"""Keystroke-Level Model estimate for thesis section 4.7, on the LOCAL docker stack, Ukrainian UI.

Card, S. K., Moran, T. P., Newell, A. (1980). The keystroke-level model for user performance time
with interactive systems. Communications of the ACM 23(7), 396-410.

Each task is really performed in a browser (headless Edge, Playwright) on fresh accounts, both ways.
The script counts the KLM operators a person would need for the same actions and measures the real
system waits. Estimated time = sum of operator times + measured waits. Nothing is tuned by hand.

Task A, phone 390x844: put the products of a benchmark photo into the fridge.
  A1 by search; A2 by AI photo scan, fixing its list and searching for what it missed.
Task B, desktop 1440x950: a week of meals (7 days x 3), no dish twice a day, each day within
  +-10 % of the daily calorie goal. B1 by hand on the Recipes page (fixed greedy rule); B2 the generator.

Every modelling assumption is listed in docs/thesis/4.7-protocol.md ("Автоматизована оцінка за KLM").

    docker compose -f docker-compose.yml -f tests/klm/ratelimit.override.yml up -d backend
    python tests/klm/klm_estimate.py
    docker compose up -d backend

Writes docs/thesis/4.7-klm-results.csv and docs/thesis/4.7-klm-summary.json. All test accounts are
deleted at the end, also on failure.
"""
import base64, csv, datetime, json, os, re, statistics, subprocess, sys, time, traceback, urllib.request, uuid
from contextlib import contextmanager
from urllib.parse import parse_qs, urlparse
from playwright.sync_api import sync_playwright

BASE = os.environ.get("KLM_BASE", "http://localhost:8080")
assert re.match(r"^http://(localhost|127\.0\.0\.1)(:\d+)?$", BASE), "local stack only"
# The local backend must use the docker Postgres, not a hosted DATABASE_URL (same check as the integration tests)
assert subprocess.run(["docker", "exec", "nutrition-app-backend", "sh", "-c", 'echo -n "${DATABASE_URL:+set}"'],
                      capture_output=True, text=True, check=True).stdout == "", "backend points at a hosted database"

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, "docs", "thesis")
BENCH = os.path.join(ROOT, "ai-service", "benchmark")
sys.path.insert(0, BENCH)
from benchmark import alias_match, normalize  # noqa: E402  same name matching as the AI benchmark

N_ACCOUNTS = int(os.environ.get("KLM_ACCOUNTS", "5"))
NO_AI = os.environ.get("KLM_NO_AI") == "1"  # smoke test of the script without GPU calls; writes nothing
PASSWORD = "KlmPass123!"
PHOTO_FILE = "board_cut.jpg"
PHOTO = os.path.join(BENCH, "photos", PHOTO_FILE)

# Operator times, s (Card, Moran & Newell 1980, Table 2). K: average non-secretary typist (40 wpm).
# BB: mouse button press + release (B = 0.1 s each). On the phone a tap is P + BB.
KLM = {"K": 0.28, "P": 1.1, "BB": 0.2, "H": 0.4, "M": 1.35}

# Target set: the photo's ground truth ("required" items in ai-service/benchmark/cases.json)
with open(os.path.join(BENCH, "cases.json"), encoding="utf-8") as f:
    TARGETS = next(p for p in json.load(f)["photos"] if p["file"] == PHOTO_FILE)["required"]

# Searching by hand: the English name typed, the catalogue entry picked, and the Ukrainian name
# typed when the scan shows a wrong one. "bell pepper" finds nothing, so the person retypes "pepper".
SEARCH = {
    "tomato": (["tomato"], "Tomato", "Помідор"),
    "cucumber": (["cucumber"], "Cucumber", "Огірок"),
    "bell pepper": (["bell pepper", "pepper"], "Green Pepper", "Перець"),
    "banana": (["banana"], "Banana", "Банан"),
    "avocado": (["avocado"], "Avocado", "Авокадо"),
    "orange": (["orange"], "Orange", "Апельсин"),
    "lemon": (["lemon"], "Lemon", "Лимон"),
    "egg": (["egg"], "Egg", "Яйця"),
    "bread": (["bread"], "Bread", "Хліб"),
}
assert sorted(t["en"][0] for t in TARGETS) == sorted(SEARCH), "SEARCH must cover the photo's ground truth"

