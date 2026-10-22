"use client";
/**
 * Approve / reject a proposal. Rejecting asks why, in one tap — the orchestrator learns from it ("not now" brings it
 * back tomorrow, "wrong person" proposes someone else, a kind that keeps being rejected stops running by itself).
 * When the signed-in person may not approve it, the buttons say why (and offer to sign in).
 */
import { useState } from "react";
import type { RejectReason } from "@/lib/proposals";

export const REASONS: [RejectReason, string][] = [["not_now", "Not now"], ["already_handled", "Already handled"], ["wrong_person", "Wrong person"], ["too_costly", "Too costly"], ["disagree", "Disagree"]];

export function Decide({ can, busy, onApprove, onReject, onSignIn, approveLabel = "Approve" }: {
  can: { ok: boolean; why?: string }; busy?: boolean; approveLabel?: string;
  onApprove: () => void; onReject: (reason: RejectReason) => void; onSignIn?: () => void;
}) {
  const [asking, setAsking] = useState(false);
  if (!can.ok) return (
    <div className="dc-no">
      <span>{can.why}</span>
      {onSignIn && /sign in/i.test(can.why ?? "") && <button className="mini" onClick={onSignIn}>Sign in</button>}
    </div>
  );
  if (asking) return (
    <div className="dc-why" role="group" aria-label="Why reject it?">
      <span className="kl">Why?</span>
      {REASONS.map(([r, label]) => <button key={r} className="chip" disabled={busy} onClick={() => { setAsking(false); onReject(r); }}>{label}</button>)}
      <button className="mini" onClick={() => setAsking(false)}>Cancel</button>
    </div>
  );
  return (
    <div className="oa-acts">
      <button className="studio-add" disabled={busy} onClick={onApprove}>{busy ? "…" : approveLabel}</button>
      <button className="mini" disabled={busy} onClick={() => setAsking(true)}>Reject</button>
    </div>
  );
}
