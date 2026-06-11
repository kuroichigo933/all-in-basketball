import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { completeOnboarding } from "../(app)/actions";

const GOALS = [
  ["shooting", "Shooting"], ["handles", "Ball handling"], ["finishing", "Finishing"],
  ["defense", "Defense"], ["footwork", "Footwork"], ["conditioning", "Conditioning"],
];

function Choice({ name, value, label, type = "radio" }: { name: string; value: string; label: string; type?: "radio" | "checkbox" }) {
  return (
    <label className="cursor-pointer">
      <input type={type} name={name} value={value} className="peer sr-only" />
      <span className="block rounded-card border border-line px-4 py-3 text-sm font-semibold text-muted
        peer-checked:border-game peer-checked:text-game">{label}</span>
    </label>
  );
}

export default async function Onboarding() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase.from("profiles").select("onboarded").eq("id", user.id).single();
  if (profile?.onboarded) redirect("/dashboard");

  return (
    <main className="mx-auto max-w-2xl px-4 py-12 pb-24">
      <p className="text-xs uppercase tracking-[0.2em] text-game">Welcome to All In</p>
      <h1 className="display mt-2 text-4xl">Let&apos;s build your plan</h1>
      <p className="mt-2 text-muted">Sixty seconds. We&apos;ll point you at the right program.</p>

      <form action={completeOnboarding} className="mt-10 space-y-10">
        <fieldset>
          <legend className="display mb-3 text-lg">Who&apos;s this account for?</legend>
          <div className="grid grid-cols-2 gap-3">
            <Choice name="role" value="player" label="I'm the player" />
            <Choice name="role" value="parent" label="I'm a parent" />
          </div>
        </fieldset>
        <fieldset>
          <legend className="display mb-3 text-lg">Age group</legend>
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-5">
            {[["u10","Under 10"],["u13","11–13"],["u15","14–15"],["u18","16–18"],["adult","Adult"]].map(([v,l]) =>
              <Choice key={v} name="age_group" value={v} label={l} />)}
          </div>
        </fieldset>
        <fieldset>
          <legend className="display mb-3 text-lg">Position</legend>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[["guard","Guard"],["wing","Wing"],["big","Big"],["unsure","Not sure yet"]].map(([v,l]) =>
              <Choice key={v} name="position" value={v} label={l} />)}
          </div>
        </fieldset>
        <fieldset>
          <legend className="display mb-3 text-lg">Where&apos;s your game right now?</legend>
          <div className="grid grid-cols-3 gap-3">
            {[["beginner","Beginner"],["intermediate","Intermediate"],["advanced","Advanced"]].map(([v,l]) =>
              <Choice key={v} name="skill_level" value={v} label={l} />)}
          </div>
        </fieldset>
        <fieldset>
          <legend className="display mb-3 text-lg">What do you want to work on? <span className="text-sm text-muted normal-case">(pick any)</span></legend>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {GOALS.map(([v, l]) => <Choice key={v} name="goals" value={v} label={l} type="checkbox" />)}
          </div>
        </fieldset>
        <button className="btn-game w-full">Build my plan</button>
      </form>
    </main>
  );
}
