import { query } from '../config/database';
import { AppError } from '../middleware/errorHandler';
import { FoodLog, MealType, LogStatus, DailyNutrition } from '../types';

export async function logFood(
  userId: string,
  data: {
    recipe_id?: string;
    food_id?: string;
    meal_type: MealType;
    servings?: number;
    quantity_g?: number;
    note?: string;
    log_date?: string;
  }
): Promise<FoodLog> {
  if (!data.recipe_id && !data.food_id) {
    throw new AppError('Either recipe_id or food_id is required', 400);
  }

  let calories = 0, protein_g = 0, carbs_g = 0, fat_g = 0, fiber_g = 0;

  if (data.food_id) {
    const foodResult = await query(
      'SELECT calories, protein_g, carbs_g, fat_g, fiber_g FROM foods WHERE id = $1',
      [data.food_id]
    );
    if (!foodResult.rowCount || foodResult.rowCount === 0) throw new AppError('Food not found', 404);

    const food = foodResult.rows[0];
    const qty = data.quantity_g || 100;
    const ratio = qty / 100;
    calories = food.calories * ratio;
    protein_g = food.protein_g * ratio;
    carbs_g = food.carbs_g * ratio;
    fat_g = food.fat_g * ratio;
    fiber_g = food.fiber_g * ratio;
  }

  if (data.recipe_id) {
    const recipeResult = await query(
      `SELECT calories_per_serving, protein_per_serving_g, carbs_per_serving_g,
              fat_per_serving_g, fiber_per_serving_g FROM recipes WHERE id = $1`,
      [data.recipe_id]
    );
    if (!recipeResult.rowCount || recipeResult.rowCount === 0) throw new AppError('Recipe not found', 404);

    const recipe = recipeResult.rows[0];
    const servings = data.servings || 1;
    calories = (recipe.calories_per_serving || 0) * servings;
    protein_g = (recipe.protein_per_serving_g || 0) * servings;
    carbs_g = (recipe.carbs_per_serving_g || 0) * servings;
    fat_g = (recipe.fat_per_serving_g || 0) * servings;
    fiber_g = (recipe.fiber_per_serving_g || 0) * servings;
  }

  const result = await query(
    `INSERT INTO food_logs
      (user_id, recipe_id, food_id, meal_type, log_date, servings, quantity_g,
       calories, protein_g, carbs_g, fat_g, fiber_g, note)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
     RETURNING *`,
    [
      userId,
      data.recipe_id || null,
      data.food_id || null,
      data.meal_type,
      data.log_date || new Date().toISOString().split('T')[0],
      data.servings || 1,
      data.quantity_g || null,
      Math.round(calories * 10) / 10,
      Math.round(protein_g * 10) / 10,
      Math.round(carbs_g * 10) / 10,
      Math.round(fat_g * 10) / 10,
      Math.round(fiber_g * 10) / 10,
      data.note || null,
    ]
  );

  return result.rows[0] as FoodLog;
}

export async function getDailyNutrition(userId: string, date: string): Promise<DailyNutrition> {
  const logsResult = await query(
    `SELECT fl.*,
            r.title as recipe_title, r.image_url as recipe_image,
            f.name as food_name, f.image_url as food_image
     FROM food_logs fl
     LEFT JOIN recipes r ON fl.recipe_id = r.id
     LEFT JOIN foods f ON fl.food_id = f.id
     WHERE fl.user_id = $1 AND fl.log_date = $2 AND fl.status != 'skipped'
     ORDER BY fl.logged_at ASC`,
    [userId, date]
  );

  const logs = logsResult.rows as FoodLog[];

  const totals = logs.reduce(
    (acc, log) => ({
      calories: acc.calories + (log.calories || 0),
      protein_g: acc.protein_g + (log.protein_g || 0),
      carbs_g: acc.carbs_g + (log.carbs_g || 0),
      fat_g: acc.fat_g + (log.fat_g || 0),
      fiber_g: acc.fiber_g + (log.fiber_g || 0),
    }),
    { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0, fiber_g: 0 }
  );

  const mealTypes: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack', 'pre_workout', 'post_workout'];

  const meals = mealTypes
    .map((mealType) => {
      const entries = logs.filter((l) => l.meal_type === mealType);
      return {
        meal_type: mealType,
        entries,
        subtotal_calories: Math.round(entries.reduce((s, e) => s + (e.calories || 0), 0)),
      };
    })
    .filter((m) => m.entries.length > 0);

  return {
    date,
    total_calories: Math.round(totals.calories),
    total_protein_g: Math.round(totals.protein_g * 10) / 10,
    total_carbs_g: Math.round(totals.carbs_g * 10) / 10,
    total_fat_g: Math.round(totals.fat_g * 10) / 10,
    total_fiber_g: Math.round(totals.fiber_g * 10) / 10,
    meals,
  };
}

export async function deleteFoodLog(userId: string, logId: string): Promise<void> {
  const result = await query(
    'DELETE FROM food_logs WHERE id = $1 AND user_id = $2 RETURNING id',
    [logId, userId]
  );
  if (!result.rowCount || result.rowCount === 0) {
    throw new AppError('Log entry not found', 404);
  }
}

export async function getWeeklyStats(userId: string, startDate: string) {
  const result = await query(
    `SELECT
       log_date,
       ROUND(SUM(calories)) as total_calories,
       ROUND(SUM(protein_g)::numeric, 1) as total_protein_g,
       ROUND(SUM(carbs_g)::numeric, 1) as total_carbs_g,
       ROUND(SUM(fat_g)::numeric, 1) as total_fat_g
     FROM food_logs
     WHERE user_id = $1
       AND log_date >= $2::date
       AND log_date < ($2::date + INTERVAL '7 days')
       AND status != 'skipped'
     GROUP BY log_date
     ORDER BY log_date ASC`,
    [userId, startDate]
  );
  return result.rows;
}
