// Tools the AI assistant can call while answering: search the recipe
// catalogue, look up one recipe, search TheMealDB for recipes the catalogue
// doesn't have yet (imported on the spot), and write a new recipe itself.
// Nutrition always comes from our own USDA-based calculation, never the model.
//
// Results are kept short (the model has 8K tokens per conversation) and use
// short references ("R1") instead of UUIDs.
import { query, getClient } from '../config/database';
import { fitsUser } from './mealPlan.service';
import { findIngredient, IngredientInfo, recipeNutrition } from './recipeNutrition';
import { filterMealDbByIngredient, importMeal, lookupMealDb, searchMealDb } from './recipeImport.service';
import { logger } from '../utils/logger';
import { fridgeKeys } from './fridgeMatch';

export interface RecipeCard {
  type: 'recipe';
  id: string;
  title: string;
  title_uk: string | null;
  image_url: string | null;
  calories: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  time_min: number | null;
}

export interface DraftCard {
  type: 'draft';
  title: string;
  title_uk: string | null;
  servings: number;
  meal_type: string;
  prep_time_min: number;
  cook_time_min: number;
  ingredients: { name: string; grams: number }[];
  steps: string[];
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number;
  /** Ingredients without nutrition data, left out of the totals */
  missing: string[];
  saved_recipe_id?: string;
}

export type Attachment = RecipeCard | DraftCard;

const MEAL_TYPES = ['breakfast', 'lunch', 'dinner', 'snack'];
const MAX_RESULTS = 5;

export const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'search_recipes',
      description:
        "Search the app's recipe catalogue (about 800 recipes with calories and macros per serving, plus the user's " +
        'saved recipes). Results already exclude recipes with the user\'s allergens or against their diet, and show ' +
        'how many ingredients are in their fridge.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Dish name or main ingredients in English, e.g. "chicken curry" or "beetroot". Leave out to browse.' },
          meal_type: { type: 'string', enum: MEAL_TYPES },
          max_calories: { type: 'number', description: 'Max kcal per serving' },
          min_protein_g: { type: 'number', description: 'Min protein per serving, grams' },
          use_fridge: { type: 'boolean', description: "Prefer recipes made from what's in the user's fridge" },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_recipe',
      description: 'Ingredients (with grams), nutrition and instructions of one recipe found by a search.',
      parameters: {
        type: 'object',
        properties: { ref: { type: 'string', description: 'The recipe reference from search results, e.g. "R2"' } },
        required: ['ref'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_online_recipes',
      description:
        'Search TheMealDB (an online recipe site) for recipes the catalogue does not have. Found recipes are added ' +
        'to the catalogue with calculated nutrition. Use when search_recipes finds nothing suitable.',
      parameters: {
        type: 'object',
        properties: { query: { type: 'string', description: 'Dish name or one main ingredient in English, e.g. "lasagne" or "salmon"' } },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_recipe',
      description:
        'Write a new recipe yourself, e.g. when the user asks for a dish nothing else has, or one built from their ' +
        'fridge. Its calories and macros are calculated by the app from the ingredient grams. The user sees it as a ' +
        'card and can save it to their own recipes.',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Dish name in English' },
          title_uk: { type: 'string', description: 'Dish name in Ukrainian' },
          servings: { type: 'integer' },
          meal_type: { type: 'string', enum: MEAL_TYPES },
          prep_time_min: { type: 'integer' },
          cook_time_min: { type: 'integer' },
          ingredients: {
            type: 'array',
            description: 'Every ingredient with its total amount in grams for the whole recipe',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string', description: 'Simple generic English name, e.g. "onion", "chicken breast", "sour cream"' },
                grams: { type: 'number' },
              },
              required: ['name', 'grams'],
            },
          },
          steps: { type: 'array', items: { type: 'string' }, description: 'Short cooking steps' },
        },
        required: ['title', 'title_uk', 'servings', 'meal_type', 'ingredients', 'steps'],
      },
    },
  },
];

export interface ToolContext {
  userId: string;
  diet: string | null;
  allergens: string[];
  /** Recipes returned by searches this turn, by reference */
  found: Map<string, RecipeCard>;
  drafts: DraftCard[];
}

export async function createToolContext(userId: string): Promise<ToolContext> {
  const result = await query(
    `SELECT p.diet_type, array_remove(array_agg(a.name), NULL) AS allergens
     FROM users u
     LEFT JOIN user_profiles p ON p.user_id = u.id
     LEFT JOIN user_allergens ua ON ua.user_id = u.id
     LEFT JOIN allergens a ON a.id = ua.allergen_id
     WHERE u.id = $1 GROUP BY p.diet_type`,
    [userId]
  );
  const row = result.rows[0] ?? {};
  return { userId, diet: row.diet_type ?? null, allergens: row.allergens ?? [], found: new Map(), drafts: [] };
}

