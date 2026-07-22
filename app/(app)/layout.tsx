import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AppNav from "@/components/AppNav";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  
  const [{ data: profile }, { data: subscription }] = await Promise.all([
    supabase.from("profiles")
      .select("full_name, role, onboarded, tier").eq("id", user.id).single(),
    supabase.from("subscriptions")
      .select("status").eq("user_id", user.id).maybeSingle(),
  ]);
    
  if (profile?.tier === "free" && profile?.role !== "coach") {
    const hasHadSubscription = !!subscription?.status && subscription.status !== "inactive";
    redirect(hasHadSubscription ? "/pricing?trial=expired" : "/pricing?access=required");
  }
  if (profile && !profile.onboarded) redirect("/onboarding");

  const fullName = profile?.full_name || user?.user_metadata?.full_name || "";
  const firstName = fullName.split(" ")[0] || "";

  return (
    <div className="min-h-screen pb-20 md:pb-0">
      <AppNav role={profile?.role ?? "player"} name={firstName} />
      <main className="mx-auto max-w-5xl px-4 py-8">{children}</main>
    </div>
  );
}
