"use client";
import { useEffect, useMemo, useState } from "react";
import type { Location, Note } from "@/lib/types";
import { fmtDate, pathOf, type ClientDoc } from "./site";
import { usePanZoom } from "./usePanZoom";
import { runtime } from "./runtime";
import { useSpeech } from "./useSpeech";
import { Icon } from "./icons";

interface Props {
  doc: ClientDoc;
  locations: Location[];
  notes: Note[];
  onClose: () => void;
  onAddNote: (p: { docId: string; text: string; kind: Note["kind"]; at?: { x: number; y: number } }) => Promise<void>;
  onToggleNote: (n: Note) => void;
  onShowOnMap: (locationId: string) => void;
}

export default function DocViewer({ doc, locations, notes, onClose, onAddNote, onToggleNote, onShowOnMap }: Props) {
  const isImg = doc.mime.startsWith("image/");
  const isPdf = doc.mime === "application/pdf";
  const src = runtime.fileUrl(doc);
  const [dim, setDim] = useState({ w: 1200, h: 850 });
  const [text, setText] = useState("");
  const [kind, setKind] = useState<Note["kind"]>("note");
  const [mark, setMark] = useState(false);
  const [pending, setPending] = useState<{ x: number; y: number } | null>(null);
  const [hi, setHi] = useState<string | null>(null);
  const [panel, setPanel] = useState(false);
  const docNotes = useMemo(() => notes.filter((n) => n.docId === doc.id), [notes, doc.id]);

  useEffect(() => {
    if (!isImg) return;
    const im = new Image();
    im.onload = () => setDim({ w: im.naturalWidth || 1200, h: im.naturalHeight || 850 });
    im.src = src;
  }, [src, isImg]);

  const [body, setBody] = useState("");
  useEffect(() => {
    if (isImg || isPdf) return;
    fetch(src).then((r) => r.text()).then(setBody).catch(() => setBody("Couldn't load file."));
  }, [src, isImg, isPdf]);

  const pz = usePanZoom(dim.w, dim.h, (t) => {
    const m = t.target?.closest?.("[data-note]")?.getAttribute("data-note");
    if (m) { setHi(m); setPanel(true); return; }
    if (mark) { setPending({ x: t.cx / dim.w, y: t.cy / dim.h }); setMark(false); }
  }, 24);

  const speech = useSpeech((t) => setText(t));

  const submit = async () => {
    const t = text.trim();
    if (!t) return;
    await onAddNote({ docId: doc.id, text: t, kind, at: pending ?? undefined });
    setText(""); setPending(null);
  };

  const pinned = docNotes.filter((n) => n.at);
  const k = pz.view.k;

  return (
    <div className="viewer" role="dialog" aria-label={doc.title}>
      <header>
        <button className="x" onClick={onClose} aria-label="Back">‹</button>
        <div className="ttl">
          <b>{doc.title}</b>
          <em>{doc.category}{doc.revision ? ` · Rev ${doc.revision}` : ""} · {pathOf(locations, doc.locationId)}</em>
        </div>
        <button className="mini" onClick={() => { onShowOnMap(doc.locationId); }}>Map</button>
      </header>

      <div className="stage">
        {isImg ? (
          <>
            <div ref={pz.ref} className={"viewport" + (mark ? " marking" : "")}>
              <svg width={pz.size.w} height={pz.size.h}>
                <g transform={`translate(${pz.view.x} ${pz.view.y}) scale(${k})`}>
                  <rect width={dim.w} height={dim.h} fill="#fff" />
                  <image href={src} width={dim.w} height={dim.h} />
                  {pinned.map((n, i) => (
                    <g key={n.id} transform={`translate(${n.at!.x * dim.w} ${n.at!.y * dim.h}) scale(${1 / k})`} data-note={n.id} className={"mk " + n.kind + (hi === n.id ? " hi" : "") + (n.status === "closed" ? " done" : "")}>
                      <path d="M0,0 C-4,-8 -13,-13 -13,-22 A13,13 0 1 1 13,-22 C13,-13 4,-8 0,0Z" data-note={n.id} />
                      <text y={-18} textAnchor="middle" data-note={n.id}>{i + 1}</text>
                    </g>
                  ))}
                  {pending && <g transform={`translate(${pending.x * dim.w} ${pending.y * dim.h}) scale(${1 / k})`}><circle r={10} className="droppoint" /><path d="M-16,0H16M0,-16V16" className="dropcross" /></g>}
                </g>
              </svg>
            </div>
            <div className="mapctl">
              <button onClick={() => pz.zoomBy(1.7)} aria-label="Zoom in">＋</button>
              <button onClick={() => pz.zoomBy(1 / 1.7)} aria-label="Zoom out">－</button>
              <button onClick={pz.fit} aria-label="Fit">⤢</button>
              <button onClick={() => setMark((m) => !m)} className={mark ? "on" : ""} aria-label="Mark up">✎</button>
            </div>
            {mark && <div className="banner">Tap the drawing where the note applies</div>}
          </>
        ) : isPdf ? (
          <iframe title={doc.title} src={src} className="pdf" />
        ) : (
          <pre className="txt">{body || "Loading…"}</pre>
        )}
      </div>

      <div className={"dock" + (panel ? " open" : "")}>
        <button className="dockhead" onClick={() => setPanel((p) => !p)}>
          <span>Notes ({docNotes.length}) · {doc.summary ? doc.summary.slice(0, 70) : "no summary"}</span><span>{panel ? "▾" : "▴"}</span>
        </button>
        {panel && (
          <ul className="notes">
            {docNotes.length === 0 && <li className="empty">No notes on this document yet.</li>}
            {docNotes.map((n) => (
              <li key={n.id} className={n.status + (hi === n.id ? " hi" : "")} onClick={() => setHi(n.id)}>
                <span className={"k " + n.kind}>{n.at ? `#${pinned.indexOf(n) + 1}` : n.kind}</span>
                <span className="t">{n.text}<em>{n.author} · {fmtDate(n.createdAt)}{n.via === "agent" ? " · via agent" : ""}</em></span>
                <button className="mini" onClick={(e) => { e.stopPropagation(); onToggleNote(n); }}>{n.status === "open" ? "Close" : "Reopen"}</button>
              </li>
            ))}
          </ul>
        )}
        <div className="composer">
          <div className="seg">
            {(["note", "issue", "instruction"] as const).map((k2) => (
              <button key={k2} className={kind === k2 ? "on" : ""} onClick={() => setKind(k2)}>{k2}</button>
            ))}
          </div>
          {pending && <div className="pendingpin">📍 Note will be pinned on the drawing <button onClick={() => setPending(null)}>remove</button></div>}
          <div className="row">
            <input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()}
              placeholder={pending ? "Note for the pinned spot…" : "Leave a note on this document…"} />
            {speech.supported && <button className={"mic" + (speech.listening ? " live" : "")} onClick={speech.toggle} aria-label="Dictate"><Icon name="mic" /></button>}
            <button onClick={submit} disabled={!text.trim()}>Save</button>
          </div>
          {speech.error && <div className="err">{speech.error}</div>}
        </div>
      </div>
    </div>
  );
}
