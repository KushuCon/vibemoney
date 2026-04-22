-- ============================================================
-- VIBEWALLET — SUPABASE SQL SCHEMA
-- Run this entire file in Supabase → SQL Editor → New Query
-- ============================================================

-- ── Enable UUID extension ────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── USERS TABLE ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id            UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  email         TEXT UNIQUE NOT NULL,
  name          TEXT,
  avatar_url    TEXT,
  google_id     TEXT UNIQUE,
  last_synced_at TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ── TRANSACTIONS TABLE ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS transactions (
  id              UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_email      TEXT NOT NULL REFERENCES users(email) ON DELETE CASCADE,

  -- Core transaction data
  amount          NUMERIC(12, 2) NOT NULL,
  type            TEXT NOT NULL CHECK (type IN ('debit', 'credit')),
  merchant        TEXT NOT NULL,
  description     TEXT,

  -- Vibe categorization
  category_id     TEXT NOT NULL DEFAULT 'miscellaneous',
  category_name   TEXT NOT NULL DEFAULT 'Random Arc',
  category_emoji  TEXT NOT NULL DEFAULT '🌀',

  -- Metadata
  date            DATE NOT NULL,
  account_last4   TEXT,
  source          TEXT,         -- "HDFC Bank", "GPay", etc.
  email_id        TEXT UNIQUE,  -- Gmail message ID (prevents duplicates)
  raw_subject     TEXT,

  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ── MONTHLY REPORTS TABLE ────────────────────────────────────
CREATE TABLE IF NOT EXISTS monthly_reports (
  id                  UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_email          TEXT NOT NULL REFERENCES users(email) ON DELETE CASCADE,
  month               TEXT NOT NULL,  -- format: "2026-04"

  total_spent         NUMERIC(12, 2) DEFAULT 0,
  transaction_count   INTEGER DEFAULT 0,
  top_category        TEXT,
  personality_title   TEXT,
  personality_emoji   TEXT,
  wrapped_data        JSONB,          -- Full wrapped report as JSON

  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE (user_email, month)
);

-- ── INDEXES ──────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_transactions_user_email
  ON transactions(user_email);

CREATE INDEX IF NOT EXISTS idx_transactions_date
  ON transactions(date DESC);

CREATE INDEX IF NOT EXISTS idx_transactions_user_date
  ON transactions(user_email, date DESC);

CREATE INDEX IF NOT EXISTS idx_transactions_category
  ON transactions(user_email, category_id);

CREATE INDEX IF NOT EXISTS idx_monthly_reports_user
  ON monthly_reports(user_email, month DESC);

-- ── ROW LEVEL SECURITY (RLS) ─────────────────────────────────
-- IMPORTANT: Enable RLS so users can only see their own data

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE monthly_reports ENABLE ROW LEVEL SECURITY;

-- Users can read/update only their own row
CREATE POLICY "users_own_data" ON users
  FOR ALL USING (email = current_user);

-- Users can only access their own transactions
CREATE POLICY "transactions_own_data" ON transactions
  FOR ALL USING (user_email = current_user);

-- Users can only access their own reports
CREATE POLICY "reports_own_data" ON monthly_reports
  FOR ALL USING (user_email = current_user);

-- Service role bypasses RLS (used by our API routes with SUPABASE_SERVICE_ROLE_KEY)
-- This is automatic — the service role key always bypasses RLS.

-- ── HELPER VIEWS ─────────────────────────────────────────────

-- Monthly summary view
CREATE OR REPLACE VIEW monthly_summary AS
SELECT
  user_email,
  TO_CHAR(date, 'YYYY-MM') AS month,
  SUM(CASE WHEN type = 'debit' THEN amount ELSE 0 END) AS total_spent,
  SUM(CASE WHEN type = 'credit' THEN amount ELSE 0 END) AS total_received,
  COUNT(*) AS transaction_count,
  COUNT(DISTINCT category_id) AS categories_used
FROM transactions
GROUP BY user_email, TO_CHAR(date, 'YYYY-MM');

-- Category breakdown view
CREATE OR REPLACE VIEW category_breakdown AS
SELECT
  user_email,
  TO_CHAR(date, 'YYYY-MM') AS month,
  category_id,
  category_name,
  category_emoji,
  SUM(amount) AS total_amount,
  COUNT(*) AS transaction_count,
  AVG(amount) AS avg_amount
FROM transactions
WHERE type = 'debit'
GROUP BY user_email, TO_CHAR(date, 'YYYY-MM'), category_id, category_name, category_emoji
ORDER BY total_amount DESC;

-- ── SAMPLE DATA (optional, for testing) ─────────────────────
-- Uncomment to insert test data after replacing the email

/*
INSERT INTO users (email, name) VALUES ('test@gmail.com', 'Test User')
ON CONFLICT (email) DO NOTHING;

INSERT INTO transactions (user_email, amount, type, merchant, category_id, category_name, category_emoji, date, source, email_id) VALUES
  ('test@gmail.com', 450, 'debit', 'Swiggy', 'midnight-cravings', 'Midnight Cravings', '🍜', '2026-04-01', 'HDFC Bank', 'test_001'),
  ('test@gmail.com', 1200, 'debit', 'Amazon', 'retail-therapy', 'Retail Therapy', '🛍️', '2026-04-03', 'HDFC Bank', 'test_002'),
  ('test@gmail.com', 599, 'debit', 'Netflix', 'digital-dopamine', 'Digital Dopamine', '📱', '2026-04-05', 'ICICI Bank', 'test_003'),
  ('test@gmail.com', 2400, 'debit', 'Uber', 'main-character', 'Main Character', '✈️', '2026-04-07', 'GPay', 'test_004'),
  ('test@gmail.com', 300, 'debit', 'Zepto', 'midnight-cravings', 'Midnight Cravings', '🍜', '2026-04-10', 'SBI', 'test_005'),
  ('test@gmail.com', 15000, 'credit', 'Salary', 'transfer', 'Money Moves', '💸', '2026-04-01', 'HDFC Bank', 'test_006');
*/
