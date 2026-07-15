// set-user-offline Edge Function
// sendBeacon으로 호출되며 Authorization 헤더 없이 동작
// userId만으로 is_online = false 처리

import { createClient } from "jsr:@supabase/supabase-js@2.49.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { userId } = body as { userId: string };

    if (!userId) {
      return new Response(JSON.stringify({ success: false, error: "userId required" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }

    const serviceSupabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const [usersResult] = await Promise.all([
      serviceSupabase.from("users").update({ is_online: false }).eq("id", userId),
      serviceSupabase.from("online_sessions").delete().eq("user_id", userId),
    ]);

    if (usersResult.error) {
      return new Response(JSON.stringify({ success: false, error: usersResult.error.message }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ success: false, error: err.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
