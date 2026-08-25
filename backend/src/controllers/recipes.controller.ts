import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth';
import { query } from '../config/database';
import { AppError } from '../middleware/errorHandler';
import { getCache, setCache } from '../config/redis';

export async function searchRecipes(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const {
      q = '', page = '1', limit = '20', meal_type, diet_type, cuisine_type,
      match_only, sort,
    } = req.query as Record<string, string>;
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(50, parseInt(limit));
    const offset = (pageNum - 1) * limitNum;

    let whereClause = 'WHERE is_public = TRUE';
    const params: unknown[] = [];

    if (q.trim()) {
      params.push(q.trim());
      whereClause += ` AND (
        to_tsvector('simple', title) @@ plainto_tsquery('simple', $${params.length})
        OR title ILIKE '%' || $${params.length} || '%'
      )`;
    }
    if (meal_type) {
      params.push(meal_type);
      whereClause += ` AND meal_type = $${params.length}`;
    }
    if (cuisine_type) {
      params.push(cuisine_type);
      whereClause += ` AND cuisine_type = $${params.length}`;
    }
    if (diet_type) {
      params.push(diet_type);
      whereClause += ` AND $${params.length} = ANY(diet_types)`;
    }

    // Ingredient-match counts against the caller's fridge (0/0 when logged out).
    params.push(req.user?.id || null);
    const userIdParam = params.length;

    const joinClause = `
       LEFT JOIN recipe_ingredients ri ON ri.recipe_id = r.id
       LEFT JOIN fridge_items fi ON fi.food_id = ri.food_id AND fi.user_id = $${userIdParam}`;

    let havingClause = '';
    if (match_only === 'true' && req.user) {
      havingClause = `HAVING COUNT(DISTINCT ri.id) > 0
        AND COUNT(DISTINCT ri.id) = COUNT(DISTINCT ri.id) FILTER (WHERE fi.food_id IS NOT NULL)`;
    }

    const orderBy = sort === 'match'
      ? 'matched_ingredients DESC, r.title ASC'
      : 'r.title ASC';

    const countResult = await query(
      `SELECT COUNT(*) FROM (
         SELECT r.id FROM recipes r ${joinClause} ${whereClause} GROUP BY r.id ${havingClause}
       ) sub`,
      params
    );
    const total = parseInt(countResult.rows[0].count);

    params.push(limitNum, offset);
    const result = await query(
      `SELECT r.id, r.title, r.title_uk, r.description, r.image_url,
              r.prep_time_min, r.cook_time_min, r.servings, r.difficulty,
              r.cuisine_type, r.meal_type, r.diet_types,
              r.calories_per_serving, r.protein_per_serving_g, r.carbs_per_serving_g,
              r.fat_per_serving_g, r.fiber_per_serving_g,
              COALESCE(AVG(rr.rating), 0)::float AS average_rating,
              COUNT(DISTINCT rr.id)::int AS rating_count,
              COUNT(DISTINCT ri.id)::int AS total_ingredients,
              COUNT(DISTINCT ri.id) FILTER (WHERE fi.food_id IS NOT NULL)::int AS matched_ingredients,
              EXISTS(SELECT 1 FROM user_favorites uf WHERE uf.user_id = $${userIdParam} AND uf.recipe_id = r.id) AS is_favorite
       FROM recipes r
       LEFT JOIN recipe_ratings rr ON rr.recipe_id = r.id
       ${joinClause}
       ${whereClause}
       GROUP BY r.id
       ${havingClause}
       ORDER BY ${orderBy}
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    res.json({
      success: true,
      data: result.rows,
      pagination: { page: pageNum, limit: limitNum, total, totalPages: Math.ceil(total / limitNum) },
    });
  } catch (err) {
    next(err);
  }
}

export async function getRecipeById(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const cacheKey = `recipe:${req.params.id}`;
    const cached = await getCache(cacheKey);

    let recipe;
    if (cached) {
      recipe = cached;
    } else {
      const result = await query(
        `SELECT r.*, COALESCE(AVG(rr.rating), 0)::float AS average_rating,
                COUNT(DISTINCT rr.id)::int AS rating_count
         FROM recipes r
         LEFT JOIN recipe_ratings rr ON rr.recipe_id = r.id
         WHERE r.id = $1
         GROUP BY r.id`,
        [req.params.id]
      );
      if (!result.rowCount || result.rowCount === 0) throw new AppError('Recipe not found', 404);
      recipe = result.rows[0];

      const ingredients = await query(
        `SELECT ri.id, ri.quantity, ri.unit, ri.note, ri.order_index,
                f.id AS food_id, f.name, f.name_uk, f.category, f.calories,
                f.protein_g, f.carbs_g, f.fat_g, f.image_url
         FROM recipe_ingredients ri
         JOIN foods f ON ri.food_id = f.id
         WHERE ri.recipe_id = $1
         ORDER BY ri.order_index ASC`,
        [req.params.id]
      );
      recipe.ingredients = ingredients.rows;

      await setCache(cacheKey, recipe, 3600);
    }

    let isFavorite = false;
    let fridgeFoodIds = new Set<string>();
    if (req.user) {
      const [favResult, fridgeResult] = await Promise.all([
        query('SELECT 1 FROM user_favorites WHERE user_id = $1 AND recipe_id = $2', [req.user.id, req.params.id]),
        query('SELECT food_id FROM fridge_items WHERE user_id = $1', [req.user.id]),
      ]);
      isFavorite = !!favResult.rowCount;
      fridgeFoodIds = new Set(fridgeResult.rows.map((r) => r.food_id));
    }

    const ingredientsWithFridgeStatus = (recipe.ingredients || []).map(
      (ing: { food_id: string; [key: string]: unknown }) => ({ ...ing, in_fridge: fridgeFoodIds.has(ing.food_id) })
    );

    res.json({
      success: true,
      data: { ...recipe, ingredients: ingredientsWithFridgeStatus, is_favorite: isFavorite },
    });
  } catch (err) {
    next(err);
  }
}

export async function toggleFavorite(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const recipeId = req.params.id;
    const existing = await query(
      'SELECT 1 FROM user_favorites WHERE user_id = $1 AND recipe_id = $2',
      [req.user!.id, recipeId]
    );

    if (existing.rowCount) {
      await query('DELETE FROM user_favorites WHERE user_id = $1 AND recipe_id = $2', [req.user!.id, recipeId]);
      res.json({ success: true, data: { is_favorite: false } });
    } else {
      await query('INSERT INTO user_favorites (user_id, recipe_id) VALUES ($1, $2)', [req.user!.id, recipeId]);
      res.json({ success: true, data: { is_favorite: true } });
    }
  } catch (err) {
    next(err);
  }
}
