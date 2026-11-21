-- Onboarding answers that had nowhere to go: household size, cooking skill
-- and preferred cooking time. Safe to run more than once.
--   npm run db:migrate -- src/utils/migrations/002_profile_cooking_preferences.sql
-- or paste into the Supabase SQL editor.

ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS household_size SMALLINT
  CHECK (household_size BETWEEN 1 AND 12);
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS cooking_skill VARCHAR(20)
  CHECK (cooking_skill IN ('beginner', 'intermediate', 'advanced'));
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS cooking_time VARCHAR(10)
  CHECK (cooking_time IN ('under15', '15to30', '30to60', 'over60'));
