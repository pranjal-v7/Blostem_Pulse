import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/utils.ts";
import { callAI } from "../_shared/ai.ts";
import { sanitizeText, sanitizeForAI } from "../_shared/security.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { company_name } = await req.json();
    const safeCompanyName = sanitizeText(company_name, 100);
    const serpApiKey = Deno.env.get("SERPAPI_KEY");
    
    let snippets = "";

    // If SerpAPI is available, fetch some context
    if (serpApiKey && safeCompanyName) {
      const query = encodeURIComponent(`${safeCompanyName} India fintech official website linkedin contact email cto`);
      const serpUrl = `https://serpapi.com/search.json?q=${query}&num=5&api_key=${serpApiKey}`;
      const serpRes = await fetch(serpUrl);
      const serpData = await serpRes.json();
      snippets = (serpData.organic_results || [])
        .map((r: any) => `Title: ${sanitizeText(r.title, 200)}\nLink: ${r.link}\nSnippet: ${sanitizeText(r.snippet, 300)}`)
        .join("\n\n");
    }

    const safeSnippets = sanitizeForAI(snippets);

    // Use AI to extract the contact info from the web snippets (or hallucinate/know it if snippets are weak, but prioritize snippets)
    const systemPrompt = "You are a lead generation expert. Extract factual contact information for Indian fintech companies. Return ONLY valid JSON.";
    const userPrompt = `Find the contact information for the Indian company: "${company_name}".
Here are some search snippets:
${snippets}

If you cannot find exact executive names in the snippets, do not invent them. However, do your best to deduce the website domain and a generic contact email (e.g. contact@domain.com or info@domain.com).
For LinkedIn, format as https://linkedin.com/company/[name].

Return EXACTLY this JSON structure:
{
  "website": "example.com",
  "linkedin": "https://linkedin.com/company/example",
  "email": "contact@example.com",
  "cto": "Name or null",
  "ctoEmail": "email or null",
  "cfo": "Name or null",
  "cfoEmail": "email or null"
}`;

    const aiRes = await callAI(systemPrompt, userPrompt);
    const cleaned = aiRes.text.trim().replace(/^```json\s*/i, "").replace(/```$/, "").trim();
    const contactInfo = JSON.parse(cleaned);

    return new Response(JSON.stringify(contactInfo), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
