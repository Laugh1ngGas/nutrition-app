import { Response, NextFunction } from 'express';
import { body, param, query as queryParam } from 'express-validator';
import { AuthRequest } from '../middleware/auth';
import * as mealPlans from '../services/mealPlan.service';

// The week's Monday as YYYY-MM-DD, computed in the browser (the user's local week)
const mondayRule = (field: ReturnType<typeof body>) =>
  field
    .isISO8601({ strict: true })
    .isLength({ min: 10, max: 10 })
    .custom((v: string) => new Date(`${v}T00:00:00Z`).getUTCDay() === 1)
    .withMessage('start must be a Monday (YYYY-MM-DD)');

export const getWeekValidation = [mondayRule(queryParam('start'))];
export const generateWeekValidation = [mondayRule(body('start'))];
export const rearrangeValidation = [
  param('planId').isUUID(),
  body('entries').isArray({ min: 1, max: 50 }),
  body('entries.*.id').isUUID(),
  body('entries.*.planned_date').isISO8601({ strict: true }).isLength({ min: 10, max: 10 }),
  body('entries.*.meal_type').isIn([...mealPlans.PLAN_SLOTS]),
];

export async function getWeek(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    res.json({ success: true, data: await mealPlans.getWeek(req.user!.id, req.query.start as string) });
  } catch (err) {
    next(err);
  }
}

// Creates the week's plan, or replaces its meals when it already exists
export async function generateWeek(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    await mealPlans.generateWeek(req.user!.id, req.body.start);
    res.status(201).json({ success: true, data: await mealPlans.getWeek(req.user!.id, req.body.start) });
  } catch (err) {
    next(err);
  }
}

export async function rearrange(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const start = await mealPlans.rearrange(req.user!.id, req.params.planId, req.body.entries);
    res.json({ success: true, data: await mealPlans.getWeek(req.user!.id, start) });
  } catch (err) {
    next(err);
  }
}
