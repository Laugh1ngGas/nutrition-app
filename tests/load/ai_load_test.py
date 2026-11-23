"""Load test of the deployed AI service (Modal): 1, 2 and 4 chats at once, and a chat + a photo at once.
Reports median and p90 latency per request and failures. Kept short to save GPU credits.
The key is read from the AI_SERVICE_KEY environment variable and never printed.

    $env:AI_SERVICE_KEY = [Environment]::GetEnvironmentVariable("AI_SERVICE_KEY","User")
    python tests/load/ai_load_test.py
(needs httpx: pip install httpx)"""
import concurrent.futures as cf, json, math, os, statistics, sys, time
import httpx

URL = os.environ.get("AI_SERVICE_URL", "https://laugh1nggas--nutrition-app-ai-serve.us-east.modal.run")
KEY = os.environ["AI_SERVICE_KEY"]
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
PHOTO = open(os.path.join(ROOT, "ai-service", "benchmark", "photos", "eggs_kitchen.jpg"), "rb").read()
QUESTIONS = [  # one fixed set, so every scenario asks the same kind of thing
    "Suggest a quick high-protein breakfast.",
    "Що приготувати на вечерю з курки та броколі?",
    "How much protein is in 100 g of chicken breast?",
    "Порадь легкий перекус до 200 ккал.",
]
client = httpx.Client(headers={"X-AI-Key": KEY}, timeout=300)


def chat(i: int):
    t = time.perf_counter()
    r = client.post(f"{URL}/v1/chat", json={"messages": [{"role": "user", "content": QUESTIONS[i % len(QUESTIONS)]}]})
    ok = r.status_code == 200 and bool(r.json().get("reply"))
    tokens = (r.json().get("timings") or {}).get("predicted_n") if ok else None
    return "chat", time.perf_counter() - t, ok, tokens, r.status_code


def photo(_: int):
    t = time.perf_counter()
    r = client.post(f"{URL}/v1/recognize", files={"image": ("photo.jpg", PHOTO, "image/jpeg")})
    ok = r.status_code == 200 and isinstance(r.json().get("ingredients"), list)
    n = len(r.json()["ingredients"]) if ok else None
    return "photo", time.perf_counter() - t, ok, n, r.status_code


def p90(xs):  # nearest-rank
    s = sorted(xs)
    return s[max(0, math.ceil(0.9 * len(s)) - 1)]


def run(name, jobs_per_round, rounds):
    rows = []
    for _ in range(rounds):
        with cf.ThreadPoolExecutor(len(jobs_per_round)) as pool:
            rows += list(pool.map(lambda j: j[0](j[1]), [(fn, i) for i, fn in enumerate(jobs_per_round)]))
    return name, rows


# Warm-up: wait for the model, one request not counted
t0 = time.perf_counter()
for _ in range(60):
    try:
        if client.get(f"{URL}/health", timeout=30).json().get("status") == "ready": break
    except Exception: pass
    time.sleep(5)
_, warm, ok, _, code = chat(0)
print(f"warm-up: ready after {time.perf_counter() - t0:.1f} s, first chat {warm:.1f} s (status {code}), not counted")

scenarios = [
    run("1 chat", [chat], 5),
    run("2 chats at once", [chat, chat], 3),
    run("4 chats at once", [chat, chat, chat, chat], 2),
    run("chat + photo at once", [chat, photo], 3),
]

print(f"\n| Scenario | Request | n | Median, s | p90, s | Min–max, s | Failures |")
print("|---|---|---|---|---|---|---|")
report = []
for name, rows in scenarios:
    for kind in ("chat", "photo"):
        sel = [r for r in rows if r[0] == kind]
        if not sel: continue
        times = [r[1] for r in sel if r[2]]
        fails = sum(not r[2] for r in sel)
        line = (name, kind, len(sel), statistics.median(times) if times else None, p90(times) if times else None,
                min(times) if times else None, max(times) if times else None, fails)
        report.append(line)
        fmt = lambda x: f"{x:.1f}" if x is not None else "—"
        print(f"| {name} | {kind} | {len(sel)} | {fmt(line[3])} | {fmt(line[4])} | {fmt(line[5])}–{fmt(line[6])} | {fails} |")
toks = [r[3] for _, rows in scenarios for r in rows if r[0] == "chat" and r[3]]
if toks: print(f"\nchat answers: median {statistics.median(toks):.0f} generated tokens")
json.dump({"report": report, "raw": [(n, rows) for n, rows in scenarios]}, open(os.path.join(ROOT, "tests", "load", "last_run.json"), "w"), indent=1)