const num = (v: unknown) => (v == null ? null : Number(v)); // DECIMAL columns arrive as strings

interface RecipeRow {
  id: string;
  title: string;
  title_uk: string | null;
  image_url: string | null;
  diet_types: string[] | null;
  calories_per_serving: string | null;
  protein_per_serving_g: string | null;
  carbs_per_serving_g: string | null;
  fat_per_serving_g: string | null;
  prep_time_min: number | null;
  cook_time_min: number | null;
  ingredients: string[];
  total: number;
  matched: number;
  missing: string[];
}

// Shared SELECT: nutrition plus fridge matching for one user ($1)
const RECIPE_SELECT = `
  SELECT r.id, r.title, r.title_uk, r.image_url, r.diet_types,
         r.calories_per_serving, r.protein_per_serving_g, r.carbs_per_serving_g, r.fat_per_serving_g,
         r.prep_time_min, r.cook_time_min,
         array_remove(array_agg(DISTINCT lower(f.name)), NULL) AS ingredients,
         COUNT(DISTINCT ri.id)::int AS total,
         COUNT(DISTINCT ri.id) FILTER (WHERE fi.match_key IS NOT NULL)::int AS matched,
         array_remove(array_agg(DISTINCT f.name) FILTER (WHERE fi.match_key IS NULL), NULL) AS missing
  FROM recipes r
  LEFT JOIN recipe_ingredients ri ON ri.recipe_id = r.id
  LEFT JOIN foods f ON f.id = ri.food_id
  LEFT JOIN ${fridgeKeys('$1', { fresh: true })} fi ON fi.match_key = f.match_key`;

function remember(ctx: ToolContext, r: RecipeRow) {
  // The same recipe keeps its reference if a later search finds it again
  let ref = [...ctx.found.entries()].find(([, card]) => card.id === r.id)?.[0];
  if (!ref) {
    ref = `R${ctx.found.size + 1}`;
    ctx.found.set(ref, {
      type: 'recipe', id: r.id, title: r.title, title_uk: r.title_uk, image_url: r.image_url,
      calories: num(r.calories_per_serving), protein_g: num(r.protein_per_serving_g),
      carbs_g: num(r.carbs_per_serving_g), fat_g: num(r.fat_per_serving_g),
      time_min: r.prep_time_min != null || r.cook_time_min != null ? (r.prep_time_min ?? 0) + (r.cook_time_min ?? 0) : null,
    });
  }
  const card = ctx.found.get(ref)!;
  return {
    ref,
    title: r.title,
    ...(r.title_uk ? { title_uk: r.title_uk } : {}),
    kcal: card.calories,
    protein_g: card.protein_g,
    carbs_g: card.carbs_g,
    fat_g: card.fat_g,
    minutes: card.time_min,
    in_fridge: `${r.matched}/${r.total} ingredients`,
    to_buy: r.missing.slice(0, 4),
  };
}

async function searchRecipes(ctx: ToolContext, args: Record<string, unknown>) {
  const params: unknown[] = [ctx.userId];
  let where = 'WHERE (r.is_public OR r.created_by = $1)';
  let titleHits = '0';
  const words = String(args.query ?? '').toLowerCase().split(/[^\p{L}\d]+/u).filter((w) => w.length >= 3).slice(0, 4);
  for (const w of words) {
    params.push(`%${w}%`);
    const p = `$${params.length}`;
    // Every word must appear in the title or an ingredient ("chicken soup")
    where += ` AND (r.title ILIKE ${p} OR r.title_uk ILIKE ${p} OR EXISTS (
      SELECT 1 FROM recipe_ingredients ri2 JOIN foods f2 ON f2.id = ri2.food_id
      WHERE ri2.recipe_id = r.id AND (f2.name ILIKE ${p} OR f2.name_uk ILIKE ${p})))`;
    titleHits += ` + (r.title ILIKE ${p} OR COALESCE(r.title_uk, '') ILIKE ${p})::int`;
  }
  if (typeof args.meal_type === 'string' && MEAL_TYPES.includes(args.meal_type)) {
    params.push(args.meal_type);
    where += ` AND r.meal_type = $${params.length}`;
  }
  if (Number(args.max_calories) > 0) {
    params.push(Number(args.max_calories));
    where += ` AND r.calories_per_serving <= $${params.length}`;
  }
  if (Number(args.min_protein_g) > 0) {
    params.push(Number(args.min_protein_g));
    where += ` AND r.protein_per_serving_g >= $${params.length}`;
  }
  const fridgeShare = 'COUNT(DISTINCT ri.id) FILTER (WHERE fi.match_key IS NOT NULL)::float / GREATEST(COUNT(DISTINCT ri.id), 1)';
  // Without search words there's nothing to rank titles by (and a bare "0"
  // in ORDER BY would mean "column 0")
  const byTitle = words.length ? `${titleHits} DESC` : null;
  const order = (args.use_fridge ? [`${fridgeShare} DESC`, byTitle] : [byTitle, `${fridgeShare} DESC`])
    .filter(Boolean)
    .join(', ');
  // Extra rows, since diet and allergy filtering happens below
  const result = await query(
    `${RECIPE_SELECT} ${where} GROUP BY r.id ORDER BY ${order}, random() LIMIT 40`,
    params
  );
  const fitting = (result.rows as RecipeRow[]).filter((r) => fitsUser(r, ctx.diet, ctx.allergens));
  if (!fitting.length) {
    return { results: [], hint: 'Nothing suitable found. Try fewer words, search_online_recipes, or create_recipe.' };
  }
  return { results: fitting.slice(0, MAX_RESULTS).map((r) => remember(ctx, r)) };
}

