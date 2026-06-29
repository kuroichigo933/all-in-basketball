import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AppNav from "@/components/AppNav";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  
  const { data: profile } = await supabase.from("profiles")
    .select("full_name, role, onboarded, tier").eq("id", user.id).single();
    
  if (profile?.tier === "free" && profile?.role !== "coach") redirect("/pricing");
  if (profile && !profile.onboarded) redirect("/onboarding");

  return (
    <div className="min-h-screen pb-20 md:pb-0">
      <AppNav role={profile?.role ?? "player"} name={profile?.full_name ?? ""} />
      <main className="mx-auto max-w-5xl px-4 py-8">{children}</main>
    </div>
  );
}
