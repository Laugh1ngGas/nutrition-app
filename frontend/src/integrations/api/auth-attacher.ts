// src/integrations/api/auth-attacher.ts
//
// JWT токен автоматично додається до ВСІХ запитів через axios interceptor
// у src/integrations/api/client.ts — окремий TanStack middleware не потрібен.
//
// Цей файл залишено як заглушка для сумісності імпортів.
// Якщо з'являться TanStack serverFn — розкоментуйте код нижче:
//
// import { createMiddleware } from '@tanstack/react-start';
// import { tokenStorage } from './client';
// export const attachApiAuth = createMiddleware({ type: 'function' }).client(
//   async ({ next }) => {
//     const token = tokenStorage.getAccess();
//     return next({ headers: token ? { Authorization: `Bearer ${token}` } : {} });
//   }
// );

export const attachApiAuth = null;