# Manual planning: one search word per slot and day, in this order; a replacement takes the next word
TERMS = {
    "breakfast": ["pancake", "omelette", "egg", "breakfast", "porridge", "toast", "muffin"],
    "lunch": ["salad", "soup", "sandwich", "rice", "noodle", "wrap", "fish"],
    "dinner": ["chicken", "beef", "salmon", "pork", "lamb", "curry", "stew"],
}
SLOTS = ["breakfast", "lunch", "dinner"]
VISIBLE = 6         # cards compared per search: the first two rows of the 3-column grid
MAX_FIXES = 3       # replacements per day before giving up on it: dinner, then lunch, then breakfast
TOLERANCE = 0.10    # +-10 % of the daily goal, as the app's green day total


class Ops:
    """The KLM operators a person needs for one task, plus the measured system waits."""

    def __init__(self):
        self.n = dict.fromkeys(KLM, 0)
        self.wait = 0.0
        self.hand = "mouse"

    def m(self):
        self.n["M"] += 1

    def point(self):
        """A click or a tap: P + BB, after H if the hand was on the keyboard."""
        if self.hand == "keyboard":
            self.n["H"] += 1
            self.hand = "mouse"
        self.n["P"] += 1
        self.n["BB"] += 1

    def type(self, chars):
        if self.hand == "mouse":
            self.n["H"] += 1
            self.hand = "keyboard"
        self.n["K"] += chars

    @contextmanager
    def waiting(self):
        t = time.perf_counter()
        yield
        self.wait += time.perf_counter() - t

    def result(self):
        ops_s = sum(KLM[k] * v for k, v in self.n.items())
        return {**self.n, "operator_seconds": round(ops_s, 2), "system_wait_seconds": round(self.wait, 2),
                "klm_total_seconds": round(ops_s + self.wait, 2), "user_actions": self.n["BB"] + self.n["K"]}


def api(method, path, token=None, body=None):
    headers = {"Content-Type": "application/json", **({"Authorization": "Bearer " + token} if token else {})}
    req = urllib.request.Request(BASE + "/api/v1" + path, method=method, headers=headers,
                                 data=json.dumps(body).encode() if body is not None else None)
    with urllib.request.urlopen(req, timeout=240) as r:
        return json.loads(r.read() or b"null")


def psql(sql):
    return subprocess.run(["docker", "exec", "nutrition-app-postgres", "sh", "-c",
                           'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tA -c "$0"', sql],
                          capture_output=True, text=True, check=True).stdout.strip()


def token_for(email):
    return api("POST", "/auth/login", body={"email": email, "password": PASSWORD})["data"]["tokens"]["accessToken"]


def create_account():
    """A fresh account with the protocol profile: female, 30 y, 165 cm, 60 kg, moderately active, maintain."""
    email = f"klm-{uuid.uuid4().hex[:8]}@example.com"
    api("POST", "/auth/register", body={"email": email, "password": PASSWORD, "first_name": "KLM"})
    today = datetime.date.today()
    born = today.replace(year=today.year - 30) - datetime.timedelta(days=182)  # as the onboarding computes it
    api("PATCH", "/profile", token_for(email), {
        "today": today.isoformat(), "date_of_birth": born.isoformat(), "gender": "female", "height_cm": 165,
        "weight_kg": 60, "goal": "maintenance", "activity_level": "moderately_active", "diet_type": "standard"})
    return email


def delete_account(email):
    try:
        api("DELETE", "/auth/account", token_for(email), {"password": PASSWORD})
    except Exception as e:
        print(f"API delete failed for {email} ({e}); deleting in the local DB")
        psql(f"DELETE FROM users WHERE email = '{email}'")  # email is generated above, safe to inline


