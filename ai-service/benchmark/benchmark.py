"""Benchmarks a running AI service on our own tasks. Standard library only.

Run one model at a time, then compare:
    python ai-service/benchmark/benchmark.py run --label qwen3.5-4b
    python ai-service/benchmark/benchmark.py run --label gemma4-e4b
    python ai-service/benchmark/benchmark.py compare qwen3.5-4b gemma4-e4b

Results go to ai-service/benchmark/results/<label>.json and report.md.
Set AI_SERVICE_KEY in the environment if the service has one.
"""
import argparse
import json
import mimetypes
import os
import re
import statistics
import time
import urllib.request
import uuid

HERE = os.path.dirname(os.path.abspath(__file__))
PHOTOS_DIR = os.path.join(HERE, "photos")
RESULTS_DIR = os.path.join(HERE, "results")
HEADERS = {"X-AI-Key": os.environ["AI_SERVICE_KEY"]} if os.getenv("AI_SERVICE_KEY") else {}

# ── HTTP ──────────────────────────────────────────────────────────────────────

def post(base, path, data, content_type):
    req = urllib.request.Request(base + path, data=data, headers={**HEADERS, "Content-Type": content_type})
    start = time.time()
    with urllib.request.urlopen(req, timeout=900) as r:
        body = json.loads(r.read())
    return body, round(time.time() - start, 1)


def post_json(base, path, payload):
    return post(base, path, json.dumps(payload).encode(), "application/json")


def post_image(base, path):
    boundary = uuid.uuid4().hex
    mime = mimetypes.guess_type(path)[0] or "image/jpeg"
    with open(path, "rb") as f:
        payload = (
            f"--{boundary}\r\nContent-Disposition: form-data; name=\"image\"; "
            f"filename=\"{os.path.basename(path)}\"\r\nContent-Type: {mime}\r\n\r\n"
        ).encode() + f.read() + f"\r\n--{boundary}--\r\n".encode()
    return post(base, "/v1/recognize", payload, f"multipart/form-data; boundary={boundary}")


def speed(timings):
    if not timings:
        return {}
    return {
        "prompt_tokens": timings.get("prompt_n"),
        "prompt_tok_s": round(timings.get("prompt_per_second") or 0, 1),
        "output_tokens": timings.get("predicted_n"),
        "output_tok_s": round(timings.get("predicted_per_second") or 0, 2),
    }

# ── Language checks ───────────────────────────────────────────────────────────

RUSSIAN_LETTERS = set("ыэъё")
# Common Russian words / surzhyk that small models slip into Ukrainian answers
RUSSISMS = [
    "творог", "блюдо", "блюда", "лук", "картошк", "кушать", "завтрак", "ужин", "обед",
    "сахар", "яйцо", "огурец", "помидор", "курица", "мясо", "полезн", "белок",
    "конечно", "что", "это", "или", "как", "нужно", "можно", "очень", "сегодня",
]
RUSSISM_RE = re.compile(r"\b(" + "|".join(RUSSISMS) + r")\w*\b", re.IGNORECASE)


def language_check(text, lang):
    letters = [c for c in text.lower() if c.isalpha()]
    latin = sum(1 for c in letters if "a" <= c <= "z")
    cyrillic = sum(1 for c in letters if "а" <= c <= "я" or c in "ґєії")
    if lang == "uk":
        return {
            "russian_letters": sum(1 for c in text.lower() if c in RUSSIAN_LETTERS),
            "russisms": sorted({m.group(0).lower() for m in RUSSISM_RE.finditer(text)}),
            "latin_share": round(latin / len(letters), 2) if letters else 0,
        }
    return {"cyrillic_share": round(cyrillic / len(letters), 2) if letters else 0}

# ── Photo scoring ─────────────────────────────────────────────────────────────

def normalize(name):
    name = name.lower().strip()
    words = []
    for w in re.findall(r"[a-z]+", name):
        if w.endswith("ies"):
            w = w[:-3] + "y"
        elif w.endswith(("oes", "shes", "ches")):
            w = w[:-2]
        elif w.endswith("s") and not w.endswith("ss"):
            w = w[:-1]
        words.append(w)
    return " ".join(words)


