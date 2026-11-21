import { Response, NextFunction } from 'express';
import { body } from 'express-validator';
import { AuthRequest } from '../middleware/auth';
import { query } from '../config/database';
import { AppError } from '../middleware/errorHandler';
import { getClient } from '../config/database';
import * as aiService from '../services/ai.service';
import { buildUserContext } from '../services/aiContext.service';
import {
  Attachment, TOOLS, createToolContext, describeAttachments, pickAttachments, runTool,
} from '../services/aiTools.service';
import { writeIngredients } from '../services/recipeImport.service';

// Messages sent to the model with each question: enough to follow the
// conversation, short enough to fit 2 users x 8K tokens of context together
// with the tool definitions and results
const MAX_HISTORY = 12;
// Tool-calling rounds before the model must answer with what it has
const MAX_TOOL_ROUNDS = 4;
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
      `SELECT id, role, content, attachments, created_at FROM (
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

    const [history, context, tools] = await Promise.all([
      query(
        `SELECT role, content, attachments FROM ai_chat_messages WHERE user_id = $1
         ORDER BY created_at DESC LIMIT $2`,
        [userId, MAX_HISTORY - 1]
      ),
      buildUserContext(userId, today),
      createToolContext(userId),
    ]);
    const messages: aiService.ChatMessage[] = [
      // The model only sees text, so it's told which recipe cards it showed
      ...history.rows.reverse().map((m) => ({ role: m.role, content: m.content + describeAttachments(m.attachments) })),
      { role: 'user', content: message },
    ];

    // The model may call tools (search recipes, write one...) a few times
    // before answering; each round's calls and results go back to it
    let reply = '';
    for (let round = 0; ; round++) {
      const last = round === MAX_TOOL_ROUNDS;
      const result = await aiService.chat(messages, context, last ? undefined : TOOLS);
      if (!result.tool_calls.length || last) {
        reply = result.reply.trim();
        break;
      }
      const calls = result.tool_calls.map((call, i) => ({ ...call, id: call.id || `call_${round}_${i}`, type: 'function' as const }));
      messages.push({ role: 'assistant', content: result.reply || null, tool_calls: calls });
      for (const call of calls) {
        const output = await runTool(tools, call.function.name, call.function.arguments);
        messages.push({ role: 'tool', tool_call_id: call.id, content: output });
      }
    }
    if (!reply) throw new AppError('AI assistant returned an empty answer, please try again', 502);
    const attachments = pickAttachments(tools, reply);

    // Saved only once the answer exists, so a failed attempt leaves no
    // unanswered question behind and can simply be sent again
    const saved = await query(
      `INSERT INTO ai_chat_messages (user_id, role, content, attachments, created_at)
       VALUES ($1, 'user', $2, NULL, NOW()), ($1, 'assistant', $3, $4, NOW() + INTERVAL '1 millisecond')
       RETURNING id, role, content, attachments, created_at`,
      [userId, message, reply, attachments.length ? JSON.stringify(attachments) : null]
    );
    const [question, answer] = [...saved.rows].sort((a, b) => a.created_at - b.created_at);
    res.json({ success: true, data: { question, answer } });
  } catch (err) {
    next(err);
  }
}

export const saveDraftValidation = [
  body('message_id').isUUID(),
  body('index').isInt({ min: 0, max: 20 }).toInt(),
];

// Saves a recipe the assistant wrote (a "draft" card) to the user's own,
// private recipes. The draft is read from the stored message, not from the
// request, so its contents and nutrition can't be changed on the way.
export async function saveDraft(req: AuthRequest, res: Response, next: NextFunction) {
  const client = await getClient();
  try {
    const userId = req.user!.id;
    const { message_id: messageId, index } = req.body as { message_id: string; index: number };
    await client.query('BEGIN');
    const msg = await client.query(
      `SELECT attachments FROM ai_chat_messages WHERE id = $1 AND user_id = $2 AND role = 'assistant' FOR UPDATE`,
      [messageId, userId]
    );
    const attachments: Attachment[] = msg.rows[0]?.attachments ?? [];
    const draft = attachments[index];
    if (!draft || draft.type !== 'draft') throw new AppError('Recipe not found', 404);

    if (!draft.saved_recipe_id) {
      const instructions = draft.steps.map((s, i) => `${i + 1}. ${s}`).join('\n');
      const created = await client.query(
        `INSERT INTO recipes (title, title_uk, instructions, prep_time_min, cook_time_min, servings, meal_type,
                              is_public, created_by, source)
         VALUES ($1, $2, $3, $4, $5, $6, $7, FALSE, $8, 'ai') RETURNING id`,
        [draft.title, draft.title_uk, instructions || null, draft.prep_time_min, draft.cook_time_min,
         draft.servings, draft.meal_type, userId]
      );
      const recipeId = created.rows[0].id;
      await writeIngredients(
        client, recipeId,
        draft.ingredients.map((i) => ({ name: i.name, measure: `${i.grams} g`, grams: i.grams })),
        draft.servings, 'ai'
      );
      draft.saved_recipe_id = recipeId;
      await client.query('UPDATE ai_chat_messages SET attachments = $1 WHERE id = $2', [JSON.stringify(attachments), messageId]);
    }
    await client.query('COMMIT');
    res.status(201).json({ success: true, data: { recipe_id: draft.saved_recipe_id } });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
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
