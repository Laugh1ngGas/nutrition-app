import * as dotenv from 'dotenv';
import { Pool } from 'pg';

dotenv.config();

// DATABASE_URL lets this run against a hosted Postgres (Neon/Supabase) —
// those require SSL, unlike local/docker-compose Postgres.
const pool = process.env.DATABASE_URL
  ? new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } })
  : new Pool({
      host: process.env.DB_HOST,
      port: parseInt(process.env.DB_PORT || '5432'),
      database: process.env.DB_NAME,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
    });

const CATEGORIES = ['Chicken', 'Beef', 'Vegetarian', 'Seafood', 'Pasta', 'Breakfast', 'Dessert', 'Vegan'];
const RECIPES_PER_CATEGORY = 6;

const MEAL_TYPE_BY_CATEGORY: Record<string, string | undefined> = {
  Breakfast: 'breakfast',
  Dessert: 'snack',
};

const UNIT_WORDS: Record<string, string> = {
  cup: 'cup', cups: 'cup',
  tbsp: 'tbsp', tablespoon: 'tbsp', tablespoons: 'tbsp',
  tsp: 'tsp', teaspoon: 'tsp', teaspoons: 'tsp',
  g: 'g', gram: 'g', grams: 'g',
  kg: 'kg', kilogram: 'kg', kilograms: 'kg',
  ml: 'ml', milliliter: 'ml', milliliters: 'ml',
  l: 'l', liter: 'l', liters: 'l', litre: 'l', litres: 'l',
  slice: 'slice', slices: 'slice',
  piece: 'piece', pieces: 'piece',
  clove: 'piece', cloves: 'piece',
  can: 'piece', cans: 'piece',
};

interface MealDbMeal {
  strMeal: string;
  strCategory?: string;
  strArea?: string;
  strInstructions?: string;
  strMealThumb?: string;
  strTags?: string | null;
  [key: `strIngredient${number}`]: string | undefined;
  [key: `strMeasure${number}`]: string | undefined;
}

function parseMeasure(measure: string | undefined): { quantity: number; unit: string } {
  const trimmed = (measure || '').trim().toLowerCase();
  const numMatch = trimmed.match(/^(\d+\s*\/\s*\d+|\d+(\.\d+)?)/);
  let quantity = 1;
  if (numMatch) {
    const raw = numMatch[1].replace(/\s/g, '');
    if (raw.includes('/')) {
      const [n, d] = raw.split('/').map(Number);
      quantity = d ? n / d : 1;
    } else {
      quantity = parseFloat(raw);
    }
  }
  const words = trimmed.match(/[a-z]+/g) || [];
  let unit = 'piece';
  for (const word of words) {
    if (UNIT_WORDS[word]) { unit = UNIT_WORDS[word]; break; }
  }
  return { quantity: quantity > 0 ? quantity : 1, unit };
}

async function findOrCreateFood(name: string): Promise<string> {
  const cleanName = name.trim();
  const existing = await pool.query('SELECT id FROM foods WHERE LOWER(name) = LOWER($1) LIMIT 1', [cleanName]);
  if (existing.rowCount) return existing.rows[0].id;

  const created = await pool.query(
    `INSERT INTO foods (name, calories, source) VALUES ($1, 0, 'themealdb') RETURNING id`,
    [cleanName]
  );
  return created.rows[0].id;
}

async function seedRecipe(meal: MealDbMeal): Promise<'seeded' | 'skipped'> {
  const existing = await pool.query('SELECT id FROM recipes WHERE title = $1', [meal.strMeal]);
  if (existing.rowCount) return 'skipped';

  const dietTypes: string[] = [];
  const tags = (meal.strTags || '').toLowerCase();
  const category = (meal.strCategory || '').toLowerCase();
  if (category.includes('vegan') || tags.includes('vegan')) dietTypes.push('vegan');
  else if (category.includes('vegetarian') || tags.includes('vegetarian')) dietTypes.push('vegetarian');

  const mealType = (meal.strCategory && MEAL_TYPE_BY_CATEGORY[meal.strCategory]) || null;

  const recipeResult = await pool.query(
    `INSERT INTO recipes (title, instructions, image_url, servings, cuisine_type, meal_type, diet_types, is_public)
     VALUES ($1, $2, $3, $4, $5, $6, $7, TRUE)
     RETURNING id`,
    [
      meal.strMeal,
      meal.strInstructions || null,
      meal.strMealThumb || null,
      4,
      meal.strArea || null,
      mealType,
      dietTypes.length ? dietTypes : null,
    ]
  );
  const recipeId = recipeResult.rows[0].id;

  let orderIndex = 0;
  for (let i = 1; i <= 20; i++) {
    const ingName = meal[`strIngredient${i}`];
    const measure = meal[`strMeasure${i}`];
    if (!ingName || !ingName.trim()) continue;

    const foodId = await findOrCreateFood(ingName);
    const { quantity, unit } = parseMeasure(measure);
    await pool.query(
      `INSERT INTO recipe_ingredients (recipe_id, food_id, quantity, unit, order_index)
       VALUES ($1, $2, $3, $4, $5)`,
      [recipeId, foodId, quantity, unit, orderIndex]
    );
    orderIndex++;
  }

  console.log(`  seeded: ${meal.strMeal} (${orderIndex} ingredients)`);
  return 'seeded';
}

async function main() {
  console.log('Seeding recipes from TheMealDB...');
  let seededCount = 0;
  let skippedCount = 0;

  for (const category of CATEGORIES) {
    console.log(`Category: ${category}`);
    const listRes = await fetch(`https://www.themealdb.com/api/json/v1/1/filter.php?c=${encodeURIComponent(category)}`);
    const listData = (await listRes.json()) as { meals: { idMeal: string }[] | null };
    const ids = (listData.meals || []).slice(0, RECIPES_PER_CATEGORY).map((m) => m.idMeal);

    for (const id of ids) {
      const detailRes = await fetch(`https://www.themealdb.com/api/json/v1/1/lookup.php?i=${id}`);
      const detailData = (await detailRes.json()) as { meals: MealDbMeal[] | null };
      const meal = detailData.meals?.[0];
      if (!meal) continue;

      const outcome = await seedRecipe(meal);
      if (outcome === 'seeded') seededCount++;
      else skippedCount++;

      await new Promise((r) => setTimeout(r, 150));
    }
  }

  console.log(`Done. Seeded ${seededCount} recipes, skipped ${skippedCount} already-existing.`);
  await pool.end();
}

main().catch((err) => {
  console.error('Recipe seed failed:', err);
  process.exit(1);
});
