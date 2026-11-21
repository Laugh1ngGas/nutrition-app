// Imports TheMealDB recipes with nutrition calculated from USDA data. Used by
// the bulk import (utils/seedRecipes.ts) and by the AI assistant when it finds
// a recipe on TheMealDB that isn't in the catalogue yet.
import { PoolClient } from 'pg';
import { getClient } from '../config/database';
import { deleteCache } from '../config/redis';
import recipeMetaData from '../data/recipe-meta.json';
import {
  IngredientInfo, findIngredient, measureForDb, measureToGrams, recipeNutrition, RecipeNutrition,
} from './recipeNutrition';

const MEALDB = 'https://www.themealdb.com/api/json/v1/1';

export interface MealDbMeal {
  idMeal: string;
  strMeal: string;
  strCategory?: string | null;
  strArea?: string | null;
  strInstructions?: string | null;
  strMealThumb?: string | null;
  strTags?: string | null;
  [key: string]: string | null | undefined;
}

interface RecipeMeta {
  servings: number;
  meal_type: 'breakfast' | 'lunch' | 'dinner' | 'snack';
  prep_time_min: number;
  cook_time_min: number;
  difficulty: 'easy' | 'medium' | 'hard';
  title_uk: string;
}

// Estimated once per recipe by the AI model (scripts/recipe-data/meta.py),
// since TheMealDB doesn't say how many servings a recipe makes
const RECIPE_META = recipeMetaData as Record<string, RecipeMeta>;

async function mealDb<T>(path: string): Promise<T> {
  const res = await fetch(`${MEALDB}/${path}`, { signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`TheMealDB ${path}: ${res.status}`);
  return res.json() as Promise<T>;
}

export async function searchMealDb(name: string): Promise<MealDbMeal[]> {
  const data = await mealDb<{ meals: MealDbMeal[] | null }>(`search.php?s=${encodeURIComponent(name)}`);
  return data.meals ?? [];
}

/** Ids of recipes with this main ingredient ("chicken breast" -> chicken_breast) */
export async function filterMealDbByIngredient(ingredient: string): Promise<string[]> {
  const key = ingredient.trim().toLowerCase().replace(/\s+/g, '_');
  const data = await mealDb<{ meals: { idMeal: string }[] | null }>(`filter.php?i=${encodeURIComponent(key)}`);
  return (data.meals ?? []).map((m) => m.idMeal);
}

export async function lookupMealDb(id: string): Promise<MealDbMeal | null> {
  const data = await mealDb<{ meals: MealDbMeal[] | null }>(`lookup.php?i=${encodeURIComponent(id)}`);
  return data.meals?.[0] ?? null;
}

/** Every recipe on TheMealDB (searched letter by letter, ~800) */
export async function fetchAllMealDb(): Promise<MealDbMeal[]> {
  const all = new Map<string, MealDbMeal>();
  for (const ch of 'abcdefghijklmnopqrstuvwxyz0123456789') {
    const data = await mealDb<{ meals: MealDbMeal[] | null }>(`search.php?f=${ch}`);
    for (const m of data.meals ?? []) all.set(m.idMeal, m);
  }
  return [...all.values()];
}

export function mealIngredients(meal: MealDbMeal): { name: string; measure: string }[] {
  const out = [];
  for (let i = 1; i <= 20; i++) {
    const name = (meal[`strIngredient${i}`] || '').trim();
    if (name) out.push({ name, measure: (meal[`strMeasure${i}`] || '').trim() });
  }
  return out;
}

// TheMealDB has a few broken characters ("Chop Up and �Saltfish")
const clean = (s: string | null | undefined) => (s || '').replace(/�/g, '').replace(/\s+/g, ' ').trim();

function defaultMeta(meal: MealDbMeal): RecipeMeta {
  const category = meal.strCategory || '';
  const mealType = category === 'Breakfast' ? 'breakfast'
    : ['Dessert', 'Side', 'Starter'].includes(category) ? 'snack' : 'dinner';
  return { servings: 4, meal_type: mealType, prep_time_min: 15, cook_time_min: 30, difficulty: 'medium', title_uk: '' };
}

const DIET_BY_CATEGORY: Record<string, string> = { Vegan: 'vegan', Vegetarian: 'vegetarian' };

const toPer100Row = (info: IngredientInfo | null) => [
  info?.per100?.kcal ?? 0, info?.per100?.protein ?? 0, info?.per100?.carbs ?? 0,
  info?.per100?.fat ?? 0, info?.per100?.fiber ?? 0,
];

/**
 * The food for an ingredient name: an existing one (filled in with USDA
 * nutrition if it has none yet) or a new one.
 */
export async function foodForIngredient(client: PoolClient, name: string, source = 'themealdb'): Promise<string> {
  const info = findIngredient(name);
  const existing = await client.query(
    `SELECT id, calories FROM foods WHERE LOWER(name) = LOWER($1)
     ORDER BY is_verified DESC, created_at LIMIT 1`,
    [name]
  );
  if (existing.rowCount) {
    const food = existing.rows[0];
    if (info?.per100 && Number(food.calories) === 0) {
      await client.query(
        `UPDATE foods SET calories = $2, protein_g = $3, carbs_g = $4, fat_g = $5, fiber_g = $6,
                category = COALESCE(category, $7), external_id = COALESCE(external_id, $8), updated_at = NOW()
         WHERE id = $1`,
        [food.id, ...toPer100Row(info), info.category ?? null, `fdc:${info.fdc}`]
      );
    }
    return food.id;
  }
  const created = await client.query(
    `INSERT INTO foods (name, calories, protein_g, carbs_g, fat_g, fiber_g, category, source, external_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
    [
      info?.name ?? name, ...toPer100Row(info), info?.category ?? null,
      info?.per100 ? 'usda' : source, info?.fdc ? `fdc:${info.fdc}` : null,
    ]
  );
  return created.rows[0].id;
}

export interface IngredientLine {
  name: string;
  measure: string;
  grams: number | null;
}

/** Replaces a recipe's ingredients; returns the nutrition per serving */
export async function writeIngredients(
  client: PoolClient, recipeId: string, lines: IngredientLine[], servings: number, source = 'themealdb'
): Promise<RecipeNutrition> {
  await client.query('DELETE FROM recipe_ingredients WHERE recipe_id = $1', [recipeId]);
  const nutritionLines = [];
  for (const [index, line] of lines.entries()) {
    const info = findIngredient(line.name);
    const foodId = await foodForIngredient(client, line.name, source);
    const { quantity, unit } = measureForDb(line.measure, line.grams);
    await client.query(
      `INSERT INTO recipe_ingredients (recipe_id, food_id, quantity, unit, note, grams, order_index)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [recipeId, foodId, Math.min(quantity, 999999), unit, line.measure.slice(0, 255) || null, line.grams, index]
    );
    nutritionLines.push({ name: line.name, grams: line.grams, info });
  }
  const nutrition = recipeNutrition(nutritionLines, servings);
  await client.query(
    `UPDATE recipes SET calories_per_serving = $2, protein_per_serving_g = $3, carbs_per_serving_g = $4,
            fat_per_serving_g = $5, fiber_per_serving_g = $6, updated_at = NOW()
     WHERE id = $1`,
    [recipeId, nutrition.calories, nutrition.protein_g, nutrition.carbs_g, nutrition.fat_g, nutrition.fiber_g]
  );
  return nutrition;
}

