"use client";
import { useMemo, useState } from "react";
import type { Location, Note } from "@/lib/types";
import { descendants, fmtDate, pathOf, type ClientDoc } from "./site";
import { CATEGORY_ICON, Icon } from "./icons";

interface Props {
  locations: Location[];
  docs: ClientDoc[];
  notes: Note[];
  locationId: string;
  onClose: () => void;
  onOpenDoc: (id: string) => void;
  onUpload: (locationId: string) => void;
  onNote: (locationId: string, text: string, kind: Note["kind"]) => Promise<void>;
  onToggleNote: (n: Note) => void;
  onSelect: (id: string) => void;
}


export default function LocationSheet({ locations, docs, notes, locationId, onClose, onOpenDoc, onUpload, onNote, onToggleNote, onSelect }: Props) {
  const [noteText, setNoteText] = useState("");
  const [kind, setKind] = useState<Note["kind"]>("note");
  const [expanded, setExpanded] = useState(false);
  const loc = locations.find((l) => l.id === locationId);
  const kids = useMemo(() => locations.filter((l) => l.parentId === locationId), [locations, locationId]);
  const ids = useMemo(() => descendants(locations, locationId), [locations, locationId]);
  const here = docs.filter((d) => ids.has(d.locationId));
  const here_notes = notes.filter((n) => (n.locationId && ids.has(n.locationId)) || here.some((d) => d.id === n.docId));
  const docCountAt = (id: string) => docs.filter((d) => d.locationId === id).length;
  const kidsWithDocs = kids.filter((k) => docCountAt(k.id) > 0);
  if (!loc) return null;
  const parent = loc.parentId ? locations.find((l) => l.id === loc.parentId) : undefined;

  const save = async () => {
    if (!noteText.trim()) return;
    await onNote(locationId, noteText.trim(), kind);
    setNoteText("");
  };

  return (
    <div className={"sheet" + (expanded ? " full" : "")} role="dialog" aria-label={loc.name}>
      <div className="grab" onClick={() => setExpanded((e) => !e)} />
      <div className="sheet-h">
        <div>
          {parent && <button className="crumb" onClick={() => onSelect(parent.id)}>‹ {parent.name}</button>}
          <h2>{loc.name}</h2>
          <div className="sub">{pathOf(locations, loc.id)} · {here.length} doc{here.length === 1 ? "" : "s"} · {here_notes.filter((n) => n.status === "open").length} open</div>
        </div>
        <button className="x" onClick={onClose} aria-label="Close">✕</button>
      </div>

      <div className="actions">
        <button className="primary" onClick={() => onUpload(locationId)}>＋ Upload here</button>
      </div>

      {kids.length > 0 && (
        <div className="levels">
          <div className="lbl">{kids.some((k) => k.type === "level") ? "Levels" : "Inside"}</div>
          <div className="chips">
            {kidsWithDocs.map((k) => <button key={k.id} className="chip hot" onClick={() => onSelect(k.id)}>{k.name.split(" — ").pop()} <i>{docCountAt(k.id)}</i></button>)}
            <select aria-label="Jump to level" value="" onChange={(e) => e.target.value && onSelect(e.target.value)}>
              <option value="">{kids.some((k) => k.type === "level") ? "Go to level…" : "Go to…"}</option>
              {kids.map((k) => <option key={k.id} value={k.id}>{k.name.split(" — ").pop()}</option>)}
            </select>
          </div>
        </div>
      )}

      <div className="lbl">Documents</div>
      {here.length === 0 && <div className="empty">Nothing attached here yet. Upload a drawing, photo or report and it is pinned to this spot.</div>}
      <ul className="doclist">
        {here.map((d) => {
          const open = notes.filter((n) => n.docId === d.id && n.status === "open").length;
          return (
            <li key={d.id}>
              <button onClick={() => onOpenDoc(d.id)}>
                <span className="ico"><Icon name={CATEGORY_ICON[d.category] ?? "file"} /></span>
                <span className="meta">
                  <b>{d.title}</b>
                  <em>{d.category}{d.revision ? ` · Rev ${d.revision}` : ""}{d.locationId !== locationId ? ` · ${locations.find((l) => l.id === d.locationId)?.name.split(" — ").pop()}` : ""} · {fmtDate(d.uploadedAt)}</em>
                </span>
                {open > 0 && <span className="badge">{open}</span>}
              </button>
            </li>
          );
        })}
      </ul>

      <div className="lbl">Notes &amp; issues</div>
      <ul className="notes">
        {here_notes.length === 0 && <li className="empty">No notes yet.</li>}
        {here_notes.map((n) => (
          <li key={n.id} className={n.status}>
            <span className={"k " + n.kind}>{n.kind}</span>
            <span className="t">{n.text}<em>{n.author} · {fmtDate(n.createdAt)}{n.via === "agent" ? " · via agent" : ""}</em></span>
            <button className="mini" onClick={() => onToggleNote(n)}>{n.status === "open" ? "Close" : "Reopen"}</button>
          </li>
        ))}
      </ul>

      <div className="addnote">
        <div className="kinds">{(["note", "issue", "instruction"] as const).map((k) => <button key={k} className={kind === k ? "on" : ""} onClick={() => setKind(k)}>{k}</button>)}</div>
        <div className="row">
          <input value={noteText} onChange={(e) => setNoteText(e.target.value)} placeholder={`Leave a ${kind} at ${loc.name.split(" — ").pop()}`} onKeyDown={(e) => e.key === "Enter" && save()} />
          <button onClick={save} disabled={!noteText.trim()}>Save</button>
        </div>
      </div>
    </div>
  );
}
