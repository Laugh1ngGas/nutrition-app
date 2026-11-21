import { Request, Response, NextFunction } from 'express';
import { body } from 'express-validator';
import * as authService from '../services/auth.service';
import * as aiService from '../services/ai.service';
import { AuthRequest } from '../middleware/auth';

export const registerValidation = [
  body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
  body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
  body('first_name').optional().trim().isLength({ max: 100 }),
  body('last_name').optional().trim().isLength({ max: 100 }),
];

export const loginValidation = [
  body('email').isEmail().normalizeEmail(),
  body('password').notEmpty(),
];

export const changePasswordValidation = [
  body('current_password').isString().notEmpty(),
  body('new_password').isString().isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
];

export const deleteAccountValidation = [body('password').isString().notEmpty()];

export async function changePassword(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const tokens = await authService.changePassword(req.user!.id, req.body.current_password, req.body.new_password);
    res.json({ success: true, data: tokens });
  } catch (err) {
    next(err);
  }
}

export async function deleteAccount(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    await authService.deleteAccount(req.user!.id, req.body.password);
    res.json({ success: true, message: 'Account deleted' });
  } catch (err) {
    next(err);
  }
}

export async function register(req: Request, res: Response, next: NextFunction) {
  try {
    const { email, password, first_name, last_name } = req.body;
    const { user, tokens } = await authService.registerUser(email, password, first_name, last_name);
    aiService.wake();
    res.status(201).json({ success: true, data: { user, tokens } });
  } catch (err) {
    next(err);
  }
}

export async function login(req: Request, res: Response, next: NextFunction) {
  try {
    const { email, password } = req.body;
    const { user, tokens } = await authService.loginUser(email, password);
    aiService.wake();
    res.json({ success: true, data: { user, tokens } });
  } catch (err) {
    next(err);
  }
}

export async function refresh(req: Request, res: Response, next: NextFunction) {
  try {
    const { refresh_token } = req.body;
    if (!refresh_token) {
      res.status(400).json({ success: false, message: 'refresh_token is required' });
      return;
    }
    const tokens = await authService.refreshTokens(refresh_token);
    // Returning users with a saved session never hit login, so wake here too
    aiService.wake();
    res.json({ success: true, data: tokens });
  } catch (err) {
    next(err);
  }
}

export async function logout(req: Request, res: Response, next: NextFunction) {
  try {
    const { refresh_token } = req.body;
    if (refresh_token) await authService.logoutUser(refresh_token);
    res.json({ success: true, message: 'Logged out successfully' });
  } catch (err) {
    next(err);
  }
}
