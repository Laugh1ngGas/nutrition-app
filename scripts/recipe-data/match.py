"""Match TheMealDB ingredient names to USDA SR Legacy foods with Gemma (via the AI service's /v1/complete).
Pass 1: USDA-style search phrases. Pass 2: pick the best candidate + typical piece weight.
Results are cached in terms.json / matches.json so a rerun only does what's missing."""
import json, math, os, re, sys, time, urllib.request
from collections import Counter
from concurrent.futures import ThreadPoolExecutor

URL = "https://laugh1nggas--nutrition-app-ai-serve.us-east.modal.run/v1/complete"
KEY = os.environ["AI_SERVICE_KEY"]
STEP = sys.argv[1] if len(sys.argv) > 1 else "all"

usda = json.load(open("usda.json", encoding="utf-8"))
by_fdc = {u["fdc"]: u for u in usda}
names = sorted({(i["strIngredient"] or "").strip() for i in json.load(open("ingredients.json", encoding="utf-8"))} |
               {(m.get(f"strIngredient{k}") or "").strip() for m in json.load(open("meals.json", encoding="utf-8")) for k in range(1, 21)}
               - {""}, key=str.lower)
# Case variants ("Garlic"/"garlic") are one ingredient
seen, uniq = set(), []
for n in names:
    if n.lower() not in seen:
        seen.add(n.lower()); uniq.append(n)
names = uniq
print(len(names), "ingredient names")

def call(messages, schema, max_tokens=2048):
    body = json.dumps({"messages": messages, "json_schema": schema, "max_tokens": max_tokens, "temperature": 0.1}).encode()
    for attempt in range(8):
        try:
            req = urllib.request.Request(URL, data=body, headers={"Content-Type": "application/json", "X-AI-Key": KEY})
            return json.loads(urllib.request.urlopen(req, timeout=300).read())["data"]
        except Exception as e:
            print("  retry", attempt, str(e)[:120]); time.sleep(10)
    raise RuntimeError("AI service kept failing")

def load(path):
    return json.load(open(path, encoding="utf-8")) if os.path.exists(path) else {}

def save(path, data):
    json.dump(data, open(path, "w", encoding="utf-8"), ensure_ascii=False, indent=0)

# ---------- pass 1: search phrases ----------
TERMS_SCHEMA = {"type": "object", "properties": {"items": {"type": "array", "items": {"type": "object", "properties": {
    "name": {"type": "string"}, "terms": {"type": "array", "items": {"type": "string"}}}, "required": ["name", "terms"]}}},
    "required": ["items"]}
TERMS_PROMPT = (
    "These are cooking ingredient names from a recipe website (often British English).\n"
    "For each one, write 1-3 short search phrases in the vocabulary of the USDA SR Legacy food database: "
    "American names, the food as bought (usually raw/uncooked, or canned/dried if that's how it's sold), "
    "main word first like USDA does (e.g. 'Onions, raw', 'Cream, fluid, heavy whipping', 'Sugars, granulated', "
    "'Beef, ground, 80% lean meat', 'Eggplant, raw', 'Spices, paprika', 'Oil, olive').\n"
    "Translate British names: aubergine=eggplant, courgette=zucchini, coriander leaves=cilantro, double cream=heavy cream, "
    "single cream=light cream, caster/granulated sugar=sugar, icing sugar=powdered sugar, plain flour=all-purpose wheat flour, "
    "minced beef=ground beef, spring onions=scallions, rocket=arugula, prawns=shrimp, swede=rutabaga, beetroot=beets, "
    "mange tout=snow peas, bicarbonate of soda=baking soda, rapeseed oil=canola oil, stock cube=bouillon, gammon=ham.\n"
    "Return every input name exactly as given.\n\nIngredients:\n"
)

terms = load("terms.json")
todo = [n for n in names if n not in terms]
if STEP in ("all", "terms") and todo:
    batches = [todo[i:i + 40] for i in range(0, len(todo), 40)]
    def run(batch):
        data = call([{"role": "user", "content": TERMS_PROMPT + "\n".join(batch)}], TERMS_SCHEMA, 4096)
        got = {i["name"].lower(): i["terms"] for i in data["items"]}
        return {n: got[n.lower()] for n in batch if n.lower() in got}
    t = time.time()
    with ThreadPoolExecutor(2) as pool:
        for i, res in enumerate(pool.map(run, batches)):
            terms.update(res); save("terms.json", terms)
            print(f"  terms batch {i + 1}/{len(batches)} ({time.time() - t:.0f}s)")
    print("terms:", len(terms), "missing:", [n for n in names if n not in terms][:20])

