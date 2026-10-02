"use client";
import { useRef, useState } from "react";
import { CATEGORIES, type Location } from "@/lib/types";
import { pathOf } from "./site";

interface Props {
  locations: Location[];
  locationId: string;
  pin?: { x: number; y: number };
  author: string;
  directPrefix?: string | null;
  onClose: () => void;
  onDone: (docId: string) => void;
}

export default function UploadSheet({ locations, locationId, pin, author, directPrefix, onClose, onDone }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("");
  const [revision, setRevision] = useState("");
  const [note, setNote] = useState("");
  const [loc, setLoc] = useState(locationId);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const camRef = useRef<HTMLInputElement>(null);

  const pick = (f: File | null | undefined) => {
    if (!f) return;
    setFile(f);
    if (!title) setTitle(f.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " "));
    if (!category && f.type.startsWith("image/")) setCategory("Photo");
  };

  const submit = async () => {
    if (!file) return;
    setBusy(true); setErr("");
    try {
      // Vercel functions accept ≤ 4.5 MB per request: big files go straight to Blob storage.
      if (directPrefix && file.size > 4 * 1024 * 1024) {
        const { upload } = await import("@vercel/blob/client");
        const safe = file.name.replace(/[^\w.\-]+/g, "_").slice(-80);
        // Unique path per upload so re-sending the same file name never collides.
        const unique = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}-${safe}`;
        const blob = await upload(directPrefix + unique, file, { access: "private", handleUploadUrl: "/api/upload/token", multipart: file.size > 50 * 1024 * 1024, contentType: file.type || undefined });
        const key = blob.pathname.slice(directPrefix.length - "uploads/direct/".length);
        const r = await fetch("/api/upload", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({
          fileKey: key, filename: file.name, mime: file.type || "application/octet-stream", size: file.size, locationId: loc, author,
          title: title.trim() || undefined, category: category || undefined, revision: revision.trim() || undefined, summary: note.trim() || undefined,
          x: pin ? Math.round(pin.x) : undefined, y: pin ? Math.round(pin.y) : undefined,
        }) });
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || "Upload failed");
        return onDone(j.doc.id);
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Upload failed");
      setBusy(false);
      return;
    }
    const fd = new FormData();
    fd.set("file", file); fd.set("locationId", loc); fd.set("author", author);
    if (title.trim()) fd.set("title", title.trim());
    if (category) fd.set("category", category);
    if (revision.trim()) fd.set("revision", revision.trim());
    if (note.trim()) fd.set("summary", note.trim());
    if (pin) { fd.set("x", String(Math.round(pin.x))); fd.set("y", String(Math.round(pin.y))); }
    try {
      const r = await fetch("/api/upload", { method: "POST", body: fd });
      if (r.status === 413) throw new Error("File too large for this server (limit 4.5 MB on Vercel without Blob storage, 40 MB otherwise).");
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Upload failed");
      onDone(j.doc.id);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Upload failed");
      setBusy(false);
    }
  };

  const places = locations.filter((l) => l.type !== "level" || l.id === loc);

  return (
    <div className="modal" role="dialog" aria-label="Attach document">
      <div className="modal-card">
        <div className="sheet-h"><b>Attach document</b><button className="x" onClick={onClose} aria-label="Close">✕</button></div>
        <div className="placechip">📍 {pathOf(locations, loc)}{pin ? ` · pinned (${Math.round(pin.x)}, ${Math.round(pin.y)})` : ""}</div>

        <div className="pickrow">
          <button className="big" onClick={() => camRef.current?.click()}>📷 Take photo</button>
          <button className="big" onClick={() => fileRef.current?.click()}>📄 Choose file</button>
        </div>
        <input ref={camRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => pick(e.target.files?.[0])} />
        <input ref={fileRef} data-testid="file" type="file" accept=".pdf,image/*,.txt,.md,.csv,.dwg,.dxf,.docx,.xlsx" hidden onChange={(e) => pick(e.target.files?.[0])} />
        {file && <div className="filechip">✔ {file.name} · {(file.size / 1024 / 1024).toFixed(1)} MB</div>}

        <label>Title<input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Auto-filled from the file" /></label>
        <div className="two">
          <label>Type
            <select value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="">Auto-detect</option>
              {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
            </select>
          </label>
          <label>Revision<input value={revision} onChange={(e) => setRevision(e.target.value)} placeholder="e.g. C" /></label>
        </div>
        <label>Location
          <select value={loc} onChange={(e) => setLoc(e.target.value)}>
            {places.map((l) => <option key={l.id} value={l.id}>{pathOf(locations, l.id)}</option>)}
          </select>
        </label>
        <label>Comment (optional)<textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="What is this and why does it matter?" /></label>
        {err && <div className="err">{err}</div>}
        <button className="primary" disabled={!file || busy} onClick={submit}>{busy ? "Uploading & indexing…" : "Attach to location"}</button>
      </div>
    </div>
  );
}
