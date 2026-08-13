import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { callAI } from "../_shared/ai.ts";
import { corsHeaders, parseJSON } from "../_shared/utils.ts";
import { scoreSystemPrompt, scoreUserPrompt } from "../_shared/prompts.ts";
import { sanitizeForAI } from "../_shared/security.ts";

const DEFAULT_ICP = "Series B+ fintechs in India needing compliance and onboarding automation";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const body = await req.json();
    const { company_id, rescore_all, icp_definition: bodyIcp } = body;

    // Get companies to score
    let companies: any[] = [];
    if (rescore_all) {
      const { data } = await supabase.from("prospects").select("*");
      companies = data || [];
    } else if (company_id) {
      const { data } = await supabase
        .from("prospects")
        .select("*")
        .eq("id", company_id)
        .single();
      if (data) companies = [data];
    }

    // Resolve user ICP — priority:
    // 1. Body icp_definition (passed by deep-scan/discover-prospects)
    // 2. Auth header → user profile lookup
    // 3. Default fallback string
    let icpDefinition = DEFAULT_ICP;

    if (bodyIcp) {
      // Caller explicitly passed an ICP (e.g., discover-prospects looked it up)
      icpDefinition = bodyIcp;
    } else {
      // Try to resolve from the auth header (works for real user JWTs, not service-role keys)
      const authHeader = req.headers.get("Authorization")?.replace("Bearer ", "");
      if (authHeader) {
        try {
          const { data: { user } } = await supabase.auth.getUser(authHeader);
          if (user) {
            const { data: profile } = await supabase
              .from("profiles")
              .select("icp_definition")
              .eq("id", user.id)
              .single();
            if (profile?.icp_definition) icpDefinition = profile.icp_definition;
          }
        } catch (authErr) {
          // Auth lookup failed (e.g., service-role key) — use default
          console.warn("ICP auth lookup failed, using default:", authErr.message);
        }
      }
    }

    const results = [];
    const errors = [];

    for (const company of companies) {
      try {
        // Fetch top 5 recent signals
        const { data: signals } = await supabase
          .from("signals")
          .select("*")
          .eq("company_id", company.id)
          .order("fetched_at", { ascending: false })
          .limit(5);

        // Fetch active macro events for this sector
        const { data: macroEvents } = await supabase
          .from("macro_events")
          .select("*")
          .contains("sector_impact", [company.sector])
          .eq("is_active", true);

        const signalText = (signals || [])
          .map((s: any) => `- ${s.headline} (${s.source}, ${s.fetched_at})`)
          .join("\n") || "No recent signals found";

        const eventsText = (macroEvents || [])
          .map((e: any) => `- ${e.title} (${e.source})`)
          .join("\n") || "No active macro events";

        const safeSignals = sanitizeForAI(signalText);
        const safeEvents = sanitizeForAI(eventsText);
        const safeIcp = sanitizeForAI(icpDefinition);

        const { text } = await callAI(
          scoreSystemPrompt(),
          scoreUserPrompt({
            company_name: company.name,
            sector: company.sector,
            stage: company.stage,
            hq_city: company.hq_city,
            signals: safeSignals,
            macro_events: safeEvents,
            icp_definition: safeIcp,
          })
        );

        const result = parseJSON(text);

        // Process 4-Pillar Breakdown
        const pillarScores = result.pillar_scores || {
          regulatory_urgency: Math.round((Number(result.score) || 60) * 0.35),
          expansion_velocity: Math.round((Number(result.score) || 60) * 0.25),
          capital_trajectory: Math.round((Number(result.score) || 60) * 0.20),
          icp_fit: Math.round((Number(result.score) || 60) * 0.20),
        };

        const calculatedPillarTotal = Number(pillarScores.regulatory_urgency || 0) +
          Number(pillarScores.expansion_velocity || 0) +
          Number(pillarScores.capital_trajectory || 0) +
          Number(pillarScores.icp_fit || 0);

        const rawScore = Number(result.score) || calculatedPillarTotal;
        const clampedScore = isNaN(rawScore) || rawScore <= 0
          ? (50 + Math.min(40, (signals || []).length * 8))
          : Math.max(0, Math.min(100, Math.round(rawScore)));

        const enrichedAiAnalysis = {
          ...(result.ai_analysis || {}),
          pillar_scores: pillarScores,
        };

        // Update prospect in DB — check for errors
        const { error: updateErr } = await supabase
          .from("prospects")
          .update({
            intent_score: clampedScore,
            alignment_reason: result.reason || null,
            signal_weights: result.signal_weights || null,
            ai_analysis: enrichedAiAnalysis,
          })
          .eq("id", company.id);

        if (updateErr) {
          console.error(`DB update failed for "${company.name}":`, updateErr.message);
          errors.push({ company_id: company.id, name: company.name, error: updateErr.message });
        }

        results.push({
          company_id: company.id,
          name: company.name,
          score: clampedScore,
          reason: result.reason,
          signal_weights: result.signal_weights,
          ai_analysis: result.ai_analysis,
        });
      } catch (companyErr) {
        // Per-company error — log and continue (don't abort the whole batch)
        console.error(`Score failed for "${company.name}":`, companyErr.message);
        errors.push({ company_id: company.id, name: company.name, error: companyErr.message });
      }
    }

    return new Response(JSON.stringify({ results, errors }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
