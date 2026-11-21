import { randomInt } from 'crypto';
import { getClient, query } from '../config/database';
import { AppError } from '../middleware/errorHandler';

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
}

function fitsUser(r: Candidate, diet: string | null, allergens: string[]): boolean {
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

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

async function loadCandidates(userId: string, weekStart: string): Promise<Candidate[]> {
  const result = await query(
    `SELECT r.id, r.meal_type, r.diet_types,
            array_remove(array_agg(DISTINCT lower(f.name)), NULL) AS ingredients,
            COUNT(DISTINCT ri.id)::int AS total,
            COUNT(DISTINCT ri.id) FILTER (WHERE fi.food_id IS NOT NULL)::int AS matched,
            COUNT(DISTINCT ri.id) FILTER (
              WHERE fi.expiry_date BETWEEN $2::date AND $2::date + 3)::int AS expiring,
            bool_or(uf.recipe_id IS NOT NULL) AS favorite,
            EXISTS (SELECT 1 FROM food_logs fl WHERE fl.user_id = $1 AND fl.recipe_id = r.id
                      AND fl.log_date >= $2::date - 7) AS eaten_recently
     FROM recipes r
     LEFT JOIN recipe_ingredients ri ON ri.recipe_id = r.id
     LEFT JOIN foods f ON f.id = ri.food_id
     LEFT JOIN fridge_items fi ON fi.food_id = ri.food_id AND fi.user_id = $1
     LEFT JOIN user_favorites uf ON uf.recipe_id = r.id AND uf.user_id = $1
     WHERE r.is_public
     GROUP BY r.id`,
    [userId, weekStart]
  );
  return result.rows;
}

// Fills the week day by day. A recipe never appears twice on the same day or in
// the same slot on consecutive days, and repeats across the week only once the
// pool runs out; with very few suitable recipes the rules relax in that order.
function fillWeek(pools: Record<PlanSlot, Candidate[]>, random: () => number): Record<PlanSlot, Candidate[]> {
  const plan: Record<PlanSlot, Candidate[]> = { breakfast: [], lunch: [], dinner: [] };
  const used = new Map<string, number>();
  for (let day = 0; day < 7; day++) {
    const today = new Set<string>();
    for (const slot of PLAN_SLOTS) {
      const pool = pools[slot];
      const yesterday = plan[slot][day - 1];
      const notToday = pool.filter((r) => !today.has(r.id));
      const preferred = notToday.filter((r) => r !== yesterday);
      const options = preferred.length ? preferred : notToday.length ? notToday : pool;
      const best = options
        .map((r) => ({ r, s: score(r, random) - 1.5 * (used.get(r.id) ?? 0) }))
        .sort((a, b) => b.s - a.s)[0].r;
      used.set(best.id, (used.get(best.id) ?? 0) + 1);
      today.add(best.id);
      plan[slot].push(best);
    }
  }
  return plan;
}

export async function generateWeek(userId: string, weekStart: string) {
  const [profileResult, candidates] = await Promise.all([
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
    mulberry32(randomInt(2 ** 31))
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
      for (const [day, recipe] of plan[slot].entries()) {
        await client.query(
          `INSERT INTO meal_plan_entries (plan_id, recipe_id, meal_type, planned_date, order_index)
           VALUES ($1, $2, $3, $4, $5)`,
          [planId, recipe.id, slot, addDays(weekStart, day), slotIndex]
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

  // Fridge match is computed now, not stored, so it follows the fridge
  const entries = await query(
    `SELECT e.id, e.meal_type, to_char(e.planned_date, 'YYYY-MM-DD') AS planned_date,
            r.id AS recipe_id, r.title, r.image_url, r.prep_time_min, r.cook_time_min, r.calories_per_serving,
            COUNT(DISTINCT ri.id)::int AS total_ingredients,
            COUNT(DISTINCT ri.id) FILTER (WHERE fi.food_id IS NOT NULL)::int AS matched_ingredients
     FROM meal_plan_entries e
     JOIN recipes r ON r.id = e.recipe_id
     LEFT JOIN recipe_ingredients ri ON ri.recipe_id = r.id
     LEFT JOIN fridge_items fi ON fi.food_id = ri.food_id AND fi.user_id = $2
     WHERE e.plan_id = $1
     GROUP BY e.id, r.id
     ORDER BY e.planned_date, e.order_index`,
    [plan.id, userId]
  );
  return { ...plan, entries: entries.rows };
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
