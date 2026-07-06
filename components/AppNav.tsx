"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const LINKS = [
  { href: "/dashboard", label: "Home" },
  { href: "/library", label: "Drills" },
  { href: "/programs", label: "Train" },
  { href: "/review", label: "Film Room" },
  { href: "/progress", label: "Progress" },
  { href: "/book", label: "Book" },
  { href: "/feedback", label: "Feedback" },
];

export default function AppNav({ role, name }: { role: string; name: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const [moreOpen, setMoreOpen] = useState(false);

  const links = [...LINKS];
  if (role === "parent") links.push({ href: "/family", label: "My Players" });
  if (role === "coach") {
    links.push({ href: "/coach", label: "Coach Desk" });
    links.push({ href: "/ai-tracker", label: "AI Tracker" });
  }

  // Mobile bottom bar: 4 primary tabs + a "More" sheet for the rest.
  const primary = links.slice(0, 4);
  const rest = links.slice(4);

  // Close the More sheet whenever the route changes.
  useEffect(() => { setMoreOpen(false); }, [pathname]);

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

      {/* "More" sheet (mobile) — sits above the tab bar */}
      {moreOpen && rest.length > 0 && (
        <>
          <div className="fixed inset-0 z-40 bg-black/50 md:hidden" onClick={() => setMoreOpen(false)} />
          <div className="fixed inset-x-0 bottom-[49px] z-40 border-t border-line bg-asphalt md:hidden">
            {rest.map((l) => (
              <Link key={l.href} href={l.href} onClick={() => setMoreOpen(false)}
                className={`block border-b border-line/60 px-5 py-3.5 text-sm font-semibold ${pathname.startsWith(l.href) ? "text-game" : "text-chalk"}`}>
                {l.label}
              </Link>
            ))}
          </div>
        </>
      )}

      {/* bottom tab bar (mobile) */}
      <nav className="fixed inset-x-0 bottom-0 z-40 flex border-t border-line bg-asphalt/95 backdrop-blur md:hidden">
        {primary.map((l) => (
          <Link key={l.href} href={l.href} onClick={() => setMoreOpen(false)}
            className={`flex-1 whitespace-nowrap px-2 py-3 text-center text-[11px] font-semibold ${pathname.startsWith(l.href) ? "text-game" : "text-muted"}`}>
            {l.label}
          </Link>
        ))}
        {rest.length > 0 && (
          <button type="button" onClick={() => setMoreOpen((o) => !o)}
            className={`flex-1 whitespace-nowrap px-2 py-3 text-center text-[11px] font-semibold ${
              moreOpen || rest.some((l) => pathname.startsWith(l.href)) ? "text-game" : "text-muted"
            }`}>
            More ⋯
          </button>
        )}
      </nav>
    </>
  );
}
