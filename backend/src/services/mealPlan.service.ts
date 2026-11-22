import { randomInt } from 'crypto';
import { getClient, query } from '../config/database';
import { AppError } from '../middleware/errorHandler';
import { fridgeKeys } from './fridgeMatch';
import { calculateDailyTargets } from './auth.service';

// Weekly meal plan generator. Deterministic rules plus a little randomness, so
// "Regenerate" gives a different but still sensible week:
//   1. drop recipes that break the user's diet or contain their allergens
//   2. score the rest: share of ingredients already in the fridge, ingredients
//      that expire soon, favourites, minus recipes eaten in the last week
//   3. fill Monday to Sunday in order, best score first (so recipes that use
//      expiring food land early in the week), avoiding repeats
// Recipes have no calorie data yet (TheMealDB), so calories aren't balanced.

export const PLAN_SLOTS = ['breakfast', 'lunch', 'dinner'] as const;
export type PlanSlot = (typeof PLAN_SLOTS)[number];

// Neither recipes nor foods carry allergen data, so allergens and diets are
// checked against ingredient names. A heuristic, but it errs on the side of
// excluding: "nutmeg" is not a nut, while "pine nuts" and "almonds" are.
const words = (...w: string[]) => new RegExp(`\\b(?:${w.join('|')})`, 'i');

const ALLERGEN_KEYWORDS: Record<string, RegExp> = {
  gluten: words('wheat', 'flour', 'bread', 'pasta', 'spaghetti', 'penne', 'noodle', 'couscous', 'barley', 'rye',
    'tortilla', 'pastry', 'biscuit', 'cracker', 'semolina', 'bulgur', 'beer', 'soy sauce', 'pitta', 'pita', 'bun',
    'baguette', 'lasagne', 'macaroni', 'fettuccine', 'linguine', 'tagliatelle', 'rigatoni', 'farfalle', 'breadcrumb'),
  dairy: words('milk', 'cheese', 'butter', 'cream', 'yogh?urt', 'parmesan', 'mozzarella', 'cheddar', 'feta', 'ricotta',
    'mascarpone', 'ghee', 'cr[eè]me fra[iî]che', 'halloumi', 'paneer', 'custard', 'gruy[eè]re', 'brie', 'stilton'),
  eggs: words('eggs?\\b', 'egg yolk', 'egg white', 'mayonnaise', 'meringue'),
  peanuts: words('peanut'),
  tree_nuts: words('almond', 'walnut', 'cashew', 'pecan', 'hazelnut', 'pistachio', 'macadamia', 'brazil nut',
    'pine nut', 'nuts?\\b', 'praline', 'marzipan'),
  soy: words('soy', 'soya', 'tofu', 'tempeh', 'edamame', 'miso'),
  fish: words('fish', 'salmon', 'tuna', 'cod\\b', 'haddock', 'mackerel', 'sardine', 'anchov', 'trout', 'tilapia',
    'hake', 'pollock', 'sea bass', 'herring', 'kipper', 'monkfish', 'halibut', 'whitebait',
    'worcestershire'), // made with anchovies
  shellfish: words('prawn', 'shrimp', 'crab', 'lobster', 'mussel', 'clam', 'oyster', 'scallop', 'squid', 'calamari',
    'crayfish', 'langoustine'),
  sesame: words('sesame', 'tahini'),
  mustard: words('mustard'),
  celery: words('celery', 'celeriac'),
  sulfites: words('wine', 'sherry', 'vermouth', 'port\\b'),
};
// "meat" itself too: some recipes list just "Shredded Meat"
const MEAT = words('meat', 'chicken', 'beef', 'pork', 'lamb', 'mutton', 'bacon', 'ham\\b', 'sausage', 'chorizo', 'salami',
  'pepperoni', 'prosciutto', 'pancetta', 'mortadella', 'pastrami', 'brisket', 'sirloin', 'turkey', 'duck', 'goose',
  'quail', 'pheasant', 'rabbit', 'veal', 'venison', 'goat', 'mince', 'steak', 'gammon', 'lard', 'suet', 'gelatin',
  'oxtail', 'kidney', 'liver');