def missing_targets(token):
    items = api("GET", "/fridge", token)["data"]
    return [t["en"][0] for t in TARGETS if not any(alias_match(normalize(i["name"] or ""), t["en"]) for i in items)]


def clear_fridge(token):
    for item in api("GET", "/fridge", token)["data"]:
        api("DELETE", f"/fridge/{item['id']}", token)


def login(page, email):
    page.goto(BASE + "/sign-in")
    page.fill("#email", email)
    page.fill("#password", PASSWORD)
    page.click('button[type="submit"]')
    page.wait_for_url(lambda u: "/sign-in" not in u, timeout=60_000)


def is_fridge_reload(r):
    return r.request.method == "GET" and urlparse(r.url).path == "/api/v1/fridge"


def ai_ready(token, limit_s=300):
    """Seconds until /ai/status says ready (0 if it already is)."""
    t = time.perf_counter()
    while api("GET", "/ai/status", token)["data"]["status"] != "ready":
        if time.perf_counter() - t > limit_s:
            raise RuntimeError("AI service not ready")
        time.sleep(3)
    return time.perf_counter() - t


# ── Task A ───────────────────────────────────────────────────────────────────

def open_add_dialog(page, ops):
    ops.point()
    with ops.waiting():
        page.click("button:has-text('Додати продукт') >> nth=0")
        page.wait_for_selector("[role=dialog]")


def add_by_search(page, ops, target):
    """Додати продукт -> (Пошук is the default tab) -> type -> choose the result -> Додати в холодильник."""
    queries, item, _ = SEARCH[target]
    open_add_dialog(page, ops)
    box = page.locator("[role=dialog] input").first
    result = page.get_by_role("button", name=re.compile(rf"^{re.escape(item)} \d"))
    for i, q in enumerate(queries):
        if i:  # nothing found: decide on another word, delete the old one with backspace
            ops.m()
            ops.type(len(queries[i - 1]))
        ops.type(len(q))
        with ops.waiting():
            with page.expect_response(lambda r: urlparse(r.url).path == "/api/v1/foods"
                                      and parse_qs(urlparse(r.url).query).get("q") == [q]) as resp:
                box.fill(q)
            found = resp.value.json()["data"]
            if any(f["name"] == item for f in found):
                result.first.wait_for()
                break
            page.get_by_text("Нічого не знайдено").wait_for()
    else:
        raise RuntimeError(f"{item} not found by {queries}")
    ops.m()  # choose the result
    ops.point()
    result.first.click()
    ops.point()
    with ops.waiting():
        with page.expect_response(is_fridge_reload):
            page.click("[role=dialog] button:has-text('Додати в холодильник')")
        page.wait_for_selector("[role=dialog]", state="detached")


def task_a_manual(page, token):
    ops = Ops()
    for t in TARGETS:
        add_by_search(page, ops, t["en"][0])
    return ops, {}


