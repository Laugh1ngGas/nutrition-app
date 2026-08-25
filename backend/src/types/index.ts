// ============================================================
// Enums
// ============================================================

export type UserGoal = 'weight_loss' | 'weight_gain' | 'muscle_gain' | 'maintenance' | 'healthy_eating';
export type ActivityLevel = 'sedentary' | 'lightly_active' | 'moderately_active' | 'very_active' | 'extra_active';
export type Gender = 'male' | 'female' | 'other';
export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack' | 'pre_workout' | 'post_workout';
export type DietType = 'standard' | 'vegetarian' | 'vegan' | 'pescatarian' | 'keto' | 'paleo' | 'gluten_free' | 'dairy_free' | 'halal' | 'kosher';
export type UnitType = 'g' | 'kg' | 'ml' | 'l' | 'cup' | 'tbsp' | 'tsp' | 'piece' | 'slice' | 'serving';
export type LogStatus = 'planned' | 'eaten' | 'skipped';

// ============================================================
// User
// ============================================================

export interface User {
  id: string;
  email: string;
  password_hash: string;
  first_name?: string;
  last_name?: string;
  avatar_url?: string;
  is_active: boolean;
  is_verified: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface UserPublic extends Omit<User, 'password_hash'> {}

export interface UserProfile {
  id: string;
  user_id: string;
  gender?: Gender;
  date_of_birth?: Date;
  height_cm?: number;
  weight_kg?: number;
  target_weight_kg?: number;
  goal: UserGoal;
  activity_level: ActivityLevel;
  diet_type: DietType;
  daily_calories?: number;
  daily_protein_g?: number;
  daily_carbs_g?: number;
  daily_fat_g?: number;
  daily_fiber_g?: number;
  onboarding_completed: boolean;
  created_at: Date;
  updated_at: Date;
}

// ============================================================
// Auth
// ============================================================

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface JwtPayload {
  sub: string;
  email: string;
  iat: number;
  exp: number;
}

// ============================================================
// Food
// ============================================================

export interface Food {
  id: string;
  name: string;
  name_uk?: string;
  brand?: string;
  barcode?: string;
  category?: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number;
  sugar_g: number;
  sodium_mg: number;
  cholesterol_mg: number;
  saturated_fat_g: number;
  vitamin_a_mcg?: number;
  vitamin_c_mg?: number;
  vitamin_d_mcg?: number;
  calcium_mg?: number;
  iron_mg?: number;
  potassium_mg?: number;
  image_url?: string;
  is_verified: boolean;
  source?: string;
  created_by?: string;
  created_at: Date;
  updated_at: Date;
}

// ============================================================
// Recipe
// ============================================================

export interface Recipe {
  id: string;
  title: string;
  title_uk?: string;
  description?: string;
  instructions?: string;
  image_url?: string;
  prep_time_min?: number;
  cook_time_min?: number;
  servings: number;
  difficulty?: 'easy' | 'medium' | 'hard';
  cuisine_type?: string;
  meal_type?: MealType;
  diet_types?: DietType[];
  calories_per_serving?: number;
  protein_per_serving_g?: number;
  carbs_per_serving_g?: number;
  fat_per_serving_g?: number;
  fiber_per_serving_g?: number;
  is_public: boolean;
  created_by?: string;
  created_at: Date;
  updated_at: Date;
}

export interface RecipeIngredient {
  id: string;
  recipe_id: string;
  food_id: string;
  quantity: number;
  unit: UnitType;
  note?: string;
  order_index: number;
}

export interface RecipeWithIngredients extends Recipe {
  ingredients: (RecipeIngredient & { food: Food })[];
  average_rating?: number;
  rating_count?: number;
  is_favorite?: boolean;
}

// ============================================================
// Meal Plan
// ============================================================

export interface MealPlan {
  id: string;
  user_id: string;
  name?: string;
  start_date: Date;
  end_date: Date;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface MealPlanEntry {
  id: string;
  plan_id: string;
  recipe_id?: string;
  food_id?: string;
  meal_type: MealType;
  planned_date: Date;
  servings: number;
  quantity_g?: number;
  note?: string;
  order_index: number;
}

// ============================================================
// Food Log
// ============================================================

export interface FoodLog {
  id: string;
  user_id: string;
  recipe_id?: string;
  food_id?: string;
  meal_type: MealType;
  logged_at: Date;
  log_date: Date;
  servings: number;
  quantity_g?: number;
  calories?: number;
  protein_g?: number;
  carbs_g?: number;
  fat_g?: number;
  fiber_g?: number;
  status: LogStatus;
  note?: string;
}

export interface DailyNutrition {
  date: string;
  total_calories: number;
  total_protein_g: number;
  total_carbs_g: number;
  total_fat_g: number;
  total_fiber_g: number;
  meals: {
    meal_type: MealType;
    entries: FoodLog[];
    subtotal_calories: number;
  }[];
}

// ============================================================
// Fridge
// ============================================================

export interface FridgeItem {
  id: string;
  user_id: string;
  food_id: string;
  quantity?: number;
  unit: UnitType;
  expiry_date?: Date;
  added_at: Date;
  food?: Food;
}

// ============================================================
// Shopping List
// ============================================================

export interface ShoppingList {
  id: string;
  user_id: string;
  name: string;
  plan_id?: string;
  created_at: Date;
}

export interface ShoppingListItem {
  id: string;
  list_id: string;
  food_id: string;
  quantity?: number;
  unit: UnitType;
  is_purchased: boolean;
  category?: string;
  food?: Food;
}

// ============================================================
// API Response wrapper
// ============================================================

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  message?: string;
  errors?: Record<string, string[]>;
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}
