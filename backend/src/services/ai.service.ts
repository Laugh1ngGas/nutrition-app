import { logger } from '../utils/logger';
import { AppError } from '../middleware/errorHandler';

// The AI service (Gemma 4 31B, see ai-service/) runs on Modal in production
// and in docker-compose locally. Modal stops the GPU container after 5 idle
// minutes and starts it again on the next request (~25 s to load the model).
const AI_SERVICE_URL = (process.env.AI_SERVICE_URL || 'http://ai-service:7860').replace(/\/$/, '');

function headers(): Record<string, string> {
  return process.env.AI_SERVICE_KEY ? { 'X-AI-Key': process.env.AI_SERVICE_KEY } : {};
}

export type AiStatus = 'ready' | 'loading' | 'offline';

export async function getStatus(): Promise<AiStatus> {
  try {
    const res = await fetch(`${AI_SERVICE_URL}/health`, { headers: headers(), signal: AbortSignal.timeout(10_000) });
    const body = (await res.json().catch(() => ({}))) as { status?: string };
    if (body.status === 'ready') return 'ready';
    if (body.status === 'error') return 'offline'; // model process crashed
    if (!res.ok) return 'offline'; // e.g. 404 when the Modal app isn't deployed
    return 'loading';
  } catch (err) {
    // Modal holds the request while it starts a container, so a timeout
    // usually means "waking up"; refused connections etc. mean offline
    return (err as { name?: string })?.name === 'TimeoutError' ? 'loading' : 'offline';
  }
}

// Fire-and-forget: called on sign-in/up/refresh so the model is loading
// while the user is still looking at the dashboard.
export function wake(): void {
  getStatus().then((status) => logger.info(`AI service wake ping: ${status}`));
}

// After a quiet spell Modal starts a fresh container, which answers 503 for
// the ~25 s the model takes to load. Waiting that out (up to 90 s) beats
// failing the first message of every session.
const WARMUP_RETRY_MS = 5_000;
const WARMUP_RETRIES = 18;

async function post<T>(path: string, body: string | FormData, contentType?: string): Promise<T> {
  let res: Response;
  for (let attempt = 0; ; attempt++) {
    res = await fetch(`${AI_SERVICE_URL}${path}`, {
      method: 'POST',
      headers: { ...headers(), ...(contentType ? { 'Content-Type': contentType } : {}) },
      body,
      // The local CPU version can take over a minute for a photo
      signal: AbortSignal.timeout(180_000),
    }).catch(() => {
      throw new AppError('AI assistant is offline, please try again in a minute', 503);
    });
    if (res.status !== 503 || attempt >= WARMUP_RETRIES) break;
    await new Promise((resolve) => setTimeout(resolve, WARMUP_RETRY_MS));
  }

  if (res.status === 503) throw new AppError('AI assistant is warming up, please try again in a minute', 503);
  if (!res.ok) {
    logger.error(`AI service ${path} failed: ${res.status} ${await res.text()}`);
    throw new AppError('AI assistant failed to respond', 502);
  }
  return res.json() as Promise<T>;
}

export interface ToolCall {
  id?: string;
  type?: 'function';
  function: { name: string; arguments: string };
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'tool';
  content: string | null;
  // An assistant turn that called tools, and each tool's answer to it
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}

export interface ChatResult {
  reply: string;
  tool_calls: ToolCall[];
}

// context: the user's profile and fridge (see aiContext.service.ts)
// tools: OpenAI-style definitions the model may call instead of answering
export async function chat(messages: ChatMessage[], context?: string, tools?: unknown[]): Promise<ChatResult> {
  const result = await post<{ reply?: string; tool_calls?: ToolCall[] }>(
    '/v1/chat',
    JSON.stringify({ messages, context, tools }),
    'application/json'
  );
  return { reply: result.reply ?? '', tool_calls: result.tool_calls ?? [] };
}

export interface RecognizedIngredient {
  name: string;
  name_uk: string;
  confidence: 'high' | 'medium' | 'low';
}

export async function recognize(image: Buffer, mimeType: string): Promise<RecognizedIngredient[]> {
  const form = new FormData();
  form.append('image', new Blob([image], { type: mimeType }), 'photo');
  const { ingredients } = await post<{ ingredients: RecognizedIngredient[] }>('/v1/recognize', form);
  return ingredients;
}
