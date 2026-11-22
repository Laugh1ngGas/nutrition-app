"""matches.json + usda.json (+ overrides.json, hand fixes) -> backend/src/data/ingredient-nutrition.json
meta.json -> backend/src/data/recipe-meta.json"""
import json, os, sys
from collections import Counter

OUT_DIR = sys.argv[1]
usda = {u["fdc"]: u for u in json.load(open("usda.json", encoding="utf-8"))}
matches = json.load(open("matches.json", encoding="utf-8"))
overrides = {k.lower(): v for k, v in (json.load(open("overrides.json", encoding="utf-8")) if os.path.exists("overrides.json") else {}).items()}

CATEGORY = {
    "Dairy and Egg Products": "dairy", "Spices and Herbs": "spices", "Fats and Oils": "oils",
    "Poultry Products": "poultry", "Soups, Sauces, and Gravies": "condiments", "Sausages and Luncheon Meats": "meat",
    "Breakfast Cereals": "grains", "Fruits and Fruit Juices": "fruits", "Pork Products": "meat",
    "Vegetables and Vegetable Products": "vegetables", "Nut and Seed Products": "nuts", "Beef Products": "meat",
    "Beverages": "beverages", "Finfish and Shellfish Products": "seafood", "Legumes and Legume Products": "legumes",
    "Lamb, Veal, and Game Products": "meat", "Baked Products": "bakery", "Sweets": "snacks",
    "Cereal Grains and Pasta": "grains", "Snacks": "snacks", "Alcoholic Beverages": "beverages",
    "American Indian/Alaska Native Foods": None, "Meals, Entrees, and Side Dishes": None,
}
USDA_PORTIONS = ["cup", "tbsp", "tsp", "clove", "slice", "stick", "can", "bunch", "head", "sprig", "leaf", "stalk"]

# Hand-set ingredients the model left out are added as well
known = {k.lower() for k in matches}
for key in overrides:
    if key not in known:
        matches[key[:1].upper() + key[1:]] = {"fdc": None, "piece_g": None, "cup_g": None}

out, flags = {}, []
for name, m in sorted(matches.items(), key=lambda kv: kv[0].lower()):
    m = {**m, **overrides.get(name.lower(), {})}
    u = usda.get(m["fdc"]) if m.get("fdc") else None
    g = {k: v for k, v in (u["portions"] if u else {}).items() if k in USDA_PORTIONS}
    if "cup" not in g and m.get("cup_g"):
        g["cup"] = m["cup_g"]
    # Recipes count pieces the way people buy them (half a chicken breast, a
    # medium egg); the model's estimate fits that better than USDA's portions
    piece = m.get("piece_g") or (u["portions"].get("piece") if u else None)
    if piece:
        g["piece"] = piece
        usda_piece = u["portions"].get("piece") if u else None
        if usda_piece and not (usda_piece / 3 <= piece <= usda_piece * 3):
            flags.append(f"piece {name}: model {piece} g vs USDA {usda_piece} g")
    n = u["n"] if u else None
    out[name.lower()] = {
        "name": name,
        "fdc": u["fdc"] if u else None,
        "usda": u["desc"] if u else None,
        "category": m.get("category") or (CATEGORY.get(u["cat"]) if u else None),
        "per100": {"kcal": n.get("kcal", 0), "protein": n.get("protein", 0), "carbs": n.get("carbs", 0),
                   "fat": n.get("fat", 0), "fiber": n.get("fiber", 0)} if n else None,
        "g": {k: round(v, 1) for k, v in g.items()},
    }

os.makedirs(OUT_DIR, exist_ok=True)
json.dump(out, open(os.path.join(OUT_DIR, "ingredient-nutrition.json"), "w", encoding="utf-8"),
          ensure_ascii=False, separators=(",", ":"), sort_keys=True)
meta = json.load(open("meta.json", encoding="utf-8")) if os.path.exists("meta.json") else {}
json.dump(meta, open(os.path.join(OUT_DIR, "recipe-meta.json"), "w", encoding="utf-8"),
          ensure_ascii=False, separators=(",", ":"), sort_keys=True)
print(len(out), "ingredients,", sum(1 for o in out.values() if o["per100"]), "with nutrition;", len(meta), "recipe meta")
print("categories:", Counter(o["category"] for o in out.values()).most_common())
for f in flags[:40]: print(" ", f)
