"use client";
// The Campaigns page's layout as a card — in the chat after a change: which campaigns, the order, the figures on each
// campaign, the charts in each dashboard; Undo and "Open Campaigns" one click away.
import type { CampaignLayoutView } from "@/lib/campaign-layout";
import { useI18n } from "./lang";

export function CampaignLayoutCard({ view, onUndo }: { view: CampaignLayoutView; onUndo?: () => void }) {
  const { t } = useI18n();
  const filters = view.filters;
  return (
    <div className="rl-card">
      <div className="rl-head">
        <span className="rl-chev" aria-hidden="true">❯</span>
        <b>{t("Campaign dashboards")}</b>
        {view.custom_ ? <span className="pill hold" style={{ fontSize: 9 }}>{t("customised")}</span> : <span className="pill healthy" style={{ fontSize: 9 }}>{t("standard")}</span>}
      </div>
      <div className="rl-meta" style={{ marginTop: 0, marginBottom: 8 }}>
        <span className="chip on">{view.scopeLabel}</span>
        {filters.map((f) => <span key={f} className="chip on">{f}</span>)}
        <span className="chip">{view.sortLabel}</span>
      </div>
      <ol className="rl-list">
        <li><span className="rl-n">#</span><span style={{ flex: 1 }}>{t("Figures on each campaign")}</span><span className="rl-sub">{view.kpis.map((k) => k.name).join(" · ")}</span></li>
        <li><span className="rl-n">▥</span><span style={{ flex: 1 }}>{t("Charts in each dashboard")}</span><span className="rl-sub">{[...view.charts.map((c) => c.name), ...view.custom.map((c) => `+ ${c.title}`)].join(" · ") || t("no charts")}</span></li>
      </ol>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10 }}>
        <a className="btn" style={{ padding: "6px 10px", fontSize: 9, textDecoration: "none" }} href="/campaigns">{t("Open Campaigns")}</a>
        {onUndo && <button className="btn ghost" style={{ padding: "6px 10px", fontSize: 9 }} onClick={onUndo}>↶ {t("Undo")}</button>}
      </div>
    </div>
  );
}