def alias_match(pred, aliases):
    """0 = no match, 3 = exact, 2 = alias ends the prediction, 1 = alias elsewhere in it.

    The last word of an English food name is the food itself ("cherry tomato"
    is a tomato), so a match there beats one on a describing word.
    """
    best = 0
    for alias in aliases:
        a = normalize(alias)
        if pred == a:
            return 3
        if re.search(r"\b" + re.escape(a) + r"$", pred):
            best = max(best, 2)
        elif re.search(r"\b" + re.escape(a) + r"\b", pred):
            best = max(best, 1)
    return best


def score_photo(predictions, label):
    items = [("required", i, item) for i, item in enumerate(label["required"])] + \
            [("optional", i, item) for i, item in enumerate(label["optional"])]
    matched = {}  # (kind, index) -> prediction
    rows = []
    for p in predictions:
        pred = normalize(p.get("name", ""))
        candidates = []
        for kind, i, item in items:
            m = alias_match(pred, item["en"])
            if m:
                # prefer exact matches, then required items, then unmatched ones
                candidates.append((m, kind == "required", (kind, i) not in matched, kind, i, item))
        candidates.sort(reverse=True)
        status, uk_ok = "wrong", None
        for m, _, free, kind, i, item in candidates:
            if free:
                matched[(kind, i)] = p
                status = kind
                uk = (p.get("name_uk") or "").lower()
                uk_ok = any(stem in uk for stem in item["uk"])
                break
        else:
            if candidates:
                status = "duplicate"
        rows.append({**p, "status": status, "uk_ok": uk_ok})

    required_found = sum(1 for (kind, _) in matched if kind == "required")
    counted = [r for r in rows if r["status"] != "duplicate"]
    correct = [r for r in counted if r["status"] in ("required", "optional")]
    missed = [label["required"][i]["en"][0] for i in range(len(label["required"])) if ("required", i) not in matched]
    return {
        "predictions": rows,
        "missed_required": missed,
        "required_total": len(label["required"]),
        "required_found": required_found,
        "precision": round(len(correct) / len(counted), 3) if counted else 0,
        "recall": round(required_found / len(label["required"]), 3),
        "uk_names_correct": sum(1 for r in correct if r["uk_ok"]),
        "uk_names_total": len(correct),
    }


def ensure_photos(cases):
    os.makedirs(PHOTOS_DIR, exist_ok=True)
    for photo in cases["photos"]:
        path = os.path.join(PHOTOS_DIR, photo["file"])
        if not os.path.exists(path):
            print(f"  downloading {photo['file']}")
            req = urllib.request.Request(photo["url"], headers={"User-Agent": "NutritionAppBench/1.0 (thesis research)"})
            with urllib.request.urlopen(req, timeout=60) as r, open(path, "wb") as f:
                f.write(r.read())

# ── Tool-call scoring ─────────────────────────────────────────────────────────

def score_tool(tool_calls, expect):
    if expect["name"] is None:
        return {"correct_tool": not tool_calls, "correct_args": not tool_calls, "valid_json": True}
    if not tool_calls:
        return {"correct_tool": False, "correct_args": False, "valid_json": True}
    fn = tool_calls[0].get("function", {})
    try:
        args = json.loads(fn.get("arguments") or "{}") if isinstance(fn.get("arguments"), str) else fn.get("arguments", {})
    except json.JSONDecodeError:
        return {"correct_tool": fn.get("name") == expect["name"], "correct_args": False, "valid_json": False}
    ok = all(str(args.get(k, "")).lower() == str(v).lower() for k, v in expect.get("args", {}).items())
    if "ingredients_count" in expect:
        ok = ok and len(args.get("ingredients") or []) == expect["ingredients_count"]
    if "items_count" in expect:
        ok = ok and len(args.get("items") or []) == expect["items_count"]
    return {"correct_tool": fn.get("name") == expect["name"], "correct_args": fn.get("name") == expect["name"] and ok, "valid_json": True}

# ── Run ───────────────────────────────────────────────────────────────────────

