import Link from "next/link";

export default function PublicTrialBanner() {
  return (
    <div className="sticky top-0 z-50 border-b border-game/30 bg-game text-asphalt shadow-lg shadow-black/10">
      <div className="mx-auto flex max-w-5xl flex-col gap-2 px-4 py-3 text-center text-sm font-bold sm:flex-row sm:items-center sm:justify-between sm:text-left">
        <span>Start with a 5-day free trial. No credit card required.</span>
        <Link href="/signup" className="underline decoration-asphalt/40 underline-offset-4 hover:decoration-asphalt">
          Start free trial
        </Link>
      </div>
    </div>
  );
}
