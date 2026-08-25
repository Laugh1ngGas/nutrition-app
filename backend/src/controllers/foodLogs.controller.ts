import { Response, NextFunction } from 'express';
import { body, param } from 'express-validator';
import { AuthRequest } from '../middleware/auth';
import * as foodLogService from '../services/foodLog.service';

export const logFoodValidation = [
  body('meal_type').isIn(['breakfast', 'lunch', 'dinner', 'snack', 'pre_workout', 'post_workout']),
  body('servings').optional().isFloat({ min: 0.1 }),
  body('quantity_g').optional().isFloat({ min: 0.1 }),
  body('log_date').optional().isISO8601(),
];

export async function addFoodLog(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const log = await foodLogService.logFood(req.user!.id, req.body);
    res.status(201).json({ success: true, data: log });
  } catch (err) {
    next(err);
  }
}

export async function getDailyLog(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const date = (req.query.date as string) || new Date().toISOString().split('T')[0];
    const nutrition = await foodLogService.getDailyNutrition(req.user!.id, date);

    // Append user targets for progress display
    const { query } = await import('../config/database');
    const profileResult = await query(
      'SELECT daily_calories, daily_protein_g, daily_carbs_g, daily_fat_g, daily_fiber_g FROM user_profiles WHERE user_id = $1',
      [req.user!.id]
    );
    const targets = profileResult.rows[0] || {};

    res.json({ success: true, data: { ...nutrition, targets } });
  } catch (err) {
    next(err);
  }
}

export async function removeFoodLog(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    await foodLogService.deleteFoodLog(req.user!.id, req.params.id);
    res.json({ success: true, message: 'Log entry removed' });
  } catch (err) {
    next(err);
  }
}

export async function getWeeklyStats(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const startDate = (req.query.start_date as string) || getMonday();
    const stats = await foodLogService.getWeeklyStats(req.user!.id, startDate);
    res.json({ success: true, data: stats });
  } catch (err) {
    next(err);
  }
}

function getMonday(): string {
  const d = new Date();
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  return d.toISOString().split('T')[0];
}
