import { Response, NextFunction } from 'express';
import { body } from 'express-validator';
import { AuthRequest } from '../middleware/auth';
import { query } from '../config/database';
import { AppError } from '../middleware/errorHandler';
import * as aiService from '../services/ai.service';

// Keep prompts small — on a 2-vCPU Space every extra token costs time
const MAX_HISTORY = 20;

export const chatValidation = [
  body('messages').isArray({ min: 1 }),
  body('messages.*.role').isIn(['user', 'assistant']),
  body('messages.*.content').isString().trim().isLength({ min: 1, max: 4000 }),
];

export const recognizeValidation = [
  body('image').isString().notEmpty().withMessage('image (base64 or data URL) is required'),
];

export async function getStatus(_req: AuthRequest, res: Response, next: NextFunction) {
  try {
    res.json({ success: true, data: { status: await aiService.getStatus() } });
  } catch (err) {
    next(err);
  }
}

export async function chat(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const messages: aiService.ChatMessage[] = req.body.messages.slice(-MAX_HISTORY);
    const reply = await aiService.chat(messages);
    res.json({ success: true, data: { reply } });
  } catch (err) {
    next(err);
  }
}

export async function recognize(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    // Accept either "data:image/jpeg;base64,..." or bare base64
    const match = /^data:(image\/[\w+.-]+);base64,(.+)$/s.exec(req.body.image);
    const mimeType = match ? match[1] : 'image/jpeg';
    const image = Buffer.from(match ? match[2] : req.body.image, 'base64');
    if (image.length === 0) throw new AppError('image is not valid base64', 400);

    const ingredients = await aiService.recognize(image, mimeType);

    // Link each recognized name to an existing food so the UI can add it to
    // the fridge in one tap. Same case-insensitive name matching the recipe
    // seeder uses; unmatched items come back with food_id null.
    const names = ingredients.map((i) => i.name.toLowerCase());
    const foods = names.length
      ? await query(
          `SELECT DISTINCT ON (LOWER(name)) id, LOWER(name) AS key
           FROM foods WHERE LOWER(name) = ANY($1)
           ORDER BY LOWER(name), is_verified DESC`,
          [names]
        )
      : { rows: [] };
    const idByName = new Map(foods.rows.map((f: { id: string; key: string }) => [f.key, f.id]));

    res.json({
      success: true,
      data: ingredients.map((i) => ({ ...i, food_id: idByName.get(i.name.toLowerCase()) ?? null })),
    });
  } catch (err) {
    next(err);
  }
}
