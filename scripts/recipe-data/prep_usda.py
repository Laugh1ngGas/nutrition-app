"""USDA SR Legacy CSVs -> usda.json: per-100 g nutrition plus gram weights of household portions."""
import csv, json, re, sys
from collections import defaultdict

SRC, OUT = sys.argv[1], sys.argv[2]
NUTRIENTS = {"1008": "kcal", "1003": "protein", "1005": "carbs", "1004": "fat", "1079": "fiber", "2000": "sugar", "1093": "sodium_mg"}
# Skip whole categories nobody cooks with
SKIP_CATS = {"3", "21", "25", "27"}  # baby foods, fast food, restaurant, QC materials

def rows(name):
    with open(f"{SRC}/{name}", encoding="utf-8") as f:
        yield from csv.DictReader(f)

cats = {r["id"]: r["description"] for r in rows("food_category.csv")}
foods = {r["fdc_id"]: {"fdc": int(r["fdc_id"]), "desc": r["description"], "cat": cats.get(r["food_category_id"], "")}
         for r in rows("food.csv") if r["food_category_id"] not in SKIP_CATS}
nut = defaultdict(dict)
for r in rows("food_nutrient.csv"):
    if r["fdc_id"] in foods and r["nutrient_id"] in NUTRIENTS:
        nut[r["fdc_id"]][NUTRIENTS[r["nutrient_id"]]] = round(float(r["amount"]), 2)

# "cup, chopped" -> cup; "medium (2-1/2" dia)" -> piece; "clove" -> clove ...
KINDS = [
    ("cup", r"^cups?\b"), ("tbsp", r"^(tbsp|tablespoons?)\b"), ("tsp", r"^(tsp|teaspoons?)\b"),
    ("clove", r"^cloves?\b"), ("slice", r"^slices?\b"), ("stick", r"^sticks?\b"), ("can", r"^can\b"),
    ("leaf", r"^lea(f|ves)\b"), ("sprig", r"^sprigs?\b"), ("bunch", r"^bunch\b"), ("head", r"^head\b"),
    ("stalk", r"^stalks?\b"),
    ("medium", r"^medium\b"), ("large", r"^(large|extra large)\b"), ("small", r"^small\b"),
    ("piece", r"^(fruit|whole|each|piece|breast|fillet|filet|egg|bulb|root|pepper|onion|banana|plantain|leg|thigh|drumstick|wing|steak|chop|link|sausage|patty|tortilla|roll|bun|bagel|muffin|cake)\b"),
]
portions = defaultdict(dict)
for r in rows("food_portion.csv"):
    if r["fdc_id"] not in foods:
        continue
    text = (r["modifier"] or r["portion_description"] or "").strip().lower()
    amount, grams = float(r["amount"] or 1), float(r["gram_weight"] or 0)
    if not grams or not amount:
        continue
    for kind, pattern in KINDS:
        if re.match(pattern, text):
            portions[r["fdc_id"]].setdefault(kind, round(grams / amount, 1))  # first (main) portion wins
            break

out = []
for fid, f in foods.items():
    n = nut.get(fid, {})
    if "kcal" not in n:
        continue
    p = portions.get(fid, {})
    piece = p.get("medium") or p.get("piece") or p.get("large") or p.get("small")
    out.append({**f, "n": n, "portions": {k: v for k, v in {**p, "piece": piece}.items() if v and k not in ("medium", "large", "small")}})
json.dump(out, open(OUT, "w", encoding="utf-8"), ensure_ascii=False)
print(len(out), "foods;", sum(1 for o in out if o["portions"]), "with portions")