def task_a_photo(page, token):
    ops = Ops()
    open_add_dialog(page, ops)
    ops.point()
    with ops.waiting():
        page.click("[role=tab]:has-text('AI-фото')")
        page.wait_for_selector("text=Вибрати з галереї")
    ops.point()               # «Зробити фото»
    ops.m(); ops.point()      # taking the photo: M + P + BB (assumption)
    t = time.perf_counter()
    with ops.waiting():       # the photo file stands in for the camera
        page.locator("[role=dialog] input[type=file]:not([capture])").set_input_files(PHOTO)
        page.wait_for_selector("text=/Знайдено \\d+/", timeout=240_000)
    recognition = time.perf_counter() - t
    rows = page.locator("[data-scan-item]")
    items = rows.evaluate_all("""els => els.map(e => ({
        name: e.dataset.scanItem,
        shown: e.querySelector('.truncate').textContent,
        checked: e.querySelector('[role=checkbox]').getAttribute('data-state') === 'checked'}))""")

    # Each recognised item to a free target, best name match first (as the benchmark scores it);
    # anything else (not a target, or a second copy of one) is removed
    claimed, plan = set(), []
    for it in items:
        pred = normalize(it["name"])
        cands = sorted(((alias_match(pred, t["en"]), t["en"][0], t) for t in TARGETS), key=lambda c: -c[0])
        hit = next((c for c in cands if c[0] and c[1] not in claimed), None)
        if hit:
            claimed.add(hit[1])
        plan.append((it, hit and hit[2]))

    removed = corrected = 0
    for i in reversed(range(len(items))):  # from the bottom, so removing keeps the indexes valid
        it, target = plan[i]
        row = rows.nth(i)
        ops.m()  # check the item
        if not target:
            ops.point()
            row.locator("button[aria-label^='Прибрати']").click()
            removed += 1
            continue
        if not any(stem in it["shown"].lower() for stem in target["uk"]):  # right product, wrong Ukrainian name
            new = SEARCH[target["en"][0]][2]
            ops.point(); row.locator("button[aria-label='Змінити']").click()
            ops.point()                       # the name field
            ops.type(len(it["shown"]))        # delete the old name with backspace
            ops.type(len(new))
            row.locator(".col-span-2 input").first.fill(new)
            ops.point(); row.locator("button[aria-label='Готово']").click()
            corrected += 1
        if not it["checked"]:                 # unsure items start unticked
            ops.point()
            row.locator("[role=checkbox]").click()

    if claimed:
        ops.point()
        with ops.waiting():
            with page.expect_response(is_fridge_reload):
                page.get_by_role("button", name=re.compile(r"^Додати \d+ продукт")).click()
            page.wait_for_selector("[role=dialog]", state="detached", timeout=60_000)
    else:  # nothing to save: close the dialog
        ops.point()
        page.keyboard.press("Escape")
        page.wait_for_selector("[role=dialog]", state="detached")

    missed = [t["en"][0] for t in TARGETS if t["en"][0] not in claimed]
    for name in missed:
        add_by_search(page, ops, name)
    return ops, {"recognised_of_target": f"{len(claimed)}/{len(TARGETS)}", "removed": removed,
                 "corrected": corrected, "added_manually": len(missed), "recognition_wait_s": round(recognition, 2),
                 "scan_items": [f"{it['name']}/{it['shown']}" for it in items]}


# ── Task B ───────────────────────────────────────────────────────────────────

def within(total, goal):
    return abs(total - goal) <= goal * TOLERANCE


