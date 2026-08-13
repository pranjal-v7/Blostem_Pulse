# BlostemPulse — Full Technical Reference & Architecture Report

*A living reference for anyone (including future-you) making changes to this codebase.*

---

## 1. What This Project Is

BlostemPulse is an AI-powered B2B sales-intelligence dashboard for Blostem's sales team, targeting Indian fintech companies (NBFCs, neobanks, payments, insurtech, lending). It was built for a hackathon and is optimized as much for a **live, real-time-feeling demo** as for production correctness — this shows up repeatedly in the code (client-side fallbacks everywhere, demo-seed data, a "Discover Now" manual trigger button, a hidden "Load Demo Signals" button, etc.).

Four pipeline stages, all AI-assisted:

```
DISCOVER  →  SCORE  →  OUTREACH  →  COMPLY
```

- **Discover**: scrape 7 Indian fintech RSS feeds, extract company entities with AI, validate with SerpAPI, auto-insert as prospects.
- **Score**: AI scores each company 0–100 for buying intent based on signals + ICP fit + regulatory triggers.
- **Outreach**: AI drafts a personalized cold email per stakeholder/tone, streamed token-by-token.
- **Comply**: every email is checked against 7 RBI/SEBI/DPDPA-style rules, with one-click auto-fix.

---

## 2. Tech Stack

| Layer | Technology |
|---|---|
| Frontend framework | React 18.3 + Vite 6 |
| Routing | React Router 6.28 (`BrowserRouter`) |
| Animation | Framer Motion 11.12 |
| Icons | lucide-react 0.460 |
| Styling | Hand-written CSS custom-property design system in `src/index.css` (Tailwind is installed and configured but **barely used** — see §15) |
| Backend | Supabase: Postgres, Auth (GoTrue), Edge Functions (Deno), Realtime (WebSocket), Storage |
| AI | Provider-agnostic adapter — Gemini 2.0 Flash (default) or Claude Sonnet, switched by one env var |
| External APIs | SerpAPI (news search + validation), Clearbit Logo API + Google Favicons (logo fallback), 7 Indian fintech RSS feeds |
| Deployment | Frontend → Vercel (SPA rewrite via `vercel.json`); Backend → Supabase Cloud |

---

## 3. Repository Map

```
src/
  main.jsx                     — ReactDOM root, wraps <App/> in StrictMode
  App.jsx                      — Router, providers, route table, demo-seed effect
  index.css                    — entire design system (dark + light theme)
  lib/supabase.js              — Supabase client (uses VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY)
  context/
    AuthContext.jsx            — user/session state, sign in/up/out, profile auto-create
    ThemeContext.jsx           — dark/light theme, persisted to localStorage
  components/
    AppShell.jsx                — sidebar + top-level layout for all /app/* routes
    Toast.jsx                   — toast notification system (context + UI)
  hooks/
    useRealtimeProspects.js     — live prospects+signals list via Supabase Realtime
  pages/
    LoginPage.jsx                — sign in / sign up / Google OAuth / forgot password
    OnboardingPage.jsx           — 3-step ICP wizard (reachable but not enforced)
    RadarPage.jsx                — main dashboard (hero page)
    CompanyDetailPage.jsx        — per-company drill-down
    OutreachPage.jsx             — email generation + compliance workspace
    SettingsPage.jsx             — profile, ICP, scan schedule, danger zone
    ResetPasswordPage.jsx        — password reset landing page
    NotFoundPage.jsx             — 404

supabase/functions/
  _shared/
    ai.ts                       — Gemini/Claude adapter (callAI / callAIStream)
    prompts.ts                  — every LLM system/user prompt, centralized
    utils.ts                    — CORS headers + parseJSON() (strips ```json fences)
  discover-prospects/           — full autonomous discovery pipeline ("Option B")
  fetch-signals/                — older/alternate discovery pipeline ("Option A")
  score-intent/                 — AI intent scoring (single company or rescore_all)
  deep-scan/                    — refresh signals + rescore one company
  fetch-contact-info/           — AI+SerpAPI lookup of exec contacts/website
  generate-email/                — streamed outreach email generation
  check-compliance/              — 7-rule RBI/SEBI/DPDPA email checker
  auto-fix-compliance/           — rewrites only flagged sentences
  update-cron/                   — translates UI scan-frequency into a pg_cron schedule

plans/, .agents/, DEMO_SCRIPT.txt, README.md — planning docs, build guides, demo script (not app code — see §18)
```

---

## 4. Application Bootstrap

`index.html` → mounts `#root`, preloads Inter + JetBrains Mono fonts.
`src/main.jsx` → `ReactDOM.createRoot(...).render(<React.StrictMode><App/></React.StrictMode>)`, imports `index.css`.

`src/App.jsx` is the composition root:

```
<BrowserRouter>
  <ThemeProvider>
    <AuthProvider>
      <ToastProvider>
        <AppRoutes/>
      </ToastProvider>
    </AuthProvider>
  </ThemeProvider>
</BrowserRouter>
```

**`AppRoutes`** also contains a `useEffect` (dependency `[user]`) that runs an **idempotent demo-seed**: it checks whether "Groww", "Zerodha", "Navi" already exist in `prospects` (by name) and inserts only the missing ones, each with `is_new_entrant: true, intent_score: null`. This runs on every mount where `user` is truthy — i.e., effectively once per login session, regardless of which `/app/*` page the person lands on. This is why those three companies (or leftovers of them) tend to reappear even after a DB wipe.

---

## 5. Routing Table

