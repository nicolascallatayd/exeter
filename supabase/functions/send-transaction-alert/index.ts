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

    // Service role client for admin operations (triggered by database)
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { userId, transaction } = await req.json();
    
    if (!userId || !transaction) {
      return new Response(JSON.stringify({ error: "userId and transaction are required" }), {
        status: 400,
        headers: corsHeaders,
      });
    }

    // Get user's email from profile or auth
    const { data: profile } = await supabase
      .from("profiles")
      .select("email, full_name")
      .eq("id", userId)
      .single();

    const { data: authUser } = await supabase.auth.admin.getUserById(userId);
    const toEmail = profile?.email ?? authUser.user?.email;
    
    if (!toEmail) {
      return new Response(JSON.stringify({ error: "No email on file for this user" }), {
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

    // Format amount
    const formattedAmount = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(transaction.amount);

    // Format date
    const transactionDate = new Date(transaction.created_at).toLocaleString();

    // Determine transaction type and icon
    const isCredit = transaction.type === "credit";
    const transactionType = isCredit ? "Credit" : "Debit";
    const actionText = isCredit ? "received" : "sent";
    const amountPrefix = isCredit ? "+" : "-";

    // Build email content
    const subject = `Transaction Alert: ${transactionType} - ${formattedAmount}`;
    const emailBody = [
      profile?.full_name ? `Hi ${profile.full_name},` : "Hi,",
      "",
      `You have ${actionText} a transaction on your account.`,
      "",
      `Transaction Details:`,
      `-------------------`,
      `Type: ${transactionType}`,
      `Amount: ${amountPrefix}${formattedAmount}`,
      `Description: ${transaction.name}`,
      `Category: ${transaction.category}`,
      `Date: ${transactionDate}`,
      transaction.note ? `Note: ${transaction.note}` : "",
      "",
      "If you did not perform this transaction, please contact support immediately.",
      "",
      "Best regards,",
      "The Exeter Team"
    ].filter(Boolean).join("\n");

    const emailResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromEmail,
        to: toEmail,
        subject: subject,
        text: emailBody,
      }),
    });

    const emailResult = await emailResponse.json();
    if (!emailResponse.ok) {
      console.error("Resend error:", emailResult);
      return new Response(JSON.stringify({ error: emailResult?.message ?? "Failed to send transaction alert" }), {
        status: 502,
        headers: corsHeaders,
      });
    }

    return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
  } catch (err) {
    console.error("send-transaction-alert error:", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: corsHeaders,
    });
  }
});
