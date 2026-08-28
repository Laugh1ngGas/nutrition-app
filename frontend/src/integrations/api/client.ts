// Замінює: src/integrations/supabase/client.ts
// Axios-клієнт для вашого Express API з автоматичним оновленням JWT токену.

import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';

// In the browser this is always same-origin — the frontend's own Nitro server
// proxies /api/** to the backend container (see vite.config.ts routeRules), so
// there's no absolute URL to bake in at build time and no CORS hop involved.
// The internal fallback only matters if a server-side call is ever added.
const API_URL =
  typeof window !== 'undefined'
    ? '/api/v1'
    : (process.env.INTERNAL_API_URL || 'http://backend:3001/api/v1');

// ── Ключі для localStorage ────────────────────────────────────────────────────
export const TOKEN_KEY         = 'mealprep_access_token';
export const REFRESH_TOKEN_KEY = 'mealprep_refresh_token';

// ── Helpers ───────────────────────────────────────────────────────────────────
export const tokenStorage = {
  getAccess:     () => (typeof window !== 'undefined' ? localStorage.getItem(TOKEN_KEY) : null),
  getRefresh:    () => (typeof window !== 'undefined' ? localStorage.getItem(REFRESH_TOKEN_KEY) : null),
  setAccess:     (t: string) => typeof window !== 'undefined' && localStorage.setItem(TOKEN_KEY, t),
  setRefresh:    (t: string) => typeof window !== 'undefined' && localStorage.setItem(REFRESH_TOKEN_KEY, t),
  setTokens:     (access: string, refresh: string) => {
    tokenStorage.setAccess(access);
    tokenStorage.setRefresh(refresh);
  },
  clearTokens:   () => {
    if (typeof window === 'undefined') return;
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
  },
};

// ── Axios instance ────────────────────────────────────────────────────────────
export const apiClient = axios.create({
  baseURL: API_URL,
  headers: { 'Content-Type': 'application/json' },
  // 30s, not 15s — free-tier hosting (Render) cold-starts a spun-down
  // service in up to ~50-60s; this needs to comfortably outlast a single
  // cold-start response rather than time out mid-boot.
  timeout: 30_000,
});

// ── Request interceptor — додає Bearer токен ──────────────────────────────────
apiClient.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = tokenStorage.getAccess();
  if (token && config.headers) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// ── Response interceptor — оновлює токен при 401 ─────────────────────────────
let isRefreshing = false;
let pendingQueue: Array<{
  resolve: (token: string) => void;
  reject: (err: unknown) => void;
}> = [];

const processPendingQueue = (error: unknown, token: string | null) => {
  pendingQueue.forEach(({ resolve, reject }) =>
    error ? reject(error) : resolve(token!)
  );
  pendingQueue = [];
};

const RETRYABLE_STATUSES = [502, 503, 504];
// Render's edge returns a 502 immediately (not a slow timeout) for any
// request that arrives before a spun-down service passes its first health
// check — measured cold start ~23s, platform states "up to 50s or more".
// A single quick retry lands on the same still-waking backend and fails
// again, so this needs several retries spaced out, not a longer timeout —
// a *warm* backend responds in milliseconds once it's actually up.
const MAX_TRANSIENT_RETRIES = 8;
const TRANSIENT_RETRY_DELAY_MS = 4000;

apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & {
      _retry?: boolean;
      _transientRetryCount?: number;
    };

    const isTransientFailure = !error.response || RETRYABLE_STATUSES.includes(error.response.status);
    const retryCount = originalRequest._transientRetryCount ?? 0;
    if (isTransientFailure && retryCount < MAX_TRANSIENT_RETRIES) {
      originalRequest._transientRetryCount = retryCount + 1;
      await new Promise((resolve) => setTimeout(resolve, TRANSIENT_RETRY_DELAY_MS));
      return apiClient(originalRequest);
    }

    if (error.response?.status !== 401 || originalRequest._retry) {
      return Promise.reject(error);
    }

    const refreshToken = tokenStorage.getRefresh();
    if (!refreshToken) {
      tokenStorage.clearTokens();
      window.location.href = '/sign-in';
      return Promise.reject(error);
    }

    if (isRefreshing) {
      // Ставимо запит у чергу поки refresh іде
      return new Promise((resolve, reject) => {
        pendingQueue.push({ resolve, reject });
      }).then((token) => {
        originalRequest.headers!.Authorization = `Bearer ${token}`;
        return apiClient(originalRequest);
      });
    }

    originalRequest._retry = true;
    isRefreshing = true;

    try {
      const { data } = await axios.post(`${API_URL}/auth/refresh`, {
        refresh_token: refreshToken,
      });

      const { accessToken, refreshToken: newRefresh } = data.data;
      tokenStorage.setTokens(accessToken, newRefresh);

      processPendingQueue(null, accessToken);
      originalRequest.headers!.Authorization = `Bearer ${accessToken}`;
      return apiClient(originalRequest);
    } catch (refreshError) {
      processPendingQueue(refreshError, null);
      tokenStorage.clearTokens();
      window.location.href = '/sign-in';
      return Promise.reject(refreshError);
    } finally {
      isRefreshing = false;
    }
  }
);

export default apiClient;
