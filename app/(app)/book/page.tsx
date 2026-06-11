import { createClient } from "@/lib/supabase/server";
import { PageTitle } from "@/components/ui";
import BookForm from "./BookForm";

export default async function Book() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const [{ data: types }, { data: slots }, { data: mine }] = await Promise.all([
    supabase.from("session_types").select("*").eq("active", true),
    supabase.from("availability_slots").select("*").eq("booked", false)
      .gte("starts_at", new Date().toISOString()).order("starts_at").limit(30),
    supabase.from("bookings")
      .select("id, status, session_types(title), availability_slots(starts_at)")
      .eq("user_id", user!.id).order("created_at", { ascending: false }).limit(10),
  ]);

  return (
    <>
      <PageTitle kicker="In-person training" title="Get in the gym with us" />
      <p className="max-w-2xl text-muted">
        The app is practice. The gym is where we sharpen the details — footwork, hand placement,
        body control. Book a session and we&apos;ll confirm it. Payment is handled at the session.
      </p>
      <div className="mt-8 grid gap-8 lg:grid-cols-[1.4fr_1fr]">
        <BookForm types={types ?? []} slots={slots ?? []} />
        <section>
          <h2 className="display baseline text-xl">Your sessions</h2>
          <div className="mt-4 space-y-3">
            {(mine ?? []).length === 0 && <p className="text-sm text-muted">No sessions booked yet.</p>}
            {(mine ?? []).map((b) => (
              <div key={b.id} className="card p-4 text-sm">
                <p className="font-semibold">{(b.session_types as any)?.title}</p>
                <p className="text-muted">{new Date((b.availability_slots as any)?.starts_at).toLocaleString()}</p>
                <p className={`mt-1 text-xs font-semibold uppercase tracking-wider
                  ${b.status === "confirmed" ? "text-make" : b.status === "cancelled" ? "text-game" : "text-wood"}`}>
                  {b.status}
                </p>
              </div>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}
