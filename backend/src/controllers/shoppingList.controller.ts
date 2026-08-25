import { Response, NextFunction } from 'express';
import { body } from 'express-validator';
import { AuthRequest } from '../middleware/auth';
import { query } from '../config/database';
import { AppError } from '../middleware/errorHandler';

export async function getShoppingLists(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const result = await query(
      `SELECT sl.*, COUNT(sli.id) as item_count,
              COUNT(sli.id) FILTER (WHERE sli.is_purchased) as purchased_count
       FROM shopping_lists sl
       LEFT JOIN shopping_list_items sli ON sl.id = sli.list_id
       WHERE sl.user_id = $1
       GROUP BY sl.id
       ORDER BY sl.created_at DESC`,
      [req.user!.id]
    );
    res.json({ success: true, data: result.rows });
  } catch (err) {
    next(err);
  }
}

export async function getShoppingListById(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const listResult = await query(
      'SELECT * FROM shopping_lists WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user!.id]
    );
    if (!listResult.rowCount || listResult.rowCount === 0) throw new AppError('List not found', 404);

    const itemsResult = await query(
      `SELECT sli.*, f.name, f.name_uk, f.brand, f.category, f.image_url,
              f.calories, f.protein_g, f.carbs_g, f.fat_g
       FROM shopping_list_items sli
       JOIN foods f ON sli.food_id = f.id
       WHERE sli.list_id = $1
       ORDER BY sli.category, f.name`,
      [req.params.id]
    );

    res.json({
      success: true,
      data: { ...listResult.rows[0], items: itemsResult.rows },
    });
  } catch (err) {
    next(err);
  }
}

export async function createShoppingList(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const { name, plan_id } = req.body;
    const result = await query(
      'INSERT INTO shopping_lists (user_id, name, plan_id) VALUES ($1, $2, $3) RETURNING *',
      [req.user!.id, name || 'Shopping List', plan_id || null]
    );
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) {
    next(err);
  }
}

export async function addItemToList(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    // Verify list ownership
    const listCheck = await query(
      'SELECT id FROM shopping_lists WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user!.id]
    );
    if (!listCheck.rowCount || listCheck.rowCount === 0) throw new AppError('List not found', 404);

    const { food_id, quantity, unit, category } = req.body;

    // Auto-set category from food if not provided
    let resolvedCategory = category;
    if (!resolvedCategory) {
      const foodResult = await query('SELECT category FROM foods WHERE id = $1', [food_id]);
      resolvedCategory = foodResult.rows[0]?.category;
    }

    const result = await query(
      `INSERT INTO shopping_list_items (list_id, food_id, quantity, unit, category)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [req.params.id, food_id, quantity || null, unit || 'g', resolvedCategory]
    );

    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) {
    next(err);
  }
}

export async function toggleItemPurchased(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const result = await query(
      `UPDATE shopping_list_items sli
       SET is_purchased = NOT is_purchased
       FROM shopping_lists sl
       WHERE sli.id = $1 AND sli.list_id = sl.id AND sl.user_id = $2
       RETURNING sli.*`,
      [req.params.itemId, req.user!.id]
    );
    if (!result.rowCount || result.rowCount === 0) throw new AppError('Item not found', 404);
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    next(err);
  }
}

export async function removeItemFromList(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    await query(
      `DELETE FROM shopping_list_items sli
       USING shopping_lists sl
       WHERE sli.id = $1 AND sli.list_id = sl.id AND sl.user_id = $2`,
      [req.params.itemId, req.user!.id]
    );
    res.json({ success: true, message: 'Item removed' });
  } catch (err) {
    next(err);
  }
}

export async function generateFromPlan(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const { plan_id, start_date, end_date } = req.body;

    const ingredientsResult = await query(
      `SELECT ri.food_id, SUM(ri.quantity) as total_quantity, ri.unit,
              f.category
       FROM meal_plan_entries mpe
       JOIN recipe_ingredients ri ON mpe.recipe_id = ri.recipe_id
       JOIN foods f ON ri.food_id = f.id
       WHERE mpe.plan_id = $1
         AND mpe.planned_date BETWEEN $2 AND $3
       GROUP BY ri.food_id, ri.unit, f.category`,
      [plan_id, start_date, end_date]
    );

    // Create a new list
    const listResult = await query(
      `INSERT INTO shopping_lists (user_id, name, plan_id)
       VALUES ($1, 'Plan Shopping List', $2) RETURNING id`,
      [req.user!.id, plan_id]
    );
    const listId = listResult.rows[0].id;

    // Insert aggregated ingredients
    for (const item of ingredientsResult.rows) {
      await query(
        `INSERT INTO shopping_list_items (list_id, food_id, quantity, unit, category)
         VALUES ($1, $2, $3, $4, $5)`,
        [listId, item.food_id, item.total_quantity, item.unit, item.category]
      );
    }

    res.status(201).json({ success: true, data: { list_id: listId, items_added: ingredientsResult.rowCount } });
  } catch (err) {
    next(err);
  }
}
