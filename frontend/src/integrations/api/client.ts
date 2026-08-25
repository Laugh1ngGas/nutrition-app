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
  timeout: 15_000,
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

apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };

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
