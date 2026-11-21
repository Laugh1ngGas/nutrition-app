# Recipe nutrition data

Builds the two data files the backend uses to calculate calories and macros for recipes:

- `backend/src/data/ingredient-nutrition.json`: for each of TheMealDB's ~1000 ingredient names, the matching USDA food (nutrition per 100 g) and the gram weight of household portions (1 cup, 1 tbsp, 1 clove, 1 piece...).
- `backend/src/data/recipe-meta.json`: for each TheMealDB recipe, what the recipe doesn't say: servings, meal type, prep/cook time, difficulty and a Ukrainian title.

The backend turns each recipe's measures ("1 1/2 cups", "2 cloves", "200g/7oz") into grams with these portion weights, multiplies by the USDA nutrition and divides by the servings (`backend/src/services/recipeNutrition.ts`).

## Sources

- **USDA FoodData Central, SR Legacy (April 2018)**: 7,793 foods with laboratory nutrition data and household portion weights. Public domain (CC0). <https://fdc.nal.usda.gov/download-datasets>
- **TheMealDB**: recipes and the ingredient list. <https://www.themealdb.com/api.php>

## How the data was made

USDA names its foods differently from recipes ("Onions, raw" vs "Onion", "Cream, fluid, heavy whipping" vs "Double Cream"). So matching uses the app's own AI model (Gemma 4 31B on Modal, `/v1/complete` endpoint) in two passes:

1. `match.py terms`: the model rewrites each ingredient name as 1-3 search phrases in USDA's vocabulary (British to American names: aubergine = eggplant, caster sugar = sugar...).
2. `match.py pick`: a keyword search (TF-IDF) finds the 14 closest USDA foods for those phrases. The model picks the one with the most similar nutrition, or none. It also estimates the weight of one typical piece and one cup, used when USDA has no portion data.
3. `meta.py`: the model estimates servings, meal type, times, difficulty and the Ukrainian title of each recipe.
4. The matches were then checked by hand. Corrections are in `overrides.json`, which wins over the model's choice.
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

Then import the recipes into the database (after migration `003_recipe_nutrition.sql`):

```powershell
cd ../../backend
npm run db:seed-recipes
```
