import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(new URL("/login", request.url), 303);
  }

  const settingsUrl = new URL("/settings", request.url);
  const { data: subscription } = await supabase
    .from("subscriptions")
    .select("stripe_subscription_id, status")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!subscription?.stripe_subscription_id || !["active", "trialing"].includes(subscription.status)) {
    settingsUrl.searchParams.set("error", "no-active-subscription");
    return NextResponse.redirect(settingsUrl, 303);
  }

  try {
    await stripe.subscriptions.update(subscription.stripe_subscription_id, {
      cancel_at_period_end: true,
    });
    settingsUrl.searchParams.set("cancelled", "true");
  } catch (error) {
    console.error("[stripe cancel] unable to cancel subscription:", error);
    settingsUrl.searchParams.set("error", "cancel-failed");
  }

  return NextResponse.redirect(settingsUrl, 303);
}
