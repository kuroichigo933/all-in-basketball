import Link from "next/link";
import type { Tier } from "@/lib/tiers";

export function TierPill({ tier }: { tier: Tier }) {
  const styles: Record<Tier, string> = {
    free: "border-line text-muted",
    basic: "border-wood text-wood",
    professional: "border-game text-game",
  };
  const label: Record<Tier, string> = { free: "Free", basic: "Basic", professional: "Professional" };
  return (
    <span className={`inline-block rounded-full border px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wider ${styles[tier]}`}>
      {label[tier]}
    </span>
  );
}

export function Stat({ value, label }: { value: string | number; label: string }) {
  return (
    <div className="card p-4 text-center">
      <div className="score text-4xl text-game">{value}</div>
      <div className="mt-1 text-xs uppercase tracking-wider text-muted">{label}</div>
    </div>
  );
}

export function PageTitle({ kicker, title }: { kicker?: string; title: string }) {
  return (
    <header className="baseline mb-6">
      {kicker && <p className="text-xs uppercase tracking-[0.2em] text-game mb-1">{kicker}</p>}
      <h1 className="display text-3xl md:text-4xl">{title}</h1>
    </header>
  );
}

export function LockedCard({ requiredLabel }: { requiredLabel: string }) {
  return (
    <div className="card p-6 border-dashed text-center">
      <p className="text-muted">This is {requiredLabel} content.</p>
      <Link href="/pricing" className="btn-game mt-4">Upgrade to unlock</Link>
    </div>
  );
}
