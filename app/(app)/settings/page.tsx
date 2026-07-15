import { createClient } from "@/lib/supabase/server";
import { stripe } from "@/lib/stripe";

type SettingsPageProps = {
  searchParams?: { cancelled?: string; error?: string };
};

function formatDate(value: string | null) {
  if (!value) return null;
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

export default async function SettingsPage({ searchParams }: SettingsPageProps) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const [{ data: profile }, { data: subscription }] = await Promise.all([
    supabase.from("profiles").select("full_name").eq("id", user!.id).single(),
    supabase.from("subscriptions")
      .select("plan, status, current_period_end, stripe_customer_id, stripe_subscription_id")
      .eq("user_id", user!.id)
      .maybeSingle(),
  ]);

  let cancellationScheduled = false;
  if (subscription?.stripe_subscription_id) {
    try {
      const stripeSubscription = await stripe.subscriptions.retrieve(subscription.stripe_subscription_id);
      cancellationScheduled = stripeSubscription.cancel_at_period_end;
    } catch (error) {
      console.error("[settings] unable to retrieve Stripe subscription:", error);
    }
  }

  const isCancellable = !!subscription && ["active", "trialing"].includes(subscription.status);
  const endDate = formatDate(subscription?.current_period_end ?? null);
  const isTrial = subscription?.status === "trialing";

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <div>
        <p className="text-sm font-semibold uppercase tracking-widest text-game">Account</p>
        <h1 className="display mt-1 text-4xl">Settings</h1>
      </div>

      {searchParams?.cancelled === "true" && (
        <div className="rounded-xl border border-game/40 bg-game/10 p-4 text-sm text-chalk">
          Your subscription has been cancelled. You will keep access until {endDate ?? "the end of your current period"}.
        </div>
      )}
      {searchParams?.error && (
        <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-4 text-sm text-chalk">
          {searchParams.error === "no-active-subscription"
            ? "There is no active subscription to cancel."
            : "We could not cancel your subscription. Please try again or use the billing portal below."}
        </div>
      )}

      <section className="rounded-2xl border border-line bg-charcoal p-6">
        <h2 className="text-lg font-bold">Profile</h2>
        <dl className="mt-4 space-y-3 text-sm">
          <div className="flex justify-between gap-4"><dt className="text-muted">Name</dt><dd>{profile?.full_name || "Not set"}</dd></div>
          <div className="flex justify-between gap-4"><dt className="text-muted">Email</dt><dd>{user?.email}</dd></div>
        </dl>
      </section>

      <section className="rounded-2xl border border-line bg-charcoal p-6">
        <h2 className="text-lg font-bold">Subscription</h2>
        <dl className="mt-4 space-y-3 text-sm">
          <div className="flex justify-between gap-4"><dt className="text-muted">Plan</dt><dd className="capitalize">{subscription?.plan ?? "Free"}</dd></div>
          <div className="flex justify-between gap-4"><dt className="text-muted">Status</dt><dd className="capitalize">{cancellationScheduled ? "Cancels at period end" : subscription?.status ?? "Inactive"}</dd></div>
          {endDate && <div className="flex justify-between gap-4"><dt className="text-muted">{cancellationScheduled ? "Access ends" : isTrial ? "Trial ends" : "Renews"}</dt><dd>{endDate}</dd></div>}
        </dl>

        <div className="mt-6 flex flex-wrap items-center gap-4">
          {isCancellable && !cancellationScheduled && (
            <form action="/api/stripe/cancel" method="POST">
              <button className="rounded-lg border border-red-500/60 px-4 py-2 text-sm font-semibold text-red-300 hover:bg-red-500/10">
                {isTrial ? "Cancel free trial" : "Cancel subscription"}
              </button>
            </form>
          )}
          {subscription?.stripe_customer_id && (
            <form action="/api/stripe/portal" method="POST">
              <button className="text-sm font-semibold text-muted underline hover:text-chalk">Open billing portal</button>
            </form>
          )}
        </div>

        {cancellationScheduled && (
          <p className="mt-5 text-sm text-muted">No further charges are scheduled. Your access remains available until {endDate ?? "the end of the current period"}.</p>
        )}
      </section>
    </div>
  );
}