def task_b_manual(page, token):
    """Recipes page only. Per slot: search, compare the first cards' kcal, open the closest one, read it,
    write "<name> <kcal>" into one's own table. Greedy fix when a day is off target."""
    ops = Ops()
    goal = float(api("GET", "/profile", token)["data"]["daily_calories"])
    page.goto(BASE + "/dashboard")
    page.wait_for_load_state("networkidle")
    ops.point()
    with ops.waiting():
        page.click("a[href='/recipes'] >> nth=0")
        page.wait_for_selector("h3.font-bold")
    box = page.get_by_placeholder("Пошук рецептів...")
    next_term = dict.fromkeys(SLOTS, 0)
    used = set()

    def search(term):
        ops.point()  # click in the search field
        if box.input_value():
            ops.type(2)  # Ctrl+A, then the typing replaces the old word
        ops.type(len(term))
        with ops.waiting():
            with page.expect_response(lambda r: urlparse(r.url).path == "/api/v1/recipes"
                                      and parse_qs(urlparse(r.url).query).get("q") == [term]) as resp:
                box.fill(term)
            data = resp.value.json()["data"]
            if data:
                page.wait_for_function("t => document.querySelector('h3.font-bold')?.textContent === t", arg=data[0]["title"])
        return data

    def pick(slot, target_kcal):
        for _ in range(len(TERMS[slot])):
            term = TERMS[slot][next_term[slot] % len(TERMS[slot])]
            next_term[slot] += 1
            cards = search(term)[:VISIBLE]
            cands = [(i, r) for i, r in enumerate(cards) if r["calories_per_serving"] is not None and r["id"] not in used]
            if cands:
                break
        else:
            raise RuntimeError(f"no unused recipe for {slot}")
        i, r = min(cands, key=lambda c: abs(round(float(c[1]["calories_per_serving"])) - target_kcal))
        ops.point()
        with ops.waiting():
            page.locator("button:has-text('Переглянути рецепт')").nth(i).click()
            page.locator("[role=dialog] h2", has_text=r["title"]).wait_for()
            page.locator("[role=dialog] .grid-cols-4 .font-bold").first.wait_for()
        kcal = int(page.locator("[role=dialog] .grid-cols-4 .font-bold").first.inner_text())
        assert kcal == round(float(r["calories_per_serving"])), (kcal, r["calories_per_serving"])
        ops.m()  # read the kcal, choose the recipe
        ops.point()  # close the card
        with ops.waiting():
            page.keyboard.press("Escape")
            page.wait_for_selector("[role=dialog]", state="detached")
        ops.type(len(f"{r['title']} {kcal}"))  # write it into one's own table
        used.add(r["id"])
        return kcal

    days_ok = 0
    for _ in range(7):
        day = {}
        for n, slot in enumerate(SLOTS):
            day[slot] = pick(slot, (goal - sum(day.values())) / (3 - n))
        ops.m()  # check the day's total
        for slot in ["dinner", "lunch", "breakfast"][:MAX_FIXES]:
            if within(sum(day.values()), goal):
                break
            day[slot] = pick(slot, goal - sum(v for s, v in day.items() if s != slot))
            ops.m()
        days_ok += within(sum(day.values()), goal)
    ops.m()  # the plan is done
    return ops, {"days_on_target": f"{days_ok}/7", "goal_kcal": round(goal)}


def drag(page, src, dst):
    s, t = src.locator("xpath=./div").first.bounding_box(), dst.bounding_box()
    page.mouse.move(s["x"] + s["width"] / 2, s["y"] + s["height"] / 2)
    page.mouse.down()
    page.mouse.move(s["x"] + s["width"] / 2 + 10, s["y"] + s["height"] / 2 + 10, steps=5)
    page.mouse.move(t["x"] + t["width"] / 2, t["y"] + t["height"] / 2, steps=15)


def task_b_generator(page, token):
    ops = Ops()
    goal = float(api("GET", "/profile", token)["data"]["daily_calories"])
    # Setup, not measured: the first visit generates a week; then start from the dashboard
    page.goto(BASE + "/planner")
    page.wait_for_selector("[data-slot] .line-clamp-2", timeout=90_000)
    page.goto(BASE + "/dashboard")
    page.wait_for_load_state("networkidle")

    ops.point()
    with ops.waiting():
        page.click("a[href='/planner'] >> nth=0")
        page.wait_for_selector("[data-slot] .line-clamp-2")
    ops.point()
    with ops.waiting():
        page.click("button:has-text('Згенерувати тиждень заново')")
        page.wait_for_selector("[role=alertdialog]")
    ops.point()
    t = time.perf_counter()
    with ops.waiting():
        with page.expect_response(lambda r: r.request.method == "POST" and urlparse(r.url).path == "/api/v1/meal-plans/week"):
            page.click("[role=alertdialog] button:has-text('Згенерувати')")
        page.get_by_text("Тиждень оновлено новими стравами").first.wait_for()
    generation = time.perf_counter() - t
    assert page.locator("[data-slot] .line-clamp-2").count() == 21

    days = page.locator("[data-day]").evaluate_all("els => els.map(e => e.dataset.day)")
    totals = page.locator("[data-day-kcal]").evaluate_all("els => els.map(e => Number(e.dataset.dayKcal))")
    for _ in days:
        ops.m()  # check the day's total (green = within 10 %)
    days_ok = sum(within(k, goal) for k in totals)

    # Two swaps within a day (lunch <-> dinner on the first two days), so the day totals stay as checked
    for date in days[:2]:
        lunch, dinner = page.locator(f"[data-slot='{date}|lunch']"), page.locator(f"[data-slot='{date}|dinner']")
        before = lunch.locator(".line-clamp-2").inner_text(), dinner.locator(".line-clamp-2").inner_text()
        ops.point(); ops.point()  # press on one meal, release on the other: P + BB + P + BB
        drag(page, lunch, dinner)
        with ops.waiting():
            with page.expect_response(lambda r: r.request.method == "PUT" and "/meal-plans/" in r.url):
                page.mouse.up()
        assert (lunch.locator(".line-clamp-2").inner_text(), dinner.locator(".line-clamp-2").inner_text()) == before[::-1]
    ops.m()  # accept the plan
    return ops, {"days_on_target": f"{days_ok}/7", "goal_kcal": round(goal), "generation_wait_s": round(generation, 2)}


