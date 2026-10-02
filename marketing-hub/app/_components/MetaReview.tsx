"use client";

// Meta ads review: which agency runs each Meta campaign, with the evidence; confirm or correct in one click.
// Shown on the Campaigns page (the data-source plumbing behind it is not shown in the UI).
import { useEffect, useState } from "react";
import { useI18n } from "./lang";
import { useAgent, useApprover } from "./useAgent";

export default function MetaReview() {
  const { data, busy, act } = useAgent();
  // Deep link (/campaigns#meta): scroll once the panel exists (data loads after navigation).
  useEffect(() => { if (data?.meta && window.location.hash === "#meta") document.getElementById("meta")?.scrollIntoView({ behavior: "smooth" }); }, [!!data]);
  return data?.meta ? <MetaPanel m={data.meta} act={act} busy={busy} /> : null;
}

const KIND: Record<string, [string, string]> = {
  VENDOR: ["Agency", "live"], IN_HOUSE: ["In-house", "hold"], UNKNOWN_AGENCY: ["Not one of your agencies", "weak"], CONFLICT: ["Conflicting evidence", "watch"], UNRESOLVED: ["Unknown", "hold"],
};
const CONF: Record<string, string> = { HIGH: "healthy", MEDIUM: "fix", LOW: "weak" };

