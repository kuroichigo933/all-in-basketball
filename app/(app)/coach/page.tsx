import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageTitle, Stat } from "@/components/ui";
import { setBookingStatus } from "../actions";
import AddSlot from "./AddSlot";

export default async function CoachDesk() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: me } = await supabase.from("profiles").select("role").eq("id", user!.id).single();
  if (me?.role !== "coach") redirect("/dashboard");

  const [{ data: queue }, { data: bookings }] = await Promise.all([
    supabase.from("review_submissions")
      .select("id, focus, notes, status, created_at, profiles(full_name)")
      .neq("status", "complete").order("created_at"),
    supabase.from("bookings")
      .select("id, status, note, profiles(full_name), session_types(title), availability_slots(starts_at)")
      .in("status", ["requested", "confirmed"]).order("created_at"),
  ]);

  return (
    <>
      <PageTitle kicker="Coach desk" title="Run the program" />
      <div className="grid grid-cols-2 gap-3 sm:max-w-md">
        <Stat value={queue?.length ?? 0} label="Reviews waiting" />
        <Stat value={bookings?.length ?? 0} label="Upcoming sessions" />
      </div>

      <section className="mt-8">
        <h2 className="display baseline text-xl">Film queue</h2>
        <div className="mt-4 space-y-3">
          {(queue ?? []).length === 0 && <p className="text-sm text-muted">Queue&apos;s clear. Nice.</p>}
          {(queue ?? []).map((s) => (
            <Link key={s.id} href={`/coach/reviews/${s.id}`}
              className="card flex items-center justify-between gap-4 p-5 hover:border-game">
              <div>
                <p className="font-semibold">{(s.profiles as any)?.full_name} · <span className="capitalize">{s.focus}</span></p>
                <p className="mt-1 text-sm text-muted line-clamp-1">{s.notes || "No notes"}</p>
              </div>
              <span className="text-xs uppercase tracking-wider text-wood">
                {s.status === "in_review" ? "In review" : new Date(s.created_at).toLocaleDateString()}
              </span>
            </Link>
          ))}
        </div>
      </section>

      <section className="mt-10">
        <h2 className="display baseline text-xl">Session requests</h2>
        <div className="mt-4 space-y-3">
          {(bookings ?? []).length === 0 && <p className="text-sm text-muted">No pending sessions.</p>}
          {(bookings ?? []).map((b) => (
            <div key={b.id} className="card flex flex-wrap items-center justify-between gap-3 p-5">
              <div>
                <p className="font-semibold">{(b.profiles as any)?.full_name} · {(b.session_types as any)?.title}</p>
                <p className="text-sm text-muted">
                  {new Date((b.availability_slots as any)?.starts_at).toLocaleString()} {b.note && `· "${b.note}"`}
                </p>
              </div>
              <div className="flex gap-2">
                {b.status === "requested" && (
                  <form action={setBookingStatus.bind(null, b.id, "confirmed")}>
                    <button className="btn-game !py-2 !px-4 text-sm">Confirm</button>
                  </form>
                )}
                <form action={setBookingStatus.bind(null, b.id, "cancelled")}>
                  <button className="btn-ghost !py-2 !px-4 text-sm">Cancel</button>
                </form>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-10 max-w-md">
        <h2 className="display baseline text-xl">Open up training times</h2>
        <AddSlot />
      </section>
    </>
  );
}
