-- Recipes with calculated nutrition, imported from TheMealDB or written by
-- the AI assistant. Safe to run more than once.
--   npm run db:migrate -- src/utils/migrations/003_recipe_nutrition.sql
-- or paste into the Supabase SQL editor.

-- Where a recipe came from ('themealdb', 'ai'), and its id there, so a
-- re-import updates the recipe instead of adding a copy
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS source VARCHAR(30);
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS external_id VARCHAR(50);
CREATE UNIQUE INDEX IF NOT EXISTS idx_recipes_source_external
  ON recipes(source, external_id) WHERE external_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_recipes_created_by ON recipes(created_by) WHERE created_by IS NOT NULL;

-- The amount in grams, which the nutrition totals are calculated from
-- (quantity/unit keep the recipe's own wording: "2 tbsp")
ALTER TABLE recipe_ingredients ADD COLUMN IF NOT EXISTS grams DECIMAL(8,1);

-- Recipe cards the assistant attached to an answer (found or drafted recipes)
ALTER TABLE ai_chat_messages ADD COLUMN IF NOT EXISTS attachments JSONB;
