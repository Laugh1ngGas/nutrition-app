import { Response, NextFunction } from 'express';
import { body } from 'express-validator';
import { AuthRequest } from '../middleware/auth';
import { getClient, query } from '../config/database';
import { AppError } from '../middleware/errorHandler';

const UNITS = ['g', 'kg', 'ml', 'l', 'cup', 'tbsp', 'tsp', 'piece', 'slice', 'serving'];

export const fridgeItemValidation = [
  body('food_id').isUUID(),
  body('quantity').optional().isFloat({ min: 0 }),
  body('unit').optional().isIn(UNITS),
  body('expiry_date').optional().isISO8601(),
];

// Items confirmed after an AI photo scan: each has a matched food_id, or a
// name to look up (and create if it's new)
export const fridgeBatchValidation = [
  body('items').isArray({ min: 1, max: 30 }),
  body('items.*.food_id').optional({ values: 'null' }).isUUID(),
  body('items.*.name').isString().trim().isLength({ min: 1, max: 100 }),
  body('items.*.name_uk').optional({ values: 'null' }).isString().trim().isLength({ max: 100 }),
  body('items.*.quantity').optional({ values: 'null' }).isFloat({ min: 0 }),
  body('items.*.unit').optional().isIn(UNITS),
  body('items.*.expiry_date').optional({ values: 'null' }).isISO8601(),
];

interface BatchItem {
  food_id?: string | null;
  name: string;
  name_uk?: string | null;
  quantity?: number | null;
  unit?: string;
  expiry_date?: string | null;
}

// All or nothing, so a failed save never leaves half the scan in the fridge
export async function addFridgeItemsBatch(req: AuthRequest, res: Response, next: NextFunction) {
  const client = await getClient();
  try {
    const items = req.body.items as BatchItem[];
    await client.query('BEGIN');
    const added = [];
    for (const item of items) {
      let foodId = item.food_id ?? null;
      if (foodId) {
        const exists = await client.query('SELECT 1 FROM foods WHERE id = $1', [foodId]);
        if (!exists.rowCount) foodId = null;
      }
      if (!foodId) {
        // Reuse a food with the same name before adding a new one, so the
        // shared catalogue doesn't fill up with duplicates
        const found = await client.query(
          `SELECT id FROM foods
           WHERE LOWER(name) = LOWER($1) OR (CAST($2 AS TEXT) IS NOT NULL AND LOWER(name_uk) = LOWER($2))
           ORDER BY is_verified DESC, created_at LIMIT 1`,
          [item.name, item.name_uk || null]
        );
        foodId = found.rows[0]?.id;
      }
      if (!foodId) {
        // Capitalised like the rest of the catalogue ("Tomato", not "tomato")
        const capital = (s?: string | null) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : null);
        const created = await client.query(
          `INSERT INTO foods (name, name_uk, calories, source, created_by)
           VALUES ($1, $2, 0, 'ai_photo', $3) RETURNING id`,
          [capital(item.name), capital(item.name_uk), req.user!.id]
        );
        foodId = created.rows[0].id;
      }
      const result = await client.query(
        `INSERT INTO fridge_items (user_id, food_id, quantity, unit, expiry_date)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (user_id, food_id)
         DO UPDATE SET quantity = EXCLUDED.quantity, unit = EXCLUDED.unit,
                       expiry_date = EXCLUDED.expiry_date, updated_at = NOW()
         RETURNING *`,
        [req.user!.id, foodId, item.quantity || null, item.unit || 'piece', item.expiry_date || null]
      );
      added.push(result.rows[0]);
    }
    await client.query('COMMIT');
    res.status(201).json({ success: true, data: added });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
}

export async function getFridgeItems(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const result = await query(
      `SELECT fi.*, f.name, f.name_uk, f.brand, f.category,
              f.calories, f.protein_g, f.carbs_g, f.fat_g,
              f.image_url,
              CASE WHEN fi.expiry_date < CURRENT_DATE THEN true ELSE false END as is_expired,
              CASE WHEN fi.expiry_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '3 days'
                   THEN true ELSE false END as expiring_soon
       FROM fridge_items fi
       JOIN foods f ON fi.food_id = f.id
       WHERE fi.user_id = $1
       ORDER BY fi.expiry_date ASC NULLS LAST, f.category, f.name`,
      [req.user!.id]
    );
    res.json({ success: true, data: result.rows });
  } catch (err) {
    next(err);
  }
}

export async function addFridgeItem(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const { food_id, quantity, unit, expiry_date } = req.body;

    // Verify food exists
    const foodCheck = await query('SELECT id FROM foods WHERE id = $1', [food_id]);
    if (!foodCheck.rowCount || foodCheck.rowCount === 0) throw new AppError('Food not found', 404);

    const result = await query(
      `INSERT INTO fridge_items (user_id, food_id, quantity, unit, expiry_date)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (user_id, food_id)
       DO UPDATE SET quantity = EXCLUDED.quantity, unit = EXCLUDED.unit,
                     expiry_date = EXCLUDED.expiry_date, updated_at = NOW()
       RETURNING *`,
      [req.user!.id, food_id, quantity || null, unit || 'g', expiry_date || null]
    );

    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) {
    next(err);
  }
}

export async function updateFridgeItem(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const { quantity, unit, expiry_date } = req.body;

    const result = await query(
      `UPDATE fridge_items
       SET quantity = COALESCE($1, quantity),
           unit = COALESCE($2, unit),
           expiry_date = COALESCE($3, expiry_date),
           updated_at = NOW()
       WHERE id = $4 AND user_id = $5
       RETURNING *`,
      [quantity, unit, expiry_date, req.params.id, req.user!.id]
    );

    if (!result.rowCount || result.rowCount === 0) throw new AppError('Item not found', 404);
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    next(err);
  }
}

export async function removeFridgeItem(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const result = await query(
      'DELETE FROM fridge_items WHERE id = $1 AND user_id = $2 RETURNING id',
      [req.params.id, req.user!.id]
    );
    if (!result.rowCount || result.rowCount === 0) throw new AppError('Item not found', 404);
    res.json({ success: true, message: 'Item removed from fridge' });
  } catch (err) {
    next(err);
  }
}

export async function getExpiringItems(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const days = parseInt(req.query.days as string) || 3;
    const result = await query(
      `SELECT fi.*, f.name, f.name_uk, f.category, f.image_url,
              fi.expiry_date - CURRENT_DATE as days_until_expiry
       FROM fridge_items fi
       JOIN foods f ON fi.food_id = f.id
       WHERE fi.user_id = $1
         AND fi.expiry_date IS NOT NULL
         AND fi.expiry_date <= CURRENT_DATE + $2 * INTERVAL '1 day'
       ORDER BY fi.expiry_date ASC`,
      [req.user!.id, days]
    );
    res.json({ success: true, data: result.rows });
  } catch (err) {
    next(err);
  }
}
