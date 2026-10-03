"use client";
// The daily report's layout as a card — in the chat after a change, and on the Reports page. Sections in order (on/off),
// charts, focus, item limit, notes; Undo and Preview one click away.
import type { LayoutView } from "@/lib/report-layout";
import { useI18n } from "./lang";

export function ReportLayoutCard({ view, onUndo, onReset, compact = false }: { view: LayoutView; onUndo?: () => void; onReset?: () => void; compact?: boolean }) {
  const { t } = useI18n();
  let n = 0;
  return (
    <div className="rl-card">
      <div className="rl-head">
        <span className="rl-chev" aria-hidden="true">❯</span>
        <b>{t("Daily report layout")}</b>
        {view.custom ? <span className="pill hold" style={{ fontSize: 9 }}>{t("customised")}</span> : <span className="pill healthy" style={{ fontSize: 9 }}>{t("standard")}</span>}
      </div>
      <ol className="rl-list">
        {view.sections.map((s) => (
          <li key={s.id} className={s.on ? "" : "off"}>
            <span className="rl-n">{s.on ? ++n : "–"}</span>
            <span style={{ flex: 1 }}>{s.name}</span>
            {!s.on && <span className="rl-tag">{t("hidden")}</span>}
            {s.id === "glance" && s.on && !compact && (
              <span className="rl-sub">{[...view.charts.filter((c) => c.on).map((c) => c.name), ...view.added.map((c) => `+ ${c.title}`)].join(" · ") || t("no charts")}</span>
            )}
          </li>
        ))}
      </ol>
      {(view.focus || view.maxItems || view.notes.length > 0 || view.charts.some((c) => !c.on)) && (
        <div className="rl-meta">
          {view.focus && <span className="chip on">{t("Focus")}: {view.focus}</span>}
          {view.maxItems && <span className="chip on">{t("Top")} {view.maxItems}</span>}
          {view.charts.filter((c) => !c.on).map((c) => <span key={c.id} className="chip" style={{ textDecoration: "line-through", opacity: 0.7 }}>{c.name}</span>)}
          {view.notes.map((x, i) => <div key={i} className="rl-note">“{x}”</div>)}
        </div>
      )}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10 }}>
        <a className="btn" style={{ padding: "6px 10px", fontSize: 9, textDecoration: "none" }} href="/reports?preview=1">{t("Preview the report")}</a>
        {onUndo && <button className="btn ghost" style={{ padding: "6px 10px", fontSize: 9 }} onClick={onUndo}>↶ {t("Undo")}</button>}
        {onReset && view.custom && <button className="btn ghost" style={{ padding: "6px 10px", fontSize: 9 }} onClick={onReset}>{t("Reset to standard")}</button>}
      </div>
    </div>
  );
}
