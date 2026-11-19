import { Response, NextFunction } from 'express';
import { body } from 'express-validator';
import { AuthRequest } from '../middleware/auth';
import { query } from '../config/database';
import { AppError } from '../middleware/errorHandler';
import * as aiService from '../services/ai.service';
import { buildUserContext } from '../services/aiContext.service';

// Messages sent to the model with each question: enough to follow the
// conversation, short enough to fit 2 users x 8K tokens of context
const MAX_HISTORY = 20;
// Messages shown when the chat opens
const HISTORY_PAGE = 100;

export const chatValidation = [
  body('message').isString().trim().isLength({ min: 1, max: 4000 }),
  // The user's local date; optional so older clients still work
  body('today').optional().isISO8601({ strict: true }).isLength({ min: 10, max: 10 }),
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

export async function getMessages(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const result = await query(
      `SELECT id, role, content, created_at FROM (
         SELECT * FROM ai_chat_messages WHERE user_id = $1
         ORDER BY created_at DESC LIMIT $2
       ) latest ORDER BY created_at`,
      [req.user!.id, HISTORY_PAGE]
    );
    res.json({ success: true, data: result.rows });
  } catch (err) {
    next(err);
  }
}

export async function chat(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const userId = req.user!.id;
    const message: string = req.body.message;
    const today: string = req.body.today ?? new Date().toISOString().slice(0, 10);

    const [history, context] = await Promise.all([
      query(
        `SELECT role, content FROM ai_chat_messages WHERE user_id = $1
         ORDER BY created_at DESC LIMIT $2`,
        [userId, MAX_HISTORY - 1]
      ),
      buildUserContext(userId, today),
    ]);
    const messages: aiService.ChatMessage[] = [...history.rows.reverse(), { role: 'user', content: message }];

    const reply = (await aiService.chat(messages, context)).trim();
    if (!reply) throw new AppError('AI assistant returned an empty answer, please try again', 502);

    // Saved only once the answer exists, so a failed attempt leaves no
    // unanswered question behind and can simply be sent again
    const saved = await query(
      `INSERT INTO ai_chat_messages (user_id, role, content, created_at)
       VALUES ($1, 'user', $2, NOW()), ($1, 'assistant', $3, NOW() + INTERVAL '1 millisecond')
       RETURNING id, role, content, created_at`,
      [userId, message, reply]
    );
    const [question, answer] = [...saved.rows].sort((a, b) => a.created_at - b.created_at);
    res.json({ success: true, data: { question, answer } });
  } catch (err) {
    next(err);
  }
}

export async function clearMessages(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    await query('DELETE FROM ai_chat_messages WHERE user_id = $1', [req.user!.id]);
    res.json({ success: true });
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
