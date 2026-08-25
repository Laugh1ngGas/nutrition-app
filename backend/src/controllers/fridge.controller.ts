import { Response, NextFunction } from 'express';
import { body } from 'express-validator';
import { AuthRequest } from '../middleware/auth';
import { query } from '../config/database';
import { AppError } from '../middleware/errorHandler';

export const fridgeItemValidation = [
  body('food_id').isUUID(),
  body('quantity').optional().isFloat({ min: 0 }),
  body('unit').optional().isIn(['g', 'kg', 'ml', 'l', 'cup', 'tbsp', 'tsp', 'piece', 'slice', 'serving']),
  body('expiry_date').optional().isISO8601(),
];

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
