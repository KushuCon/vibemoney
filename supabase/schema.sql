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


create table transactions (
  id uuid default gen_random_uuid() primary key,
  user_email text not null,
  amount numeric not null,
  type text check (type in ('debit', 'credit')),
  merchant text,
  description text,
  category_id text,
  category_name text,
  category_emoji text,
  date date,
  account_last4 text,
  source text,
  email_id text unique,
  raw_subject text,
  created_at timestamp with time zone default now()
);

create table users (
  id uuid default gen_random_uuid() primary key,
  email text unique not null,
  last_synced_at timestamp with time zone,
  created_at timestamp with time zone default now()
);

SELECT tablename, rowsecurity FROM pg_tables 
WHERE schemaname = 'public';



SELECT * FROM users;
SELECT * FROM transactions LIMIT 5;

DROP POLICY IF EXISTS "transactions_own_data" ON transactions;
DROP POLICY IF EXISTS "users_own_data" ON users;
DROP POLICY IF EXISTS "reports_own_data" ON monthly_reports;

ALTER TABLE users ADD COLUMN IF NOT EXISTS monthly_budget NUMERIC(12,2) DEFAULT NULL;

ALTER TABLE users 
ADD COLUMN IF NOT EXISTS bank_balance NUMERIC(12,2) DEFAULT NULL,
ADD COLUMN IF NOT EXISTS balance_updated_at TIMESTAMPTZ DEFAULT NULL;


ALTER TABLE users ADD COLUMN IF NOT EXISTS bank_balance NUMERIC(12,2);
ALTER TABLE users ADD COLUMN IF NOT EXISTS balance_updated_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS monthly_budget NUMERIC(12,2);


CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_transactions_merchant_trgm
  ON transactions USING gin(merchant gin_trgm_ops);


ALTER TABLE users ADD COLUMN IF NOT EXISTS bank_balance NUMERIC(12,2);
ALTER TABLE users ADD COLUMN IF NOT EXISTS balance_updated_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS monthly_budget NUMERIC(12,2);
ALTER TABLE users ADD COLUMN IF NOT EXISTS sync_from_date DATE;

ALTER TABLE transactions ADD COLUMN IF NOT EXISTS vpa TEXT;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS category_override TEXT;

CREATE INDEX IF NOT EXISTS idx_transactions_account
  ON transactions(user_email, account_last4);


  


-- Delete ALL balance notification transactions for your account
DELETE FROM transactions
WHERE user_email = 'your@gmail.com'
AND (
  -- "reflect in your account" balance drop alerts
  merchant ILIKE '%reflect%'
  OR LOWER(description) LIKE '%reflect in your account%'
  OR LOWER(description) LIKE '%balance%dropped below%'
  OR LOWER(description) LIKE '%available balance%'
  OR LOWER(description) LIKE '%balance in your account%'
  
  -- ₹4 and ₹5000 unknown transactions that are balance notifications
  -- These come from HDFC low balance alert emails
  OR (merchant = 'Unknown' AND amount = 4)
  OR (merchant = 'Unknown' AND amount = 174)
  OR (amount = 5000 AND LOWER(description) LIKE '%reflect%')
);


-- Delete balance alert rows where description matches the available balance email
DELETE FROM transactions
WHERE user_email = 'your@email.com'
AND description ILIKE '%available balance in your account%';


DELETE FROM transactions
WHERE user_email = 'kushucon@gmail.com'
AND (
  merchant ILIKE '%reflect%'
  OR (merchant = 'Unknown' AND amount IN (4, 174, 5000))
  OR description ILIKE '%greetings from hdfc%'
  OR description ILIKE '%dropped below%'
  OR description ILIKE '%available balance%'
  OR description ILIKE '%balance in your account%'
  OR (amount = 5000 AND type = 'debit' AND source = 'HDFC Bank')
);


SELECT id, merchant, amount, description, date, type
FROM transactions
WHERE user_email = 'kushucon@gmail.com'
AND (
  merchant ILIKE '%reflect%'
  OR (merchant = 'Unknown' AND amount IN (4, 174, 5000))
  OR description ILIKE '%greetings from hdfc%'
  OR description ILIKE '%dropped below%'
  OR description ILIKE '%available balance%'
  OR description ILIKE '%balance in your account%'
  OR (amount = 5000 AND type = 'debit' AND source = 'HDFC Bank')
);

