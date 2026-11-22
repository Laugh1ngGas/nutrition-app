-- Fridge matching by USDA food instead of by exact food row: "Onion" in the
-- fridge counts for a recipe's "Onions" or "Red Onions", since all three are
-- the same USDA food. Foods without USDA data match by lower-cased name.
-- Safe to run more than once.
--   npm run db:migrate -- src/utils/migrations/004_food_match_key.sql
-- or paste into the Supabase SQL editor.

ALTER TABLE foods ADD COLUMN IF NOT EXISTS match_key TEXT GENERATED ALWAYS AS (
  CASE WHEN external_id LIKE 'fdc:%' THEN external_id ELSE lower(btrim(name)) END
) STORED;

CREATE INDEX IF NOT EXISTS idx_foods_match_key ON foods(match_key);