const PORK = words('pork', 'bacon', 'ham\\b', 'chorizo', 'salami', 'pepperoni', 'prosciutto', 'pancetta', 'gammon', 'lard');
const ALCOHOL = words('wine', 'beer', 'brandy', 'rum\\b', 'vodka', 'sherry', 'cider', 'whisk(?:e)?y', 'vermouth', 'liqueur');
const HONEY = words('honey');

interface Candidate {
  id: string;
  meal_type: string | null;
  diet_types: string[] | null;
  ingredients: string[];
  total: number;
  matched: number;
  expiring: number;
  favorite: boolean;
  eaten_recently: boolean;
  calories: number | null; // per serving
}

// Also used by the AI assistant's recipe tools
export function fitsUser(
  r: Pick<Candidate, 'ingredients' | 'diet_types'>, diet: string | null, allergens: string[]
): boolean {
  const has = (re: RegExp) => r.ingredients.some((name) => re.test(name));
  const tagged = (d: string) => r.diet_types?.includes(d) ?? false;

  for (const allergen of allergens) {
    const re = ALLERGEN_KEYWORDS[allergen];
    if (re && has(re)) return false;
  }

  const fish = has(ALLERGEN_KEYWORDS.fish) || has(ALLERGEN_KEYWORDS.shellfish);
  switch (diet) {
    case 'vegan':
      return tagged('vegan') || !(has(MEAT) || fish || has(ALLERGEN_KEYWORDS.dairy) || has(ALLERGEN_KEYWORDS.eggs) || has(HONEY));
    case 'vegetarian':
      return tagged('vegan') || tagged('vegetarian') || !(has(MEAT) || fish);
    case 'pescatarian':
      return !has(MEAT);
    case 'gluten_free':
      return !has(ALLERGEN_KEYWORDS.gluten);
    case 'dairy_free':
      return !has(ALLERGEN_KEYWORDS.dairy);
    case 'halal':
      return !(has(PORK) || has(ALCOHOL));
    case 'kosher':
      return !(has(PORK) || has(ALLERGEN_KEYWORDS.shellfish));
    default:
      return true; // standard, keto, paleo: not checkable without nutrition data
  }
}

