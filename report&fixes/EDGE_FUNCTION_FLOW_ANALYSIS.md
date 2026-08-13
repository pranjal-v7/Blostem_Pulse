Good question — let me trace this precisely through the actual code rather than the docs, because there's a real gap between what the README/prompts *claim* happens and what the code *actually* does.

## Part 1 — How `score-intent` actually produces a score

**File: `supabase/functions/score-intent/index.ts`**

```ts
const authHeader = req.headers.get("Authorization")?.replace("Bearer ", "");
let icpDefinition = "Series B+ fintechs in India needing compliance and onboarding automation";
if (authHeader) {
  const { data: { user } } = await supabase.auth.getUser(authHeader);
  if (user) {
    const { data: profile } = await supabase.from("profiles").select("icp_definition")...
    if (profile?.icp_definition) icpDefinition = profile.icp_definition;
  }
}
```

Then, per company: pull last 5 `signals`, pull `macro_events` where `sector_impact` contains `company.sector`, build the prompt (`scoreSystemPrompt`/`scoreUserPrompt`), call the AI, `parseJSON(text)`, and `UPDATE prospects SET intent_score, alignment_reason, signal_weights, ai_analysis`.

Mechanically, yes — this works: it builds a real prompt from real signals, calls a real model, writes a real column. But there are four concrete problems in this function itself:

