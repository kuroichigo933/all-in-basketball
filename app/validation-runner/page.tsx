import { notFound } from "next/navigation";
import AITracker from "@/app/(app)/ai-tracker/AITracker";

export default function ValidationRunnerPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <main className="mx-auto max-w-5xl p-6"><h1 className="display mb-2 text-2xl">Local Validation Runner</h1><p className="mb-6 text-sm text-muted">Development-only route for processing local validation segments.</p><AITracker /></main>;
}