# ── Run ──────────────────────────────────────────────────────────────────────

def run_task(rows, account, order, task, method, fn, page, token):
    t = time.perf_counter()
    try:
        ops, extra = fn(page, token)
    except Exception:
        shot = os.path.join(os.environ.get("TEMP", "."), f"klm-failure-{account}-{task}-{method}.png")
        page.screenshot(path=shot)
        print(f"failed at {page.url}; screenshot {shot}")
        raise
    if task == "A":  # recorded, not asserted, so a mismatch doesn't throw away the GPU scans already done
        missing = missing_targets(token)
        extra["all_targets_in_fridge"] = "yes" if not missing else "no: " + ", ".join(missing)
    rows.append({"account": account, "order": order, "task": task, "method": method, **ops.result(), **extra})
    r = rows[-1]
    print(f"  {task} {method:9} KLM {r['klm_total_seconds']:7.1f} s = {r['operator_seconds']:.1f} operators "
          f"+ {r['system_wait_seconds']:.1f} wait; actions {r['user_actions']}; "
          f"{ {k: v for k, v in extra.items() if k != 'scan_items'} }  (run {time.perf_counter() - t:.0f} s)", flush=True)


def main():
    rows, emails, info = [], [], {}
    started = datetime.datetime.now()
    with sync_playwright() as p:
        browser = p.chromium.launch(channel="msedge", headless=True)
        try:
            for i in range(N_ACCOUNTS):
                emails.append(create_account())
            token = token_for(emails[0])
            if not NO_AI:
                info["cold_start_seconds"] = round(ai_ready(token), 1)  # never part of a measurement
                with open(PHOTO, "rb") as f:
                    image = "data:image/jpeg;base64," + base64.b64encode(f.read()).decode()
                t = time.perf_counter()
                api("POST", "/ai/recognize", token, {"image": image})  # warm-up scan, not counted
                info["warmup_scan_seconds"] = round(time.perf_counter() - t, 1)
                print(f"AI ready after {info['cold_start_seconds']} s; warm-up scan {info['warmup_scan_seconds']} s", flush=True)

            for i, email in enumerate(emails):
                account, order = f"klm{i + 1}", ("manual_first" if i % 2 == 0 else "app_first")
                token = token_for(email)
                print(f"{account} ({order})", flush=True)

                phone = browser.new_page(viewport={"width": 390, "height": 844}, device_scale_factor=2,
                                         is_mobile=True, has_touch=True, locale="uk-UA")
                phone.set_default_timeout(30_000)
                login(phone, email)
                a = [("manual", task_a_manual), ("app", task_a_photo)]
                for method, fn in (a if order == "manual_first" else a[::-1]):
                    if NO_AI and method == "app":
                        continue
                    clear_fridge(token)
                    if method == "app":
                        ai_ready(token)  # the model is up before the timed scan
                    phone.goto(BASE + "/fridge")
                    try:
                        phone.locator("button:has-text('Додати продукт')").first.wait_for(timeout=15_000)
                    except Exception:  # seen once: the page came up without its content; a reload fixed it
                        phone.reload()
                        phone.locator("button:has-text('Додати продукт')").first.wait_for()
                    phone.wait_for_load_state("networkidle")
                    run_task(rows, account, order, "A", method, fn, phone, token)
                phone.close()

                desk = browser.new_page(viewport={"width": 1440, "height": 950}, locale="uk-UA")
                desk.set_default_timeout(30_000)
                login(desk, email)
                b = [("manual", task_b_manual), ("app", task_b_generator)]
                for method, fn in (b if order == "manual_first" else b[::-1]):
                    run_task(rows, account, order, "B", method, fn, desk, token)
                desk.close()
        except Exception:
            traceback.print_exc()
            print("\nRun FAILED; no results written.")
            return 1
        finally:
            browser.close()
            for email in emails:
                delete_account(email)
            left = psql("SELECT count(*) FROM users WHERE email LIKE 'klm-%@example.com'")
            print(f"test accounts left: {left}")

    if NO_AI:
        print("smoke test done; nothing written")
        return 0
    write(rows, info, started)
    return 0


