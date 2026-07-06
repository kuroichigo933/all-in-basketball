import { PageTitle } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import ContactForm from "./ContactForm";

const LEVELS = ["beginner", "intermediate", "advanced"];

export default async function Book() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: profile } = user
    ? await supabase.from("profiles").select("full_name, skill_level").eq("id", user.id).single()
    : { data: null };

  const defaultExperience = LEVELS.includes(profile?.skill_level ?? "")
    ? (profile!.skill_level as string)
    : "beginner";

  return (
    <>
      <PageTitle kicker="In-person training" title="Get in the gym with us" />
      <p className="max-w-2xl text-muted">
        The app is practice. The gym is where we sharpen the details — footwork, hand placement,
        body control. Send us your info and Coach Sanar will reach out to set up a session.
      </p>
      <div className="mt-8 max-w-xl">
        <ContactForm
          defaultName={profile?.full_name ?? ""}
          defaultEmail={user?.email ?? ""}
          defaultExperience={defaultExperience}
        />
      </div>
    </>
  );
}
