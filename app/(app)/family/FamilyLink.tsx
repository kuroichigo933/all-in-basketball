"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createChildInvite, redeemChildInvite } from "../actions";

export default function FamilyLink({ role, pendingCodes }: { role: string; pendingCodes: string[] }) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [msg, setMsg] = useState("");
  const [pending, start] = useTransition();

  return (
    <div className="grid gap-4 md:max-w-2xl md:grid-cols-2">
      {role === "parent" ? (
        <div className="card p-5">
          <h2 className="font-semibold">Link your player</h2>
          <p className="mt-1 text-sm text-muted">Generate a code, then your player enters it from their account on this page.</p>
          <button className="btn-game mt-3 w-full" disabled={pending}
            onClick={() => start(async () => { await createChildInvite(); router.refresh(); })}>
            Generate link code
          </button>
          {pendingCodes.length > 0 && (
            <p className="mt-3 text-sm">Active codes: {pendingCodes.map((c) => (
              <span key={c} className="score mr-2 text-lg text-game">{c}</span>
            ))}</p>
          )}
        </div>
      ) : (
        <div className="card p-5">
          <h2 className="font-semibold">Got a code from a parent?</h2>
          <div className="mt-3 flex gap-2">
            <input className="input uppercase" maxLength={6} value={code}
              onChange={(e) => setCode(e.target.value)} placeholder="ABC123" aria-label="Parent link code" />
            <button className="btn-game" disabled={pending || code.length < 6}
              onClick={() => start(async () => {
                const res = await redeemChildInvite(code);
                setMsg(res?.error ?? "Linked! Your parent can now see your progress.");
                setCode(""); router.refresh();
              })}>
              Link
            </button>
          </div>
          {msg && <p className="mt-2 text-sm text-make">{msg}</p>}
        </div>
      )}
    </div>
  );
}
