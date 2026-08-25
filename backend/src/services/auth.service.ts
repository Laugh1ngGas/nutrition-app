import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { query } from '../config/database';
import { AppError } from '../middleware/errorHandler';
import { AuthTokens, UserPublic, UserGoal, ActivityLevel, Gender } from '../types';

const ACTIVITY_MULTIPLIERS: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  lightly_active: 1.375,
  moderately_active: 1.55,
  very_active: 1.725,
  extra_active: 1.9,
};

export function calculateDailyTargets(
  gender: Gender,
  weightKg: number,
  heightCm: number,
  ageYears: number,
  activityLevel: ActivityLevel,
  goal: UserGoal
) {
  const bmr =
    gender === 'male'
      ? 10 * weightKg + 6.25 * heightCm - 5 * ageYears + 5
      : 10 * weightKg + 6.25 * heightCm - 5 * ageYears - 161;

  const tdee = bmr * ACTIVITY_MULTIPLIERS[activityLevel];

  const goalAdjustments: Record<UserGoal, number> = {
    weight_loss: -500,
    weight_gain: 300,
    muscle_gain: 200,
    maintenance: 0,
    healthy_eating: 0,
  };
  const dailyCalories = Math.round(tdee + goalAdjustments[goal]);

  const protein_g = Math.round((dailyCalories * 0.25) / 4);
  const fat_g     = Math.round((dailyCalories * 0.30) / 9);
  const carbs_g   = Math.round((dailyCalories * 0.45) / 4);
  const fiber_g   = Math.round((dailyCalories / 1000) * 14);

  return { dailyCalories, protein_g, fat_g, carbs_g, fiber_g };
}

// ── Token helpers ──────────────────────────────────────────────────────────────

function signAccessToken(userId: string, email: string): string {
  const secret    = process.env.JWT_SECRET!;
  const expiresIn = process.env.JWT_EXPIRES_IN || '15m';
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore — jsonwebtoken приймає string, але @types/jsonwebtoken вимагає StringValue
  return jwt.sign({ sub: userId, email }, secret, { expiresIn });
}

function signRefreshToken(userId: string): string {
  const secret    = process.env.JWT_REFRESH_SECRET!;
  const expiresIn = process.env.JWT_REFRESH_EXPIRES_IN || '7d';
  // @ts-ignore
  return jwt.sign({ sub: userId }, secret, { expiresIn });
}

// ── Service functions ──────────────────────────────────────────────────────────

export async function registerUser(
  email: string,
  password: string,
  firstName?: string,
  lastName?: string
): Promise<{ user: UserPublic; tokens: AuthTokens }> {
  const existing = await query('SELECT id FROM users WHERE email = $1', [email]);
  if (existing.rowCount && existing.rowCount > 0) {
    throw new AppError('Email already in use', 409);
  }

  const passwordHash = await bcrypt.hash(password, 12);

  const result = await query(
    `INSERT INTO users (email, password_hash, first_name, last_name)
     VALUES ($1, $2, $3, $4)
     RETURNING id, email, first_name, last_name, is_active, is_verified, created_at, updated_at`,
    [email, passwordHash, firstName || null, lastName || null]
  );

  const user = result.rows[0] as UserPublic;
  await query('INSERT INTO user_profiles (user_id) VALUES ($1)', [user.id]);

  const tokens = await generateTokens(user.id, user.email);
  return { user, tokens };
}

export async function loginUser(
  email: string,
  password: string
): Promise<{ user: UserPublic; tokens: AuthTokens }> {
  const result = await query(
    `SELECT id, email, password_hash, first_name, last_name, is_active, is_verified, created_at, updated_at
     FROM users WHERE email = $1`,
    [email]
  );

  const user = result.rows[0];
  if (!user) throw new AppError('Invalid email or password', 401);
  if (!user.is_active) throw new AppError('Account is deactivated', 403);

  const isValid = await bcrypt.compare(password, user.password_hash);
  if (!isValid) throw new AppError('Invalid email or password', 401);

  const { password_hash, ...userPublic } = user;
  const tokens = await generateTokens(user.id, user.email);
  return { user: userPublic as UserPublic, tokens };
}

export async function refreshTokens(refreshToken: string): Promise<AuthTokens> {
  const dbToken = await query(
    `SELECT * FROM refresh_tokens
     WHERE token = $1 AND is_revoked = FALSE AND expires_at > NOW()`,
    [refreshToken]
  );

  if (!dbToken.rowCount || dbToken.rowCount === 0) {
    throw new AppError('Invalid or expired refresh token', 401);
  }

  const payload = jwt.verify(
    refreshToken,
    process.env.JWT_REFRESH_SECRET!
  ) as { sub: string };

  await query('UPDATE refresh_tokens SET is_revoked = TRUE WHERE token = $1', [refreshToken]);

  const userResult = await query('SELECT email FROM users WHERE id = $1', [payload.sub]);
  return generateTokens(payload.sub, userResult.rows[0].email);
}

export async function logoutUser(refreshToken: string): Promise<void> {
  await query('UPDATE refresh_tokens SET is_revoked = TRUE WHERE token = $1', [refreshToken]);
}

async function generateTokens(userId: string, email: string): Promise<AuthTokens> {
  const accessToken  = signAccessToken(userId, email);
  const refreshToken = signRefreshToken(userId);

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7);

  await query(
    `INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES ($1, $2, $3)`,
    [userId, refreshToken, expiresAt]
  );

  return { accessToken, refreshToken };
}
