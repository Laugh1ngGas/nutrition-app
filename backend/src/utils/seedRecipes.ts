// Imports every TheMealDB recipe (~800) with calories and macros calculated
// from USDA data. Safe to run again: recipes are matched by their TheMealDB
// id (or title, for the ones imported before ids were kept) and updated.
//   npm run db:seed-recipes
// Run migration 003_recipe_nutrition.sql first.
import 'dotenv/config';
import { getClient, query } from '../config/database';
import redisClient, { connectRedis, deleteCacheByPattern } from '../config/redis';
import { fetchAllMealDb, importMeal } from '../services/recipeImport.service';
import { findIngredient } from '../services/recipeNutrition';

async function main() {
  console.log('Fetching TheMealDB recipes...');
  const meals = await fetchAllMealDb();
  console.log(`${meals.length} recipes`);

  let created = 0, updated = 0, complete = 0;
  const missing = new Map<string, number>();
  const client = await getClient();
  try {
    for (const [i, meal] of meals.entries()) {
      // One transaction per recipe, so a bad one doesn't undo the rest
      await client.query('BEGIN');
      try {
        const result = await importMeal(client, meal);
        await client.query('COMMIT');
        if (result.created) created++; else updated++;
        if (!result.nutrition.missing.length) complete++;
        for (const name of result.nutrition.missing) missing.set(name, (missing.get(name) ?? 0) + 1);
      } catch (err) {
        await client.query('ROLLBACK');
        console.error(`  failed: ${meal.strMeal}:`, (err as Error).message);
      }
      if ((i + 1) % 50 === 0) console.log(`  ${i + 1}/${meals.length}`);
    }
  } finally {
    client.release();
  }

  // Foods added some other way (photo scan, by hand) get nutrition too
  const zero = await query('SELECT id, name FROM foods WHERE calories = 0');
  let filled = 0;
  for (const food of zero.rows) {
    const info = findIngredient(food.name);
    if (!info?.per100) continue;
    await query(
      `UPDATE foods SET calories = $2, protein_g = $3, carbs_g = $4, fat_g = $5, fiber_g = $6,
              category = COALESCE(category, $7), external_id = COALESCE(external_id, $8), updated_at = NOW()
       WHERE id = $1`,
      [food.id, info.per100.kcal, info.per100.protein, info.per100.carbs, info.per100.fat, info.per100.fiber,
       info.category ?? null, `fdc:${info.fdc}`]
    );
    filled++;
  }

  // Recipe details are cached for an hour
  try {
    await connectRedis();
    await deleteCacheByPattern('recipe:*');
    await redisClient.quit();
  } catch (err) {
    console.warn('Could not clear the recipe cache (it expires within an hour):', (err as Error).message);
  }

  console.log(`Done: ${created} added, ${updated} updated; ${complete} with every ingredient counted.`);
  console.log(`Nutrition filled in for ${filled} other foods.`);
  const top = [...missing.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25);
  if (top.length) console.log('Most common ingredients left out of totals:', top.map(([n, c]) => `${n} (${c})`).join(', '));
  process.exit(0);
}

main().catch((err) => {
  console.error('Recipe import failed:', err);
  process.exit(1);
});
