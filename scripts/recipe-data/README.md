# Recipe nutrition data

Builds the two data files the backend uses to calculate calories and macros for recipes:

- `backend/src/data/ingredient-nutrition.json`: for each of TheMealDB's ~1000 ingredient names, the matching USDA food (nutrition per 100 g) and the gram weight of household portions (1 cup, 1 tbsp, 1 clove, 1 piece...).
- `backend/src/data/recipe-meta.json`: for each TheMealDB recipe, what the recipe doesn't say: servings, meal type, prep/cook time and difficulty. (Ukrainian titles are paused for now; the importer leaves `title_uk` empty.)

The backend turns each recipe's measures ("1 1/2 cups", "2 cloves", "200g/7oz") into grams with these portion weights, multiplies by the USDA nutrition and divides by the servings (`backend/src/services/recipeNutrition.ts`). Rules worth knowing:

- Seasoning "to taste", garnishes and sides "to serve" count as 0 g. A measure that only says how something is prepared ("Chopped") counts as one piece, or 0 g if the ingredient isn't counted in pieces.
- Oil for deep frying ("for frying", or more than 250 g of oil) counts 10%, the share food absorbs.
- "1 whole" chicken/duck/turkey is the bird (1.5 kg), not one piece.

The same data also drives fridge matching: every food gets a `match_key` (its USDA food, migration 004), so a fridge "Onion" counts for a recipe's "Onions" or "Red Onions".

## Quality

- 997 TheMealDB ingredient names: 938 matched to USDA foods (14 of them set by hand), the rest are rare items with no USDA equivalent (mirin, lime leaves, food colouring...).
- 791 recipes: 702 (89%) have every ingredient counted; the others leave out one or two minor ingredients.
- Spot checks: Spaghetti Bolognese 631 kcal, Shakshuka 173 kcal, Pancakes 215 kcal per serving.

## Sources

- **USDA FoodData Central, SR Legacy (April 2018)**: 7,793 foods with laboratory nutrition data and household portion weights. Public domain (CC0). <https://fdc.nal.usda.gov/download-datasets>
- **TheMealDB**: recipes and the ingredient list. <https://www.themealdb.com/api.php>

## How the data was made

USDA names its foods differently from recipes ("Onions, raw" vs "Onion", "Cream, fluid, heavy whipping" vs "Double Cream"). So matching uses the app's own AI model (Gemma 4 31B on Modal, `/v1/complete` endpoint) in two passes:

1. `match.py terms`: the model rewrites each ingredient name as 1-3 search phrases in USDA's vocabulary (British to American names: aubergine = eggplant, caster sugar = sugar...).
2. `match.py pick`: a keyword search (TF-IDF) finds the 14 closest USDA foods for those phrases. The model picks the one with the most similar nutrition, or none. It also estimates the weight of one typical piece and one cup, used when USDA has no portion data.
3. `meta.py`: the model estimates servings, meal type, times and difficulty of each recipe.
4. The matches were then checked by hand, most-used ingredients first. Corrections are in `overrides.json`, which wins over the model's choice: e.g. "Coriander" is the fresh leaves (not the seed), canned beans are the canned product (not dry beans, ~3x the calories), and typical piece weights for things counted in pieces (a cardamom pod 0.2 g, a filo sheet 19 g, a stock cube 10 g).
5. `build_data.py` merges everything into the two backend files.

The model's answers are cached in `terms.json`, `matches.json` and `meta.json`, so rebuilding doesn't need the model again.

## Rebuild

```powershell
# 1. Download and unpack the USDA SR Legacy CSV dataset
curl.exe -L -o sr.zip https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_sr_legacy_food_csv_2018-04.zip
Expand-Archive sr.zip -DestinationPath usda
python prep_usda.py usda/FoodData_Central_sr_legacy_food_csv_2018-04 usda.json

# 2. Only for new ingredients/recipes (needs the AI service key and the model running)
$env:AI_SERVICE_KEY = [Environment]::GetEnvironmentVariable("AI_SERVICE_KEY","User")
python fetch_mealdb.py   # meals.json + ingredients.json
python match.py
python meta.py

# 3. Write the backend data files
python build_data.py ../../backend/src/data
```

Then import the recipes into the database (after migrations `003_recipe_nutrition.sql` and `004_food_match_key.sql`):

```powershell
cd ../../backend
npm run db:seed-recipes
```
