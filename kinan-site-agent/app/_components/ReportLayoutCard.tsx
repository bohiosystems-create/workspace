"use client";
// The daily brief's layout as a card — in the chat after a change, and on the Briefs page. Sections in order (on/off),
// focus, item limit, notes; Undo and Reset one tap away. Same card as the Kinan marketing agent's.
import type { LayoutView } from "@/lib/reports/layout";

export function ReportLayoutCard({ view, onUndo, onReset, onPreview }: { view: LayoutView; onUndo?: () => void; onReset?: () => void; onPreview?: () => void }) {
  let n = 0;
  return (
    <div className="rl-card">
      <div className="rl-head">
        <span className="rl-chev" aria-hidden="true">❯</span>
        <b>Daily brief layout</b>
        {view.custom ? <span className="pill hold">customised</span> : <span className="pill healthy">standard</span>}
      </div>
      <ol className="rl-list">
        {view.sections.map((s) => (
          <li key={s.id} className={s.on ? "" : "off"}>
            <span className="rl-n">{s.on ? ++n : "–"}</span>
            <span className="grow">{s.name}</span>
            {!s.on && <span className="rl-tag">hidden</span>}
          </li>
        ))}
      </ol>
      {(view.focus || view.maxItems || view.notes.length > 0) && (
        <div className="rl-meta">
          {view.focus && <span className="chip on">Focus: {view.focus}</span>}
          {view.maxItems && <span className="chip on">Top {view.maxItems}</span>}
          {view.notes.map((x, i) => <div key={i} className="rl-note">“{x}”</div>)}
        </div>
      )}
      {(onPreview || onUndo || onReset) && (
        <div className="rl-acts">
          {onPreview && <button className="btn sm" onClick={onPreview}>Preview the brief</button>}
          {onUndo && <button className="btn ghost sm" onClick={onUndo}>↶ Undo</button>}
          {onReset && view.custom && <button className="btn ghost sm" onClick={onReset}>Reset to standard</button>}
        </div>
      )}
    </div>
  );
}
