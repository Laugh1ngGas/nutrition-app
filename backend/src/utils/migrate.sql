-- ============================================================
-- MealPrepRoulette — PostgreSQL Schema
-- ============================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm"; -- For full-text search on food/recipes

-- ============================================================
-- ENUMS
-- ============================================================

CREATE TYPE user_goal AS ENUM (
  'weight_loss',
  'weight_gain',
  'muscle_gain',
  'maintenance',
  'healthy_eating'
);

CREATE TYPE activity_level AS ENUM (
  'sedentary',
  'lightly_active',
  'moderately_active',
  'very_active',
  'extra_active'
);

CREATE TYPE gender AS ENUM ('male', 'female', 'other');

CREATE TYPE meal_type AS ENUM (
  'breakfast',
  'lunch',
  'dinner',
  'snack',
  'pre_workout',
  'post_workout'
);

CREATE TYPE diet_type AS ENUM (
  'standard',
  'vegetarian',
  'vegan',
  'pescatarian',
  'keto',
  'paleo',
  'gluten_free',
  'dairy_free',
  'halal',
  'kosher'
);

CREATE TYPE unit_type AS ENUM (
  'g', 'kg', 'ml', 'l',
  'cup', 'tbsp', 'tsp',
  'piece', 'slice', 'serving'
);

CREATE TYPE log_status AS ENUM ('planned', 'eaten', 'skipped');

-- ============================================================
-- USERS
-- ============================================================

CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email         VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  first_name    VARCHAR(100),
  last_name     VARCHAR(100),
  avatar_url    TEXT,
  is_active     BOOLEAN DEFAULT TRUE,
  is_verified   BOOLEAN DEFAULT FALSE,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_users_email ON users(email);

-- ============================================================
-- USER PROFILES (health & goals)
-- ============================================================

