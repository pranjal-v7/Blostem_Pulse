import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/utils.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { frequency } = await req.json();

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Translate the UI frequency selection to a UTC cron schedule
    // IST is UTC+5:30
    // "2x": 9:00 AM IST (3:30 UTC) and 9:00 PM IST (15:30 UTC) -> '30 3,15 * * *'
    // "4x": 3AM IST (21:30 UTC prev), 9AM IST (3:30 UTC), 3PM IST (9:30 UTC), 9PM IST (15:30 UTC) -> '30 3,9,15,21 * * *'
    let cronExpr = "";
    if (frequency === "2x") {
      cronExpr = "30 3,15 * * *";
    } else if (frequency === "4x") {
      cronExpr = "30 3,9,15,21 * * *";
    } else if (frequency === "manual") {
      cronExpr = "manual";
    } else {
      throw new Error("Invalid frequency");
    }

    // Call a database function to update pg_cron schedule
    // Requires 'update_scan_schedule' RPC to be created in Supabase SQL editor.
    // If the RPC doesn't exist, we catch and return a descriptive error.
    try {
      const { data, error } = await supabase.rpc("update_scan_schedule", {
        cron_expr: cronExpr,
        project_url: Deno.env.get("SUPABASE_URL"),
        service_role_key: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
      });

      if (error) {
        console.warn("update_scan_schedule RPC failed:", error.message);
        // Return success for the schedule interpretation even if pg_cron update failed
        return new Response(JSON.stringify({
          success: false,
          schedule: cronExpr,
          warning: `Schedule parsed but pg_cron update failed: ${error.message}. The 'update_scan_schedule' RPC may not exist yet.`
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    } catch (rpcErr) {
      console.warn("update_scan_schedule RPC call threw:", rpcErr.message);
      return new Response(JSON.stringify({
        success: false,
        schedule: cronExpr,
        warning: `Schedule parsed but pg_cron update failed: ${rpcErr.message}. The 'update_scan_schedule' RPC may not exist yet.`
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true, schedule: cronExpr }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
