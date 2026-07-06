"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const LINKS = [
  { href: "/dashboard", label: "Home" },
  { href: "/library", label: "Drills" },
  { href: "/programs", label: "Train" },
  { href: "/progress", label: "Progress" },
  { href: "/review", label: "Film Room" },
  { href: "/book", label: "Book" },
  { href: "/feedback", label: "Feedback" },
];

export default function AppNav({ role, name }: { role: string; name: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const links = [...LINKS];
  if (role === "parent") links.push({ href: "/family", label: "My Players" });
  if (role === "coach") {
    links.push({ href: "/coach", label: "Coach Desk" });
    links.push({ href: "/ai-tracker", label: "AI Tracker" });
  }

  async function signOut() {
    await createClient().auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <>
      {/* top bar */}
      <header className="sticky top-0 z-40 border-b border-line bg-asphalt/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
          <Link href="/dashboard" className="display text-lg text-game">All In</Link>
          <nav className="hidden gap-5 md:flex">
            {links.map((l) => (
              <Link key={l.href} href={l.href}
                className={`text-sm font-semibold ${pathname.startsWith(l.href) ? "text-game" : "text-muted hover:text-chalk"}`}>
                {l.label}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-3">
            <span className="hidden text-sm text-muted sm:inline">{name}</span>
            <button onClick={signOut} className="text-sm text-muted hover:text-game">Sign out</button>
          </div>
        </div>
      </header>
      {/* bottom tab bar (mobile / at the court) */}
      <nav className="fixed inset-x-0 bottom-0 z-40 flex overflow-x-auto border-t border-line bg-asphalt/95 backdrop-blur md:hidden" style={{ scrollbarWidth: "none" }}>
        {links.map((l) => (
          <Link key={l.href} href={l.href}
            className={`flex-1 whitespace-nowrap px-3 py-3 text-center text-[11px] font-semibold ${pathname.startsWith(l.href) ? "text-game" : "text-muted"}`}>
            {l.label}
          </Link>
        ))}
      </nav>
    </>
  );
}
