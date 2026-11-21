"""Downloads every TheMealDB recipe (meals.json) and its ingredient list (ingredients.json)."""
import json, string, urllib.request

BASE = "https://www.themealdb.com/api/json/v1/1/"

def get(path):
    req = urllib.request.Request(BASE + path, headers={"User-Agent": "recipe-import"})
    return json.loads(urllib.request.urlopen(req, timeout=60).read())

meals = {}
for ch in string.ascii_lowercase + string.digits:  # the free API has no "list all", only search by first letter
    for m in get(f"search.php?f={ch}").get("meals") or []:
        meals[m["idMeal"]] = m
json.dump(list(meals.values()), open("meals.json", "w", encoding="utf-8"), ensure_ascii=False)
ingredients = get("list.php?i=list")["meals"]
json.dump(ingredients, open("ingredients.json", "w", encoding="utf-8"), ensure_ascii=False)
print(len(meals), "recipes,", len(ingredients), "ingredients")
