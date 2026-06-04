import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
        status: 401,
        headers: corsHeaders,
      });
    }

    // User-scoped client: auth.uid() resolves to the caller in RPCs/RLS.
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: corsHeaders,
      });
    }

    const { accountId } = await req.json();
    if (!accountId || typeof accountId !== "string") {
      return new Response(JSON.stringify({ error: "accountId is required" }), {
        status: 400,
        headers: corsHeaders,
      });
    }

    // Resolve the recipient address (own profile is readable under RLS).
    const { data: profile } = await supabase
      .from("profiles")
      .select("email, full_name")
      .eq("id", user.id)
      .single();

    const toEmail = profile?.email ?? user.email;
    if (!toEmail) {
      return new Response(JSON.stringify({ error: "No email on file for this account" }), {
        status: 400,
        headers: corsHeaders,
      });
    }

    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    const fromEmail = Deno.env.get("SUPPORT_FROM_EMAIL");
    if (!resendApiKey || !fromEmail) {
      return new Response(JSON.stringify({ error: "Missing RESEND_API_KEY or SUPPORT_FROM_EMAIL" }), {
        status: 500,
        headers: corsHeaders,
      });
    }

    const code = String(Math.floor(100000 + Math.random() * 900000));

    // Store first — this also validates that the account belongs to the caller.
    const { data: storeData, error: storeError } = await supabase.rpc("store_transfer_otp", {
      p_account_id: accountId,
      p_code: code,
    });
    if (storeError) {
      console.error("store_transfer_otp error:", storeError);
      return new Response(JSON.stringify({ error: "Failed to store OTP" }), {
        status: 500,
        headers: corsHeaders,
      });
    }
    const stored = storeData as { ok: boolean; error?: string };
    if (!stored?.ok) {
      return new Response(JSON.stringify({ error: stored?.error ?? "Failed to store OTP" }), {
        status: 400,
        headers: corsHeaders,
      });
    }

    const emailResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromEmail,
        to: toEmail,
        subject: "Your transfer verification code",
        text: [
          profile?.full_name ? `Hi ${profile.full_name},` : "Hi,",
          "",
          `Your transfer verification code is: ${code}`,
          "It expires in 5 minutes and can be used once. Do not share it with anyone.",
          "",
          "If you did not request a transfer, you can safely ignore this email.",
        ].join("\n"),
      }),
    });

    const emailResult = await emailResponse.json();
    if (!emailResponse.ok) {
      console.error("Resend error:", emailResult);
      return new Response(JSON.stringify({ error: emailResult?.message ?? "Failed to send verification code" }), {
        status: 502,
        headers: corsHeaders,
      });
    }

    return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
  } catch (err) {
    console.error("send-transfer-otp error:", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: corsHeaders,
    });
  }
});