# ---------- candidate retrieval ----------
def toks(s):
    out = []
    for w in re.findall(r"[a-z]+", s.lower()):
        if len(w) > 3 and w.endswith("ies"): w = w[:-3] + "y"
        elif len(w) > 3 and w.endswith("oes"): w = w[:-2]
        elif len(w) > 3 and w.endswith("s") and not w.endswith("ss"): w = w[:-1]
        out.append(w)
    return out

doc_toks = [set(toks(u["desc"])) for u in usda]
head_toks = [set(toks(u["desc"].split(",")[0])) for u in usda]
df = Counter(t for d in doc_toks for t in d)
idf = {t: math.log(len(usda) / c) for t, c in df.items()}
STOP = {"and", "or", "with", "of", "the", "fresh", "a"}

def retrieve(phrases, k=14):
    scores = Counter()
    for phrase in phrases:
        q = [t for t in toks(phrase) if t not in STOP]
        if not q: continue
        for i, d in enumerate(doc_toks):
            hit = sum(idf.get(t, 0) for t in q if t in d)
            if not hit: continue
            s = hit / sum(idf.get(t, 1) for t in q)
            s += 0.3 * (len(set(q) & head_toks[i]) > 0) + 0.15 * ("raw" in d) - 0.01 * len(d)
            scores[i] = max(scores[i], s)
    return [usda[i] for i, _ in scores.most_common(k)]

# ---------- pass 2: pick ----------
PICK_SCHEMA = {"type": "object", "properties": {"items": {"type": "array", "items": {"type": "object", "properties": {
    "name": {"type": "string"},
    "choice": {"type": "integer"},
    "piece_g": {"type": "number"},
    "cup_g": {"type": "number"}},
    "required": ["name", "choice", "piece_g", "cup_g"]}}}, "required": ["items"]}
PICK_PROMPT = (
    "Match each recipe ingredient to the USDA food with the most similar nutrition per 100 g.\n"
    "- choice: the number of the best candidate, or 0 if none is a reasonable match.\n"
    "- Prefer the form used in cooking: raw meat/vegetables, dry pasta/rice/beans, plain (unsalted, unsweetened) products, "
    "unless the ingredient name says otherwise (cooked, canned, smoked, salted...).\n"
    "- A close relative is fine when the exact food is missing (e.g. 'Kale' for 'Cavolo Nero').\n"
    "- piece_g: grams of ONE typical piece as recipes count it (1 egg ~ 50, 1 onion ~ 110, 1 chicken breast ~ 175, "
    "1 lemon ~ 85, 1 can ~ 400, 1 stock cube ~ 10). 0 if the ingredient is never counted in pieces (flour, oil, salt).\n"
    "- cup_g: grams of one US cup (240 ml) of it as used in recipes (water 240, flour 125, sugar 200, chopped onion 160).\n"
    "Return every ingredient name exactly as given.\n"
)

matches = load("matches.json")
todo = [n for n in names if n in terms and n not in matches]
if STEP in ("all", "pick") and todo:
    cands = {n: retrieve([n] + terms[n]) for n in todo}
    batches = [todo[i:i + 8] for i in range(0, len(todo), 8)]
    def run(batch):
        text = PICK_PROMPT
        for n in batch:
            text += f"\nIngredient: {n}\n" + "\n".join(f"  {j + 1}. {c['desc']}" for j, c in enumerate(cands[n]))
        data = call([{"role": "user", "content": text}], PICK_SCHEMA, 2048)
        got = {i["name"].lower(): i for i in data["items"]}
        out = {}
        for n in batch:
            g = got.get(n.lower())
            if not g: continue
            c = g["choice"]
            fdc = cands[n][c - 1]["fdc"] if 1 <= c <= len(cands[n]) else None
            out[n] = {"fdc": fdc, "piece_g": g["piece_g"] or None, "cup_g": g["cup_g"]}
        return out
    t = time.time()
    with ThreadPoolExecutor(2) as pool:
        for i, res in enumerate(pool.map(run, batches)):
            matches.update(res); save("matches.json", matches)
            if i % 10 == 0: print(f"  pick batch {i + 1}/{len(batches)} ({time.time() - t:.0f}s)")
    print("matches:", len(matches), "| no match:", sum(1 for m in matches.values() if not m["fdc"]))