async function getRecipe(ctx: ToolContext, args: Record<string, unknown>) {
  const card = ctx.found.get(String(args.ref ?? '').toUpperCase().trim());
  if (!card) return { error: 'Unknown reference. Use one from search results (e.g. "R1"), or search first.' };
  const [recipe, ingredients] = await Promise.all([
    query('SELECT servings, instructions FROM recipes WHERE id = $1', [card.id]),
    query(
      `SELECT f.name, ri.grams, ri.note, ri.quantity, ri.unit
       FROM recipe_ingredients ri JOIN foods f ON f.id = ri.food_id
       WHERE ri.recipe_id = $1 ORDER BY ri.order_index`,
      [card.id]
    ),
  ]);
  const r = recipe.rows[0];
  return {
    title: card.title,
    servings: r?.servings,
    per_serving: { kcal: card.calories, protein_g: card.protein_g, carbs_g: card.carbs_g, fat_g: card.fat_g },
    ingredients: ingredients.rows.map((i) =>
      `${i.note || `${Number(i.quantity)} ${i.unit}`}${i.grams != null && i.note && !/\bg\b/.test(i.note) ? ` (${Number(i.grams)} g)` : ''} ${i.name}`),
    instructions: (r?.instructions || '').slice(0, 1500),
  };
}

async function searchOnline(ctx: ToolContext, args: Record<string, unknown>) {
  const q = String(args.query ?? '').trim();
  if (!q) return { error: 'query is required' };
  let meals = await searchMealDb(q);
  if (!meals.length) {
    // Not a dish name: try it as a main ingredient
    const ids = await filterMealDbByIngredient(q);
    meals = (await Promise.all(ids.slice(0, 4).map(lookupMealDb))).filter((m) => m != null);
  }
  if (!meals.length) return { results: [], hint: 'TheMealDB has nothing for this. You can create_recipe instead.' };

  const ids: string[] = [];
  const client = await getClient();
  try {
    for (const meal of meals.slice(0, 4)) {
      await client.query('BEGIN');
      try {
        ids.push((await importMeal(client, meal)).id);
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        logger.error(`Importing TheMealDB recipe ${meal.idMeal} failed: ${(err as Error).message}`);
      }
    }
  } finally {
    client.release();
  }
  const result = await query(`${RECIPE_SELECT} WHERE r.id = ANY($2) GROUP BY r.id`, [ctx.userId, ids]);
  const fitting = (result.rows as RecipeRow[]).filter((r) => fitsUser(r, ctx.diet, ctx.allergens));
  if (!fitting.length) return { results: [], hint: "Found recipes don't fit the user's diet or allergies." };
  return { results: fitting.map((r) => remember(ctx, r)) };
}

