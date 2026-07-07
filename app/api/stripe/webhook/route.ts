import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { stripe } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Tier } from "@/lib/tiers";

// Professional includes 4 coach film reviews per month, granted on each paid invoice.
const PROFESSIONAL_MONTHLY_CREDITS = 4;
// Basic includes NO film reviews — reset to 0 each billing cycle.
const BASIC_MONTHLY_CREDITS = 0;

function planFromPrice(priceId: string | undefined): Tier {
  if (priceId === process.env.STRIPE_PRICE_PROFESSIONAL || priceId === process.env.STRIPE_PRICE_PROFESSIONAL_YEARLY) return "professional";
  if (priceId === process.env.STRIPE_PRICE_BASIC || priceId === process.env.STRIPE_PRICE_BASIC_YEARLY) return "basic";
  return "free";
}

// Resolve a subscription's tier. The plan the user picked at checkout is carried
// in the subscription metadata (authoritative), so a paying customer is never
// left on "free" just because a price-ID env var doesn't match. An active
// subscription with an unrecognized price falls back to "basic", never "free".
function planFromSub(sub: Stripe.Subscription): Tier {
  const active = sub.status === "active" || sub.status === "trialing";
  if (!active) return "free";
  return getPlanFromSubObject(sub);
}

// Extract plan regardless of subscription status. Essential for invoice.paid
// where subscription status might still be "incomplete" during initial checkout.
function getPlanFromSubObject(sub: Stripe.Subscription): Tier {
  const meta = sub.metadata?.plan;
  if (meta === "professional" || meta === "basic") return meta;
  if (meta === "professional_yearly") return "professional";
  if (meta === "basic_yearly") return "basic";
  const byPrice = planFromPrice(sub.items.data[0]?.price.id);
  return byPrice !== "free" ? byPrice : "basic";
}

async function userIdFromCustomer(customerId: string): Promise<string | null> {
  const admin = createAdminClient();
  const { data } = await admin.from("subscriptions")
    .select("user_id").eq("stripe_customer_id", customerId).maybeSingle();
  if (data?.user_id) return data.user_id;
  const customer = await stripe.customers.retrieve(customerId);
  if (!customer.deleted && customer.metadata?.supabase_user_id) {
    return customer.metadata.supabase_user_id;
  }
  return null;
}

async function addCredits(userId: string, amount: number) {
  const admin = createAdminClient();
  const { data: row } = await admin.from("review_credits")
    .select("balance").eq("user_id", userId).maybeSingle();
  if (row) {
    await admin.from("review_credits").update({ balance: row.balance + amount }).eq("user_id", userId);
  } else {
    await admin.from("review_credits").insert({ user_id: userId, balance: amount });
  }
}

async function setCredits(userId: string, amount: number) {
  const admin = createAdminClient();
  const { data: row } = await admin.from("review_credits")
    .select("balance").eq("user_id", userId).maybeSingle();
  if (row) {
    await admin.from("review_credits").update({ balance: amount }).eq("user_id", userId);
  } else {
    await admin.from("review_credits").insert({ user_id: userId, balance: amount });
  }
}

async function ensureProfessionalCredits(userId: string) {
  const admin = createAdminClient();
  const { data: row } = await admin.from("review_credits")
    .select("balance").eq("user_id", userId).maybeSingle();
  if (!row) {
    await admin.from("review_credits").insert({ user_id: userId, balance: PROFESSIONAL_MONTHLY_CREDITS });
  } else if (row.balance === 0) {
    await admin.from("review_credits").update({ balance: PROFESSIONAL_MONTHLY_CREDITS }).eq("user_id", userId);
  }
}