SELECT * FROM transactions
WHERE user_email = 'kushucon@gmail.com'
ORDER BY date DESC;

-- Remove old Zerodha source rows and re-sync to get HDFC NEFT credit instead
DELETE FROM transactions
WHERE user_email = 'kushucon@gmail.com'
AND source = 'Zerodha';


DELETE FROM transactions
WHERE user_email = 'kushucon@gmail.com'
AND description ILIKE '%View: Account update for your HDFC Bank%'
AND type = 'credit';

DELETE FROM transactions
WHERE user_email = 'kushucon@gmail.com'
AND source = 'Zerodha';


-- ============================================================
-- VIBEWALLET — SUPABASE FIXES & DEBUG QUERIES
-- ============================================================

-- ── FIX: Add missing columns ──────────────────────────────────
ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS vpa TEXT;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS bank_balance NUMERIC(12, 2),
  ADD COLUMN IF NOT EXISTS balance_updated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS sync_from_date DATE;

-- ── 1. ALL transactions (all time, all types) ─────────────────
SELECT
  id, date, type, amount, merchant,
  category_name, source, vpa, email_id, raw_subject, created_at
FROM transactions
WHERE user_email = 'kushucon@gmail.com'
ORDER BY date DESC, created_at DESC;

-- ── 2. Summary by month ───────────────────────────────────────
SELECT
  TO_CHAR(date, 'YYYY-MM') AS month,
  COUNT(*) AS total_txns,
  COUNT(*) FILTER (WHERE type = 'debit') AS debits,
  COUNT(*) FILTER (WHERE type = 'credit') AS credits,
  SUM(amount) FILTER (WHERE type = 'debit') AS total_spent,
  SUM(amount) FILTER (WHERE type = 'credit') AS total_received
FROM transactions
WHERE user_email = 'kushucon@gmail.com'
GROUP BY 1
ORDER BY 1 DESC;

-- ── 3. NEFT / large credits check ────────────────────────────
SELECT date, type, amount, merchant, source, raw_subject, email_id
FROM transactions
WHERE user_email = 'kushucon@gmail.com'
  AND (
    amount > 1000
    OR source ILIKE '%zerodha%'
    OR merchant ILIKE '%zerodha%'
    OR raw_subject ILIKE '%neft%'
    OR raw_subject ILIKE '%credited%'
  )
ORDER BY date DESC;

-- ── 4. Most recent 50 transactions ───────────────────────────
SELECT email_id, date, type, amount, merchant, raw_subject
FROM transactions
WHERE user_email = 'kushucon@gmail.com'
ORDER BY created_at DESC
LIMIT 50;

-- ── 5. Users table — balance + sync state ────────────────────
SELECT
  email, bank_balance, balance_updated_at,
  last_synced_at, sync_from_date, created_at
FROM users
WHERE email = 'kushucon@gmail.com';

-- ── 6. Duplicate email_ids check ─────────────────────────────
SELECT email_id, COUNT(*) as cnt
FROM transactions
WHERE user_email = 'kushucon@gmail.com'
GROUP BY email_id
HAVING COUNT(*) > 1;


SELECT
  id, date, type, amount, merchant,
  category_name, source, vpa, email_id, raw_subject, created_at
FROM transactions
WHERE user_email = 'kushucon@gmail.com'
ORDER BY date DESC, created_at DESC;


DELETE FROM transactions WHERE user_email = 'kushucon@gmail.com';
UPDATE users SET sync_from_date = NULL WHERE email = 'kushucon@gmail.com';


-- New table for per-bank balances
CREATE TABLE IF NOT EXISTS bank_balances (
  id            UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_email    TEXT NOT NULL REFERENCES users(email) ON DELETE CASCADE,
  bank_name     TEXT NOT NULL,
  balance       NUMERIC(12, 2) NOT NULL,
  updated_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_email, bank_name)
);

CREATE INDEX IF NOT EXISTS idx_bank_balances_user
  ON bank_balances(user_email);

-- Primary bank preference
ALTER TABLE users ADD COLUMN IF NOT EXISTS primary_bank TEXT;