def run(args):
    base = args.base.rstrip("/")
    with open(os.path.join(HERE, "cases.json"), encoding="utf-8") as f:
        cases = json.load(f)
    os.makedirs(RESULTS_DIR, exist_ok=True)
    out_path = os.path.join(RESULTS_DIR, f"{args.label}.json")
    health = json.loads(urllib.request.urlopen(base + "/health", timeout=30).read())
    results = {"label": args.label, "model": health.get("model"), "started": time.strftime("%Y-%m-%d %H:%M"),
               "chat": [], "tools": [], "photos": []}

    def save():
        with open(out_path, "w", encoding="utf-8") as f:
            json.dump(results, f, ensure_ascii=False, indent=2)

    # Warm-up, not scored: the first request after startup fills llama.cpp's prompt cache
    print("warm-up…")
    post_json(base, "/v1/chat", {"messages": [{"role": "user", "content": "Hi"}]})
    post_json(base, "/v1/chat", {"messages": [{"role": "user", "content": "Привіт"}]})

    if "chat" in args.parts:
        for case in cases["chat"]:
            for lang in ("uk", "en"):
                body, secs = post_json(base, "/v1/chat", {"messages": [{"role": "user", "content": case[lang]}]})
                results["chat"].append({"id": case["id"], "lang": lang, "question": case[lang], "reply": body["reply"],
                                        "seconds": secs, **speed(body.get("timings")), "checks": language_check(body["reply"], lang)})
                print(f"  chat {case['id']}/{lang}: {secs}s")
                save()

    if "tools" in args.parts:
        for case in cases["tools"]["cases"]:
            body, secs = post_json(base, "/v1/chat", {"messages": [{"role": "user", "content": case["text"]}],
                                                       "tools": cases["tools"]["definitions"]})
            score = score_tool(body.get("tool_calls"), case["expect"])
            results["tools"].append({"id": case["id"], "text": case["text"], "tool_calls": body.get("tool_calls"),
                                     "reply": body["reply"], "seconds": secs, **score})
            print(f"  tool {case['id']}: {secs}s {'OK' if score['correct_args'] else 'WRONG'}")
            save()

    if "photos" in args.parts:
        ensure_photos(cases)
        for label in cases["photos"]:
            body, secs = post_image(base, os.path.join(PHOTOS_DIR, label["file"]))
            score = score_photo(body.get("ingredients", []), label)
            results["photos"].append({"file": label["file"], "seconds": secs, **speed(body.get("timings")), **score})
            print(f"  photo {label['file']}: {secs}s recall {score['recall']} precision {score['precision']}")
            save()

    results["finished"] = time.strftime("%Y-%m-%d %H:%M")
    save()
    print(f"saved {out_path}")

# ── Compare ───────────────────────────────────────────────────────────────────

def summarize(r):
    chat = r["chat"]
    uk = [c for c in chat if c["lang"] == "uk"]
    en = [c for c in chat if c["lang"] == "en"]
    photos = r["photos"]
    req_total = sum(p["required_total"] for p in photos)
    correct = sum(p["uk_names_total"] for p in photos)
    preds = sum(len([x for x in p["predictions"] if x["status"] != "duplicate"]) for p in photos)
    hits = sum(len([x for x in p["predictions"] if x["status"] in ("required", "optional")]) for p in photos)
    med = lambda xs: round(statistics.median(xs), 1) if xs else 0
    return {
        "Model file": r.get("model"),
        "Chat: median reply time, English (s)": med([c["seconds"] for c in en]),
        "Chat: median reply time, Ukrainian (s)": med([c["seconds"] for c in uk]),
        "Chat: generation speed (tokens/s)": med([c["output_tok_s"] for c in chat if c.get("output_tok_s")]),
        "Ukrainian: answers with Russian letters (ы э ъ ё)": f"{sum(1 for c in uk if c['checks']['russian_letters'])}/{len(uk)}",
        "Ukrainian: answers with Russian words": f"{sum(1 for c in uk if c['checks']['russisms'])}/{len(uk)}",
        "Ukrainian: answers that switched to English (>20% Latin)": f"{sum(1 for c in uk if c['checks']['latin_share'] > 0.2)}/{len(uk)}",
        "English: answers containing Cyrillic": f"{sum(1 for c in en if c['checks']['cyrillic_share'] > 0)}/{len(en)}",
        "Tools: correct tool + arguments": f"{sum(1 for t in r['tools'] if t['correct_args'])}/{len(r['tools'])}",
        "Tools: correct tool chosen": f"{sum(1 for t in r['tools'] if t['correct_tool'])}/{len(r['tools'])}",
        "Tools: median time (s)": med([t["seconds"] for t in r["tools"]]),
        "Photos: recall (required items found)": f"{sum(p['required_found'] for p in photos)}/{req_total}"
            + (f" = {sum(p['required_found'] for p in photos) / req_total:.0%}" if req_total else ""),
        "Photos: precision (predictions that are correct)": f"{hits}/{preds}" + (f" = {hits / preds:.0%}" if preds else ""),
        "Photos: correct Ukrainian names": f"{sum(p['uk_names_correct'] for p in photos)}/{correct}",
        "Photos: median time per photo (s)": med([p["seconds"] for p in photos]),
    }