export function MetaPanel({ m, act, busy }: { m: any; act: (b: any, k: string) => Promise<any>; busy: string | null }) {
  const { t, N, k } = useI18n();
  const [saved, save] = useApprover();
  const [approver, setApprover] = useState<string | null>(null);
  const name = approver ?? saved;
  const [pick, setPick] = useState<Record<string, { target: string; code: string; remember: boolean }>>({});
  const sel = (c: any) => pick[c.id] ?? { target: c.vendorId ?? c.suggested[0] ?? (c.kind === "UNKNOWN_AGENCY" ? "UNKNOWN" : c.kind === "IN_HOUSE" ? "IN_HOUSE" : ""), code: c.code ?? "", remember: false };
  const set = (c: any, p: any) => setPick({ ...pick, [c.id]: { ...sel(c), ...p } });
  const codesOf = (vid: string) => m.vendorOptions.find((v: any) => v.id === vid)?.codes ?? [];
  const s = m.summary;
  return (
    <div className="panel" id="meta" style={{ marginTop: 18 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
        <div className="chart-label" style={{ margin: 0 }}>{t("Meta ads — which agency runs each campaign")}</div>
        <div style={{ flex: 1 }} />
        <button className="btn ghost" style={{ padding: "6px 10px", fontSize: 8 }} disabled={busy === "meta-sync"} onClick={() => act({ action: "META_SYNC" }, "meta-sync")}>{t("Sync now")}</button>
      </div>
      <p className="muted" style={{ fontSize: 12, margin: "0 0 12px", maxWidth: 820 }}>{t("Meta doesn't say which agency runs a campaign. The agent works it out from the campaign code in the name, the utm_campaign on the ads, who created the campaign (ad-account activity log) and who owns the ad account — and asks you when the evidence is weak or conflicting. Only attributed spend counts towards checking a vendor's reported media spend.")}</p>
      <div className="kpis" style={{ marginBottom: 12 }}>
        <div className="kpi"><div className="kv">{k(s.spendK)}</div><div className="kl">{t("Meta spend")}</div><div className="kd">{s.campaigns} {t("campaigns")}</div></div>
        <div className="kpi"><div className="kv">{s.attributedPct}%</div><div className="kl">{t("Attributed to an agency")}</div><div className="kd">{k(s.attributedK)}</div></div>
        <div className="kpi"><div className="kv" style={s.unknownK ? { color: "var(--alert)" } : {}}>{k(s.unknownK)}</div><div className="kl">{t("Not one of your agencies")}</div></div>
        <div className="kpi"><div className="kv" style={s.conflictK ? { color: "var(--alert)" } : {}}>{k(s.conflictK)}</div><div className="kl">{t("Unclear — to confirm")}</div></div>
        <div className="kpi"><div className="kv">{k(s.inHouseK)}</div><div className="kl">{t("In-house")}</div></div>
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
        {s.byVendor.map((v: any) => <span key={v.vendorId} className="tag" style={{ fontSize: 9 }}>{v.vendor}: {k(v.spendK)} · {v.campaigns} {t("campaigns")}</span>)}
      </div>
      <div style={{ marginBottom: 12 }}>
        {m.accounts.map((a: any) => (
          <div key={a.id} className="logrow">
            <div style={{ flex: 1 }}>
              <b>{a.name}</b> <span className="muted" dir="ltr">{a.id}</span>
              <div className="muted" style={{ fontSize: 10 }}>
                {t("Owner")}: {a.owner ?? "—"} ({t(a.ownerIs === "CLIENT" ? "you" : a.ownerIs === "VENDOR" ? "an agency" : "unknown")}) · {t("Partners with access")}: {a.agencies.length ? a.agencies.map((g: any, i: number) => <span key={i} className={g.known ? "" : "bad"}>{i ? ", " : ""}{g.name}{g.known ? "" : ` (${t("not a vendor")})`}</span>) : "—"}
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="field" style={{ width: 220, marginBottom: 10 }}><label>{t("Confirming as")}</label><input className="in" placeholder={t("Your name")} value={name} onChange={(e) => { setApprover(e.target.value); save(e.target.value); }} /></div>
      <table className="dtable">
        <thead><tr><th>{t("Meta campaign")}</th><th>{t("Created by")}</th><th className="num">{t("Spend")}</th><th>{t("Agency · code")}</th><th>{t("Evidence")}</th></tr></thead>
        <tbody>
          {m.campaigns.map((c: any) => {
            const p = sel(c);
            return (
              <tr key={c.id} style={c.needsReview ? { background: "rgba(255,77,106,0.05)" } : {}}>
                <td style={{ minWidth: 180 }}><b>{c.name}</b><div className="muted" style={{ fontSize: 9 }}>{c.account} · {c.status.toLowerCase()}{c.utm.length ? <> · <span dir="ltr">utm {c.utm.join(", ")}</span></> : ""}</div></td>
                <td style={{ fontSize: 11 }}>{c.creator ?? "—"}</td>
                <td className="num">{k(c.spendK)}<div className="muted" style={{ fontSize: 9 }}>{c.leads} {t("leads")}</div></td>
                <td style={{ minWidth: 170 }}>
                  <span className={`pill ${KIND[c.kind]?.[1] ?? "hold"}`} style={{ display: "inline-block" }}>{t(KIND[c.kind]?.[0] ?? c.kind)}</span>{" "}
                  {c.kind === "VENDOR" && <span className={`pill ${CONF[c.confidence]}`} style={{ display: "inline-block" }}>{t(c.confidence)}</span>}
                  {c.vendor && <div style={{ marginTop: 4 }}><b>{c.vendor}</b>{c.code ? <span className="muted" dir="ltr"> · {c.code}</span> : ""}</div>}
                  {c.review === "CONFIRMED" && <div className="muted" style={{ fontSize: 9, marginTop: 3 }}>{t("confirmed by")} {c.reviewedBy}</div>}
                </td>
                <td style={{ fontSize: 11, minWidth: 240 }}>
                  <ul style={{ margin: 0, paddingInlineStart: 14 }}>{c.signals.map((x: string, i: number) => <li key={i}>{x}</li>)}</ul>
                  {c.flags.filter((f: any) => f.code !== "IN_HOUSE" && f.code !== "UNKNOWN_AGENCY").map((f: any) => <div key={f.code} className="bad" style={{ fontSize: 10, marginTop: 3 }}>⚠ {f.text}</div>)}
                  {c.needsReview && (
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", marginTop: 8 }}>
                      <select className="in" style={{ width: 170, padding: "5px 6px" }} value={p.target} onChange={(e) => set(c, { target: e.target.value, code: codesOf(e.target.value)[0] ?? "" })}>
                        <option value="">{t("Who runs it?")}</option>
                        {m.vendorOptions.map((v: any) => <option key={v.id} value={v.id}>{v.name}</option>)}
                        <option value="IN_HOUSE">{t("In-house")}</option>
                        <option value="UNKNOWN">{t("Not one of your agencies")}</option>
                      </select>
                      {p.target && p.target !== "IN_HOUSE" && p.target !== "UNKNOWN" && (
                        <select className="in" dir="ltr" style={{ width: 140, padding: "5px 6px" }} value={p.code || codesOf(p.target)[0] || ""} onChange={(e) => set(c, { code: e.target.value })}>
                          {codesOf(p.target).map((x: string) => <option key={x} value={x}>{x}</option>)}
                        </select>
                      )}
                      {!c.creatorKnown && c.creator && p.target !== "UNKNOWN" && <label className="muted" style={{ fontSize: 10, display: "flex", gap: 4, alignItems: "center" }}><input type="checkbox" checked={p.remember} onChange={(e) => set(c, { remember: e.target.checked })} />{t("Remember this creator")}</label>}
                      <button className="btn" style={{ padding: "6px 10px", fontSize: 8 }} disabled={!name.trim() || !p.target || busy === c.id} title={!name.trim() ? t("Enter your name") : ""}
                        onClick={() => act({ action: "META_ASSIGN", id: c.id, target: p.target, code: p.code || codesOf(p.target)[0] || null, remember: p.remember && !c.creatorKnown, approver: name }, c.id)}>{t("Confirm")}</button>
                    </div>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
