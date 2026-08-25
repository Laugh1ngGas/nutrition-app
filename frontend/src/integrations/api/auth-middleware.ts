// Замінює: src/integrations/supabase/auth-middleware.ts
// Серверний middleware TanStack Start — перевіряє JWT токен через ваш Express API.

import { createMiddleware } from '@tanstack/react-start';
import { getRequest } from '@tanstack/react-start/server';

interface JwtPayload {
  sub: string;
  email: string;
  iat: number;
  exp: number;
}

// Легкий JWT-декодер (без верифікації підпису — це робить бекенд)
function decodeJwtPayload(token: string): JwtPayload | null {
  try {
    const base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const json = atob(base64);
    return JSON.parse(json) as JwtPayload;
  } catch {
    return null;
  }
}

export const requireApiAuth = createMiddleware({ type: 'function' }).server(
  async ({ next }) => {
    const request = getRequest();

    if (!request?.headers) {
      throw new Error('Unauthorized: No request headers');
    }

    const authHeader = request.headers.get('authorization');

    if (!authHeader?.startsWith('Bearer ')) {
      throw new Error('Unauthorized: No Bearer token');
    }

    const token = authHeader.replace('Bearer ', '');
    if (!token) {
      throw new Error('Unauthorized: Empty token');
    }

    const payload = decodeJwtPayload(token);
    if (!payload?.sub) {
      throw new Error('Unauthorized: Invalid token payload');
    }

    // Перевірка терміну дії
    if (payload.exp && Date.now() / 1000 > payload.exp) {
      throw new Error('Unauthorized: Token expired');
    }

    return next({
      context: {
        userId:    payload.sub,
        userEmail: payload.email,
        token,
      },
    });
  }
);