CREATE TABLE user_profiles (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  gender          gender,
  date_of_birth   DATE,
  height_cm       DECIMAL(5,2),
  weight_kg       DECIMAL(5,2),
  target_weight_kg DECIMAL(5,2),
  goal            user_goal DEFAULT 'maintenance',
  activity_level  activity_level DEFAULT 'moderately_active',
  diet_type       diet_type DEFAULT 'standard',

  -- Calculated nutritional targets (stored for performance)
  daily_calories  INTEGER,
  daily_protein_g  INTEGER,
  daily_carbs_g    INTEGER,
  daily_fat_g      INTEGER,
  daily_fiber_g    INTEGER,

  onboarding_completed BOOLEAN DEFAULT FALSE,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- ALLERGIES & DIETARY RESTRICTIONS
-- ============================================================

CREATE TABLE allergens (
  id    SERIAL PRIMARY KEY,
  name  VARCHAR(100) UNIQUE NOT NULL  -- 'gluten', 'lactose', 'nuts', etc.
);

CREATE TABLE user_allergens (
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  allergen_id INTEGER NOT NULL REFERENCES allergens(id),
  PRIMARY KEY (user_id, allergen_id)
);

INSERT INTO allergens (name) VALUES
  ('gluten'), ('dairy'), ('eggs'), ('peanuts'), ('tree_nuts'),
  ('soy'), ('fish'), ('shellfish'), ('sesame'), ('mustard'),
  ('celery'), ('sulfites')
ON CONFLICT (name) DO NOTHING;

-- ============================================================
-- FOODS (product database)
-- ============================================================

CREATE TABLE foods (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name            VARCHAR(255) NOT NULL,
  name_uk         VARCHAR(255),            -- Ukrainian name
  brand           VARCHAR(255),
  barcode         VARCHAR(50) UNIQUE,
  category        VARCHAR(100),

  -- Per 100g
  calories        DECIMAL(8,2) NOT NULL DEFAULT 0,
  protein_g       DECIMAL(8,2) DEFAULT 0,
  carbs_g         DECIMAL(8,2) DEFAULT 0,
  fat_g           DECIMAL(8,2) DEFAULT 0,
  fiber_g         DECIMAL(8,2) DEFAULT 0,
  sugar_g         DECIMAL(8,2) DEFAULT 0,
  sodium_mg       DECIMAL(8,2) DEFAULT 0,
  cholesterol_mg  DECIMAL(8,2) DEFAULT 0,
  saturated_fat_g DECIMAL(8,2) DEFAULT 0,

  -- Vitamins & Minerals (optional, for detailed tracking)
  vitamin_a_mcg   DECIMAL(8,2),
  vitamin_c_mg    DECIMAL(8,2),
  vitamin_d_mcg   DECIMAL(8,2),
  calcium_mg      DECIMAL(8,2),
  iron_mg         DECIMAL(8,2),
  potassium_mg    DECIMAL(8,2),

  image_url       TEXT,
  is_verified     BOOLEAN DEFAULT FALSE,   -- Verified by admin
  source          VARCHAR(50),             -- 'usda', 'openfoodfacts', 'user'
  external_id     VARCHAR(100),            -- ID from external API

  created_by      UUID REFERENCES users(id),
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_foods_name ON foods USING GIN(to_tsvector('simple', name));
CREATE INDEX idx_foods_barcode ON foods(barcode);
CREATE INDEX idx_foods_category ON foods(category);

CREATE TABLE food_allergens (
  food_id     UUID NOT NULL REFERENCES foods(id) ON DELETE CASCADE,
  allergen_id INTEGER NOT NULL REFERENCES allergens(id),
  PRIMARY KEY (food_id, allergen_id)
);

-- ============================================================
-- RECIPES
-- ============================================================

CREATE TABLE recipes (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title           VARCHAR(255) NOT NULL,
  title_uk        VARCHAR(255),
  description     TEXT,
  instructions    TEXT,
  image_url       TEXT,
  prep_time_min   INTEGER,
  cook_time_min   INTEGER,
  servings        INTEGER DEFAULT 1,
  difficulty      VARCHAR(20) CHECK (difficulty IN ('easy', 'medium', 'hard')),
  cuisine_type    VARCHAR(100),
  meal_type       meal_type,
  diet_types      diet_type[],

  -- Calculated totals per serving
  calories_per_serving     DECIMAL(8,2),
  protein_per_serving_g    DECIMAL(8,2),
  carbs_per_serving_g      DECIMAL(8,2),
  fat_per_serving_g        DECIMAL(8,2),
  fiber_per_serving_g      DECIMAL(8,2),

  is_public       BOOLEAN DEFAULT TRUE,
  created_by      UUID REFERENCES users(id),
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_recipes_title ON recipes USING GIN(to_tsvector('simple', title));
CREATE INDEX idx_recipes_meal_type ON recipes(meal_type);
CREATE INDEX idx_recipes_diet ON recipes USING GIN(diet_types);

CREATE TABLE recipe_ingredients (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  recipe_id   UUID NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  food_id     UUID NOT NULL REFERENCES foods(id),
  quantity    DECIMAL(8,2) NOT NULL,
  unit        unit_type NOT NULL DEFAULT 'g',
  note        VARCHAR(255),                -- 'chopped', 'diced', etc.
  order_index INTEGER DEFAULT 0
);

CREATE TABLE recipe_allergens (
  recipe_id   UUID NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  allergen_id INTEGER NOT NULL REFERENCES allergens(id),
  PRIMARY KEY (recipe_id, allergen_id)
);

-- ============================================================
-- MEAL PLANS
-- ============================================================

CREATE TABLE meal_plans (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name        VARCHAR(255),
  start_date  DATE NOT NULL,
  end_date    DATE NOT NULL,
  is_active   BOOLEAN DEFAULT TRUE,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_meal_plans_user ON meal_plans(user_id);
CREATE INDEX idx_meal_plans_dates ON meal_plans(start_date, end_date);

CREATE TABLE meal_plan_entries (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  plan_id     UUID NOT NULL REFERENCES meal_plans(id) ON DELETE CASCADE,
  recipe_id   UUID REFERENCES recipes(id),
  food_id     UUID REFERENCES foods(id),
  meal_type   meal_type NOT NULL,
  planned_date DATE NOT NULL,
  servings    DECIMAL(5,2) DEFAULT 1,
  quantity_g  DECIMAL(8,2),             -- If food (not recipe)
  note        TEXT,
  order_index INTEGER DEFAULT 0,

  CONSTRAINT entry_has_recipe_or_food CHECK (
    (recipe_id IS NOT NULL AND food_id IS NULL) OR
    (recipe_id IS NULL AND food_id IS NOT NULL)
  )
);

CREATE INDEX idx_plan_entries_plan ON meal_plan_entries(plan_id);
CREATE INDEX idx_plan_entries_date ON meal_plan_entries(planned_date);

-- ============================================================
-- FOOD LOGS (actual eaten meals)
-- ============================================================

CREATE TABLE food_logs (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recipe_id   UUID REFERENCES recipes(id),
  food_id     UUID REFERENCES foods(id),
  meal_type   meal_type NOT NULL,
  logged_at   TIMESTAMPTZ DEFAULT NOW(),
  log_date    DATE NOT NULL DEFAULT CURRENT_DATE,
  servings    DECIMAL(5,2) DEFAULT 1,
  quantity_g  DECIMAL(8,2),

  -- Snapshot of nutritional values at time of logging
  calories    DECIMAL(8,2),
  protein_g   DECIMAL(8,2),
  carbs_g     DECIMAL(8,2),
  fat_g       DECIMAL(8,2),
  fiber_g     DECIMAL(8,2),

  status      log_status DEFAULT 'eaten',
  note        TEXT,

  CONSTRAINT log_has_recipe_or_food CHECK (
    (recipe_id IS NOT NULL AND food_id IS NULL) OR
    (recipe_id IS NULL AND food_id IS NOT NULL)
  )
);

CREATE INDEX idx_food_logs_user_date ON food_logs(user_id, log_date);
CREATE INDEX idx_food_logs_logged_at ON food_logs(logged_at);

-- ============================================================
-- FRIDGE (My Fridge feature)
-- ============================================================

CREATE TABLE fridge_items (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  food_id         UUID NOT NULL REFERENCES foods(id),
  quantity        DECIMAL(8,2),
  unit            unit_type DEFAULT 'g',
  expiry_date     DATE,
  added_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_fridge_user_food ON fridge_items(user_id, food_id);
CREATE INDEX idx_fridge_expiry ON fridge_items(expiry_date);

-- ============================================================
-- SHOPPING LIST
-- ============================================================

CREATE TABLE shopping_lists (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name        VARCHAR(255) DEFAULT 'Shopping List',
  plan_id     UUID REFERENCES meal_plans(id),
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE shopping_list_items (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  list_id           UUID NOT NULL REFERENCES shopping_lists(id) ON DELETE CASCADE,
  food_id           UUID NOT NULL REFERENCES foods(id),
  quantity          DECIMAL(8,2),
  unit              unit_type DEFAULT 'g',
  is_purchased      BOOLEAN DEFAULT FALSE,
  category          VARCHAR(100),
  added_at          TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- WATER TRACKING
-- ============================================================

CREATE TABLE water_logs (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount_ml   INTEGER NOT NULL,
  logged_at   TIMESTAMPTZ DEFAULT NOW(),
  log_date    DATE NOT NULL DEFAULT CURRENT_DATE
);

CREATE INDEX idx_water_logs_user_date ON water_logs(user_id, log_date);

-- ============================================================
-- BODY WEIGHT TRACKING
-- ============================================================

CREATE TABLE weight_logs (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  weight_kg   DECIMAL(5,2) NOT NULL,
  note        TEXT,
  logged_at   TIMESTAMPTZ DEFAULT NOW(),
  log_date    DATE NOT NULL DEFAULT CURRENT_DATE
);

CREATE INDEX idx_weight_logs_user ON weight_logs(user_id, log_date);

-- ============================================================
-- RECIPE RATINGS & FAVORITES
-- ============================================================

CREATE TABLE recipe_ratings (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recipe_id   UUID NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  rating      INTEGER CHECK (rating BETWEEN 1 AND 5),
  review      TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, recipe_id)
);

CREATE TABLE user_favorites (
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recipe_id   UUID NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  added_at    TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, recipe_id)
);

-- ============================================================
-- REFRESH TOKENS (Auth)
-- ============================================================

CREATE TABLE refresh_tokens (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token       TEXT UNIQUE NOT NULL,
  expires_at  TIMESTAMPTZ NOT NULL,
  is_revoked  BOOLEAN DEFAULT FALSE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_refresh_tokens_token ON refresh_tokens(token);
CREATE INDEX idx_refresh_tokens_user ON refresh_tokens(user_id);

-- ============================================================
-- AUTO-UPDATE updated_at TRIGGER
-- ============================================================

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_users_updated_at
  BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_profiles_updated_at
  BEFORE UPDATE ON user_profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_foods_updated_at
  BEFORE UPDATE ON foods FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_recipes_updated_at
  BEFORE UPDATE ON recipes FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_plans_updated_at
  BEFORE UPDATE ON meal_plans FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_fridge_updated_at
  BEFORE UPDATE ON fridge_items FOR EACH ROW EXECUTE FUNCTION update_updated_at();
