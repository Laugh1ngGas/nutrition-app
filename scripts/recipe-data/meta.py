"""Pass 3: per-recipe metadata TheMealDB doesn't have (servings, meal type, times, difficulty).
Cached in meta.json keyed by idMeal."""
import json, os, re, time, urllib.request
from concurrent.futures import ThreadPoolExecutor

URL = "https://laugh1nggas--nutrition-app-ai-serve.us-east.modal.run/v1/complete"
KEY = os.environ["AI_SERVICE_KEY"]
meals = json.load(open("meals.json", encoding="utf-8"))
meta = json.load(open("meta.json", encoding="utf-8")) if os.path.exists("meta.json") else {}

SCHEMA = {"type": "object", "properties": {"recipes": {"type": "array", "items": {"type": "object", "properties": {
    "id": {"type": "string"},
    "servings": {"type": "integer"},
    "meal_type": {"type": "string", "enum": ["breakfast", "lunch", "dinner", "snack"]},
    "prep_time_min": {"type": "integer"},
    "cook_time_min": {"type": "integer"},
    "difficulty": {"type": "string", "enum": ["easy", "medium", "hard"]}},
    "required": ["id", "servings", "meal_type", "prep_time_min", "cook_time_min", "difficulty"]}}},
    "required": ["recipes"]}
PROMPT = (
    "For each recipe below, estimate what the recipe text doesn't say:\n"
    "- servings: how many people the amounts feed (use the text if it says; a cake or tray bake is usually 8-12 slices, "
    "a family main dish 4-6, a sauce or condiment counts its typical portions).\n"
    "- meal_type: breakfast, lunch, dinner or snack (desserts, sides, starters, drinks and condiments = snack).\n"
    "- prep_time_min and cook_time_min: realistic minutes (marinating/chilling/rising counts as prep).\n"
    "- difficulty: easy, medium or hard.\n"
    "- title_uk: the dish name in natural literary Ukrainian, as a Ukrainian cookbook would write it. "
    "Use the established Ukrainian name if there is one (Borscht = Борщ). Keep foreign dish names transliterated "
    "(Paella = Паелья, Pierogi = Вареники only if they really are). No Russian words.\n"
    "Return every recipe id exactly as given.\n"
)

def describe(m):
    ings = [f"{(m.get(f'strMeasure{k}') or '').strip()} {(m.get(f'strIngredient{k}') or '').strip()}".strip()
            for k in range(1, 21) if (m.get(f"strIngredient{k}") or "").strip()]
    instr = " ".join((m.get("strInstructions") or "").split())[:700]
    return (f"\nid: {m['idMeal']}\ntitle: {m['strMeal']}\ncategory: {m.get('strCategory')}; cuisine: {m.get('strArea')}\n"
            f"ingredients: {'; '.join(ings)}\ninstructions: {instr}\n")

def call(text):
    body = json.dumps({"messages": [{"role": "user", "content": text}], "json_schema": SCHEMA,
                       "max_tokens": 1200, "temperature": 0.1}).encode()
    for attempt in range(8):
        try:
            req = urllib.request.Request(URL, data=body, headers={"Content-Type": "application/json", "X-AI-Key": KEY})
            return json.loads(urllib.request.urlopen(req, timeout=300).read())["data"]["recipes"]
        except Exception as e:
            print("  retry", attempt, str(e)[:120]); time.sleep(10)
    raise RuntimeError("AI service kept failing")

todo = [m for m in meals if m["idMeal"] not in meta]
batches = [todo[i:i + 4] for i in range(0, len(todo), 4)]
t = time.time()
def run(batch):
    # The model sometimes puts a stray character before the id ("।53483")
    got = {re.sub(r"\D", "", r["id"]): r for r in call(PROMPT + "".join(describe(m) for m in batch))}
    return {m["idMeal"]: {k: v for k, v in got[m["idMeal"]].items() if k != "id"} for m in batch if m["idMeal"] in got}
with ThreadPoolExecutor(int(os.getenv('WORKERS', '1'))) as pool:
    for i, res in enumerate(pool.map(run, batches)):
        meta.update(res)
        json.dump(meta, open("meta.json", "w", encoding="utf-8"), ensure_ascii=False, indent=0)
        if i % 10 == 0: print(f"  batch {i + 1}/{len(batches)} ({time.time() - t:.0f}s)", flush=True)
print("meta:", len(meta), "of", len(meals))
