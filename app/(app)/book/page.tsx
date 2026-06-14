import { PageTitle } from "@/components/ui";
import FakeCalendar from "./FakeCalendar";

export default function Book() {
  return (
    <>
      <PageTitle kicker="In-person training" title="Get in the gym with us" />
      <p className="max-w-2xl text-muted">
        The app is practice. The gym is where we sharpen the details — footwork, hand placement,
        body control. Pick a day on the calendar to see open slots.
      </p>
      <div className="mt-8">
        <FakeCalendar today={new Date().toISOString()} />
      </div>
    </>
  );
}
