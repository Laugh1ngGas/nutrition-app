-- AI assistant chat history. Safe to run more than once.
--   npm run db:migrate -- src/utils/migrations/001_ai_chat_messages.sql
-- or paste into the Supabase SQL editor.

CREATE TABLE IF NOT EXISTS ai_chat_messages (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role        VARCHAR(10) NOT NULL CHECK (role IN ('user', 'assistant')),
  content     TEXT NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_chat_user_created ON ai_chat_messages(user_id, created_at);
