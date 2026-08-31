import { Request, Response, NextFunction } from 'express';
import { query as dbQuery } from 'express-validator';
import { query } from '../config/database';
import { AuthRequest } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import { getCache, setCache } from '../config/redis';

export async function searchFoods(req: Request, res: Response, next: NextFunction) {
  try {
    const { q = '', page = '1', limit = '20', category } = req.query as Record<string, string>;
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(50, parseInt(limit));
    const offset = (pageNum - 1) * limitNum;

    const cacheKey = `foods:search:${q}:${category}:${pageNum}:${limitNum}`;
    const cached = await getCache(cacheKey);
    if (cached) {
      res.json(cached);
      return;
    }

    let whereClause = 'WHERE 1=1';
    const params: unknown[] = [];

    if (q.trim()) {
      params.push(q.trim());
      whereClause += ` AND (
        to_tsvector('simple', name) @@ plainto_tsquery('simple', $${params.length})
        OR name ILIKE '%' || $${params.length} || '%'
        OR name_uk ILIKE '%' || $${params.length} || '%'
        OR brand ILIKE '%' || $${params.length} || '%'
      )`;
    }

    if (category) {
      params.push(category);
      whereClause += ` AND category = $${params.length}`;
    }

    const countResult = await query(`SELECT COUNT(*) FROM foods ${whereClause}`, params);
    const total = parseInt(countResult.rows[0].count);

    params.push(limitNum, offset);
    const result = await query(
      `SELECT id, name, name_uk, brand, category, calories, protein_g, carbs_g, fat_g,
              fiber_g, image_url, is_verified, source
       FROM foods ${whereClause}
       ORDER BY is_verified DESC, name ASC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    const response = {
      success: true,
      data: result.rows,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
    };

    await setCache(cacheKey, response, 300); // 5 min cache
    res.json(response);
  } catch (err) {
    next(err);
  }
}

export async function getFoodById(req: Request, res: Response, next: NextFunction) {
  try {
    const cacheKey = `food:${req.params.id}`;
    const cached = await getCache(cacheKey);
    if (cached) { res.json(cached); return; }

    const result = await query('SELECT * FROM foods WHERE id = $1', [req.params.id]);
    if (!result.rowCount || result.rowCount === 0) throw new AppError('Food not found', 404);

    const response = { success: true, data: result.rows[0] };
    await setCache(cacheKey, response, 3600);
    res.json(response);
  } catch (err) {
    next(err);
  }
}

// Open Food Facts — free, no API key. On a local miss we look the barcode
// up there and, if found, create a real `foods` row from it (real nutrition
// data, unlike the calories=0 placeholders on TheMealDB-sourced rows) so
// every subsequent scan of the same barcode is served locally, no repeat
// API call. Returns null on any miss/error — callers fall back to 404,
// same as before this existed.
interface OpenFoodFactsProduct {
  product_name?: string;
  brands?: string;
  image_url?: string;
  categories_tags?: string[];
  nutriments?: Record<string, number>;
}

async function fetchFromOpenFoodFacts(barcode: string): Promise<OpenFoodFactsProduct | null> {
  try {
    const res = await fetch(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(barcode)}.json`, {
      headers: { 'User-Agent': 'NutritionApp - ZNU thesis project - https://github.com/Laugh1ngGas/nutrition-app' },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { status: number; product?: OpenFoodFactsProduct };
    if (data.status !== 1 || !data.product?.product_name) return null;
    return data.product;
  } catch {
    return null; // network hiccup, timeout, malformed response — treat as a miss
  }
}

export async function getFoodByBarcode(req: Request, res: Response, next: NextFunction) {
  try {
    const barcode = req.params.barcode;
    const result = await query('SELECT * FROM foods WHERE barcode = $1', [barcode]);
    if (result.rowCount && result.rowCount > 0) {
      res.json({ success: true, data: result.rows[0] });
      return;
    }

    const offProduct = await fetchFromOpenFoodFacts(barcode);
    if (!offProduct) throw new AppError('Food not found by barcode', 404);

    const n = offProduct.nutriments || {};
    const category = offProduct.categories_tags?.[0]?.replace(/^\w\w:/, '').replace(/-/g, ' ') || null;
    const created = await query(
      `INSERT INTO foods (name, brand, barcode, category, calories, protein_g, carbs_g,
         fat_g, fiber_g, sugar_g, sodium_mg, saturated_fat_g, image_url, source)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'openfoodfacts')
       RETURNING *`,
      [
        offProduct.product_name, offProduct.brands || null, barcode, category,
        n['energy-kcal_100g'] || 0, n['proteins_100g'] || 0, n['carbohydrates_100g'] || 0,
        n['fat_100g'] || 0, n['fiber_100g'] || 0, n['sugars_100g'] || 0,
        n['sodium_100g'] != null ? Math.round(n['sodium_100g'] * 1000) : 0,
        n['saturated-fat_100g'] || 0, offProduct.image_url || null,
      ]
    );
    res.json({ success: true, data: created.rows[0] });
  } catch (err) {
    next(err);
  }
}

export async function createFood(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const {
      name, name_uk, brand, barcode, category,
      calories, protein_g, carbs_g, fat_g, fiber_g,
      sugar_g, sodium_mg, image_url,
    } = req.body;

    const result = await query(
      `INSERT INTO foods (name, name_uk, brand, barcode, category, calories, protein_g,
         carbs_g, fat_g, fiber_g, sugar_g, sodium_mg, image_url, source, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'user',$14)
       RETURNING *`,
      [name, name_uk, brand, barcode, category, calories, protein_g,
       carbs_g, fat_g, fiber_g || 0, sugar_g || 0, sodium_mg || 0, image_url, req.user!.id]
    );

    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) {
    next(err);
  }
}

export async function getFoodCategories(_req: Request, res: Response, next: NextFunction) {
  try {
    const cached = await getCache('foods:categories');
    if (cached) { res.json(cached); return; }

    const result = await query(
      `SELECT category, COUNT(*) as count FROM foods
       WHERE category IS NOT NULL GROUP BY category ORDER BY count DESC`
    );
    const response = { success: true, data: result.rows };
    await setCache('foods:categories', response, 3600);
    res.json(response);
  } catch (err) {
    next(err);
  }
}
