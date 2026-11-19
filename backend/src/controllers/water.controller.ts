import { Response, NextFunction } from 'express';
import { body, query as queryParam } from 'express-validator';
import { AuthRequest } from '../middleware/auth';
import { getClient, query } from '../config/database';

// The dashboard counts water in cups; water_logs stores millilitres
const CUP_ML = 250;
const MAX_CUPS = 20;

const dateRule = (field: ReturnType<typeof body>) =>
  field.isISO8601({ strict: true }).isLength({ min: 10, max: 10 });

export const getWaterValidation = [dateRule(queryParam('date'))];
export const setWaterValidation = [
  dateRule(body('date')),
  body('cups').isInt({ min: 0, max: MAX_CUPS }).toInt(),
];

// date comes from the browser (the user's local day), like the food log
async function waterFor(userId: string, date: string) {
  const result = await query(
    'SELECT COALESCE(SUM(amount_ml), 0)::int AS total_ml FROM water_logs WHERE user_id = $1 AND log_date = $2',
    [userId, date]
  );
  const total_ml: number = result.rows[0].total_ml;
  return { date, total_ml, cups: Math.round(total_ml / CUP_ML) };
}

export async function getWater(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    res.json({ success: true, data: await waterFor(req.user!.id, req.query.date as string) });
  } catch (err) {
    next(err);
  }
}

// Sets the day's total. The UI is "tap the Nth cup", so it sends the new total
// rather than +1/-1, and the day becomes a single row of cups x 250 ml.
export async function setWater(req: AuthRequest, res: Response, next: NextFunction) {
  const client = await getClient();
  try {
    const { date, cups } = req.body as { date: string; cups: number };
    await client.query('BEGIN');
    await client.query('DELETE FROM water_logs WHERE user_id = $1 AND log_date = $2', [req.user!.id, date]);
    if (cups > 0) {
      await client.query(
        'INSERT INTO water_logs (user_id, amount_ml, log_date) VALUES ($1, $2, $3)',
        [req.user!.id, cups * CUP_ML, date]
      );
    }
    await client.query('COMMIT');
    res.json({ success: true, data: await waterFor(req.user!.id, date) });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
}
