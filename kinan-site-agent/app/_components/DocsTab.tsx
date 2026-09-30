"use client";
import { useMemo, useState } from "react";
import { CATEGORIES, type Location, type Note } from "@/lib/types";
import { fmtDate, pathOf, type ClientDoc } from "./site";

interface Props { docs: ClientDoc[]; locations: Location[]; notes: Note[]; onOpen: (id: string) => void; onToggleNote: (n: Note) => void; onSelectLocation: (id: string) => void }

export default function DocsTab({ docs, locations, notes, onOpen, onToggleNote, onSelectLocation }: Props) {
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("");
  const [view, setView] = useState<"docs" | "issues">("docs");
  const shown = useMemo(() => {
    const t = q.toLowerCase().split(/\s+/).filter(Boolean);
    return docs.filter((d) => (!cat || d.category === cat) &&
      t.every((w) => `${d.title} ${d.category} ${d.discipline ?? ""} ${d.tags.join(" ")} ${d.summary} ${pathOf(locations, d.locationId)}`.toLowerCase().includes(w)));
  }, [docs, q, cat, locations]);
  const open = notes.filter((n) => n.status === "open");
  const catsUsed = CATEGORIES.filter((c) => docs.some((d) => d.category === c));

  return (
    <div className="docs">
      <div className="seg top">
        <button className={view === "docs" ? "on" : ""} onClick={() => setView("docs")}>Documents ({docs.length})</button>
        <button className={view === "issues" ? "on" : ""} onClick={() => setView("issues")}>Open notes ({open.length})</button>
      </div>
      {view === "docs" ? (
        <>
          <input className="search" type="search" placeholder="Search title, tag, place…" value={q} onChange={(e) => setQ(e.target.value)} />
          <div className="chips scroll">
            <button className={"chip" + (!cat ? " hot" : "")} onClick={() => setCat("")}>All</button>
            {catsUsed.map((c) => <button key={c} className={"chip" + (cat === c ? " hot" : "")} onClick={() => setCat(c)}>{c}</button>)}
          </div>
          <ul className="doclist">
            {shown.map((d) => (
              <li key={d.id}>
                <button onClick={() => onOpen(d.id)}>
                  <span className="meta"><b>{d.title}</b><em>{d.category}{d.revision ? ` · Rev ${d.revision}` : ""} · {pathOf(locations, d.locationId)} · {fmtDate(d.uploadedAt)}</em></span>
                </button>
              </li>
            ))}
            {shown.length === 0 && <li className="empty">No documents match.</li>}
          </ul>
        </>
      ) : (
        <ul className="notes">
          {open.length === 0 && <li className="empty">Nothing open. 🎉</li>}
          {open.map((n) => {
            const d = n.docId ? docs.find((x) => x.id === n.docId) : undefined;
            return (
              <li key={n.id}>
                <span className={"k " + n.kind}>{n.kind}</span>
                <span className="t">{n.text}<em>
                  {d ? <a onClick={() => onOpen(d.id)}>{d.title}</a> : n.locationId ? <a onClick={() => onSelectLocation(n.locationId!)}>{pathOf(locations, n.locationId)}</a> : null} · {n.author} · {fmtDate(n.createdAt)}
                </em></span>
                <button className="mini" onClick={() => onToggleNote(n)}>Close</button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