1. **No clamping/validation of the AI's output.** `result.score` is trusted as-is. Nothing checks it's an integer 0–100. If the model hallucinates `"score": "high"` or `142`, that goes straight into `prospects.intent_score`.
2. **The DB write isn't checked.** `await supabase.from("prospects").update(...)` — the `{data, error}` result is never inspected. If RLS blocks the write or there's a type mismatch, the function still reports success in its response.
3. **`parseJSON` throws on any non-JSON preamble** (it only strips leading/trailing ```` ```json ```` fences, nothing else), and that throw isn't caught per-company inside the loop — it bubbles to the outer `catch` and 500s the *whole* request. For `rescore_all`, this means: companies processed earlier in the loop **already got their DB rows updated** (each `update` is awaited before moving to the next company), but the response comes back as an error. Partial, silent, non-atomic rescoring.
4. **`rescore_all` is a sequential `for` loop**, not `Promise.all`. Each iteration is 2 DB reads + 1 AI round-trip + 1 DB write. With enough prospects (and this app auto-grows its own prospect count via discovery), this is a real Edge Function timeout risk.

## Part 2 — The bug that actually breaks personalization

This is the important one. `score-intent` gets triggered from **four** places. Only two of them send a real user session token:

| Caller | Auth header sent |
|---|---|
| `RadarPage.saveIcp()` (ICP modal "Save & Rescore All") | ✅ real browser session JWT |
| `OnboardingPage.handleSubmit()` | ❌ none at all |
| `deep-scan/index.ts` → internal call | ⚠️ `SUPABASE_SERVICE_ROLE_KEY` |
| `discover-prospects/index.ts` → internal call | ⚠️ `SUPABASE_SERVICE_ROLE_KEY` |

```ts
// deep-scan/index.ts
headers: { "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}` }
```

The service role key **is** a JWT, but it's a project-level key with `role: service_role` — it doesn't correspond to any row in `auth.users`. When `score-intent` runs `supabase.auth.getUser(authHeader)` on it, that lookup fails to resolve a user, `user` is falsy, and the function silently falls through to the hardcoded default ICP string.

**Net effect:** every automatic score (single "Scan" button, "Scan All Live", and every company auto-discovered by the RSS pipeline) is scored against the generic default ICP — *not* whatever ICP the account actually configured. The only path that ever uses the real ICP is manually clicking "Save & Rescore All" in the Radar page's ICP modal — and the very next Deep Scan on any company immediately overwrites that with a generic-ICP score again. The "AI scores against *your* ICP" pitch doesn't actually hold up for the two flows (auto-discovery, deep scan) that produce the bulk of the scores in the app.

## Part 3 — Does Gemini actually "verify" companies from SerpAPI data?

This is where the code diverges most from what the naming suggests. Look at `discover-prospects/index.ts`, Stage 2:

```ts
async function validateWithSerp(companyName, serpApiKey) {
  const query = encodeURIComponent(`${companyName} India fintech funding OR launch`);
  const url = `https://serpapi.com/search.json?q=${query}&num=5&api_key=${serpApiKey}`;
  const res = await fetch(url);
  const data = await res.json();
  const results = data.organic_results || [];
  if (results.length < 2) return { valid: false, snippets: "" };
  const snippets = results.slice(0, 4).map(r => `Source: ${r.displayed_link}\n${r.snippet || r.title}`).join("\n\n");
  return { valid: true, snippets };
}
```

**There is no AI call in this function at all.** "Validation" here is purely `organic_results.length >= 2`. No model ever looks at the search results and judges whether they're actually *about* this company as a real business — it's a bare result-count threshold. A name that happens to share keywords with two unrelated articles (e.g. a generic-sounding fabricated name that coincides with other "fintech...funding" news) would pass this check just as easily as a real company.

The AI-based validator does exist:

```ts
async function validateWithAI(companyName, sourceHeadline) {
  const userPrompt = `Is "${companyName}" a real Indian fintech/NBFC/payments/lending company?
Context headline: "${sourceHeadline}" ...`;
  const { text } = await callAI(systemPrompt, userPrompt);
  ...
}
```

— but it's only reached here:

```ts
const { valid, snippets } = usingSerp
  ? await validateWithSerp(entityName, serpApiKey)
  : await validateWithAI(entityName, title);
```

`usingSerp` is true whenever `SERPAPI_KEY` is set — i.e. in the intended "real" production configuration. So **in the normal/expected setup, the AI never sees the SerpAPI results and plays no role in verification at all.** It's only invoked as a fallback when the SerpAPI key is *missing*, and even then it's a weak check: it's given the same single RSS headline that produced the candidate name in Stage 1 (no fresh search evidence), so it's effectively the same model re-asked to confirm its own prior guess from the same input — a self-correlated check, not an independent one.

Where AI *does* touch the SerpAPI snippets is Stage 3, `extractMetadata()` — but that step assumes the company is already validated; it only extracts `sector/stage/hq_city`, it doesn't re-judge legitimacy. On failure it silently defaults to `sector: "Fintech"`, `stage: "Unknown"`, `hq_city: "India"` — and `"Fintech"` isn't even one of the nine enum values the prompt itself asks for (`Lending, Payments, Insurtech, Neobank, NBFC, WealthTech, RegTech, B2B Fintech, Other`), which then silently breaks the sector-matching `.contains('sector_impact', [sector])` lookups used both by `score-intent` and `CompanyDetailPage` for macro events.

## Part 4 — The full discover→score chain, traced end to end

```
RSS fetch (7 feeds, ≤15 items each → ≤105 headlines)
  → for EACH headline, sequentially:
      AI call: entity extraction (Stage 1)
      → for EACH entity found:
          SerpAPI call (result-count check only — no AI) OR AI plausibility fallback (Stage 2)
          → if valid:
              AI call: metadata extraction (Stage 3)
              → INSERT prospects + INSERT signals
              → AWAITED call to score-intent, using SERVICE ROLE KEY as auth
                  → generic default ICP used (see Part 2)
                  → AI call: scoring
                  → UPDATE prospects.intent_score (unchecked write)
```

Every one of those AI/network calls is sequential and `await`ed inline in nested `for` loops — nothing is batched or parallelized. With up to 105 headlines each potentially triggering 1–3 downstream AI calls, this is a genuinely large number of sequential round trips in a single Edge Function invocation, with no partial-progress checkpointing if it times out midway (though partial DB writes up to that point do persist).

## Verdict

**It runs, and it does produce numbers that end up on screen — but it doesn't work the way its own naming and prompts claim to:**

- ✅ The scoring prompt itself is well-constructed (signals + macro events + ICP + explicit HOT/WARM/COLD thresholds + anti-hallucination instruction for 95+ scores).
- ✅ The provider-swap adapter genuinely works — Gemini and Claude are interchangeable via one env var with no code changes.
- ❌ "Verified by Gemini" is not what happens for company validation in the standard (SerpAPI-configured) setup — it's a bare `count >= 2` check with zero semantic verification.
- ❌ "Scored against your ICP" is broken for both automatic scoring paths (single deep-scan, scan-all, and every auto-discovered company) due to the service-role-key-as-user-token bug — they all silently fall back to a hardcoded generic ICP string.
- ⚠️ No output validation/clamping on AI responses and no DB-write error checking mean bad AI output or blocked writes fail silently rather than surfacing anywhere.
- ⚠️ Fully sequential, deeply nested `await` chains in both `rescore_all` and `discover-prospects` create real timeout exposure as the prospect/headline count grows.

If you want, I can go fix the auth-propagation bug first (it's a small, contained change — pass the real user's JWT through from the frontend into `deep-scan`/`discover-prospects`, or have those functions look up a "default" profile's ICP explicitly instead of relying on `getUser` against a service key), since that's the one silently undermining the core "personalized scoring" pitch.
