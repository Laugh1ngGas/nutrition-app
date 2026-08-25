import { createStart, createMiddleware } from "@tanstack/react-start";
import { renderErrorPage } from "./lib/error-page";
import { tokenStorage } from "@/integrations/api/client";

// ── Error middleware (оригінальний) ───────────────────────────────────────────
const errorMiddleware = createMiddleware().server(async ({ next }) => {
  try {
    return await next();
  } catch (error) {
    if (error != null && typeof error === "object" && "statusCode" in error) {
      throw error;
    }
    console.error(error);
    return new Response(renderErrorPage(), {
      status: 500,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
});

// ── JWT auth middleware — додає Bearer токен до serverFn запитів ───────────────
const authMiddleware = createMiddleware().client(async ({ next }) => {
  const token = tokenStorage.getAccess();
  return next({
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
});

export const startInstance = createStart(() => ({
  requestMiddleware: [errorMiddleware],
  functionMiddleware: [authMiddleware],
}));
