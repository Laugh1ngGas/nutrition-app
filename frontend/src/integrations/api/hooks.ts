// Хуки для всіх API-запитів.
// Використовуйте ці хуки у компонентах замість прямих викликів supabase.

import { useState, useEffect, useCallback } from 'react';
import apiClient from './client';
import type {
  DailyNutrition, FoodLog, MealType,
  Food, Recipe, RecipeWithIngredients,
  FridgeItem,
  ShoppingList, ShoppingListItem,
  ProfileWithUser, Allergen,
  AiStatus, AiChatMessage,
} from './types';

// ── Утиліта ───────────────────────────────────────────────────────────────────

function useApiCall<T>(
  fetcher: () => Promise<T>,
  deps: React.DependencyList = []
) {
  const [data, setData]       = useState<T | null>(null);
  const [isLoading, setLoad]  = useState(true);
  const [error, setError]     = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoad(true);
    setError(null);
    try {
      setData(await fetcher());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setLoad(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => { load(); }, [load]);

  return { data, isLoading, error, refetch: load };
}

// ── Profile ───────────────────────────────────────────────────────────────────

export function useProfile() {
  return useApiCall<ProfileWithUser>(async () => {
    const { data } = await apiClient.get('/profile');
    return data.data;
  });
}

export async function updateProfile(payload: Partial<ProfileWithUser>) {
  const { data } = await apiClient.patch('/profile', payload);
  return data.data;
}

export function useAllergens() {
  return useApiCall<Allergen[]>(async () => {
    const { data } = await apiClient.get('/allergens');
    return data.data;
  });
}

export async function updateUserAllergens(allergenIds: number[]) {
  const { data } = await apiClient.put('/profile/allergens', { allergen_ids: allergenIds });
  return data;
}

// ── Daily Nutrition Log ───────────────────────────────────────────────────────

// The user's local date (YYYY-MM-DD). toISOString() alone gives the UTC date,
// which in Ukraine is still "yesterday" between midnight and 2-3 am.
export function localDate(d = new Date()): string {
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

export function useDailyLog(date?: string) {
  const today = date || localDate();
  return useApiCall<DailyNutrition>(async () => {
    const { data } = await apiClient.get(`/logs?date=${today}`);
    return data.data;
  }, [today]);
}

export function useWeeklyStats(startDate?: string) {
  const monday = startDate || getMonday();
  return useApiCall<Record<string, number>[]>(async () => {
    const { data } = await apiClient.get(`/logs/weekly?start_date=${monday}`);
    return data.data;
  }, [monday]);
}

export async function addFoodLog(payload: {
  recipe_id?: string;
  food_id?: string;
  meal_type: MealType;
  servings?: number;
  quantity_g?: number;
  note?: string;
  log_date?: string;
}): Promise<FoodLog> {
  const { data } = await apiClient.post('/logs', { log_date: localDate(), ...payload });
  return data.data;
}

export async function removeFoodLog(id: string): Promise<void> {
  await apiClient.delete(`/logs/${id}`);
}

// ── Foods ─────────────────────────────────────────────────────────────────────

export function useFoodSearch(query: string, category?: string) {
  return useApiCall<Food[]>(async () => {
    if (!query.trim()) return [];
    const params = new URLSearchParams({ q: query, limit: '20' });
    if (category) params.set('category', category);
    const { data } = await apiClient.get(`/foods?${params}`);
    return data.data;
  }, [query, category]);
}

export function useFoodCategories() {
  return useApiCall<{ category: string; count: number }[]>(async () => {
    const { data } = await apiClient.get('/foods/categories');
    return data.data;
  });
}

export async function getFoodByBarcode(barcode: string): Promise<Food> {
  const { data } = await apiClient.get(`/foods/barcode/${barcode}`);
  return data.data;
}

export async function createFood(payload: {
  name: string;
  name_uk?: string;
  brand?: string;
  barcode?: string;
  category?: string;
  calories: number;
  protein_g?: number;
  carbs_g?: number;
  fat_g?: number;
  fiber_g?: number;
  sugar_g?: number;
  sodium_mg?: number;
  image_url?: string;
}): Promise<Food> {
  const { data } = await apiClient.post('/foods', payload);
  return data.data;
}

// ── Recipes ───────────────────────────────────────────────────────────────────

export function useRecipeSearch(query: string, filters?: {
  meal_type?: string;
  diet_type?: string;
  matchOnly?: boolean;
  sort?: 'match';
}) {
  const { meal_type, diet_type, matchOnly, sort } = filters ?? {};
  return useApiCall<{ items: Recipe[]; total: number }>(async () => {
    const params = new URLSearchParams({ limit: '30' });
    if (query.trim()) params.set('q', query.trim());
    if (meal_type) params.set('meal_type', meal_type);
    if (diet_type) params.set('diet_type', diet_type);
    if (matchOnly) params.set('match_only', 'true');
    if (sort) params.set('sort', sort);
    const { data } = await apiClient.get(`/recipes?${params}`);
    return { items: data.data, total: data.pagination.total };
  }, [query, meal_type, diet_type, matchOnly, sort]);
}

export function useRecipe(id: string | null) {
  return useApiCall<RecipeWithIngredients | null>(async () => {
    if (!id) return null;
    const { data } = await apiClient.get(`/recipes/${id}`);
    return data.data;
  }, [id]);
}

export async function toggleRecipeFavorite(id: string): Promise<{ is_favorite: boolean }> {
  const { data } = await apiClient.post(`/recipes/${id}/favorite`);
  return data.data;
}

// ── Fridge ────────────────────────────────────────────────────────────────────

export function useFridge() {
  return useApiCall<FridgeItem[]>(async () => {
    const { data } = await apiClient.get('/fridge');
    return data.data;
  });
}

export function useExpiringItems(days = 3) {
  return useApiCall<FridgeItem[]>(async () => {
    const { data } = await apiClient.get(`/fridge/expiring?days=${days}`);
    return data.data;
  }, [days]);
}

export async function addFridgeItem(payload: {
  food_id: string;
  quantity?: number;
  unit?: string;
  expiry_date?: string;
}): Promise<FridgeItem> {
  const { data } = await apiClient.post('/fridge', payload);
  return data.data;
}

export async function updateFridgeItem(
  id: string,
  payload: { quantity?: number; unit?: string; expiry_date?: string }
): Promise<FridgeItem> {
  const { data } = await apiClient.patch(`/fridge/${id}`, payload);
  return data.data;
}

export async function removeFridgeItem(id: string): Promise<void> {
  await apiClient.delete(`/fridge/${id}`);
}

// ── Shopping Lists ────────────────────────────────────────────────────────────

export function useShoppingLists() {
  return useApiCall<ShoppingList[]>(async () => {
    const { data } = await apiClient.get('/shopping');
    return data.data;
  });
}

export function useShoppingList(id: string) {
  return useApiCall<ShoppingList>(async () => {
    const { data } = await apiClient.get(`/shopping/${id}`);
    return data.data;
  }, [id]);
}

export async function createShoppingList(name?: string): Promise<ShoppingList> {
  const { data } = await apiClient.post('/shopping', { name });
  return data.data;
}

export async function addShoppingItem(
  listId: string,
  payload: { food_id: string; quantity?: number; unit?: string }
): Promise<ShoppingListItem> {
  const { data } = await apiClient.post(`/shopping/${listId}/items`, payload);
  return data.data;
}

export async function toggleShoppingItem(
  listId: string,
  itemId: string
): Promise<ShoppingListItem> {
  const { data } = await apiClient.patch(`/shopping/${listId}/items/${itemId}/toggle`);
  return data.data;
}

export async function removeShoppingItem(listId: string, itemId: string): Promise<void> {
  await apiClient.delete(`/shopping/${listId}/items/${itemId}`);
}

// ── AI Assistant ──────────────────────────────────────────────────────────────

// How often to re-check while the model wakes up, and for how long at most.
// Polling stops once it's ready: every check reaches the GPU service and
// would otherwise keep it awake (and billed) for as long as the page is open.
const AI_STATUS_POLL_MS = 3000;
const AI_STATUS_MAX_POLL_MS = 3 * 60_000;

export async function getAiStatus(): Promise<AiStatus> {
  const { data } = await apiClient.get('/ai/status');
  return data.data.status;
}

export function useAiStatus(enabled = true) {
  const [status, setStatus] = useState<AiStatus | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const startedAt = Date.now();

    const check = async () => {
      const next = await getAiStatus().catch((): AiStatus => 'offline');
      if (cancelled) return;
      setStatus(next);
      if (next !== 'ready' && Date.now() - startedAt < AI_STATUS_MAX_POLL_MS) {
        timer = setTimeout(check, AI_STATUS_POLL_MS);
      }
    };
    check();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [enabled]);

  return { status, setStatus };
}

export async function getAiMessages(): Promise<AiChatMessage[]> {
  const { data } = await apiClient.get('/ai/messages');
  return data.data;
}

export async function sendAiMessage(
  message: string
): Promise<{ question: AiChatMessage; answer: AiChatMessage }> {
  // An answer takes ~5-10 s, but the first one after a quiet spell also waits
  // for the model to load (the backend waits up to 90 s for that)
  // The user's local date, so "expires tomorrow" means the user's tomorrow
  const { data } = await apiClient.post('/ai/chat', { message, today: localDate() }, { timeout: 150_000 });
  return data.data;
}

export async function clearAiMessages(): Promise<void> {
  await apiClient.delete('/ai/messages');
}

// ── Water ─────────────────────────────────────────────────────────────────────

export interface WaterDay {
  date:     string;
  total_ml: number;
  cups:     number;
}

export function useWater(date?: string) {
  const day = date || localDate();
  return useApiCall<WaterDay>(async () => {
    const { data } = await apiClient.get(`/water?date=${day}`);
    return data.data;
  }, [day]);
}

// Sets the day's total in cups (250 ml each)
export async function setWater(cups: number, date = localDate()): Promise<WaterDay> {
  const { data } = await apiClient.put('/water', { date, cups });
  return data.data;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getMonday(): string {
  const d = new Date();
  const day = d.getDay();
  d.setDate(d.getDate() - day + (day === 0 ? -6 : 1));
  return localDate(d);
}