| Path | Component | Protected? | Notes |
|---|---|---|---|
| `/login` | `LoginPage` | — | Redirects to `/app/radar` inline if `user` truthy (redirect logic lives in the route definition, not inside `LoginPage`) |
| `/reset-password` | `ResetPasswordPage` | No | Landing target for Supabase password-reset email links |
| `/onboarding` | `OnboardingPage` | **No** | Reachable by anyone, but **not enforced** — see §15 |
| `/app` | `ProtectedRoute` → `AppShell` | Yes | Wraps all authenticated routes; shows spinner while `loading`, redirects to `/login` if no `user` |
| `/app/radar` | `RadarPage` | Yes | Default index redirect target |
| `/app/company/:id` | `CompanyDetailPage` | Yes | |
| `/app/outreach` | `OutreachPage` | Yes | Accepts `?company_id=` to preselect |
| `/app/settings` | `SettingsPage` | Yes | |
| `/app` (index) | → `Navigate to="radar"` | Yes | |
| `/` | → `Navigate to="/app"` | — | |
| `*` | `NotFoundPage` | — | Links back to `/app/radar` |

`ProtectedRoute` (defined in `App.jsx`) is a simple wrapper: `useAuth()` → if `loading` show a centered spinner; if `!user` → `<Navigate to="/login" replace/>`; else render children.

---

## 6. Global State: Contexts & Providers