// Small seeded PRNG: one random seed per generation, reproducible within it
function mulberry32(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function score(r: Candidate, random: () => number): number {
  const fridgeShare = r.total ? r.matched / r.total : 0;
  return (
    fridgeShare +
    0.4 * Math.min(r.expiring, 2) + // uses food that would otherwise go off
    (r.favorite ? 0.3 : 0) -
    (r.eaten_recently ? 0.3 : 0) + // variety: just had it
    random() * 0.35
  );
}

// ── Daily calorie goal ───────────────────────────────────────────────────
// The day's goal is split between the planned meals; each meal then gets a
// recipe and a portion that come close to its share.
const SLOT_SHARE: Record<PlanSlot, number> = { breakfast: 0.25, lunch: 0.4, dinner: 0.35 };
// Portions the planner suggests, in servings of the recipe
const PORTIONS = [0.5, 0.75, 1, 1.25, 1.5, 2];
// A day within 10% of the goal is on target
const DAY_TOLERANCE = 0.1;
// How much calorie fit counts against fridge use etc. when choosing a
// recipe. Portions and balanceDay do most of the fitting, so it can stay
// low. Measured (17 fridge items, 2,713 kcal goal, 8 weeks): weight 2 ->
// 50% of ingredients from the fridge, days 1% off the goal; 1 -> 53%, 2.6%;
// 0.5 -> 54%, 4.0%. Every day stayed within 10% in all three.
const CALORIE_WEIGHT = Number(process.env.PLAN_CALORIE_WEIGHT) || 1;

/** The portion of a recipe that comes closest to a calorie target */
function bestPortion(kcal: number, target: number): number {
  return PORTIONS.reduce((best, p) => (Math.abs(kcal * p - target) < Math.abs(kcal * best - target) ? p : best), 1);
}

/**
 * How well a recipe can fill a meal's calorie target, for the score: 0 when a
 * portion of it hits the target, more negative the further off it is. Odd
 * portions (half, double) cost a little, so normal servings win a near tie.
 */
function calorieFit(r: Candidate, target: number | null): number {
  if (!target) return 0;
  if (!r.calories) return -0.6; // unknown calories: only when nothing else fits
  const portion = bestPortion(r.calories, target);
  const miss = Math.abs(r.calories * portion - target) / target;
  return -CALORIE_WEIGHT * miss - 0.1 * Math.abs(Math.log2(portion));
}

interface PlannedMeal {
  recipe: Candidate;
  servings: number;
}

/**
 * If the day's meals are more than 10% off the goal, nudges portions one step
 * at a time (the step that helps most) until it fits or nothing helps.
 */
function balanceDay(meals: PlannedMeal[], goal: number) {
  const total = () => meals.reduce((sum, m) => sum + (m.recipe.calories ?? 0) * m.servings, 0);
  for (let step = 0; step < 6; step++) {
    const error = total() - goal;
    if (Math.abs(error) <= goal * DAY_TOLERANCE) return;
    let best: { meal: PlannedMeal; servings: number } | null = null;
    let bestError = Math.abs(error);
    for (const meal of meals) {
      if (!meal.recipe.calories) continue;
      const i = PORTIONS.indexOf(meal.servings);
      for (const next of [PORTIONS[i - 1], PORTIONS[i + 1]]) {
        if (next === undefined) continue;
        const e = Math.abs(error + meal.recipe.calories * (next - meal.servings));
        if (e < bestError) {
          bestError = e;
          best = { meal, servings: next };
        }
      }
    }
    if (!best) return;
    best.meal.servings = best.servings;
  }
}

/**
 * The user's daily calorie goal: the one in their profile, or worked out from
 * weight, height, age, activity and goal (Mifflin-St Jeor) when only those are
 * set. null when the profile has neither, and plans then ignore calories.
 */
export async function dailyCalorieGoal(userId: string): Promise<number | null> {
  const result = await query(
    `SELECT daily_calories, gender, weight_kg, height_cm, activity_level, goal,
            date_part('year', age(date_of_birth))::int AS age
     FROM user_profiles WHERE user_id = $1`,
    [userId]
  );
  const p = result.rows[0];
  if (!p) return null;
  if (p.daily_calories) return Number(p.daily_calories);
  if (p.gender && p.weight_kg && p.height_cm && p.age) {
    return calculateDailyTargets(
      p.gender, Number(p.weight_kg), Number(p.height_cm), p.age,
      p.activity_level ?? 'moderately_active', p.goal ?? 'maintenance'
    ).dailyCalories;
  }
  return null;
}

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

async function loadCandidates(userId: string, weekStart: string): Promise<Candidate[]> {
  const result = await query(
    `SELECT r.id, r.meal_type, r.diet_types, r.calories_per_serving::float AS calories,
            array_remove(array_agg(DISTINCT lower(f.name)), NULL) AS ingredients,
            COUNT(DISTINCT ri.id)::int AS total,
            COUNT(DISTINCT ri.id) FILTER (WHERE fi.match_key IS NOT NULL)::int AS matched,
            COUNT(DISTINCT ri.id) FILTER (
              WHERE fi.expiry_date BETWEEN $2::date AND $2::date + 3)::int AS expiring,
            bool_or(uf.recipe_id IS NOT NULL) AS favorite,
            EXISTS (SELECT 1 FROM food_logs fl WHERE fl.user_id = $1 AND fl.recipe_id = r.id
                      AND fl.log_date >= $2::date - 7) AS eaten_recently
     FROM recipes r
     LEFT JOIN recipe_ingredients ri ON ri.recipe_id = r.id
     LEFT JOIN foods f ON f.id = ri.food_id
     LEFT JOIN ${fridgeKeys('$1')} fi ON fi.match_key = f.match_key
     LEFT JOIN user_favorites uf ON uf.recipe_id = r.id AND uf.user_id = $1
     WHERE r.is_public OR r.created_by = $1
     GROUP BY r.id`,
    [userId, weekStart]
  );
  return result.rows;
}

// Fills the week day by day. A recipe never appears twice on the same day or in
// the same slot on consecutive days, and repeats across the week only once the
// pool runs out; with very few suitable recipes the rules relax in that order.
// With a calorie goal, each meal also gets a portion, and each day is
// balanced to within 10% of the goal where portions allow.
function fillWeek(
  pools: Record<PlanSlot, Candidate[]>, random: () => number, goal: number | null
): Record<PlanSlot, PlannedMeal[]> {
  const plan: Record<PlanSlot, PlannedMeal[]> = { breakfast: [], lunch: [], dinner: [] };
  const used = new Map<string, number>();
  for (let day = 0; day < 7; day++) {
    const today = new Set<string>();
    const meals: PlannedMeal[] = [];
    for (const slot of PLAN_SLOTS) {
      const pool = pools[slot];
      const target = goal ? goal * SLOT_SHARE[slot] : null;
      const yesterday = plan[slot][day - 1]?.recipe;
      const notToday = pool.filter((r) => !today.has(r.id));
      const preferred = notToday.filter((r) => r !== yesterday);
      const options = preferred.length ? preferred : notToday.length ? notToday : pool;
      const best = options
        .map((r) => ({ r, s: score(r, random) + calorieFit(r, target) - 1.5 * (used.get(r.id) ?? 0) }))
        .sort((a, b) => b.s - a.s)[0].r;
      used.set(best.id, (used.get(best.id) ?? 0) + 1);
      today.add(best.id);
      const meal = { recipe: best, servings: target && best.calories ? bestPortion(best.calories, target) : 1 };
      meals.push(meal);
      plan[slot].push(meal);
    }
    if (goal) balanceDay(meals, goal);
  }
  return plan;
}

export async function generateWeek(userId: string, weekStart: string) {
  const [profileResult, candidates, goal] = await Promise.all([
    query(
      `SELECT p.diet_type, array_remove(array_agg(a.name), NULL) AS allergens
       FROM users u
       LEFT JOIN user_profiles p ON p.user_id = u.id
       LEFT JOIN user_allergens ua ON ua.user_id = u.id
       LEFT JOIN allergens a ON a.id = ua.allergen_id
       WHERE u.id = $1 GROUP BY p.diet_type`,
      [userId]
    ),
    loadCandidates(userId, weekStart),
    dailyCalorieGoal(userId),
  ]);
  const { diet_type: diet = null, allergens = [] } = profileResult.rows[0] ?? {};
  const allowed = candidates.filter((r) => fitsUser(r, diet, allergens));

  // Desserts ("snack") never become a main meal
  const breakfasts = allowed.filter((r) => r.meal_type === 'breakfast');
  const mains = allowed.filter((r) => r.meal_type !== 'breakfast' && r.meal_type !== 'snack');
  if (mains.length === 0) {
    throw new AppError('No recipes fit your diet and allergies yet, so a plan cannot be generated', 422);
  }

  const plan = fillWeek(
    {
      // No suitable breakfast recipe (e.g. vegan): fall back to main dishes
      breakfast: breakfasts.length ? breakfasts : mains,
      lunch: mains,
      dinner: mains,
    },
    mulberry32(randomInt(2 ** 31)),
    goal
  );

  // One plan row per week, reused on regenerate: shopping_lists.plan_id
  // points at it without ON DELETE, so the row itself must stay
  const client = await getClient();
  try {
    await client.query('BEGIN');
    const existing = await client.query(
      'SELECT id FROM meal_plans WHERE user_id = $1 AND start_date = $2 AND is_active ORDER BY created_at LIMIT 1',
      [userId, weekStart]
    );
    let planId: string = existing.rows[0]?.id;
    if (planId) {
      await client.query('DELETE FROM meal_plan_entries WHERE plan_id = $1', [planId]);
      await client.query('UPDATE meal_plans SET updated_at = NOW() WHERE id = $1', [planId]);
    } else {
      const created = await client.query(
        `INSERT INTO meal_plans (user_id, name, start_date, end_date)
         VALUES ($1, $2, $3, $4) RETURNING id`,
        [userId, `Week of ${weekStart}`, weekStart, addDays(weekStart, 6)]
      );
      planId = created.rows[0].id;
    }
    for (const [slotIndex, slot] of PLAN_SLOTS.entries()) {
      for (const [day, meal] of plan[slot].entries()) {
        await client.query(
          `INSERT INTO meal_plan_entries (plan_id, recipe_id, meal_type, planned_date, servings, order_index)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [planId, meal.recipe.id, slot, addDays(weekStart, day), meal.servings, slotIndex]
        );
      }
    }
    await client.query('COMMIT');
    return planId;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function getWeek(userId: string, weekStart: string) {
  const planResult = await query(
    `SELECT id, to_char(start_date, 'YYYY-MM-DD') AS start_date, to_char(end_date, 'YYYY-MM-DD') AS end_date
     FROM meal_plans WHERE user_id = $1 AND start_date = $2 AND is_active
     ORDER BY created_at LIMIT 1`,
    [userId, weekStart]
  );
  const plan = planResult.rows[0];
  if (!plan) return null;

  // Fridge match is computed now, not stored, so it follows the fridge.
  // calories = the planned portion's calories (servings x per serving).
  const [entries, goal] = await Promise.all([query(
    `SELECT e.id, e.meal_type, to_char(e.planned_date, 'YYYY-MM-DD') AS planned_date,
            COALESCE(e.servings, 1)::float AS servings,
            r.id AS recipe_id, r.title, r.image_url, r.prep_time_min, r.cook_time_min, r.calories_per_serving,
            ROUND(r.calories_per_serving * COALESCE(e.servings, 1))::int AS calories,
            COUNT(DISTINCT ri.id)::int AS total_ingredients,
            COUNT(DISTINCT ri.id) FILTER (WHERE fi.match_key IS NOT NULL)::int AS matched_ingredients
     FROM meal_plan_entries e
     JOIN recipes r ON r.id = e.recipe_id
     LEFT JOIN recipe_ingredients ri ON ri.recipe_id = r.id
     LEFT JOIN foods f ON f.id = ri.food_id
     LEFT JOIN ${fridgeKeys('$2')} fi ON fi.match_key = f.match_key
     WHERE e.plan_id = $1
     GROUP BY e.id, r.id
     ORDER BY e.planned_date, e.order_index`,
    [plan.id, userId]
  ), dailyCalorieGoal(userId)]);
  return { ...plan, daily_calories: goal, entries: entries.rows };
}

// Saves a new arrangement after drag and drop: each entry's day and slot.
// Every entry must belong to the plan and land inside its week.
export async function rearrange(
  userId: string,
  planId: string,
  moves: { id: string; planned_date: string; meal_type: PlanSlot }[]
) {
  const planResult = await query(
    `SELECT to_char(start_date, 'YYYY-MM-DD') AS start_date, to_char(end_date, 'YYYY-MM-DD') AS end_date
     FROM meal_plans WHERE id = $1 AND user_id = $2`,
    [planId, userId]
  );
  const plan = planResult.rows[0];
  if (!plan) throw new AppError('Meal plan not found', 404);

  const slots = new Set<string>();
  for (const m of moves) {
    if (m.planned_date < plan.start_date || m.planned_date > plan.end_date) {
      throw new AppError('A meal was moved outside this week', 400);
    }
    const key = `${m.planned_date}|${m.meal_type}`;
    if (slots.has(key)) throw new AppError('Two meals were placed in the same slot', 400);
    slots.add(key);
  }

  const client = await getClient();
  try {
    await client.query('BEGIN');
    for (const m of moves) {
      const updated = await client.query(
        `UPDATE meal_plan_entries SET planned_date = $1, meal_type = $2, order_index = $3
         WHERE id = $4 AND plan_id = $5`,
        [m.planned_date, m.meal_type, PLAN_SLOTS.indexOf(m.meal_type), m.id, planId]
      );
      if (!updated.rowCount) throw new AppError('Meal not found in this plan', 404);
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
  return plan.start_date as string;
}
