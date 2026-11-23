"""End-to-end test in a real browser (headless Edge, Python Playwright) on the LOCAL docker stack, Ukrainian UI.

Run 1, desktop: sign up -> onboarding -> add fridge items -> the week is generated -> swap two meals -> ask the assistant.
Run 2, phone:   AI photo scan of a fixture photo -> remove one item -> save the rest to the fridge.
The assistant and the photo scan use the real AI service the local backend points at (Modal).
Screenshots: docs/screenshots/e2e/. The test user is deleted at the end.

    python tests/e2e/run_e2e.py
"""
import json, os, re, sys, time, traceback, urllib.request, uuid
from playwright.sync_api import sync_playwright

BASE = os.environ.get("E2E_BASE", "http://localhost:8080")
assert re.match(r"^http://(localhost|127\.0\.0\.1)(:\d+)?$", BASE), "local stack only"
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, "docs", "screenshots", "e2e")
PHOTO = os.path.join(ROOT, "ai-service", "benchmark", "photos", "eggs_kitchen.jpg")
os.makedirs(OUT, exist_ok=True)

EMAIL, PASSWORD = f"e2e-{uuid.uuid4().hex[:8]}@example.com", "TestPass123!"
results = []  # (step, ok, seconds, note)


def step(name):
    """Runs a step, times it, records pass/fail; later steps still run."""
    def wrap(fn):
        t = time.perf_counter()
        try:
            note = fn() or ""
            results.append((name, True, time.perf_counter() - t, note))
        except Exception as e:
            results.append((name, False, time.perf_counter() - t, f"{type(e).__name__}: {str(e).splitlines()[0][:120]}"))
            traceback.print_exc()
        print(f"{'PASS' if results[-1][1] else 'FAIL'}  {name}  ({results[-1][2]:.1f} s) {results[-1][3]}", flush=True)
    return wrap


def shot(page, name, full=False):
    page.wait_for_timeout(600)
    page.screenshot(path=os.path.join(OUT, name), full_page=full)


def login(page):
    page.goto(BASE + "/sign-in")
    page.fill("#email", EMAIL); page.fill("#password", PASSWORD)
    page.click('button[type="submit"]')
    page.wait_for_url(lambda u: "/sign-in" not in u, timeout=60_000)


