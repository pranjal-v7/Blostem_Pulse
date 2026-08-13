// ============================================================
// discover-prospects — Full Auto-Discovery Pipeline (Option B)
// Stage 1: Entity extraction from RSS headlines
// Stage 2: SerpAPI validation (noise filtering)
// Stage 3: Metadata extraction + auto-insert + auto-score
// ============================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { callAI } from "../_shared/ai.ts";
import { corsHeaders, parseJSON } from "../_shared/utils.ts";
import {
  entityExtractionSystemPrompt,
  entityExtractionUserPrompt,
  metadataExtractionSystemPrompt,
  metadataExtractionUserPrompt,
} from "../_shared/prompts.ts";
import { sanitizeText, validateExternalURL } from "../_shared/security.ts";

const RSS_FEEDS = [
  { name: "Inc42", url: "https://inc42.com/feed/" },
  { name: "ETBFSI", url: "https://etbfsi.com/feed/" },
  { name: "YourStory", url: "https://yourstory.com/feed" },
  { name: "Entrackr", url: "https://entrackr.com/feed/" },
  { name: "LiveMint", url: "https://www.livemint.com/rss/companies" },
  { name: "Moneycontrol", url: "https://www.moneycontrol.com/rss/business.xml" },
  { name: "Economic Times", url: "https://economictimes.indiatimes.com/rssfeedstopstories.cms" },
  { name: "Financial Express", url: "https://www.financialexpress.com/industry/banking-finance/feed/" },
  { name: "Business Standard", url: "https://www.business-standard.com/rss/finance-103.rss" },
  { name: "BusinessLine", url: "https://www.thehindubusinessline.com/money-and-banking/feeder/default.rss" },
  { name: "Medianama", url: "https://www.medianama.com/feed/" },
];

// ─── STAGE 2: SerpAPI validation ─────────────────────────────
// Returns { valid: boolean, snippets: string } for a company name
async function validateWithSerp(
  companyName: string,
  serpApiKey: string
): Promise<{ valid: boolean; snippets: string }> {
  const query = encodeURIComponent(`${companyName} India fintech funding OR launch`);
  const url = `https://serpapi.com/search.json?q=${query}&num=5&api_key=${serpApiKey}`;

  try {
    const res = await fetch(url);
    if (!res.ok) return { valid: false, snippets: "" };
    const data = await res.json();
    const results = data.organic_results || [];

    // Require 2+ results to filter noise
    if (results.length < 2) return { valid: false, snippets: "" };

    const snippets = results
      .slice(0, 4)
      .map((r: any) => `Source: ${r.displayed_link}\n${r.snippet || r.title}`)
      .join("\n\n");

    return { valid: true, snippets };
  } catch {
    return { valid: false, snippets: "" };
  }
}

// ─── STAGE 2 FALLBACK: AI plausibility check ─────────────────
// When SERPAPI_KEY is not set, use AI to assess if the entity
// sounds like a real Indian fintech company (not noise)
async function validateWithAI(
  companyName: string,
  sourceHeadline: string
): Promise<{ valid: boolean; snippets: string }> {
  const systemPrompt =
    "You are an Indian fintech analyst. Return ONLY valid JSON. Start with { and end with }.";
  const userPrompt = `Is "${companyName}" a real Indian fintech/NBFC/payments/lending company?
Context headline: "${sourceHeadline}"

Rules:
- valid=true if it sounds like a specific company name (not a generic word, government body, or person)
- valid=true if the headline context suggests it's a financial services business
- valid=false if it's a generic term, regulatory body (RBI, SEBI), person name, or city name

Return ONLY: { "valid": true|false, "reason": "<one sentence>" }`;

  try {
    const { text } = await callAI(systemPrompt, userPrompt);
    const result = parseJSON(text);
    const snippets = result.valid
      ? `${companyName} appears in Indian fintech news: "${sourceHeadline}"`
      : "";
    return { valid: result.valid === true, snippets };
  } catch {
    return { valid: false, snippets: "" };
  }
}