def compare(args):
    runs = []
    for label in args.labels:
        with open(os.path.join(RESULTS_DIR, f"{label}.json"), encoding="utf-8") as f:
            runs.append(json.load(f))
    sums = [summarize(r) for r in runs]

    lines = ["# Model comparison", "", (
        "Hardware is in each label: `-t4` / `-l4` = a Modal GPU (T4 16 GB; L4 or A10 24 GB), "
        "no suffix = the Docker image limited to 2 CPUs."
    ), ""]
    lines += ["| Metric | " + " | ".join(r["label"] for r in runs) + " |", "|---|" + "---|" * len(runs)]
    for key in sums[0]:
        lines.append(f"| {key} | " + " | ".join(str(s[key]) for s in sums) + " |")

    lines += ["", "## Photos", ""]
    for i, photo in enumerate(runs[0]["photos"]):
        lines.append(f"### {photo['file']}")
        for r in runs:
            p = r["photos"][i]
            found = ", ".join(f"{x['name']}/{x.get('name_uk')}" + ("" if x["status"] in ("required", "optional") else f" ✗{x['status']}")
                              for x in p["predictions"])
            lines.append(f"- **{r['label']}** ({p['seconds']} s, recall {p['recall']:.0%}, precision {p['precision']:.0%}): {found}")
            if p["missed_required"]:
                lines.append(f"  - missed: {', '.join(p['missed_required'])}")
        lines.append("")

    lines += ["## Tool calls", ""]
    for i, t in enumerate(runs[0]["tools"]):
        lines.append(f"- `{t['id']}` — {t['text']}")
        for r in runs:
            x = r["tools"][i]
            call = x["tool_calls"][0]["function"] if x["tool_calls"] else None
            shown = f"`{call['name']}({call.get('arguments')})`" if call else "no tool call"
            lines.append(f"  - **{r['label']}** {'✅' if x['correct_args'] else '❌'} {shown}")
    lines.append("")

    lines += ["## Chat answers", ""]
    for i, c in enumerate(runs[0]["chat"]):
        lines.append(f"### {c['id']} ({c['lang']}) — {c['question']}")
        for r in runs:
            x = r["chat"][i]
            flags = x["checks"].get("russisms") or []
            lines.append(f"**{r['label']}** ({x['seconds']} s){' — Russian words: ' + ', '.join(flags) if flags else ''}")
            lines.append("")
            lines.append("> " + x["reply"].strip().replace("\n", "\n> "))
            lines.append("")

    path = os.path.join(RESULTS_DIR, "report.md")
    with open(path, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))
    print(f"saved {path}")


def main():
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest="cmd", required=True)
    p_run = sub.add_parser("run")
    p_run.add_argument("--label", required=True)
    p_run.add_argument("--base", default="http://localhost:7860")
    p_run.add_argument("--parts", nargs="+", default=["chat", "tools", "photos"], choices=["chat", "tools", "photos"])
    p_cmp = sub.add_parser("compare")
    p_cmp.add_argument("labels", nargs="+")
    args = parser.parse_args()
    run(args) if args.cmd == "run" else compare(args)


if __name__ == "__main__":
    main()
