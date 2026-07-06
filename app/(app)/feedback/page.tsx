import { PageTitle } from "@/components/ui";
import FeedbackForm from "./FeedbackForm";

export default function Feedback() {
  return (
    <>
      <PageTitle kicker="Feedback" title="Tell us what you think" />
      <p className="max-w-2xl text-muted">
        Have an idea or hit a bug? Send it over — it goes straight to the team.
      </p>
      <div className="mt-6 max-w-xl">
        <FeedbackForm />
      </div>
    </>
  );
}
