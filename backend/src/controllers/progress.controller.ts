import { Response, NextFunction } from 'express';
import { query as queryParam } from 'express-validator';
import { AuthRequest } from '../middleware/auth';
import { query } from '../config/database';
import { AppError } from '../middleware/errorHandler';

// Water goal used by the dashboard: 8 cups of 250 ml
const WATER_GOAL_ML = 2000;
const MAX_RANGE_DAYS = 366;

const dateRule = (field: string) =>
  queryParam(field).isISO8601({ strict: true }).isLength({ min: 10, max: 10 });

// from/to: the range to chart; today: the user's local date (streaks and the
// plan only count days that have already happened)
export const progressValidation = [dateRule('from'), dateRule('to'), dateRule('today')];

const dayNumber = (date: string) => Date.parse(`${date}T00:00:00Z`) / 86_400_000;

// Longest run of consecutive dates, and the run that ends today (or
// yesterday: a streak isn't broken until the day is over)
function streaks(dates: string[], today: string) {
  const days = new Set(dates.map(dayNumber));
  let best = 0;
  for (const d of days) {
    if (days.has(d - 1)) continue; // not the start of a run
    let length = 1;
    while (days.has(d + length)) length++;
    best = Math.max(best, length);
  }
  let current = 0;
  let d = dayNumber(today);
  if (!days.has(d)) d--;
  while (days.has(d)) {
    current++;
    d--;
  }
  return { current, best };
}

export async function getProgress(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const userId = req.user!.id;
    const { from, to, today } = req.query as Record<string, string>;
    const span = dayNumber(to) - dayNumber(from);
    if (span < 0 || span >= MAX_RANGE_DAYS) throw new AppError('Invalid date range', 400);

    const [days, profile, weights, plan, loggedDates, waterDates] = await Promise.all([
      // Every day in the range, including days with nothing logged.
      // DECIMAL sums are cast to float so they arrive as numbers.
      query(
        `SELECT to_char(d, 'YYYY-MM-DD') AS date,
                COALESCE(f.calories, 0)::float AS calories,
                COALESCE(f.protein_g, 0)::float AS protein_g,
                COALESCE(f.carbs_g, 0)::float AS carbs_g,
                COALESCE(f.fat_g, 0)::float AS fat_g,
                COALESCE(f.meals, 0)::int AS meals,
                COALESCE(w.water_ml, 0)::int AS water_ml
         FROM generate_series($2::date, $3::date, INTERVAL '1 day') d
         LEFT JOIN (
           SELECT log_date, SUM(calories) AS calories, SUM(protein_g) AS protein_g,
                  SUM(carbs_g) AS carbs_g, SUM(fat_g) AS fat_g, COUNT(*) AS meals
           FROM food_logs
           WHERE user_id = $1 AND status != 'skipped' AND log_date BETWEEN $2 AND $3
           GROUP BY log_date
         ) f ON f.log_date = d::date
         LEFT JOIN (
           SELECT log_date, SUM(amount_ml) AS water_ml
           FROM water_logs WHERE user_id = $1 AND log_date BETWEEN $2 AND $3
           GROUP BY log_date
         ) w ON w.log_date = d::date
         ORDER BY d`,
        [userId, from, to]
      ),
      query(
        `SELECT daily_calories, daily_protein_g, daily_carbs_g, daily_fat_g,
                weight_kg::float AS weight_kg, target_weight_kg::float AS target_weight_kg
         FROM user_profiles WHERE user_id = $1`,
        [userId]
      ),
      // The range plus the last entry before it, so the line has a start
      query(
        `(SELECT to_char(log_date, 'YYYY-MM-DD') AS date, weight_kg::float AS weight_kg
          FROM weight_logs WHERE user_id = $1 AND log_date < $2
          ORDER BY log_date DESC LIMIT 1)
         UNION ALL
         (SELECT to_char(log_date, 'YYYY-MM-DD'), weight_kg::float
          FROM weight_logs WHERE user_id = $1 AND log_date BETWEEN $2 AND $3)
         ORDER BY date`,
        [userId, from, to]
      ),
      // A planned meal counts as followed when the same recipe was logged that day
      query(
        `SELECT COUNT(*)::int AS planned,
                COUNT(*) FILTER (WHERE EXISTS (
                  SELECT 1 FROM food_logs fl
                  WHERE fl.user_id = $1 AND fl.recipe_id = e.recipe_id AND fl.log_date = e.planned_date
                ))::int AS followed
         FROM meal_plan_entries e
         JOIN meal_plans p ON p.id = e.plan_id
         WHERE p.user_id = $1 AND p.is_active
           AND e.planned_date BETWEEN $2 AND LEAST($3::date, $4::date)`,
        [userId, from, to, today]
      ),
      query(
        `SELECT DISTINCT to_char(log_date, 'YYYY-MM-DD') AS date FROM food_logs
         WHERE user_id = $1 AND status != 'skipped' AND log_date <= $2`,
        [userId, today]
      ),
      query(
        `SELECT to_char(log_date, 'YYYY-MM-DD') AS date FROM water_logs
         WHERE user_id = $1 AND log_date <= $2
         GROUP BY log_date HAVING SUM(amount_ml) >= $3`,
        [userId, today, WATER_GOAL_ML]
      ),
    ]);

    const p = profile.rows[0] ?? {};
    const logging = streaks(loggedDates.rows.map((r) => r.date), today);
    res.json({
      success: true,
      data: {
        days: days.rows,
        targets: {
          daily_calories: p.daily_calories ?? null,
          daily_protein_g: p.daily_protein_g ?? null,
          daily_carbs_g: p.daily_carbs_g ?? null,
          daily_fat_g: p.daily_fat_g ?? null,
        },
        weight: { entries: weights.rows, current: p.weight_kg ?? null, target: p.target_weight_kg ?? null },
        plan: plan.rows[0],
        streaks: {
          logging: logging.current,
          logging_best: logging.best,
          water: streaks(waterDates.rows.map((r) => r.date), today).current,
        },
        water_goal_ml: WATER_GOAL_ML,
      },
    });
  } catch (err) {
    next(err);
  }
}