async function createRecipe(ctx: ToolContext, args: Record<string, unknown>) {
  const ingredients = (Array.isArray(args.ingredients) ? args.ingredients : [])
    .map((i: { name?: unknown; grams?: unknown }) => ({ name: String(i?.name ?? '').trim(), grams: Number(i?.grams) }))
    .filter((i) => i.name && i.grams > 0 && i.grams <= 5000)
    .slice(0, 25);
  if (ingredients.length < 2) return { error: 'Give at least 2 ingredients, each with grams.' };

  const names = ingredients.map((i) => i.name.toLowerCase());
  if (!fitsUser({ ingredients: names, diet_types: null }, ctx.diet, ctx.allergens)) {
    return {
      error: `It contains something this user can't eat (diet: ${ctx.diet ?? 'none'}, allergies: ` +
        `${ctx.allergens.join(', ') || 'none'}). Change the ingredients and call create_recipe again.`,
    };
  }

  // Our USDA table first, then foods in the database that have nutrition
  const unknown = names.filter((n) => !findIngredient(n)?.per100);
  const fromDb = unknown.length
    ? await query(
        `SELECT DISTINCT ON (LOWER(name)) LOWER(name) AS key, calories, protein_g, carbs_g, fat_g, fiber_g
         FROM foods WHERE LOWER(name) = ANY($1) AND calories > 0 ORDER BY LOWER(name), is_verified DESC`,
        [unknown]
      )
    : { rows: [] };
  const dbInfo = new Map<string, IngredientInfo>(
    fromDb.rows.map((f) => [f.key, {
      name: f.key, fdc: null, usda: null, g: {},
      per100: { kcal: Number(f.calories), protein: Number(f.protein_g), carbs: Number(f.carbs_g), fat: Number(f.fat_g), fiber: Number(f.fiber_g) },
    }])
  );
  const servings = Math.min(Math.max(Math.round(Number(args.servings) || 2), 1), 20);
  const nutrition = recipeNutrition(
    ingredients.map((i) => ({ name: i.name, grams: i.grams, info: findIngredient(i.name) ?? dbInfo.get(i.name.toLowerCase()) ?? null })),
    servings
  );

  const draft: DraftCard = {
    type: 'draft',
    title: String(args.title ?? '').trim().slice(0, 200) || 'New recipe',
    title_uk: String(args.title_uk ?? '').trim().slice(0, 200) || null,
    servings,
    meal_type: MEAL_TYPES.includes(String(args.meal_type)) ? String(args.meal_type) : 'dinner',
    prep_time_min: Math.min(Math.max(Math.round(Number(args.prep_time_min) || 10), 0), 600),
    cook_time_min: Math.min(Math.max(Math.round(Number(args.cook_time_min) || 20), 0), 1440),
    ingredients: ingredients.map((i) => ({ name: i.name, grams: Math.round(i.grams) })),
    steps: (Array.isArray(args.steps) ? args.steps : []).map((s) => String(s).trim().slice(0, 500)).filter(Boolean).slice(0, 15),
    calories: nutrition.calories,
    protein_g: nutrition.protein_g,
    carbs_g: nutrition.carbs_g,
    fat_g: nutrition.fat_g,
    fiber_g: nutrition.fiber_g,
    missing: nutrition.missing,
  };
  ctx.drafts.push(draft);
  return {
    shown_to_user: 'as a recipe card with a Save button (it is saved only if they press it)',
    per_serving: { kcal: draft.calories, protein_g: draft.protein_g, carbs_g: draft.carbs_g, fat_g: draft.fat_g },
    ...(nutrition.missing.length
      ? { not_counted: nutrition.missing, note: 'No nutrition data for these; mention that the totals leave them out.' }
      : {}),
  };
}

const HANDLERS: Record<string, (ctx: ToolContext, args: Record<string, unknown>) => Promise<unknown>> = {
  search_recipes: searchRecipes,
  get_recipe: getRecipe,
  search_online_recipes: searchOnline,
  create_recipe: createRecipe,
};

/** Runs one tool call; errors go back to the model as text so it can recover */
export async function runTool(ctx: ToolContext, name: string, rawArgs: string | Record<string, unknown>): Promise<string> {
  const handler = HANDLERS[name];
  if (!handler) return JSON.stringify({ error: `Unknown tool ${name}` });
  let args: Record<string, unknown>;
  try {
    args = typeof rawArgs === 'string' ? JSON.parse(rawArgs || '{}') : rawArgs ?? {};
  } catch {
    return JSON.stringify({ error: 'Arguments were not valid JSON' });
  }
  try {
    return JSON.stringify(await handler(ctx, args));
  } catch (err) {
    logger.error(`AI tool ${name} failed: ${(err as Error).message}`);
    return JSON.stringify({ error: 'The tool failed; answer without it.' });
  }
}

/**
 * Cards to show under the answer: the drafts, plus the found recipes the
 * answer actually names (all of them, up to 4, if it names none).
 */
export function pickAttachments(ctx: ToolContext, reply: string): Attachment[] {
  const text = reply.toLowerCase();
  const found = [...ctx.found.values()];
  const named = found.filter(
    (c) => text.includes(c.title.toLowerCase()) || (c.title_uk && text.includes(c.title_uk.toLowerCase()))
  );
  return [...(named.length ? named : found.slice(0, 4)), ...ctx.drafts];
}

/** A line the model sees in later turns, so it knows which cards were shown */
export function describeAttachments(attachments: Attachment[] | null): string {
  if (!attachments?.length) return '';
  const items = attachments.map((a) =>
    a.type === 'draft'
      ? `your own recipe "${a.title}" (${a.calories} kcal/serving, ${a.saved_recipe_id ? 'saved by the user' : 'not saved'})`
      : `"${a.title}" (${a.calories ?? '?'} kcal/serving)`
  );
  return `\n\n[Recipe cards shown with this answer: ${items.join('; ')}]`;
}