def write(rows, info, started):
    cols = ["account", "order", "task", "method", "K", "P", "BB", "H", "M", "operator_seconds", "system_wait_seconds",
            "klm_total_seconds", "user_actions", "recognised_of_target", "removed", "corrected", "added_manually",
            "recognition_wait_s", "all_targets_in_fridge", "days_on_target", "goal_kcal", "generation_wait_s"]
    with open(os.path.join(OUT, "4.7-klm-results.csv"), "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, cols, extrasaction="ignore")
        w.writeheader()
        w.writerows(rows)

    def stats(task, key):
        manual = statistics.median(r[key] for r in rows if r["task"] == task and r["method"] == "manual")
        app = statistics.median(r[key] for r in rows if r["task"] == task and r["method"] == "app")
        return {"median_manual": manual, "median_app": app, "reduction_pct": round((manual - app) / manual * 100, 1)}

    summary = {
        "run_date": started.isoformat(timespec="seconds"),
        "method": "Keystroke-Level Model (Card, Moran, Newell 1980, CACM 23(7) 396-410): sum of operator times + measured system waits",
        "klm_constants_s": KLM,
        "accounts": len({r["account"] for r in rows}),
        "photo": PHOTO_FILE, "targets": [t["en"][0] for t in TARGETS],
        "cold_start_seconds_excluded": info["cold_start_seconds"],
        "warmup_scan_seconds_excluded": info["warmup_scan_seconds"],
        "tasks": {task: {"time_s": stats(task, "klm_total_seconds"), "user_actions": stats(task, "user_actions")}
                  for task in ("A", "B")},
        "scan_items_per_account": {r["account"]: r["scan_items"] for r in rows if "scan_items" in r},
    }
    with open(os.path.join(OUT, "4.7-klm-summary.json"), "w", encoding="utf-8") as f:
        json.dump(summary, f, ensure_ascii=False, indent=2)

    names = {"A": "A. 9 products into the fridge (phone)", "B": "B. Week plan 7x3 within ±10 % (desktop)"}
    print("\n| Task | Manual, s (median) | App, s (median) | Time reduction | Manual actions | App actions | Action reduction |")
    print("|---|---|---|---|---|---|---|")
    for task, s in summary["tasks"].items():
        t, a = s["time_s"], s["user_actions"]
        print(f"| {names[task]} | {t['median_manual']:.1f} | {t['median_app']:.1f} | {t['reduction_pct']} % "
              f"| {a['median_manual']:g} | {a['median_app']:g} | {a['reduction_pct']} % |")
    print(f"\nAI cold start (excluded): {info['cold_start_seconds']} s; KLM constants: {KLM}")


if __name__ == "__main__":
    sys.exit(main())