### AuthContext (`src/context/AuthContext.jsx`)
- State: `user`, `session`, `loading`, `needsOnboarding` (see caveat below).
- On mount: `supabase.auth.getSession()` then subscribes to `supabase.auth.onAuthStateChange`.
- `checkProfile(userId)`: looks up `profiles` by id; if missing, **auto-creates a blank profile row** (`upsert({id: userId})`). It then **always** sets `needsOnboarding = false` — i.e. this flag is set but never read anywhere else in the app (`AppRoutes` doesn't check it). Onboarding is effectively bypassed; users go straight from auth success to `/app/radar`.
- `signIn(email, password)`, `signUp(email, password)` (also upserts a blank profile), `signOut()`.

### ThemeContext (`src/context/ThemeContext.jsx`)
- `theme` state, default read from `localStorage['bp-theme']` or `'dark'`.
- On change: sets `document.documentElement.dataset.theme = theme` and persists to localStorage. This attribute drives every `[data-theme="light"]` override block in `index.css`.

### ToastProvider (`src/components/Toast.jsx`)
- `addToast(message, type='info', duration=3000)` — types: `success | warning | error | info`, each mapped to an icon + accent color.
- Renders a fixed top-right stack (`.toast-container`); each toast auto-removes itself via `setTimeout`.
- Consumed via `useToast()` throughout almost every page for user feedback (network results, validation errors, etc.)

---

## 7. Pages — Deep Dive

### 7.1 LoginPage.jsx
- Split-screen layout: left = marketing hero (animated stat counters, feature pills), right = auth card.
- **Sign in**: `useAuth().signIn(email, password)`.
- **Sign up**: calls `supabase.auth.signUp` directly (not via `AuthContext.signUp`), then `profiles.upsert({id, display_name: fullName, age, department})`. Extra fields (`fullName`, `age`, `department`) are **only** collected here, not reused anywhere else in the UI besides being stored.
- **Google OAuth**: `supabase.auth.signInWithOAuth({provider:'google', options:{redirectTo: origin + '/app/radar'}})`.
- **Forgot password** (`forgotMode` state): `supabase.auth.resetPasswordForEmail(email, {redirectTo: origin + '/reset-password'})`.
- `AnimatedCounter` sub-component — generic count-up animation used for the 3 hero stat boxes (hardcoded numbers 52/8/3, **not live data**).

### 7.2 OnboardingPage.jsx
- 3-step wizard with a progress bar: **Step 1** Company Type (radio cards: NBFC/Neobank/Payments/Insurtech/Lending) → **Step 2** Stage (multi-select chips) + Geography (single-select) → **Step 3** free-text ICP description.
- `handleSubmit()`: `profiles.upsert({id, company_type, stage_filter, geography, icp_definition})`, then **fire-and-forget** `fetch(.../score-intent, {body:{rescore_all:true}})` — **note: no `Authorization` header is sent here** (unlike the equivalent calls in `RadarPage` and `SettingsPage`). Because `score-intent` derives the ICP from the request's auth header, this call will silently fall back to the function's hardcoded default ICP string rather than the one the user just entered. See §15.
- Navigates to `/app/radar` after a 500ms delay.
- Since nothing in `App.jsx` redirects new users here, this page is only ever reached if a user manually navigates to `/onboarding`.

### 7.3 RadarPage.jsx — the hero page

**Data sources**
- `useRealtimeProspects()` → live `prospects` array (deduped, sorted by score), `loading`, `refetch`.
- `macroEvents` — fetched once on mount from `macro_events` where `is_active = true`.
- `unvalidatedProspects` — fetched from `prospects` where `is_new_entrant = true AND created_at >= now()-7d`, deduped by name (keep earliest), **kept in sync via a dedicated realtime channel** (`auto-discovered-prospects`) subscribed to `INSERT` events on `prospects` filtered by `is_new_entrant=eq.true`.
- A separate realtime channel (`scan-logs-notifications`) listens for `INSERT` on `scan_logs` and fires a toast summarizing the result of any background/foreground discovery scan (`🤖 Auto-scan complete: Found N new companies...`).

**Key state**: `searchQuery`, `scanningId` (which card is mid-deep-scan), `scanAllRunning` + `scanAllProgress {done,total}`, `showReviewModal` (Discovery timeline modal), `dismissedEvents` (macro-alert dismissals, persisted to `localStorage['dismissedEvents']`), ICP modal fields (`showIcpModal`, `icpCompanyType`, `icpGeography`, `icpDefinition`, `icpSaving`), `isDiscovering`.

**Interactions → backend calls**
| UI action | Handler | Calls |
|---|---|---|
| "Discover Now" button | `handleRunDiscovery` | `POST /functions/v1/discover-prospects` → toast + `refetch()` on success |
| Per-card "Scan" button | `handleDeepScan(prospect, onDelta)` | `POST /functions/v1/deep-scan` → animates `+N`/`-N` delta flash on the card; **on failure**, falls back to a random `intent_score` jitter written directly via `supabase.from('prospects').update(...)` |
| "Scan All Live" button | `handleScanAll` | Loops **sequentially** (not parallel) over every prospect calling `deep-scan`, updating `scanAllProgress` after each; per-item fallback identical to single-scan's; finishes with `refetch()` |
| "Edit ICP" (opened via `openIcpModal`) | `saveIcp` | `profiles.upsert(...)` then `POST score-intent {rescore_all:true}` **with** Authorization header (unlike Onboarding) |
| "N Auto-Discovered" badge | opens `DiscoveryPanel` modal | reads existing `unvalidatedProspects` state (no new fetch) |
| Macro alert "✕" | `dismissEvent(id)` | local + `localStorage` only, no backend call |

**Rendering breakdown**
- KPI strip: `AnimatedKPI` (count-up) for Companies / Hot Leads, `AnimatedTimeKPI` for "Last Scan" (`timeAgo(latestSignal)`), Alerts count, plus the "Discover Now" button.
- Toolbar: title, search input (client-side filter on `name`/`sector`/`hq_city`), Auto-Discovered badge (conditional), Scan-All button (+ progress bar row while running).
- Macro alert pill row (color-coded by keyword match in `getPillColor`: "rbi"/"repo" → coral, "budget"/"lending" → amber, else purple).
- "Freshly Discovered" horizontal carousel (only from `unvalidatedProspects`, separate from the main tiered list).
- Three tiered sections: **Hot** (`intent_score > 75`), **Warm** (`50 ≤ score ≤ 75`), **Cold** (`score < 50`) — each built from `filtered` (the post-search-query list). Note: `null` scores fail all three numeric comparisons except `<`, so **null/unscored prospects land in Cold** by default (relevant for freshly-seeded/unscored companies).
- Sub-components defined in this file: `AnimatedKPI`, `AnimatedTimeKPI`, `ScoreRing` (SVG donut, radius 20), `SignalDots` (up to 5 colored pulse dots), `CompanyLogo` (Clearbit → Google favicon → initials fallback chain via `onError`), `ProspectCard` (the list row, owns its own `delta` state + framer-motion flash), `DiscoveryPanel` (full-screen modal showing a timeline of `unvalidatedProspects` with heat tags and the triggering headline quoted).
- ICP Editor modal: pill selectors for `TYPES`/`GEOS` constants + textarea, "Save & Rescore All" button.

### 7.4 CompanyDetailPage.jsx
- Route param `:id`. On mount, fetches `prospects` row + last 10 `signals` in parallel, then `macro_events` matching `company.sector` via `.contains('sector_impact', [sector])`.
- **Contact info**: a hardcoded `CONTACT_INFO` dictionary covers ~10 named demo companies (KreditBee, Razorpay, Slice, Jupiter Money, Fibe, Niyo Solutions, Lendingkart, Uni Cards, NeoGrowth, PaySense). For any other company, `fetchContactInfo(name)` is called automatically, hitting `POST /functions/v1/fetch-contact-info` (SerpAPI + AI) and populating `dynamicContactInfo`.
- `handleDeepScan()` — same pattern as RadarPage: calls `deep-scan`, updates local `company.intent_score`, re-fetches signals; on failure falls back to a random jitter written directly to `prospects`.
- **Signal Breakdown** groups signals into recency buckets (Past Week / Past 3 Weeks / Past Month / Past 3 Months / Older) computed client-side from `fetched_at`. Each signal row shows a source-colored badge (`sourceColors` map keyed by source name), `+N pts` contribution chip, relative time, and a "View Source" link built by `getSignalUrl(sig)` — if `sig.url` isn't a real `http` link, it constructs a **search URL** on the matching outlet's site using `SOURCE_BASE_URLS` + the headline text (source-specific URL patterns for YourStory/Inc42/Moneycontrol/LiveMint/Economic Times/RBI/etc.).
- **AI Analysis** panel parses `company.alignment_reason` (a plain-text string from `score-intent`) by splitting on newlines and mapping the first up to 4 lines onto 4 fixed section headers ("What they launched" / "Why Blostem fits" / "Recommended angle" / "Risk & compliance notes") — this is a heuristic display, not structured data from the AI.
- Sticky bottom action bar: "Generate Email" → `navigate('/app/outreach?company_id=' + id)`; "Deep Scan" button.

### 7.5 OutreachPage.jsx
- Reads `?company_id=` from the URL to preselect a prospect on load.
- Fetches all `prospects`, deduped client-side by name (keep highest `intent_score`).
- **Left panel**: search + filter chips (`all` / `not_contacted` / `contacted`, based on `last_contacted`), list of `OutreachLogo` rows (its own Clearbit→favicon→initials fallback implementation, separate from `CompanyLogo`).
- **Right panel**: Stakeholder selector (CTO/CFO/Compliance Head/Founder) + Tone selector (Formal/Consultative/Urgent/Friendly) → "Generate Email".

**Email generation (`generateEmail`)**
1. Tries `fetch(.../generate-email, {method:'POST', body:{company_id, stakeholder, tone}})`.
2. Streams the response body, parsing SSE lines of the form `data: {"type":"content_block_delta","delta":{"text":"..."}}` (this normalized shape is guaranteed by the AI adapter regardless of provider — see §11). The **first newline** in the streamed text is treated as the subject/body boundary.
3. On any failure (network error, non-OK response, thrown error) → `generateEmailFallback()`: builds a canned templated email locally using the company's `name/sector/hq_city/stage`, then **fake-streams** it into the textarea in 3-character chunks via a `setTimeout` loop (purely cosmetic — for demo resilience if the edge function/API key is down).
4. Either path, 500ms after completion, auto-calls `checkCompliance(text)`.

**Compliance (`checkCompliance` / `handleAutoFix`)**
- `checkCompliance` tries `POST check-compliance`; on any failure, falls back to `runClientComplianceCheck()` — a **local, deterministic regex engine** (`COMPLIANCE_RULES` array) mirroring 5 of the 7 server-side rules (V1 recommendation language, V2 interest-rate claims, V4 guaranteed-returns language, V5 past-performance disclaimer, V7 urgency language — **V3 PII and V6 legal advice are not covered by the client-side fallback**).
- `handleAutoFix` tries `POST auto-fix-compliance` (AI rewrite of only flagged sentences); on failure, applies each local rule's own `fix()` regex substitution directly to the full email body, then re-runs `checkCompliance`.
- Once `complianceResult.passed`, a "Mark as Contacted" button appears → `markContacted()`: updates `prospects.last_contacted`, inserts a row into `emails_sent`, and **auto-advances** to the next prospect in the list where `!last_contacted`.
- `copyEmail()` — Clipboard API with a manual `document.execCommand('copy')` fallback for older/non-HTTPS contexts.
- `openInGmail()` — builds a `mail.google.com/mail/?view=cm&fs=1&su=...&body=...` compose URL.

### 7.6 SettingsPage.jsx
- On mount, fetches (or implicitly relies on the auto-created) `profiles` row; falls back to a name derived from the user's email prefix if no `display_name` is set.
- **Profile & Account**: avatar upload → `supabase.storage.from('avatars').upload(...)`, with a `FileReader`-to-dataURL fallback if the upload throws; display name; role selector (local pills).
- **Preferences**: theme toggle (writes through `ThemeContext`), a **notifications toggle that is local-only and never persisted** (not included in `saveProfile`'s upsert payload — resets on reload), timezone selector.
- **ICP Configuration**: company type / geography / free-text ICP / scan frequency (`2x_daily | 4x_daily | manual`).
- `saveProfile()`: (1) `profiles.upsert(...)` with all the above fields, (2) `POST update-cron` with a translated frequency string (`'2x'|'4x'|'manual'`) — if this second call fails, the whole function throws from inside the `try`, so the **profile changes have already been saved** but the person sees an error toast, which can be misleading. See §15.
- **About**: static hardcoded info card (version, platform, "AI Engine: Gemini 2.0 Flash" — this label doesn't reflect if `AI_PROVIDER` has been switched to Claude).
- **Demo Controls**: `loadDemoSignals()` — inserts a hardcoded `DEMO_SIGNALS` set of realistic headlines for 6 named companies (matched by exact name lookup against `prospects`).
- **Danger Zone**: `clearSignals()` (deletes all `signals` rows) and `resetScores()` (sets all `intent_score` to 0) — both gated by an inline "Are you sure?" confirm step (`showDangerConfirm`), not a modal.

### 7.7 ResetPasswordPage.jsx
- New/confirm password fields with show/hide toggles and client-side validation (≥6 chars, must match).
- `supabase.auth.updateUser({password})` → success screen → `navigate('/login')` after 2.5s.

### 7.8 NotFoundPage.jsx
- Static 404 with a link back to `/app/radar`.

---

## 8. Shared Components

### AppShell.jsx (`src/components/AppShell.jsx`)
Rendered once for the whole `/app/*` subtree via `<Outlet/>`.
- `BackgroundBeams` — 3 decorative blurred gradient orbs (`.beam-1/2/3`), plus a full-viewport `.grain-overlay` noise texture.
- Sidebar (220px): logo/wordmark, `NAV_ITEMS` (`Radar` with a pulsing badge dot, `Outreach`, `Settings`) rendered as `NavLink`s, bottom section: logout button (opens a confirm modal) + user avatar/first-name (derived by stripping digits/`._` from the email local-part).
- `ScrollProgress` — tracks scroll % of the `<main>` ref via a scroll listener, renders a floating pill (bottom-right) only once the user has scrolled (`pct === 0` → renders nothing).

### Toast.jsx
Covered in §6. Note it's the **only** place toast rendering logic lives — every page just calls `addToast(...)`.

---

## 9. Hooks

### useRealtimeProspects.js
This is the single source of truth for the live prospect list used by `RadarPage`.

`fetchProspects()`:
1. `SELECT * FROM prospects ORDER BY intent_score DESC`.
2. `SELECT company_id, fetched_at FROM signals` (all of them) → aggregates client-side into `signalMap[company_id] = {count, latest}`.
3. Merges `signal_count` / `last_signal_at` onto each prospect.
4. **Dedup by name** (`name.toLowerCase().trim()`), keeping the row with the highest `intent_score` (tiebreak: more signals). This dedup exists specifically because of the multiple insert paths (demo seeding, `discover-prospects`, `fetch-signals`) that can create near-duplicate rows for the same company name — see §15.

Subscribes once on mount to a single realtime channel `prospects-realtime` listening to `postgres_changes` (`event: '*'`) on **both** `prospects` and `signals` tables — any insert/update/delete on either triggers a full `fetchProspects()` refetch. Returns `{prospects, loading, error, refetch}`.

---

## 10. Supabase Backend

### 10.1 Database Schema (as documented in README.md / implied by all query usage)

**`prospects`** — core entity table
`id, name, sector, stage, hq_city, website, intent_score, alignment_reason, signal_weights(jsonb), ai_analysis(jsonb), is_new_entrant, needs_validation, discovery_source, discovery_headline, last_contacted, created_at`

**`signals`** — news/events per company
`id, company_id → prospects.id, headline, source, url, score_contribution, fetched_at`

**`macro_events`** — sector-wide regulatory alerts
`id, title, source, sector_impact(text[]), is_active, created_at`

**`profiles`** — one row per auth user (ICP config + account info)
`id → auth.users.id, display_name/full_name, role, avatar_url, company_type, geography, icp_definition, stage_filter, scan_frequency, age, department`
(`age`/`department` are written only from `LoginPage`'s sign-up form.)

**`emails_sent`** — outreach audit log
`id, company_id, user_id, stakeholder, tone, email_body, compliance_passed, sent_at`

**`scan_logs`** — discovery-scan audit trail, drives the realtime toast in RadarPage
`id, prospects_found, headlines_processed, method/triggered_by, created_at`

### 10.2 RLS & Realtime
Per the original build guide's SQL: RLS is enabled on `profiles` (owner-only) and `emails_sent` (owner-only); `prospects` has a permissive **SELECT** policy for any authenticated user. Realtime is enabled on `prospects` and `signals` (required by `useRealtimeProspects` and RadarPage's discovery subscriptions).

⚠️ **Gap to verify in the live project**: the frontend performs direct client-side `INSERT` (demo seeding in `App.jsx`), `UPDATE` (`RadarPage`/`CompanyDetailPage` deep-scan fallbacks, `SettingsPage.resetScores`), and `DELETE` (`SettingsPage.clearSignals`) against `prospects`/`signals` from the browser session. The SQL shown in the build guide only grants `SELECT`. For these calls to succeed in production, additional policies (or relaxed RLS) must exist beyond what's captured in this repo's docs — worth confirming directly in the Supabase dashboard before relying on any of these fallback paths.

### 10.3 Edge Functions Reference

| Function | Input | What it does | Output |
|---|---|---|---|
| `discover-prospects` | `{}` (POST, no body needed) | **Full auto pipeline ("Option B")**: fetch 7 RSS feeds → AI entity-extract per headline → dedupe against known names → validate each new entity via SerpAPI (≥2 results) or, if `SERPAPI_KEY` unset, an AI plausibility check → AI-extract sector/stage/hq_city → `INSERT prospects` (`is_new_entrant:true, needs_validation:false` — fully auto-approved) + first `signals` row → immediately `POST score-intent` for that company → logs a `scan_logs` row | `{discovered, companies[], validation_method, headlines_processed}` |
| `fetch-signals` | `{}` | **Older/alternate pipeline ("Option A")**: matches RSS headlines against *known* prospect names first (inserts matched signals, deduped by URL); for headlines that match nothing, AI-extracts entities and inserts them as **staged, unapproved** prospects (`needs_validation:true, is_new_entrant:false`) for manual review. Not currently invoked from any UI button in this codebase — appears to be superseded by `discover-prospects`, but is still deployed/documented. | `{inserted, discovered, companies_matched, companies_discovered[]}` |
| `score-intent` | `{company_id}` **or** `{rescore_all:true}` | For each target company: pulls last 5 `signals` + active `macro_events` for its sector + the caller's `icp_definition` (via `Authorization` header → `auth.getUser` → `profiles` lookup; falls back to a hardcoded default ICP string if no/invalid auth header) → calls the AI adapter with `scoreSystemPrompt/scoreUserPrompt` → updates `prospects.intent_score/alignment_reason/signal_weights/ai_analysis` | `{results:[{company_id, name, score, reason, signal_weights, ai_analysis}]}` |
| `deep-scan` | `{company_id, company_name}` | Records the old score, then either queries SerpAPI across 9 named outlets (`site:` OR-query) and inserts up to 8 new deduped-by-URL signals, or (no `SERPAPI_KEY`) inserts up to 4 hardcoded, name-templated fallback headlines. Then internally `POST`s `score-intent` for a fresh score. | `{new_score, delta, new_signals[]}` |
| `fetch-contact-info` | `{company_name}` | SerpAPI search for website/LinkedIn/contact info, then AI extracts a structured JSON (explicitly instructed not to invent exec names) | `{website, linkedin, email, cto, ctoEmail, cfo, cfoEmail}` |
| `generate-email` | `{company_id, stakeholder, tone}` | Pulls company row, top 3 signals, caller's ICP; streams the AI response through unchanged as `text/event-stream` | SSE stream (subject on line 1, blank line, body) |
| `check-compliance` | `{email_body}` | Runs the 7-rule prompt, parses JSON | `{passed, flags[]}` |
| `auto-fix-compliance` | `{email_body, flags[]}` | Instructs the AI to rewrite **only** the flagged sentences, returns full corrected body | `{fixed_email_body}` |
| `update-cron` | `{frequency: '2x'|'4x'|'manual'}` | Translates to a UTC cron expression accounting for IST (+5:30) offset, calls an `update_scan_schedule` Postgres RPC (defined via manual SQL — **not present in this repo's files**) to update the `pg_cron` schedule | `{success, schedule}` |

All functions share `corsHeaders` and `parseJSON` from `_shared/utils.ts`, and (where AI is involved) `callAI`/`callAIStream` from `_shared/ai.ts`.

---

## 11. AI Layer

### 11.1 `_shared/ai.ts` — the provider adapter
Single switch: `const AI_PROVIDER = Deno.env.get("AI_PROVIDER") ?? "gemini"`.

- `callAI(system, user)` → non-streaming, routes to `callGemini` or `callClaude`. Used by `score-intent`, `check-compliance`, `auto-fix-compliance`, `discover-prospects` (entity/metadata/validation calls), `fetch-contact-info`, `fetch-signals`.
- `callAIStream(system, user)` → streaming, routes to `callGeminiStream` or `callClaudeStream`. Used only by `generate-email`.
- **Gemini**: `POST generativelanguage.googleapis.com/.../gemini-2.0-flash:generateContent` (non-stream, temp 0.3) / `:streamGenerateContent?alt=sse` (stream, temp 0.5). The streaming path **normalizes Gemini's SSE shape into Claude's** (`data: {"type":"content_block_delta","delta":{"text":...}}`) so the frontend's SSE parser never needs to know which provider is active.
- **Claude**: `POST api.anthropic.com/v1/messages`, model `claude-sonnet-4-20250514`, `max_tokens: 1000`. The streaming response body is Claude's native SSE and is **passed through directly** (already matches the shape the frontend expects).

Switching providers in production is: `supabase secrets set AI_PROVIDER=claude ANTHROPIC_API_KEY=...` then redeploy — **zero code changes**.

### 11.2 `_shared/prompts.ts` — centralized prompt library
- `complianceSystemPrompt/complianceUserPrompt` — the 7 rules (V1–V7), each mapped to a real regulatory citation (SEBI/RBI/DPDPA), asks for `{passed, flags:[{sentence, rule_violated, rule_source, suggested_fix}]}`.
- `emailSystemPrompt/emailUserPrompt` — copywriting constraints (no guaranteed outcomes, no competitor disparagement, must cite real signals, 120–180 words, subject-line-first plain-text output, banned opener phrases).
- `scoreSystemPrompt/scoreUserPrompt` — HOT(75–100)/WARM(50–74)/COLD(0–49) framework tied to regulatory pressure / funding / hiring / product-launch signals; explicitly instructs the model not to award 95+ without 3+ independent corroborating signals; returns `score, reason, signal_weights[], ai_analysis:{regulatory_triggers, icp_fit, buy_window}`.
- `entityExtractionSystemPrompt/entityExtractionUserPrompt` — strict NER: company names only, excludes people/places/regulators/generic words, returns a JSON array.
- `metadataExtractionSystemPrompt/metadataExtractionUserPrompt` — given search snippets, returns an enum-constrained `{sector, stage, hq_city}`.

---

## 12. Key End-to-End Flows

### 12.1 Auth → Landing
`LoginPage` (sign in/up or Google OAuth) → Supabase Auth session created → `AuthContext` listener fires → `checkProfile` auto-creates a blank `profiles` row if missing → route-level redirect sends the user to `/app/radar` (never `/onboarding`, regardless of whether they've set an ICP).

### 12.2 Autonomous Discovery Pipeline
```
"Discover Now" click (RadarPage)
  → POST discover-prospects
      → fetch 7 RSS feeds
      → AI: extract entity names per headline
      → SerpAPI (or AI fallback): validate each unknown entity
      → AI: extract sector/stage/hq_city
      → INSERT prospects (is_new_entrant=true, needs_validation=false)
      → INSERT signals (the triggering headline)
      → POST score-intent for that company_id
      → INSERT scan_logs
  ← toast "N new prospects discovered" + refetch()

Meanwhile, independently of the button click's response:
  scan_logs INSERT  → realtime → RadarPage's "scan-logs-notifications" channel → toast
  prospects INSERT (is_new_entrant=true) → realtime → RadarPage's
      "auto-discovered-prospects" channel → refetches unvalidatedProspects
  prospects/signals change (any) → realtime → useRealtimeProspects → refetches main list
```
This triple-realtime-subscription design is what makes the dashboard update live even if the discovery run was triggered by a **cron job** in a different browser tab/session — the UI never needs to poll.

### 12.3 Deep Scan (single card / Scan All)
`handleDeepScan` → `POST deep-scan` → SerpAPI multi-source fetch (or fallback canned headlines) → new `signals` rows → internal call to `score-intent` → `{new_score, delta}` returned → card shows a `+N`/`-N` flash (framer-motion) → the underlying `prospects` row's `UPDATE` is picked up by `useRealtimeProspects`'s realtime subscription, which refetches and re-renders the sorted list. `handleScanAll` is the same loop run sequentially across every prospect, with a progress bar bound to `scanAllProgress`.

### 12.4 ICP Editing & Rescoring
Three separate entry points write to the same `profiles.icp_definition` (+ `company_type`/`geography`): `OnboardingPage`, `RadarPage`'s ICP modal, `SettingsPage`. All three then call `score-intent {rescore_all:true}` — but **only two of the three send an Authorization header** (`OnboardingPage` does not — see §15), meaning the onboarding path's rescore uses the function's default ICP rather than what was just entered.

### 12.5 Outreach: Generate → Comply → Send
`OutreachPage`: select company + stakeholder + tone → `generate-email` streams a draft (or the local fallback template streams instead) → auto `check-compliance` (or local regex fallback) → if flagged, `auto-fix-compliance` (or local regex fix) rewrites only the bad sentences → re-check → once passed, "Mark as Contacted" writes `last_contacted` + an `emails_sent` row and auto-advances to the next uncontacted prospect. `Copy` and `Open in Gmail` are pure client-side conveniences (no backend call).

---

## 13. Design System (`src/index.css`)

- CSS custom properties (`:root`) define the **dark** theme (default): `--bg0..bg3`, `--card`, `--border`, `--teal/-dim/-glow`, `--purple/-dim/-glow`, `--coral/-glow`, `--amber/-glow`, `--text1..3`, fonts (`--font-body` = Inter, `--font-mono` = JetBrains Mono), `--sidebar-w: 220px`, `--content-max: 960px`, `--radius: 10px`.
- `[data-theme="light"]` overrides a subset of those variables and adds ~15 component-specific override blocks (`.glass`, `.sidebar`, `.sb-item`, `.kpi-card`, `.search-input`, `.input-field`, `.prospect-card`, `.toast`, `.scroll-progress`, `.btn-secondary`, `.scan-btn`, select options, beam/grain opacity, scrollbar thumb color) — brand accent colors (teal/purple/coral/amber) stay essentially the same across themes, only glow opacity shifts.
- Component class families worth knowing when editing UI: `.sidebar`/`.sb-*` (nav), `.kpi-strip`/`.kpi-card` (top stats), `.toolbar`, `.search-*`, `.macro-*` (alert pills), `.prospect-card`, `.heat-tag.hot/warm/cold`, `.score-ring-wrap`/`.score-arc` (SVG donut), `.scan-btn`/`.scan-all-btn`/`.scan-all-progress*`, `.glass` (generic translucent card used almost everywhere as a panel), `.input-field`, `.btn-primary`/`.btn-secondary`, `.toast*`, `.login-card`, `.feature-pill`.
- Keyframe animations of note: `badgePulse` (nav badge, urgency dots), `scanSlide`/`scanShimmer`/`scanPulse` (scanning affordances), `deltaFade` (score delta flash), `cardEnter` (list entrance stagger), `shimmer` (skeleton loaders), `newPulse` (NEW badge border pulse), `pulse-amber` (Auto-Discovered button).

---

## 14. Resilience & Fallback Patterns

This is the single most important cross-cutting design decision in the codebase: **almost every AI/network-dependent feature has a client-side fallback** so the demo never visibly breaks.

| Feature | Primary path | Fallback (triggers on any thrown error / non-OK response) |
|---|---|---|
| Deep scan score | `deep-scan` edge function | Random jitter (`±`few points) written directly to `prospects` from the browser |
| Scan All | Same, looped | Same, per item |
| Email generation | `generate-email` streamed SSE | `generateEmailFallback()` — local template, fake-streamed char-by-char |
| Compliance check | `check-compliance` edge function | `runClientComplianceCheck()` — local regex engine (5 of 7 rules) |
| Auto-fix | `auto-fix-compliance` edge function | Local regex `.fix()` applied per rule directly to the email body |
| Avatar upload | Supabase Storage upload | `FileReader` → base64 data URL kept only in local state |
| Company logo | Clearbit Logo API | Google Favicons API → colored initials avatar (3-tier fallback; implemented **separately** in `RadarPage.CompanyLogo`, `OutreachPage.OutreachLogo`, and inline in `CompanyDetailPage`/`OutreachPage` headers) |

**Implication for future work**: if you improve/replace the AI prompts or edge function behavior, remember the client-side fallback logic (compliance regex rules, email template, jitter ranges) will silently diverge from it and needs to be updated in parallel, or removed if no longer desired.

---

## 15. Known Issues, Inconsistencies & Things to Verify

1. **Onboarding is unreachable via normal flow.** `AuthContext.needsOnboarding` is always set to `false` and is never read by `App.jsx`; `/onboarding` isn't referenced by any redirect. The page still works if visited directly, but its "trigger a rescore after ICP save" call doesn't send an auth header (see next point), so its practical value today is limited.
2. **`OnboardingPage`'s rescore call is missing the `Authorization` header** that `RadarPage`/`SettingsPage` include, so `score-intent` can't resolve the caller's ICP and silently uses its hardcoded default string instead of what the user just typed.
3. **Two default ICP strings exist and disagree**: `score-intent` defaults to *"Series B+ fintechs in India needing compliance and onboarding automation"*; `generate-email` defaults to *"Fintech compliance and onboarding automation platform"*. Harmless today (both are just fallbacks for missing auth), but worth unifying if you touch either function.
4. **Two discovery pipelines coexist**: `discover-prospects` (fully automatic, `needs_validation:false`) is what the "Discover Now" button actually calls. `fetch-signals` (staged, `needs_validation:true`, matches the older "Option A" design from `plans/newfeatue.md`) is still deployed and documented in the README's function table but isn't invoked anywhere in the current frontend. Decide whether to keep it wired to a cron job, repurpose it, or remove it — right now it's dead code from the UI's perspective.
5. **`update-cron` depends on a Postgres RPC (`update_scan_schedule`) that isn't defined anywhere in this repo** — it must exist as hand-run SQL in the live Supabase project (per `implementation_plan.md`'s "manual steps" note). If it's missing/renamed, `SettingsPage.saveProfile()` will still persist the profile fields (that `await` happens first) but will then throw on the cron call and show a generic error toast, which can mask the fact that most of the save actually succeeded.
6. **RLS coverage vs. actual client calls**: the documented SQL only grants `SELECT` on `prospects` to authenticated users, yet the frontend does direct client-side `INSERT` (demo seeding), `UPDATE` (score jitter fallbacks, reset-scores), and `DELETE` (clear-signals) from the browser. Confirm the live project's actual policies before assuming any of these fallback paths will work in production/for all users.
7. **Client-side dedup-by-name is doing real work, not just cleanup.** Both `useRealtimeProspects` and `OutreachPage` independently re-implement "group by lowercase-trimmed name, keep highest score" because of the multiple insert paths (demo seed, `discover-prospects`, `fetch-signals`, manual seeding) that can create near-duplicate rows. If you add another insert path, replicate this dedup or (better) add a DB-level uniqueness constraint/upsert-by-name and remove the client-side workaround.
8. **`unvalidatedProspects` is a misleading variable name** in `RadarPage.jsx` — under the currently-wired `discover-prospects` pipeline these rows are already fully validated (`needs_validation:false`); the name is a holdover from the `fetch-signals`/Option-A design where they genuinely were unvalidated.
9. **`is_new_entrant` never gets cleared.** The "Freshly Discovered" carousel/modal filters by a 7-day `created_at` window, but the `NEW` badge on the regular `ProspectCard` (in the Hot/Warm/Cold lists) is driven purely by `is_new_entrant`, which is set once and never unset — so months-old companies can still show a `NEW` badge in the main list while no longer appearing in the "last 7 days" surfaces.
10. **`notifications` toggle in `SettingsPage`** is local component state only; it's never included in `saveProfile()`'s upsert payload, so it silently resets on every reload.
11. **Tailwind is configured but effectively unused.** `tailwind.config.js` defines its own separate color palette (`primary`, `secondary`, `card`, `accent-teal`, etc.) and custom animations, but the actual JSX doesn't use Tailwind utility classes anywhere in scope — all styling is via `index.css` custom classes or inline `style={}` objects. Treat `tailwind.config.js` as effectively dead configuration unless you intend to start using Tailwind utilities.
12. **`.agents/frontend.md/blostempulse_redesign.html`** is a standalone static HTML/CSS/JS prototype (custom cursor, animated SVG radar decoration) — a design exploration, **not wired into the React app**. Useful as visual reference only.
13. **Logo-fallback logic is implemented 4 separate times** (`RadarPage.CompanyLogo`, `OutreachPage.OutreachLogo`, plus inline versions in `CompanyDetailPage`'s header and `OutreachPage`'s right-panel header) with slightly different fallback chains and styling. A good candidate to consolidate into one shared component if you're touching any of them.
14. **`ScoreRing` is implemented twice** (`RadarPage`, radius 20 fixed) and (`CompanyDetailPage`, configurable `size`/`strokeWidth`) — not shared.
15. **About card in `SettingsPage`** hardcodes `"AI Engine: Gemini 2.0 Flash"` — this won't update automatically if `AI_PROVIDER` is switched to Claude in the backend; it's a display string only, not read from any env var.

---

## 16. Environment Variables & Secrets

**Frontend (`.env.local`, consumed via `import.meta.env`)**
| Variable | Used in |
|---|---|
| `VITE_SUPABASE_URL` | `src/lib/supabase.js`, every `fetch(...)` call to an Edge Function across all pages |
| `VITE_SUPABASE_ANON_KEY` | `src/lib/supabase.js` |

**Backend (`supabase secrets set ...`)**
| Secret | Required? | Used by |
|---|---|---|
| `AI_PROVIDER` | Optional (`gemini` default) | `_shared/ai.ts` |
| `GEMINI_API_KEY` | Required if `AI_PROVIDER=gemini` | `_shared/ai.ts` |
| `ANTHROPIC_API_KEY` | Required if `AI_PROVIDER=claude` | `_shared/ai.ts` |
| `SERPAPI_KEY` | Optional (functions degrade gracefully without it) | `discover-prospects`, `deep-scan`, `fetch-contact-info` |
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | Provided automatically in the Edge Function runtime | All functions that use `createClient(...)` with elevated privileges, and internal function-to-function calls (`discover-prospects`→`score-intent`, `deep-scan`→`score-intent`) |

---

## 17. Deployment

- **Frontend**: Vercel, connected to the GitHub repo. `vercel.json` sets a custom `buildCommand` (`node node_modules/vite/bin/vite.js build` — avoids depending on `vite` being globally resolvable on the build image), `outputDirectory: dist`, and a catch-all SPA rewrite (`/(.*) → /index.html`) so client-side routing works on refresh/deep-link.
- **Backend**: Supabase Cloud — Edge Functions deployed individually via `supabase functions deploy <name>` (or `--all`); database schema/RLS/RPC/cron setup is manual SQL run in the Supabase SQL editor (not checked into this repo, aside from what's described in `README.md`/`plans/implementation_plan.md`).
- `.gitignore` explicitly excludes `Builder Pack/` — described as containing "synthetic PII, proprietary regulatory references, and graded eval sets provided under hackathon NDA" — i.e. there is supplementary material for this project that is deliberately **not** in version control and not reflected in this report.

---

## 18. Non-Code Reference Docs Already in the Repo

These are useful context but are documentation/planning artifacts, not application code:

- **`README.md`** — the most complete existing overview (architecture diagram, DB schema SQL, setup instructions, edge function table). Cross-reference against this report — a few details in the README (e.g. `fetch-signals`'s described role) are slightly stale relative to the current `deep-scan`/`discover-prospects` implementation (see §15.4).
- **`plans/newfeatue.md`** — the original brainstorm that produced two design options for discovery: "Option A" (manual review of unvalidated prospects) and "Option B" (full auto-discovery). The code today has **both** implemented (`fetch-signals` ≈ Option A, `discover-prospects` ≈ Option B), with only Option B wired to the UI.
- **`plans/implementation_plan.md`** — architecture rationale, a Mermaid diagram, and a scripted "judge demo flow." Also the source for the manual-SQL/Realtime-enablement callouts referenced in §10.2/§15.5.
- **`.agents/rules/blostempulse_build_guide.md`** — the original Claude-first, prompt-by-prompt build guide (superseded by the Gemini-default + adapter approach actually implemented).
- **`.agents/rules/blostempulse_ai_swap_guide.md`** — documents exactly the `_shared/ai.ts` adapter pattern that's implemented; useful as the authoritative "how to switch providers" doc.
- **`.agents/frontend.md/blostempulse_redesign.html`** — a static design prototype, not connected to the app (see §15.12).
- **`DEMO_SCRIPT.txt`** — a timed narration script for a demo video walking through Login → Radar → Company Detail → Outreach → Settings; useful as a plain-English tour of intended user-facing behavior.

---

*End of report. This document reflects the state of the codebase as provided; always re-check the live Supabase project's schema/RLS/RPC/cron configuration directly, since a meaningful part of the backend setup (§10.2, §15.5, §15.6) lives outside this repository as manually-run SQL.*
