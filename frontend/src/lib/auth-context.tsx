// src/lib/auth-context.tsx

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import apiClient, { tokenStorage } from '@/integrations/api/client';
import type { User, AuthTokens } from '@/integrations/api/types';

export const DEMO_USER = {
  id:          'demo-user-id',
  email:       'demo@NutritionApp.app',
  first_name:  'Demo',
  last_name:   'User',
  name:        'Demo User',
  avatar_url:  null,
  is_active:   true,
  is_verified: true,
  created_at:  new Date().toISOString(),
  updated_at:  new Date().toISOString(),
  createdAt:   new Date().toISOString().slice(0, 10),
};

type AuthUser = User & { name?: string; createdAt?: string };

interface AuthContextValue {
  user:            AuthUser | null;
  isLoading:       boolean;
  isAuthenticated: boolean;
  hydrated:        boolean;
  login:           (userData: Partial<AuthUser> & { email: string }) => void;
  signUp:          (email: string, password: string, firstName?: string, lastName?: string) => Promise<void>;
  signIn:          (email: string, password: string) => Promise<void>;
  signOut:         () => Promise<void>;
  logout:          () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser]         = useState<AuthUser | null>(null);
  const [isLoading, setLoading] = useState(true);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    // Fire-and-forget: ping the backend the moment any page loads, not only
    // once a user submits a form — a cold Render instance gets a head start
    // (however long the visitor spends reading/typing) instead of only
    // starting to wake up the moment a real request needs it. Result and
    // errors are both ignored; this never affects the real auth flow.
    apiClient.get('/health').catch(() => {});

    const initAuth = async () => {
      const token = tokenStorage.getAccess();
      if (!token) { setLoading(false); setHydrated(true); return; }
      try {
        const { data } = await apiClient.get<{ success: boolean; data: AuthUser }>('/profile');
        if (data.success && data.data) {
          setUser({
            ...data.data,
            name: `${data.data.first_name || ''} ${data.data.last_name || ''}`.trim(),
          });
        }
      } catch {
        tokenStorage.clearTokens();
      } finally {
        setLoading(false);
        setHydrated(true);
      }
    };
    initAuth();
  }, []);

  const login = useCallback((userData: Partial<AuthUser> & { email: string }) => {
    setUser({ ...DEMO_USER, ...userData } as AuthUser);
    setHydrated(true);
  }, []);

  const signUp = useCallback(async (
    email: string, password: string, firstName?: string, lastName?: string,
  ) => {
    const { data } = await apiClient.post<{
      success: boolean; data: { user: AuthUser; tokens: AuthTokens };
    }>('/auth/register', { email, password, first_name: firstName, last_name: lastName });
    tokenStorage.setTokens(data.data.tokens.accessToken, data.data.tokens.refreshToken);
    setUser({
      ...data.data.user,
      name: `${data.data.user.first_name || ''} ${data.data.user.last_name || ''}`.trim(),
    });
    setHydrated(true);
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const { data } = await apiClient.post<{
      success: boolean; data: { user: AuthUser; tokens: AuthTokens };
    }>('/auth/login', { email, password });
    tokenStorage.setTokens(data.data.tokens.accessToken, data.data.tokens.refreshToken);
    setUser({
      ...data.data.user,
      name: `${data.data.user.first_name || ''} ${data.data.user.last_name || ''}`.trim(),
    });
    setHydrated(true);
  }, []);

  // logout і signOut — одна функція, два імені для сумісності
  const logout = useCallback(async () => {
    const refreshToken = tokenStorage.getRefresh();
    try {
      await apiClient.post('/auth/logout', { refresh_token: refreshToken });
    } finally {
      tokenStorage.clearTokens();
      setUser(null);
      setHydrated(true);
    }
  }, []);

  return (
    <AuthContext.Provider value={{
      user, isLoading, isAuthenticated: !!user, hydrated,
      login, signUp, signIn,
      signOut: logout,
      logout,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
