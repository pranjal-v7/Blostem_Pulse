import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { callAIStream } from "../_shared/ai.ts";
import { corsHeaders } from "../_shared/utils.ts";
import { emailSystemPrompt, emailUserPrompt } from "../_shared/prompts.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { company_id, stakeholder, tone } = await req.json();

    // Fetch company
    const { data: company } = await supabase
      .from("prospects")
      .select("*")
      .eq("id", company_id)
      .single();

    if (!company) throw new Error("Company not found");

    // Fetch top 3 recent signals for personalisation
    const { data: signals } = await supabase
      .from("signals")
      .select("*")
      .eq("company_id", company_id)
      .order("fetched_at", { ascending: false })
      .limit(3);

    // Fetch user ICP
    const authHeader = req.headers.get("Authorization")?.replace("Bearer ", "");
    let icpDefinition = "Series B+ fintechs in India needing compliance and onboarding automation";
    if (authHeader) {
      const { data: { user } } = await supabase.auth.getUser(authHeader);
      if (user) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("icp_definition")
          .eq("id", user.id)
          .single();
        if (profile?.icp_definition) icpDefinition = profile.icp_definition;
      }
    }

    const signalText = (signals || [])
      .map((s: any) => `- ${s.headline} (${s.source})`)
      .join("\n") || "No signals available — write based on sector context.";

    const stream = await callAIStream(
      emailSystemPrompt(),
      emailUserPrompt({
        company_name: company.name,
        sector: company.sector,
        stage: company.stage,
        hq_city: company.hq_city,
        alignment_reason: company.alignment_reason || "",
        signals: signalText,
        icp_definition: icpDefinition,
        stakeholder,
        tone,
      })
    );

    return new Response(stream, {
      headers: {
        ...corsHeaders,
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Transfer-Encoding": "chunked",
      },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
