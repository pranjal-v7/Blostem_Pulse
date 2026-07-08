# BlostemPulse 🔍

> **AI-powered autonomous B2B prospect intelligence for the Blostem sales & marketing team.**

[![Live Demo](https://img.shields.io/badge/Live%20Demo-Vercel-black?logo=vercel)](https://blostem-pulse-pr.vercel.app)
[![Built with Supabase](https://img.shields.io/badge/Backend-Supabase-3ecf8e?logo=supabase)](https://supabase.com)
[![React 18](https://img.shields.io/badge/Frontend-React%2018-61dafb?logo=react)](https://react.dev)
[![Gemini AI](https://img.shields.io/badge/AI-Gemini%202.0%20Flash-4285F4?logo=google)](https://aistudio.google.com)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

---
## 🌐 Demo Video

**[Video Link](https://drive.google.com/file/d/1kMUcCs-fX4WvmOZJaAXn49M2jhSlbp2P/view?usp=drive_link)**

## 🌐 Live Demo

**[https://blostem-pulse-pr.vercel.app](https://blostem-pulse-pr.vercel.app)**

Sign up with any email — you'll land directly on the Radar dashboard. The platform is pre-seeded with real Indian fintech companies (Groww, Zerodha, Navi) to demonstrate live intent scoring.

---

## 🧩 The Problem

Selling compliance and infrastructure software to Indian fintech companies — NBFCs, neobanks, lending platforms — is **brutally manual**. The Blostem sales team was spending hours every week:

- **Manually scanning** Inc42, ETBFSI, YourStory, Entrackr, and Moneycontrol for buying signals: funding rounds, product launches, regulatory pressure.
- **Guessing** which prospects are ready to buy — no data-driven prioritisation, no AI reasoning.
- **Writing cold outreach** from scratch for every prospect with no guardrails against RBI/SEBI compliance violations in email copy.
- **Missing macro events** — an RBI circular or a sector-wide regulatory change can shift an entire vertical's urgency overnight.
- **Zero pipeline automation** — every step required a human to initiate, monitor, and act.

**The insight:** Indian fintech buying triggers are *public* — funding rounds, RBI circulars, product launches — they all appear in news before a company calls a vendor. The gap was aggregating and interpreting those signals at scale.

---

## 💡 The Solution

BlostemPulse is a **zero-touch, real-time sales intelligence platform** that automates the entire top-of-funnel workflow in four stages:

```
DISCOVER  →  SCORE  →  OUTREACH  →  COMPLY
```

| Stage | What Happens |
|---|---|
| 🛰️ **Discover** | Autonomous RSS scraping of 7 Indian fintech news sources → Gemini AI extracts company entities → SerpAPI validates each one → metadata extracted → inserted as prospects |
| 📊 **Score** | Gemini AI scores each company 0–100 for buying intent based on signals, ICP fit, and regulatory triggers — with full reasoning and buy-window estimate |
| ✍️ **Outreach** | Rep selects prospect + stakeholder + tone → Gemini streams a personalised email → real CTO contact info fetched on demand |
| ✅ **Comply** | Every email auto-checked against 7 RBI/SEBI/DPDPA rules → violations flagged inline → one-click auto-fix rewrites only the flagged sentences |

---

## ✨ Features

| Feature | Description |
|---|---|
| 🛰️ **Autonomous Prospect Radar** | Live dashboard of all tracked fintech companies ranked by AI-computed intent score (0–100), segmented into Hot / Warm / Cold leads with animated KPI counters and real-time Supabase Realtime updates |
| ✨ **Freshly Discovered** | Auto-discovered companies found in the last 7 days surfaced in a dedicated horizontal carousel — always deduplicated and clickable to full detail |
| 🤖 **Autonomous Discovery Engine** | `discover-prospects` Edge Function autonomously scans 7 Indian fintech RSS feeds, extracts company entities via Gemini AI, validates via SerpAPI, extracts metadata, inserts, and scores — zero human input |
| ⏱️ **Scheduled Auto-Scans** | Configurable scan frequency (Manual / 2× daily / 4× daily IST) managed via `update-cron` Edge Function and Supabase pg_cron. Real-time toast notification fires after each scan |
| 🔬 **Deep Scan** | One-click per-company or batch "Scan All" — re-fetches signals and re-scores intent in real time. Score delta animates inline on the card |
| 🏢 **Company Detail** | Drill-down view with real contact info (CTO email, LinkedIn, website), signal timeline grouped by recency, AI-generated alignment analysis, and signal-weight breakdown |
| ✍️ **Outreach Engine** | Select prospect → pick stakeholder (CTO / CFO / Compliance Head / Founder) + tone → stream personalised email via Gemini → auto-compliance check → one-click auto-fix → open in Gmail |
| 🚨 **Macro Alerts** | Dismissible banner alerts for sector-wide regulatory events (RBI circulars, lending guidelines) that affect scoring across the entire pipeline |
| ⚙️ **ICP Editor** | Define your Ideal Customer Profile (company type, geography, free-text description). Saving triggers AI-powered rescoring of every prospect against the new ICP |
| 🌙 **Dark / Light Theme** | Full theme switching persisted to localStorage — applies instantly across the entire app |
| 🔐 **Auth** | Email + Google OAuth sign-in — new users land directly on the dashboard |

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        BLOSTEM PULSE ARCHITECTURE                   │
└─────────────────────────────────────────────────────────────────────┘

  ┌──────────────────────────────┐
  │     React 18 SPA (Vite)      │  ← Vercel CDN (Static)
  │                              │
  │  Pages:                      │
  │  ├── LoginPage               │
  │  ├── RadarPage               │◄──── useRealtimeProspects (hook)
  │  ├── CompanyDetailPage       │          │ Supabase Realtime WS
  │  ├── OutreachPage            │          │ prospects + signals tables
  │  ├── SettingsPage            │
  │  └── NotFoundPage            │
  │                              │
  │  Context:                    │
  │  ├── AuthContext             │
  │  └── ThemeContext            │ ← dark/light, persisted
  └──────────┬───────────────────┘
             │ HTTPS / REST + Realtime WS
             ▼
  ┌──────────────────────────────────────────────────────────────────┐
  │                    SUPABASE (Backend-as-a-Service)               │
  │                                                                  │
  │  ┌─────────────────┐    ┌──────────────────────────────────────┐ │
  │  │   Auth (GoTrue) │    │          PostgreSQL Database         │ │
  │  │  ─ Email/OAuth  │    │                                      │ │
  │  │  ─ RLS policies │    │  Tables:                             │ │
  │  └─────────────────┘    │  ├── prospects      (core entity)    │ │
  │                         │  ├── signals        (news events)    │ │
  │  ┌─────────────────┐    │  ├── macro_events   (RBI/SEBI alerts)│ │
  │  │    Realtime     │    │  ├── profiles       (user ICP config)│ │
  │  │  WebSocket sub  │    │  ├── emails_sent    (outreach log)   │ │
  │  │  on prospects   │    │  └── scan_logs      (auto-scan audit)│ │
  │  │  + signals      │    └──────────────────────────────────────┘ │
  │  └─────────────────┘                                             │
  │                                                                  │
  │  ┌─────────────────────────────────────────────────────────────┐ │
  │  │               Edge Functions (Deno Runtime)                 │ │
  │  │                                                             │ │
  │  │  discover-prospects  ─ RSS scrape → AI extract →           │ │
  │  │                        SerpAPI validate → insert → score   │ │
  │  │  score-intent        ─ Gemini: 0–100 score + reasoning     │ │
  │  │                        + signal weights + buy window       │ │
  │  │  deep-scan           ─ Re-fetch signals + re-score         │ │
  │  │  fetch-signals       ─ Pull latest headlines per company   │ │
  │  │  fetch-contact-info  ─ SerpAPI + Gemini → CTO email,       │ │
  │  │                        LinkedIn, website                   │ │
  │  │  generate-email      ─ Stream personalised B2B email       │ │
  │  │                        (stakeholder + tone aware)          │ │
  │  │  check-compliance    ─ 7-rule RBI/SEBI/DPDPA checker       │ │
  │  │  auto-fix-compliance ─ Rewrite flagged sentences only      │ │
  │  │  update-cron         ─ Update pg_cron scan schedule        │ │
  │  └─────────────────────────────────────────────────────────────┘ │
  └──────────────────────────────────────────────────────────────────┘
             │
             ▼
  ┌──────────────────────────────┐
  │     External APIs            │
  │  ├── Google Gemini 2.0 Flash │  ← AI reasoning & generation
  │  ├── SerpAPI                 │  ← Company validation & contacts
  │  └── 7× Indian Fintech RSS   │  ← Inc42 · ETBFSI · YourStory
  │       Feeds                  │    Entrackr · LiveMint
  │                              │    Moneycontrol · Economic Times
  └──────────────────────────────┘
```

---

## 🔄 Data Flow — Autonomous Discovery Pipeline

```
Scheduled Cron (pg_cron, IST)
        │
        ▼
[1] discover-prospects (Edge Function)
        │
        ├─ Fetch headlines from 7 RSS feeds
        │     Inc42 · ETBFSI · YourStory · Entrackr
        │     LiveMint · Moneycontrol · Economic Times
        │
        ├─ Gemini 2.0 Flash → extract company entity names
        │
        ├─ SerpAPI → validate each entity (≥2 results = real company)
        │
        ├─ Gemini 2.0 Flash → extract sector / stage / city metadata
        │
        ├─ INSERT into prospects table (is_new_entrant = true)
        └─ INSERT first signal into signals table
               │
               ▼
[2] score-intent (Edge Function, called inline)
        │
        ├─ Reads all signals for this company
        ├─ Reads user ICP definition from profiles table
        ├─ Gemini → intent_score (0–100)
        │           + alignment_reason
        │           + signal_weights (JSON breakdown)
        │           + ai_analysis (buy window, regulatory triggers)
        │
        └─ UPDATE prospects row with score + full analysis
               │
               ▼
[3] Supabase Realtime → pushes to all connected clients
        ├─ useRealtimeProspects hook catches INSERT/UPDATE events
        ├─ KPI counters animate (Hot / Warm / Cold counts)
        └─ Freshly Discovered carousel updates automatically
```

---

## 🛠️ Tech Stack

### Frontend

| Technology | Version | Purpose |
|------------|---------|-------|
| React | 18.3 | UI framework |
| React Router | 6.28 | Client-side routing (SPA) |
| Framer Motion | 11.12 | Animations (score deltas, card entrances, page transitions) |
| Lucide React | 0.460 | Icon system |
| Vite | 6.0 | Build tool + Hot Module Replacement |
| Vanilla CSS | — | Custom design system (dark/light themes, glassmorphism, CSS custom properties) |

### Backend

| Technology | Purpose |
|---|---|
| Supabase Auth (GoTrue) | Email + Google OAuth sign-in, JWT sessions |
| Supabase PostgreSQL | All persistent data (6 tables) |
| Supabase Realtime | WebSocket subscriptions — live dashboard without polling |
| Supabase Edge Functions | Serverless compute (Deno runtime) — all AI + data pipeline |
| Supabase pg_cron | Scheduled autonomous scan jobs (IST timezone) |
| Supabase Storage | User avatar uploads |

### External APIs

| API | Source | Used For |
|---|---|---|
| **Google Gemini 2.0 Flash** | Google AI Studio | Entity extraction, intent scoring (0–100), email generation (streamed), compliance rewriting |
| **SerpAPI** | serpapi.com | Company validation (search result count ≥ 2), CTO email + LinkedIn lookup |
| **Inc42 RSS** | `inc42.com/feed` | Indian startup & fintech funding news |
| **ETBFSI RSS** | `etbfsi.com/rss` | Banking & financial services sector news |
| **YourStory RSS** | `yourstory.com/feed` | Startup ecosystem + product launches |
| **Entrackr RSS** | `entrackr.com/feed` | Startup funding & growth signals |
| **LiveMint RSS** | `livemint.com/rss` | Business & finance news |
| **Moneycontrol RSS** | `moneycontrol.com/rss` | NBFC, fintech, markets news |
| **Economic Times RSS** | `economictimes.com/rss` | Macro economic & regulatory events |

### Deployment

| Layer | Platform |
|---|---|
| Frontend | Vercel (CDN, auto-deploy from GitHub `main`) |
| Backend | Supabase Cloud (managed PostgreSQL + Edge Functions) |
| Live URL | `https://blostem-pulse-pr.vercel.app` |

---

## 🔒 Compliance Guardrails

Every outreach email is automatically checked against **7 Indian financial regulation rules** before sending:

| Code | Rule | Regulatory Source |
|---|---|---|
| V1 | Named investment product recommendation | SEBI / RBI |
| V2 | Unqualified interest rate or APR claim | RBI Master Direction |
| V3 | PAN / Aadhaar / account number exposure | DPDPA 2023 / KYC Norms |
| V4 | Guaranteed returns language | SEBI MF Regulations |
| V5 | Past performance without disclaimer | SEBI |
| V6 | Legal / tax-filing advice | RBI Guidelines |
| V7 | Urgency / pressure tactics | ASCI / RBI Circular |

Violations are flagged inline. **Auto-Fix** rewrites only the flagged sentences without changing the email's intent.

---

## 📡 Edge Functions Reference

| Function | Trigger | What It Does |
|---|---|---|
| `discover-prospects` | pg_cron schedule or "Discover Now" button | RSS scrape → Gemini entity extract → SerpAPI validate → metadata → insert → score |
| `score-intent` | Post-insert, post-ICP-save, post-deep-scan | Gemini: score 0–100 with reason, signal_weights JSON, ai_analysis, buy-window estimate |
| `deep-scan` | Per-company "Scan" button / "Scan All" | Fetch latest signals → re-score → animate delta inline |
| `fetch-signals` | Called internally by deep-scan | Pull fresh fintech headlines per company from RSS sources |
| `fetch-contact-info` | Company Detail page load | SerpAPI + Gemini → CTO email, LinkedIn URL, company website |
| `generate-email` | Outreach page (streamed SSE) | Stream personalised B2B email by stakeholder + tone via Gemini |
| `check-compliance` | Post email generation | 7-rule RBI/SEBI/DPDPA checker — returns flagged sentences + suggested fixes |
| `auto-fix-compliance` | "Auto-Fix" button | Rewrite only flagged sentences in-place, preserve email intent |
| `update-cron` | Settings page save | Update pg_cron schedule for scan frequency (manual / 2× / 4× daily IST) |

---

## 🗄️ Database Schema

```sql
-- Prospects (core entity table)
CREATE TABLE prospects (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name             TEXT NOT NULL,
  sector           TEXT,
  stage            TEXT,
  hq_city          TEXT,
  website          TEXT DEFAULT '',
  intent_score     INTEGER,
  alignment_reason TEXT,
  signal_weights   JSONB,
  ai_analysis      JSONB,
  is_new_entrant   BOOLEAN DEFAULT false,
  needs_validation BOOLEAN DEFAULT false,
  discovery_source TEXT,
  discovery_headline TEXT,
  last_contacted   TIMESTAMPTZ,
  created_at       TIMESTAMPTZ DEFAULT now()
);

-- Signals (news / funding events per company)
CREATE TABLE signals (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        UUID REFERENCES prospects(id) ON DELETE CASCADE,
  headline          TEXT,
  source            TEXT,
  url               TEXT,
  score_contribution INTEGER DEFAULT 0,
  fetched_at        TIMESTAMPTZ DEFAULT now()
);

-- Macro events (RBI / SEBI sector-wide alerts)
CREATE TABLE macro_events (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title         TEXT,
  source        TEXT,
  sector_impact TEXT[],
  is_active     BOOLEAN DEFAULT true,
  created_at    TIMESTAMPTZ DEFAULT now()
);

-- User profiles (ICP configuration per user)
CREATE TABLE profiles (
  id             UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name      TEXT,
  display_name   TEXT,
  role           TEXT,
  avatar_url     TEXT,
  company_type   TEXT,
  geography      TEXT,
  icp_definition TEXT,
  scan_frequency TEXT DEFAULT 'manual',
  updated_at     TIMESTAMPTZ DEFAULT now()
);

-- Emails sent (outreach audit log)
CREATE TABLE emails_sent (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        UUID REFERENCES prospects(id),
  user_id           UUID REFERENCES auth.users(id),
  stakeholder       TEXT,
  tone              TEXT,
  email_body        TEXT,
  compliance_passed BOOLEAN DEFAULT false,
  sent_at           TIMESTAMPTZ DEFAULT now()
);

-- Scan logs (auto-scan audit trail)
CREATE TABLE scan_logs (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prospects_found      INTEGER DEFAULT 0,
  headlines_processed  INTEGER DEFAULT 0,
  triggered_by         TEXT DEFAULT 'cron',
  created_at           TIMESTAMPTZ DEFAULT now()
);
```

Enable **Row Level Security** on `prospects`, `signals`, and `profiles`, and enable **Realtime** for `prospects` and `signals` tables in Supabase Dashboard → Database → Replication.

---

## 🚀 Getting Started

### Prerequisites

- **Node.js** ≥ 18
- **npm** ≥ 9
- A [Supabase](https://supabase.com) project (free tier works)
- A [Google Gemini API](https://aistudio.google.com/app/apikey) key
- A [SerpAPI](https://serpapi.com) key *(optional — falls back to AI validation if absent)*

---

### 1. Clone the Repository

```bash
git clone https://github.com/pranjal-v7/Blostem_Pulse_PR.git
cd Blostem_Pulse_PR
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Configure Environment Variables

Create a `.env.local` file in the project root:

```env
VITE_SUPABASE_URL=https://<your-project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<your-supabase-anon-key>
```

> Both values are in Supabase Dashboard → Project Settings → API.

### 4. Set Up the Database

Run the SQL schema above in your Supabase SQL Editor to create all required tables.

### 5. Deploy Edge Functions

```bash
npm install -g supabase
supabase login
supabase link --project-ref <your-project-ref>

# Set secrets
supabase secrets set GEMINI_API_KEY=<your-gemini-api-key>
supabase secrets set SERPAPI_KEY=<your-serpapi-key>

# Deploy all functions
supabase functions deploy discover-prospects
supabase functions deploy score-intent
supabase functions deploy deep-scan
supabase functions deploy fetch-signals
supabase functions deploy fetch-contact-info
supabase functions deploy generate-email
supabase functions deploy check-compliance
supabase functions deploy auto-fix-compliance
supabase functions deploy update-cron
```

### 6. Run Locally

```bash
npm run dev
# → http://localhost:5173
```

### 7. Deploy to Production

Connect your GitHub repo to [Vercel](https://vercel.com) and add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` as environment variables. The included `vercel.json` handles SPA catch-all rewrites automatically.

```bash
npm run build    # build production bundle → /dist
npm run preview  # preview locally before pushing
```

---

## 📁 Project Structure

```
Blostem_Pulse_PR/
├── src/
│   ├── pages/
│   │   ├── LoginPage.jsx             ← Email + Google OAuth auth
│   │   ├── RadarPage.jsx             ← Main prospect dashboard + discovery
│   │   ├── CompanyDetailPage.jsx     ← Per-company drill-down + contact info
│   │   ├── OutreachPage.jsx          ← Email generation + compliance check
│   │   ├── SettingsPage.jsx          ← ICP editor + scan frequency + theme
│   │   ├── ResetPasswordPage.jsx
│   │   └── NotFoundPage.jsx
│   ├── components/
│   │   ├── AppShell.jsx              ← Sidebar layout wrapper
│   │   └── Toast.jsx                 ← Notification system
│   ├── hooks/
│   │   └── useRealtimeProspects.js   ← Supabase Realtime hook (with dedup)
│   ├── context/
│   │   ├── AuthContext.jsx           ← Auth state + auto-profile creation
│   │   └── ThemeContext.jsx          ← Dark/light theme (localStorage-persisted)
│   ├── lib/
│   │   └── supabase.js               ← Supabase client init
│   ├── App.jsx                       ← Routes + ThemeProvider + seed hook
│   └── index.css                     ← Global design system (dark + light themes)
│
├── supabase/
│   └── functions/
│       ├── _shared/
│       │   ├── ai.ts                 ← Gemini API wrapper
│       │   ├── prompts.ts            ← All LLM prompt templates
│       │   └── utils.ts              ← CORS headers, JSON parser
│       ├── discover-prospects/       ← Autonomous RSS discovery pipeline
│       ├── score-intent/             ← AI intent scoring (0–100) with reasoning
│       ├── deep-scan/                ← Re-fetch signals + re-score single company
│       ├── fetch-signals/            ← Pull fresh headlines per company
│       ├── fetch-contact-info/       ← CTO email + LinkedIn + website lookup
│       ├── generate-email/           ← Streamed personalised outreach email
│       ├── check-compliance/         ← RBI/SEBI/DPDPA 7-rule email checker
│       ├── auto-fix-compliance/      ← Rewrite non-compliant sentences
│       └── update-cron/              ← Update pg_cron scan schedule
│
├── index.html
├── vite.config.js
├── vercel.json                       ← SPA catch-all rewrite
├── tailwind.config.js
├── package.json
└── .env.local                        ← (not committed) — your Supabase keys
```

---

## 🔑 Environment Variables Reference

### Frontend (`.env.local`)

| Variable | Required | Description |
|---|---|---|
| `VITE_SUPABASE_URL` | ✅ | Your Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | ✅ | Supabase anonymous (public) key |

### Edge Function Secrets (`supabase secrets set`)

| Secret | Required | Description |
|---|---|---|
| `GEMINI_API_KEY` | ✅ | Google Gemini API key — all AI operations |
| `SERPAPI_KEY` | ⚠️ Optional | SerpAPI — falls back to AI-only validation if absent |

---


> Built for the **Blostem × Hack to the Future Hackathon** — turning raw Indian fintech signal noise into zero-touch, RBI/SEBI-compliant sales intelligence.