async function syncSubscription(sub: Stripe.Subscription) {
  const admin = createAdminClient();
  const userId = await userIdFromCustomer(sub.customer as string);
  if (!userId) return;

  const plan: Tier = planFromSub(sub);

  // Newer Stripe API versions moved current_period_end from the subscription to
  // its items. Read either, and guard against a bad value (undefined → NaN would
  // throw on toISOString and 500 the whole webhook).
  const cpe: unknown =
    (sub as any).current_period_end ?? (sub as any).items?.data?.[0]?.current_period_end;
  const currentPeriodEnd =
    typeof cpe === "number" && Number.isFinite(cpe) ? new Date(cpe * 1000).toISOString() : null;

  await admin.from("subscriptions").upsert({
    user_id: userId,
    stripe_customer_id: sub.customer as string,
    stripe_subscription_id: sub.id,
    plan,
    status: sub.status,
    current_period_end: currentPeriodEnd,
  });
  await admin.from("profiles").update({ tier: plan }).eq("id", userId);

  // Safety net: if their subscription is active/trialing and they have the professional tier,
  // ensure they have credits initialized (resolves any webhook order race conditions).
  if (plan === "professional" && (sub.status === "active" || sub.status === "trialing")) {
    await ensureProfessionalCredits(userId);
  }
}

export async function POST(request: Request) {
  const body = await request.text();
  const signature = request.headers.get("stripe-signature");
  if (!signature) return NextResponse.json({ error: "Missing signature" }, { status: 400 });

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, signature, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  try {
  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const userId = session.metadata?.supabase_user_id ?? session.client_reference_id;
      // single review credit purchase
      if (session.mode === "payment" && session.metadata?.plan === "review_credit" && userId) {
        await addCredits(userId, 1);
      }
      // Save customer mapping and upgrade profile immediately upon subscription checkout completion
      if (session.mode === "subscription" && userId && session.customer) {
        const admin = createAdminClient();
        const rawPlan = (session.metadata?.plan as string) || "basic";
        const plan: Tier = (rawPlan === "professional_yearly" || rawPlan === "professional") ? "professional" : "basic";
        const subId = typeof session.subscription === "string" 
          ? session.subscription 
          : (session.subscription?.id || "");
          
        await admin.from("subscriptions").upsert({
          user_id: userId,
          stripe_customer_id: session.customer as string,
          stripe_subscription_id: subId,
          plan,
          status: "active",
        });
        
        await admin.from("profiles").update({ tier: plan }).eq("id", userId);
        
        if (plan === "professional") {
          await ensureProfessionalCredits(userId);
        }
      }
      break;
    }
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      await syncSubscription(event.data.object as Stripe.Subscription);
      break;
    }
    case "invoice.paid": {
      // grant monthly credits on every paid billing cycle (no rollover)
      const invoice = event.data.object as Stripe.Invoice;
      const userId = invoice.customer ? await userIdFromCustomer(invoice.customer as string) : null;
      const subId = invoice.subscription as string | null;
      if (userId) {
        let plan: Tier = "basic";
        const priceId = invoice.lines?.data?.[0]?.price?.id;
        const detectedPlan = planFromPrice(priceId);
        
        if (detectedPlan !== "free") {
          plan = detectedPlan;
        } else if (subId) {
          try {
            const sub = await stripe.subscriptions.retrieve(subId);
            plan = getPlanFromSubObject(sub);
          } catch (subErr) {
            console.error("[stripe webhook] failed to retrieve subscription as fallback:", subErr);
            // Fallback to metadata on the invoice if retrieve fails
            const meta = invoice.metadata?.plan || invoice.lines?.data?.[0]?.metadata?.plan;
            if (meta === "professional" || meta === "basic") {
              plan = meta;
            }
          }
        }
        await setCredits(userId, plan === "professional" ? PROFESSIONAL_MONTHLY_CREDITS : BASIC_MONTHLY_CREDITS);
      }
      break;
    }
  }
  } catch (err) {
    console.error(`[stripe webhook] error handling ${event.type} (${event.id}):`, err);
    return NextResponse.json({ error: "Webhook handler failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
