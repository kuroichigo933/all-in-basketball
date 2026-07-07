import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export async function POST(request: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  
  const isJson = request.headers.get("content-type")?.includes("application/json");
  if (!user) {
    if (isJson) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return NextResponse.redirect(`${SITE}/login?next=/pricing`, 303);
  }

  let plan = "";
  if (isJson) {
    const body = await request.json();
    plan = String(body.plan ?? "");
  } else {
    const form = await request.formData();
    plan = String(form.get("plan") ?? "");
  }

  const priceMap: Record<string, string | undefined> = {
    basic: process.env.STRIPE_PRICE_BASIC,
    professional: process.env.STRIPE_PRICE_PROFESSIONAL,
  };
  
  const price = priceMap[plan];
  if (!price) {
    if (isJson) return NextResponse.json({ error: "Invalid plan" }, { status: 400 });
    return NextResponse.redirect(`${SITE}/pricing`, 303);
  }

  // reuse the Stripe customer if we have one
  const admin = createAdminClient();
  const { data: sub } = await admin.from("subscriptions")
    .select("stripe_customer_id").eq("user_id", user.id).maybeSingle();

  const customerId = sub?.stripe_customer_id ?? undefined;

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    customer_email: customerId ? undefined : (user.email ?? undefined),
    mode: "subscription",
    line_items: [{ price, quantity: 1 }],
    allow_promotion_codes: true,
    // Don't force a card when nothing is owed (e.g. a 100%-off code) — the $0
    // checkout still completes and creates the subscription, so the webhook
    // grants the chosen tier without a payment method.
    payment_method_collection: "if_required",
    client_reference_id: user.id,
    metadata: { supabase_user_id: user.id, plan },
    // Stamp the chosen plan onto the subscription so the webhook can grant the
    // right tier from metadata — independent of price-ID env matching.
    subscription_data: { metadata: { supabase_user_id: user.id, plan } },
    success_url: `${SITE}/dashboard?upgraded=1`,
    cancel_url: `${SITE}/pricing`,
  });

  if (isJson) {
    return NextResponse.json({ url: session.url });
  }
  return NextResponse.redirect(session.url!, 303);
}