with sync_playwright() as p:
    browser = p.chromium.launch(channel="msedge", headless=True)
    page = browser.new_page(viewport={"width": 1440, "height": 950}, locale="uk-UA")
    page.set_default_timeout(30_000)

    @step("1. Реєстрація")
    def _():
        page.goto(BASE + "/sign-up")
        inputs = page.locator("form input")
        inputs.nth(0).fill("Олена"); inputs.nth(1).fill("Коваль")
        page.fill("#su-email", EMAIL); page.fill("#su-pw", PASSWORD); page.fill("#su-cpw", PASSWORD)
        page.click("#terms")
        page.click("button:has-text('Створити акаунт')")
        page.wait_for_selector("text=Перейти до налаштування")
        shot(page, "01-sign-up-done.png")

    @step("2. Онбординг (4 кроки)")
    def _():
        page.click("text=Перейти до налаштування")
        page.wait_for_selector("#age")
        page.fill("#age", "28"); page.click("button:has-text('Жіноча')")
        page.fill("#height", "168"); page.fill("#weight", "62")
        shot(page, "02-onboarding-step1.png")
        page.click("button:has-text('Продовжити')")
        page.click("button:has-text('Підтримувати вагу')")
        page.click("button:has-text('Помірна активність')")
        page.click("button:has-text('Продовжити')")
        page.click("button:has-text('Горіхи')")
        shot(page, "03-onboarding-diet-allergies.png")
        page.click("button:has-text('Продовжити')")
        page.click("button:has-text('Завершити налаштування')")
        page.wait_for_url(lambda u: "/dashboard" in u, timeout=60_000)
        page.wait_for_load_state("networkidle")
        shot(page, "04-dashboard.png")

    @step("3. Додавання продуктів у холодильник (3 шт.)")
    def _():
        page.goto(BASE + "/fridge")
        for query, name in [("chicken", "Chicken Breast"), ("tomat", "Tomatoes"), ("potat", "Potatoes")]:
            page.click("button:has-text('Додати продукт') >> nth=0")
            page.fill("[role=dialog] input", query)
            result = page.get_by_role("button", name=re.compile(rf"^{name} \d"))
            result.first.click()
            page.locator("[role=dialog] input[type=number]").first.fill("2")
            if name == "Chicken Breast":
                shot(page, "05-add-to-fridge-dialog.png")
            page.click("[role=dialog] button:has-text('Додати в холодильник')")
            page.wait_for_selector("[role=dialog]", state="detached")
        page.wait_for_load_state("networkidle")
        count = page.locator("text=/\\d+ продукт/").first.inner_text()
        assert "3" in count, count
        shot(page, "06-fridge.png")
        return count

    @step("4. Генерація тижневого плану")
    def _():
        page.goto(BASE + "/planner")
        page.wait_for_selector("[data-slot]", timeout=90_000)
        slots = page.locator("[data-slot] .line-clamp-2").count()
        assert slots == 21, f"{slots} meals"
        shot(page, "07-planner-week.png")
        return f"{slots} страв"

    @step("5. Перетягування: обмін двох страв")
    def _():
        first, second = page.locator("[data-slot]").nth(1), page.locator("[data-slot]").nth(5)  # Mon lunch, Tue dinner
        a, b = first.locator(".line-clamp-2").inner_text(), second.locator(".line-clamp-2").inner_text()
        s, t = first.locator("xpath=./div").first.bounding_box(), second.bounding_box()
        page.mouse.move(s["x"] + s["width"] / 2, s["y"] + s["height"] / 2); page.mouse.down()
        page.mouse.move(s["x"] + s["width"] / 2 + 10, s["y"] + s["height"] / 2 + 10, steps=5)
        page.mouse.move(t["x"] + t["width"] / 2, t["y"] + t["height"] / 2, steps=15)
        shot(page, "08-planner-dragging.png")
        page.mouse.up(); page.wait_for_timeout(1500)
        assert first.locator(".line-clamp-2").inner_text() == b and second.locator(".line-clamp-2").inner_text() == a
        page.reload(); page.wait_for_selector("[data-slot]")
        assert page.locator("[data-slot]").nth(1).locator(".line-clamp-2").inner_text() == b, "swap not saved"
        shot(page, "09-planner-after-swap.png")
        return f"«{a}» ⇄ «{b}», збережено після перезавантаження"

    @step("6. Запит до AI-помічника")
    def _():
        page.goto(BASE + "/assistant")
        box = page.locator("textarea").first; box.wait_for()
        box.fill("Що приготувати на вечерю з того, що є в моєму холодильнику?")
        t = time.perf_counter(); box.press("Enter")
        typing = page.locator("[aria-label='Помічник друкує']")
        typing.wait_for(state="attached", timeout=10_000)
        typing.wait_for(state="detached", timeout=240_000)
        answer = page.locator("div.rounded-tl-sm.bg-muted").last.inner_text()
        assert len(answer) > 40, answer
        shot(page, "10-assistant-answer.png")
        cards = page.locator("[data-recipe-card]").count()
        return f"відповідь за {time.perf_counter() - t:.1f} с, карток рецептів: {cards}"

    phone = browser.new_page(viewport={"width": 390, "height": 844}, device_scale_factor=2,
                             is_mobile=True, has_touch=True, locale="uk-UA")
    phone.set_default_timeout(30_000)

    @step("7. Телефон: вхід")
    def _():
        login(phone)

    found = []

    @step("8. Телефон: AI-фото, розпізнавання")
    def _():
        phone.goto(BASE + "/fridge")
        phone.click("button:has-text('Додати продукт') >> nth=0")
        phone.click("[role=tab]:has-text('AI-фото')")
        phone.wait_for_selector("text=Вибрати з галереї")
        shot(phone, "11-phone-ai-scan-start.png")
        t = time.perf_counter()
        phone.locator("[role=dialog] input[type=file]:not([capture])").set_input_files(PHOTO)
        phone.wait_for_selector("text=/Знайдено \\d+/", timeout=240_000)
        found.extend(phone.locator("[data-scan-item]").evaluate_all("els => els.map(e => e.dataset.scanItem)"))
        assert len(found) >= 3, found
        shot(phone, "12-phone-ai-scan-results-uk.png")
        return f"{len(found)} продуктів за {time.perf_counter() - t:.1f} с: {', '.join(found)}"

    @step("9. Телефон: прибрати один, зберегти решту")
    def _():
        items = phone.locator("[data-scan-item]")
        items.nth(0).locator("button[aria-label^='Прибрати']").click()
        save = phone.get_by_role("button", name=re.compile(r"^Додати \d+ продукт"))
        label = save.inner_text()
        n = int(re.search(r"\d+", label).group())
        shot(phone, "13-phone-ai-scan-before-save-uk.png")
        save.click()
        phone.wait_for_selector("[role=dialog]", state="detached", timeout=30_000)
        phone.wait_for_load_state("networkidle")
        shot(phone, "14-phone-fridge-after-scan.png", full=True)
        api_fridge = json.loads(urllib.request.urlopen(urllib.request.Request(
            BASE + "/api/v1/fridge", headers={"Authorization": "Bearer " + phone.evaluate("localStorage.getItem('mealprep_access_token')")})).read())
        total = len(api_fridge["data"])
        assert total >= 3 + n - 1, f"fridge has {total}"  # some scanned items may already be there (tomato, potato)
        return f"збережено {n}, у холодильнику {total}"

    browser.close()

# Clean up the test user the way the app deletes accounts
try:
    req = urllib.request.Request(BASE + "/api/v1/auth/login", data=json.dumps({"email": EMAIL, "password": PASSWORD}).encode(),
                                 headers={"Content-Type": "application/json"}, method="POST")
    token = json.loads(urllib.request.urlopen(req).read())["data"]["tokens"]["accessToken"]
    urllib.request.urlopen(urllib.request.Request(BASE + "/api/v1/auth/account", data=json.dumps({"password": PASSWORD}).encode(),
                                                  headers={"Content-Type": "application/json", "Authorization": "Bearer " + token}, method="DELETE"))
except Exception as e:
    print("cleanup failed:", e)

passed = sum(ok for _, ok, _, _ in results)
print(f"\n{passed}/{len(results)} steps passed, total {sum(s for _, _, s, _ in results):.1f} s")
for name, ok, secs, note in results:
    print(f"| {name} | {'✓' if ok else '✗'} | {secs:.1f} | {note} |")
sys.exit(0 if passed == len(results) else 1)
