"use client";
// After a dashboard change in the chat: what changed and what each page now hides, with Undo.
import type { ViewsView } from "@/lib/view-blocks";
import { useI18n } from "./lang";

export function ViewsCard({ view, changed, onUndo }: { view: ViewsView; changed?: string[]; onUndo?: () => void }) {
  const { t } = useI18n();
  const pages = view.filter((p) => p.blocks.some((b) => b.hidden));
  return (
    <div className="rl-card">
      <div className="rl-head"><span className="rl-chev" aria-hidden="true">❯</span><b>{t("Dashboards")}</b>
        {pages.length ? <span className="pill hold" style={{ fontSize: 9 }}>{t("customised")}</span> : <span className="pill healthy" style={{ fontSize: 9 }}>{t("standard")}</span>}</div>
      {changed && changed.length > 0 && <ul className="rl-list">{changed.map((c) => <li key={c}><span className="rl-n">✓</span><span style={{ flex: 1 }}>{c}</span></li>)}</ul>}
      <div className="rl-meta">
        {pages.length === 0 && <span className="muted">{t("Every dashboard shows all its tiles, charts and sections.")}</span>}
        {pages.map((p) => <span key={p.page} className="chip on">{p.name}: {t("hidden")} {p.blocks.filter((b) => b.hidden).map((b) => b.name).join(", ")}</span>)}
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10 }}>
        {onUndo && <button className="btn ghost" style={{ padding: "6px 10px", fontSize: 9 }} onClick={onUndo}>↶ {t("Undo")}</button>}
      </div>
    </div>
  );
}
