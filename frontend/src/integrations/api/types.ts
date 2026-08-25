// Замінює: src/integrations/supabase/types.ts
// Типи для всіх відповідей вашого Express API.

// ── Утиліти ───────────────────────────────────────────────────────────────────

export type ApiResponse<T> = {
  success: boolean;
  data?: T;
  message?: string;
  errors?: Record<string, string[]>;
};

export type PaginatedResponse<T> = ApiResponse<T[]> & {
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
};

// ── Enums ─────────────────────────────────────────────────────────────────────

export type UserGoal =
  | 'weight_loss'
  | 'weight_gain'
  | 'muscle_gain'
  | 'maintenance'
  | 'healthy_eating';

export type ActivityLevel =
  | 'sedentary'
  | 'lightly_active'
  | 'moderately_active'
  | 'very_active'
  | 'extra_active';

export type Gender = 'male' | 'female' | 'other';

export type MealType =
  | 'breakfast'
  | 'lunch'
  | 'dinner'
  | 'snack'
  | 'pre_workout'
  | 'post_workout';

export type DietType =
  | 'standard'
  | 'vegetarian'
  | 'vegan'
  | 'pescatarian'
  | 'keto'
  | 'paleo'
  | 'gluten_free'
  | 'dairy_free'
  | 'halal'
  | 'kosher';

export type UnitType =
  | 'g' | 'kg' | 'ml' | 'l'
  | 'cup' | 'tbsp' | 'tsp'
  | 'piece' | 'slice' | 'serving';

// ── Auth ──────────────────────────────────────────────────────────────────────

export interface AuthTokens {
  accessToken:  string;
  refreshToken: string;
}

export interface User {
  id:          string;
  email:       string;
  first_name?: string;
  last_name?:  string;
  avatar_url?: string;
  is_active:   boolean;
  is_verified: boolean;
  created_at:  string;
  updated_at:  string;
}

export interface AuthResponse {
  user:   User;
  tokens: AuthTokens;
}

// ── Profile ───────────────────────────────────────────────────────────────────

export interface UserProfile {
  id:                  string;
  user_id:             string;
  gender?:             Gender;
  date_of_birth?:      string;
  height_cm?:          number;
  weight_kg?:          number;
  target_weight_kg?:   number;
  goal:                UserGoal;
  activity_level:      ActivityLevel;
  diet_type:           DietType;
  daily_calories?:     number;
  daily_protein_g?:    number;
  daily_carbs_g?:      number;
  daily_fat_g?:        number;
  daily_fiber_g?:      number;
  onboarding_completed: boolean;
  allergens:           string[];
}

export type ProfileWithUser = User & UserProfile;

export interface Allergen {
  id:   number;
  name: string;
}

// ── Food ──────────────────────────────────────────────────────────────────────

export interface Food {
  id:              string;
  name:            string;
  name_uk?:        string;
  brand?:          string;
  barcode?:        string;
  category?:       string;
  calories:        number;
  protein_g:       number;
  carbs_g:         number;
  fat_g:           number;
  fiber_g:         number;
  sugar_g:         number;
  sodium_mg:       number;
  image_url?:      string;
  is_verified:     boolean;
}

// ── Recipe ────────────────────────────────────────────────────────────────────

export interface Recipe {
  id:                       string;
  title:                    string;
  title_uk?:                string;
  description?:             string;
  instructions?:            string;
  image_url?:               string;
  prep_time_min?:           number;
  cook_time_min?:           number;
  servings:                 number;
  difficulty?:              'easy' | 'medium' | 'hard';
  cuisine_type?:            string;
  meal_type?:               MealType;
  diet_types?:              DietType[];
  calories_per_serving?:    number;
  protein_per_serving_g?:   number;
  carbs_per_serving_g?:     number;
  fat_per_serving_g?:       number;
  fiber_per_serving_g?:     number;
  average_rating?:          number;
  rating_count?:            number;
  is_favorite?:             boolean;
  total_ingredients?:       number;
  matched_ingredients?:     number;
}

export interface RecipeIngredient {
  id:          string;
  food_id:     string;
  name:        string;
  name_uk?:    string;
  category?:   string;
  calories:    number;
  protein_g:   number;
  carbs_g:     number;
  fat_g:       number;
  image_url?:  string;
  quantity:    number;
  unit:        UnitType;
  note?:       string;
  order_index: number;
  in_fridge?:  boolean;
}

export interface RecipeWithIngredients extends Recipe {
  ingredients: RecipeIngredient[];
}

// ── Food Log ──────────────────────────────────────────────────────────────────

export interface FoodLog {
  id:          string;
  user_id:     string;
  recipe_id?:  string;
  food_id?:    string;
  meal_type:   MealType;
  logged_at:   string;
  log_date:    string;
  servings:    number;
  quantity_g?: number;
  calories?:   number;
  protein_g?:  number;
  carbs_g?:    number;
  fat_g?:      number;
  fiber_g?:    number;
  status:      'planned' | 'eaten' | 'skipped';
  note?:       string;
  // Joined fields
  recipe_title?:  string;
  recipe_image?:  string;
  food_name?:     string;
  food_image?:    string;
}

export interface MealGroup {
  meal_type:          MealType;
  entries:            FoodLog[];
  subtotal_calories:  number;
}

export interface DailyNutrition {
  date:             string;
  total_calories:   number;
  total_protein_g:  number;
  total_carbs_g:    number;
  total_fat_g:      number;
  total_fiber_g:    number;
  meals:            MealGroup[];
  targets?: {
    daily_calories:   number;
    daily_protein_g:  number;
    daily_carbs_g:    number;
    daily_fat_g:      number;
    daily_fiber_g:    number;
  };
}

// ── Fridge ────────────────────────────────────────────────────────────────────

export interface FridgeItem {
  id:             string;
  user_id:        string;
  food_id:        string;
  quantity?:      number;
  unit:           UnitType;
  expiry_date?:   string;
  added_at:       string;
  // Joined fields
  name:           string;
  name_uk?:       string;
  brand?:         string;
  category?:      string;
  calories:       number;
  protein_g:      number;
  carbs_g:        number;
  fat_g:          number;
  image_url?:     string;
  is_expired:     boolean;
  expiring_soon:  boolean;
}

// ── Shopping List ─────────────────────────────────────────────────────────────

export interface ShoppingListItem {
  id:            string;
  list_id:       string;
  food_id:       string;
  quantity?:     number;
  unit:          UnitType;
  is_purchased:  boolean;
  category?:     string;
  // Joined fields
  name:          string;
  name_uk?:      string;
  brand?:        string;
  image_url?:    string;
  calories:      number;
}

export interface ShoppingList {
  id:               string;
  user_id:          string;
  name:             string;
  plan_id?:         string;
  created_at:       string;
  item_count?:      number;
  purchased_count?: number;
  items?:           ShoppingListItem[];
}
