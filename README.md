# 💸 VibeWallet

Aesthetic expense tracker for Gen Z India. Connect Gmail → auto-sync bank transactions → get your monthly vibe score powered by Kimi K2 AI.

## What It Does

- **Gmail Sync** — reads transaction alert emails from Indian banks (HDFC, SBI, ICICI, Axis, Kotak, GPay, PhonePe, Paytm, Amazon Pay, CRED)
- **Auto Categorization** — tags spends into vibe categories like Midnight Cravings, Retail Therapy, Adulting Pain
- **Monthly Vibe Report** — AI-generated spending personality using NVIDIA NIM (Kimi K2 Instruct)
- **Budget Alerts** — set monthly limit, get warned at 80% and 100%
- **Bank Balance** — auto-detected from HDFC balance alert emails with last updated timestamp
- **Net Cash Flow + Savings Rate** — calculated from your credits vs debits
- **Export PDF** — download all transactions for any month
- **Dark Mode** — persisted across sessions

## Supported Banks

HDFC · SBI · ICICI · Axis · Kotak · Yes Bank · GPay · PhonePe · Paytm · Amazon Pay · CRED

---

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Copy env file and fill in values
cp .env.example .env.local

# 3. Run Supabase SQL schema (see Supabase setup below)

# 4. Start dev server
npm run dev
```

---

## Setup Guide

### 1. Google Cloud (Gmail API + OAuth)

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Create a new project → Enable **Gmail API**
3. Credentials → Create **OAuth 2.0 Client ID** (Web application)
4. Add Authorized redirect URI:
   ```
   http://localhost:3000/api/auth/callback/google
   ```
5. Copy Client ID + Secret → `.env.local`
6. OAuth consent screen → Scopes → add these three exactly:
   ```
   https://www.googleapis.com/auth/gmail.readonly
   https://www.googleapis.com/auth/userinfo.email
   https://www.googleapis.com/auth/userinfo.profile
   ```
7. OAuth consent screen → Test users → add every Gmail account you want to test with
8. Publishing status can stay as **Testing** for personal use (up to 100 test users)

> **Note:** The owner account (`kushucon@gmail.com`) also needs to be added as a test user explicitly — Google doesn't auto-allow it in Testing mode.

---

### 2. Supabase

1. Create a free project at [supabase.com](https://supabase.com)
2. SQL Editor → New Query → paste and run `supabase/schema.sql`
3. Also run these additional columns (added after initial schema):
   ```sql
   ALTER TABLE users ADD COLUMN IF NOT EXISTS monthly_budget NUMERIC(12,2) DEFAULT NULL;
   ALTER TABLE users ADD COLUMN IF NOT EXISTS bank_balance NUMERIC(12,2) DEFAULT NULL;
   ALTER TABLE users ADD COLUMN IF NOT EXISTS balance_updated_at TIMESTAMPTZ DEFAULT NULL;
   ```
4. Settings → API → copy URL + anon key + service_role key → `.env.local`

---

### 3. NVIDIA NIM (AI Vibe Reports)

1. Get a free API key at [build.nvidia.com](https://build.nvidia.com)
2. Add to `.env.local`
3. Model used: `moonshotai/kimi-k2-instruct` (set via `NVIDIA_MODEL` env var)

---

## Environment Variables

| Variable | Value / Where to get |
|---|---|
| `GOOGLE_CLIENT_ID` | Google Cloud Console → Credentials |
| `GOOGLE_CLIENT_SECRET` | Google Cloud Console → Credentials |
| `NEXTAUTH_SECRET` | Run: `openssl rand -base64 32` |
| `NEXTAUTH_URL` | `http://localhost:3000` (change to Vercel URL on deploy) |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Settings → API |
| `NVIDIA_API_KEY` | build.nvidia.com → API Keys |
| `NVIDIA_BASE_URL` | `https://integrate.api.nvidia.com/v1` |
| `NVIDIA_MODEL` | `moonshotai/kimi-k2-instruct` |

---

## How Gmail Parsing Works

1. User signs in with Google (gmail.readonly scope — read only, never sends or deletes)
2. Click **Sync Gmail** → searches for emails from known bank sender addresses
3. Each email is decoded and run through regex patterns per bank to extract amount, merchant, date, account
4. Transactions are categorized into vibe categories
5. Results saved to Supabase — duplicates skipped by Gmail message ID
6. Balance alert emails are separately parsed to update bank balance

**Default sync window:** last 3 days (pass `daysBack` in request body to change)  
**First time setup:** use the "Sync Last 90 Days" button on the empty state screen  
**Privacy:** raw email content is never stored — only parsed transaction data

---

## Known Quirks

- **Merchant shows "Unknown"** for some transactions — HDFC UPI emails use `to VPA handle NAME` format, parser extracts what it can
- **Date shows one day behind** — timezone fix applied (`T00:00:00` suffix on date strings)
- **Balance not detected** — only HDFC low-balance alert emails reliably contain balance; other banks may not
- **Vibe Report needs transactions** — button is disabled if no debit transactions exist for the month

---

## Tech Stack

| Layer | Tech |
|---|---|
| Framework | Next.js 14 (App Router) |
| Auth | NextAuth.js v4 (Google OAuth) |
| Database | Supabase (PostgreSQL) |
| Styling | Tailwind CSS + shadcn/ui |
| Charts | Recharts |
| AI | NVIDIA NIM — Kimi K2 Instruct |
| Gmail | Google APIs Node.js client |
| PDF Export | jsPDF |

---

## Project Structure

```
app/
  page.tsx                  # Landing page
  dashboard/page.tsx        # Main dashboard
  providers.tsx             # SessionProvider wrapper
  api/
    auth/[...nextauth]/     # NextAuth config + Google OAuth
    gmail/sync/             # Gmail fetch + parse + save
    transactions/           # Fetch transactions from Supabase
    budget/                 # Get/set monthly budget + balance
    wrapped/                # Generate AI vibe report

lib/
  gmail-parser.ts           # Regex patterns per bank + balance parser
  vibe-categories.ts        # Category definitions
  nvidia.ts                 # NVIDIA NIM AI calls
  supabase.ts               # Supabase client

components/
  wrapped-modal.tsx         # Vibe Report modal
  ui/                       # shadcn components
```

---

## Deploy to Vercel

```bash
npx vercel
```

After deploying:

1. Vercel dashboard → Settings → Environment Variables → add all vars from above
2. Set `NEXTAUTH_URL` to your Vercel URL: `https://your-app.vercel.app`
3. Google Cloud Console → OAuth client → add new redirect URI:
   ```
   https://your-app.vercel.app/api/auth/callback/google
   ```
4. Supabase → Authentication → URL Configuration → add Vercel URL to allowed origins

> All dev performance issues (slow cold start, hard refresh needed) are gone on Vercel — pages are pre-built and served from CDN.