// ─── STAGE 3: Extract metadata from snippets ─────────────────
async function extractMetadata(
  companyName: string,
  snippets: string
): Promise<{ sector: string; stage: string; hq_city: string }> {
  try {
    const { text } = await callAI(
      metadataExtractionSystemPrompt(),
      metadataExtractionUserPrompt(companyName, snippets)
    );
    const result = parseJSON(text);
    return {
      sector: result.sector || "Other",
      stage: result.stage || "Unknown",
      hq_city: result.hq_city || "India",
    };
  } catch {
    return { sector: "Other", stage: "Unknown", hq_city: "India" };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const serpApiKey = Deno.env.get("SERPAPI_KEY") || "";
    const usingSerp = serpApiKey.length > 0;

    // Look up the first available user ICP from profiles
    // (discover-prospects runs as a service-role function, so we can't resolve a specific user)
    let userIcp = "";
    try {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("icp_definition")
        .not("icp_definition", "is", null)
        .limit(1);
      if (profiles?.[0]?.icp_definition) {
        userIcp = profiles[0].icp_definition;
      }
    } catch (_) {
      // Non-fatal — will use default ICP in score-intent
    }

    // Fetch all known prospect names for dedup check
    const { data: knownProspects } = await supabase
      .from("prospects")
      .select("id, name");
    const knownNames = new Set(
      (knownProspects || []).map((p: any) => p.name.toLowerCase())
    );

    // Collect all unique headlines across feeds
    const allHeadlines: { title: string; link: string; source: string }[] = [];

    for (const feed of RSS_FEEDS) {
      try {
        const res = await fetch(feed.url, {
          headers: { "User-Agent": "BlostemPulse/1.0" },
        });
        if (!res.ok) continue;

        const xml = await res.text();
        const items = xml.match(/<item>([\s\S]*?)<\/item>/gi) || [];

        for (const item of items.slice(0, 15)) {
          const titleMatch =
            item.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/) ||
            item.match(/<title>(.*?)<\/title>/);
          const linkMatch = item.match(/<link>(.*?)<\/link>/);
          if (!titleMatch || !linkMatch) continue;
          allHeadlines.push({
            title: titleMatch[1].trim(),
            link: linkMatch[1].trim(),
            source: feed.name,
          });
        }
      } catch (feedErr) {
        console.error(`Feed ${feed.name} failed:`, feedErr);
      }
    }

    const discovered: any[] = [];
    const processedEntities = new Set<string>(); // avoid re-processing same name from different feeds

    for (const { title, link, source } of allHeadlines) {
      // ── STAGE 1: Extract entity names from headline ───────────
      let entities: string[] = [];
      try {
        const { text } = await callAI(
          entityExtractionSystemPrompt(),
          entityExtractionUserPrompt(title)
        );
        const cleaned = text.trim().replace(/^```json\s*/i, "").replace(/```$/, "").trim();
        const parsed = JSON.parse(cleaned);
        entities = Array.isArray(parsed) ? parsed : [];
      } catch {
        continue;
      }

      for (const entityName of entities) {
        if (!entityName || entityName.length < 3 || entityName.length > 80) continue;
        const entityKey = entityName.toLowerCase();

        // Skip if already known or already processed this run
        if (knownNames.has(entityKey) || processedEntities.has(entityKey)) continue;
        processedEntities.add(entityKey);

        // ── STAGE 2: Validate — is this a real company? ─────────
        const { valid, snippets } = usingSerp
          ? await validateWithSerp(entityName, serpApiKey)
          : await validateWithAI(entityName, title);

        if (!valid) {
          console.log(`Filtered noise: "${entityName}" (failed validation)`);
          continue;
        }

        // ── STAGE 3A: Extract metadata ───────────────────────────
        const { sector, stage, hq_city } = await extractMetadata(
          entityName,
          snippets || title
        );

        // ── STAGE 3B: Auto-insert as validated prospect ──────────
        const { data: inserted, error: insertErr } = await supabase
          .from("prospects")
          .insert({
            name: entityName,
            sector,
            stage,
            hq_city,
            website: "",
            is_new_entrant: true,
            needs_validation: false,      // Option B: fully auto, no human review
            discovery_source: source,
            discovery_headline: title.slice(0, 300),
            intent_score: null,           // score-intent will populate this
          })
          .select()
          .single();

        if (insertErr || !inserted) {
          console.error(`Insert failed for "${entityName}":`, insertErr);
          continue;
        }

        // Add the triggering headline as first signal
        await supabase.from("signals").insert({
          company_id: inserted.id,
          headline: title,
          source,
          url: link,
          score_contribution: 10,
        });

        // Track for dedupe across this run
        knownNames.add(entityKey);

        // ── STAGE 3C: Auto-score immediately ────────────────────
        try {
          const scoreRes = await fetch(
            `${Deno.env.get("SUPABASE_URL")}/functions/v1/score-intent`,
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                company_id: inserted.id,
                ...(userIcp ? { icp_definition: userIcp } : {}),
              }),
            }
          );
          const scoreData = await scoreRes.json();
          const score = scoreData.results?.[0]?.score;
          console.log(`Scored "${entityName}": ${score}`);
        } catch (scoreErr) {
          console.warn(`Score failed for "${entityName}":`, scoreErr);
          // Non-fatal — company is in DB, score will run next cycle
        }

        discovered.push({
          name: entityName,
          sector,
          stage,
          hq_city,
          source,
          validated_via: usingSerp ? "serpapi" : "ai",
        });

        console.log(`✅ Discovered: "${entityName}" (${sector}, ${stage}, ${hq_city})`);
      }
    }

    // Log the scan result for UI notifications
    await supabase.from("scan_logs").insert({
      prospects_found: discovered.length,
      headlines_processed: allHeadlines.length,
      method: usingSerp ? "serpapi" : "ai-fallback",
    });

    return new Response(
      JSON.stringify({
        discovered: discovered.length,
        companies: discovered,
        validation_method: usingSerp ? "serpapi" : "ai-fallback",
        headlines_processed: allHeadlines.length,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
