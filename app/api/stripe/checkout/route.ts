import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export async function POST(request: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(`${SITE}/login?next=/pricing`, 303);

  const form = await request.formData();
  const plan = String(form.get("plan") ?? "");

  const priceMap: Record<string, string | undefined> = {
    member: process.env.STRIPE_PRICE_MEMBER,
    allin: process.env.STRIPE_PRICE_ALLIN,
    review_credit: process.env.STRIPE_PRICE_REVIEW_CREDIT,
  };
  const price = priceMap[plan];
  if (!price) return NextResponse.redirect(`${SITE}/pricing`, 303);

  // reuse the Stripe customer if we have one
  const admin = createAdminClient();
  const { data: sub } = await admin.from("subscriptions")
    .select("stripe_customer_id").eq("user_id", user.id).maybeSingle();

  let customerId = sub?.stripe_customer_id ?? undefined;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email ?? undefined,
      metadata: { supabase_user_id: user.id },
    });
    customerId = customer.id;
    await admin.from("subscriptions").upsert({
      user_id: user.id, stripe_customer_id: customerId,
    });
  }

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: plan === "review_credit" ? "payment" : "subscription",
    line_items: [{ price, quantity: 1 }],
    client_reference_id: user.id,
    metadata: { supabase_user_id: user.id, plan },
    success_url: `${SITE}/dashboard?upgraded=1`,
    cancel_url: `${SITE}/pricing`,
  });

  return NextResponse.redirect(session.url!, 303);
}
