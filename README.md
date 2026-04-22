# 💸 VibeWallet

Aesthetic expense tracker for Gen Z India. Connect Gmail → auto-sync bank transactions → get your monthly vibe score.

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Copy env file and fill in values
cp .env.example .env.local

# 3. Run Supabase SQL
# Go to supabase.com → SQL Editor → paste supabase/schema.sql → Run

# 4. Start dev server
npm run dev
```

## Setup Guide

### Google Cloud (Gmail API + OAuth)
1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Create project → Enable **Gmail API**
3. Credentials → Create **OAuth 2.0 Client ID** (Web application)
4. Authorized redirect URI: `http://localhost:3000/api/auth/callback/google`
5. Copy Client ID + Secret → `.env.local`
6. OAuth consent screen → Add test users (up to 100 free)

### Supabase
1. Create free project at [supabase.com](https://supabase.com)
2. SQL Editor → paste `supabase/schema.sql` → Run
3. Settings → API → copy URL + anon key + service_role key → `.env.local`

### NVIDIA NIM
- You already have this key! Add it to `.env.local`
- Used for AI vibe scores and Wrapped captions

## Environment Variables

| Variable | Where to get |
|---|---|
| `GOOGLE_CLIENT_ID` | Google Cloud Console → Credentials |
| `GOOGLE_CLIENT_SECRET` | Google Cloud Console → Credentials |
| `NEXTAUTH_SECRET` | Run: `openssl rand -base64 32` |
| `NEXTAUTH_URL` | `http://localhost:3000` |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Settings → API |
| `NVIDIA_API_KEY` | Your existing NIM key |
| `NVIDIA_BASE_URL` | `https://integrate.api.nvidia.com/v1` |

## Deploy to Vercel
```bash
npx vercel
# Add all env vars in Vercel dashboard
# Update NEXTAUTH_URL to your Vercel URL
# Add Vercel URL to Google OAuth redirect URIs
```
