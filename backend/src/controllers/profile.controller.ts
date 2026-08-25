import { Request, Response, NextFunction } from 'express';
import { body } from 'express-validator';
import { AuthRequest } from '../middleware/auth';
import { query } from '../config/database';
import { AppError } from '../middleware/errorHandler';
import { calculateDailyTargets } from '../services/auth.service';
import { Gender, ActivityLevel, UserGoal, DietType } from '../types';

export const profileValidation = [
  body('gender').optional().isIn(['male', 'female', 'other']),
  body('date_of_birth').optional().isISO8601(),
  body('height_cm').optional().isFloat({ min: 50, max: 300 }),
  body('weight_kg').optional().isFloat({ min: 20, max: 500 }),
  body('target_weight_kg').optional().isFloat({ min: 20, max: 500 }),
  body('goal').optional().isIn(['weight_loss', 'weight_gain', 'muscle_gain', 'maintenance', 'healthy_eating']),
  body('activity_level').optional().isIn(['sedentary', 'lightly_active', 'moderately_active', 'very_active', 'extra_active']),
  body('diet_type').optional().isIn(['standard', 'vegetarian', 'vegan', 'pescatarian', 'keto', 'paleo', 'gluten_free', 'dairy_free', 'halal', 'kosher']),
];

export async function getMyProfile(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const result = await query(
      `SELECT u.id, u.email, u.first_name, u.last_name, u.avatar_url,
              p.*, array_agg(DISTINCT a.name) FILTER (WHERE a.name IS NOT NULL) AS allergens
       FROM users u
       LEFT JOIN user_profiles p ON u.id = p.user_id
       LEFT JOIN user_allergens ua ON u.id = ua.user_id
       LEFT JOIN allergens a ON ua.allergen_id = a.id
       WHERE u.id = $1
       GROUP BY u.id, p.id`,
      [req.user!.id]
    );

    if (!result.rowCount || result.rowCount === 0) throw new AppError('User not found', 404);
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    next(err);
  }
}

export async function updateProfile(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const {
      first_name, last_name, gender, date_of_birth,
      height_cm, weight_kg, target_weight_kg,
      goal, activity_level, diet_type,
    } = req.body;

    // Update users table
    if (first_name !== undefined || last_name !== undefined) {
      await query(
        'UPDATE users SET first_name = COALESCE($1, first_name), last_name = COALESCE($2, last_name) WHERE id = $3',
        [first_name, last_name, req.user!.id]
      );
    }

    // Recalculate nutrition targets if key values change
    let nutritionTargets: {
      dailyCalories?: number;
      protein_g?: number;
      fat_g?: number;
      carbs_g?: number;
      fiber_g?: number;
    } = {};

    const profileResult = await query('SELECT * FROM user_profiles WHERE user_id = $1', [req.user!.id]);
    const currentProfile = profileResult.rows[0];

    const mergedGender = (gender || currentProfile?.gender) as Gender;
    const mergedWeight = weight_kg || currentProfile?.weight_kg;
    const mergedHeight = height_cm || currentProfile?.height_cm;
    const mergedDob = date_of_birth || currentProfile?.date_of_birth;
    const mergedActivity = (activity_level || currentProfile?.activity_level) as ActivityLevel;
    const mergedGoal = (goal || currentProfile?.goal) as UserGoal;

    if (mergedGender && mergedWeight && mergedHeight && mergedDob) {
      const ageYears = Math.floor(
        (Date.now() - new Date(mergedDob).getTime()) / (365.25 * 24 * 60 * 60 * 1000)
      );
      const targets = calculateDailyTargets(mergedGender, mergedWeight, mergedHeight, ageYears, mergedActivity, mergedGoal);
      nutritionTargets = {
        dailyCalories: targets.dailyCalories,
        protein_g: targets.protein_g,
        fat_g: targets.fat_g,
        carbs_g: targets.carbs_g,
        fiber_g: targets.fiber_g,
      };
    }

    const updated = await query(
      `UPDATE user_profiles SET
         gender = COALESCE($1, gender),
         date_of_birth = COALESCE($2, date_of_birth),
         height_cm = COALESCE($3, height_cm),
         weight_kg = COALESCE($4, weight_kg),
         target_weight_kg = COALESCE($5, target_weight_kg),
         goal = COALESCE($6, goal),
         activity_level = COALESCE($7, activity_level),
         diet_type = COALESCE($8, diet_type),
         daily_calories = COALESCE($9, daily_calories),
         daily_protein_g = COALESCE($10, daily_protein_g),
         daily_fat_g = COALESCE($11, daily_fat_g),
         daily_carbs_g = COALESCE($12, daily_carbs_g),
         daily_fiber_g = COALESCE($13, daily_fiber_g),
         onboarding_completed = TRUE
       WHERE user_id = $14
       RETURNING *`,
      [
        gender || null, date_of_birth || null, height_cm || null, weight_kg || null,
        target_weight_kg || null, goal || null, activity_level || null, diet_type || null,
        nutritionTargets.dailyCalories || null,
        nutritionTargets.protein_g || null,
        nutritionTargets.fat_g || null,
        nutritionTargets.carbs_g || null,
        nutritionTargets.fiber_g || null,
        req.user!.id,
      ]
    );

    res.json({ success: true, data: updated.rows[0] });
  } catch (err) {
    next(err);
  }
}

export async function getAllergens(_req: Request, res: Response, next: NextFunction) {
  try {
    const result = await query('SELECT id, name FROM allergens ORDER BY name');
    res.json({ success: true, data: result.rows });
  } catch (err) {
    next(err);
  }
}

export async function updateAllergens(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const { allergen_ids } = req.body as { allergen_ids: number[] };
    await query('DELETE FROM user_allergens WHERE user_id = $1', [req.user!.id]);

    if (allergen_ids?.length > 0) {
      const values = allergen_ids.map((_, i) => `($1, $${i + 2})`).join(',');
      await query(`INSERT INTO user_allergens (user_id, allergen_id) VALUES ${values}`, [req.user!.id, ...allergen_ids]);
    }

    res.json({ success: true, message: 'Allergens updated' });
  } catch (err) {
    next(err);
  }
}