export interface ImportResult {
  id: string;
  created: boolean;
  nutrition: RecipeNutrition;
}

/** Adds a TheMealDB recipe to the catalogue, or updates it if it's there */
export async function importMeal(client: PoolClient, meal: MealDbMeal): Promise<ImportResult> {
  const meta = RECIPE_META[meal.idMeal] ?? defaultMeta(meal);
  const title = clean(meal.strMeal);
  const diet = DIET_BY_CATEGORY[meal.strCategory || ''];

  // Matched by TheMealDB id, or by title for recipes imported before ids were kept
  const existing = await client.query(
    `SELECT id FROM recipes
     WHERE (source = 'themealdb' AND external_id = $1) OR (source IS NULL AND title = $2)
     ORDER BY external_id NULLS LAST LIMIT 1`,
    [meal.idMeal, title]
  );
  const values = [
    title, meta.title_uk || null, (meal.strInstructions || '').replace(/�/g, '').trim() || null,
    meal.strMealThumb || null, meta.prep_time_min, meta.cook_time_min, meta.servings, meta.difficulty,
    meal.strArea && meal.strArea !== 'Unknown' ? meal.strArea : null, meta.meal_type, diet ? [diet] : null, meal.idMeal,
  ];
  let id: string;
  if (existing.rowCount) {
    id = existing.rows[0].id;
    await client.query(
      `UPDATE recipes SET title = $1, title_uk = $2, instructions = $3, image_url = $4, prep_time_min = $5,
              cook_time_min = $6, servings = $7, difficulty = $8, cuisine_type = $9, meal_type = $10,
              diet_types = $11, source = 'themealdb', external_id = $12, is_public = TRUE, updated_at = NOW()
       WHERE id = $13`,
      [...values, id]
    );
  } else {
    const created = await client.query(
      `INSERT INTO recipes (title, title_uk, instructions, image_url, prep_time_min, cook_time_min, servings,
                            difficulty, cuisine_type, meal_type, diet_types, source, external_id, is_public)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'themealdb', $12, TRUE) RETURNING id`,
      values
    );
    id = created.rows[0].id;
  }

  const lines = mealIngredients(meal).map((ing) => ({
    ...ing,
    grams: measureToGrams(ing.measure, findIngredient(ing.name)),
  }));
  const nutrition = await writeIngredients(client, id, lines, meta.servings);
  return { id, created: !existing.rowCount, nutrition };
}

/** importMeal in its own transaction, for one-off imports from the assistant */
export async function importMealById(mealDbId: string): Promise<ImportResult | null> {
  const meal = await lookupMealDb(mealDbId);
  if (!meal) return null;
  const client = await getClient();
  try {
    await client.query('BEGIN');
    const result = await importMeal(client, meal);
    await client.query('COMMIT');
    await deleteCache(`recipe:${result.id}`).catch(() => undefined); // a stale cache is not worth failing for
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
