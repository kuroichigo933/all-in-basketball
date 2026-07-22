import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSiteUrl } from "@/lib/site-url";

const SITE = getSiteUrl();

export async function POST() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(`${SITE}/login`, 303);

  const admin = createAdminClient();
  const { data: sub } = await admin.from("subscriptions")
    .select("stripe_customer_id").eq("user_id", user.id).maybeSingle();
  if (!sub?.stripe_customer_id) return NextResponse.redirect(`${SITE}/pricing`, 303);

  const session = await stripe.billingPortal.sessions.create({
    customer: sub.stripe_customer_id,
    return_url: `${SITE}/settings`,
  });
  return NextResponse.redirect(session.url, 303);
}
