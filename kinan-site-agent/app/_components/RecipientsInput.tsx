"use client";
// Several report recipients: each address is a chip (× removes it); type or paste one or more and press Enter, comma or space.
// Allowed people not yet on the list are offered as one-click "+ name@…" buttons. The value stays a comma-separated string,
// so the server's checks (internal addresses only) are unchanged.
import { useState } from "react";

const RE = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/;
const split = (s: string) => String(s || "").split(/[,;\s]+/).map((x) => x.trim().toLowerCase()).filter(Boolean);

export default function RecipientsInput({ value, onChange, allowedDomains = [], allowedRecipients = [], placeholder = "Add an address, press Enter", notAllowed = "not allowed", invalid = "not a valid address", removeLabel = "Remove" }: {
  value: string; onChange: (v: string) => void; allowedDomains?: string[]; allowedRecipients?: string[];
  placeholder?: string; notAllowed?: string; invalid?: string; removeLabel?: string;
}) {
  const list = [...new Set(split(value))];
  const [draft, setDraft] = useState("");
  const named = allowedRecipients.map((x) => x.toLowerCase()), doms = allowedDomains.map((x) => x.toLowerCase());
  const problem = (a: string) => !RE.test(a) ? invalid : (named.length || doms.length) && !named.includes(a) && !doms.includes(a.split("@")[1] ?? "") ? notAllowed : "";
  const add = (raw: string) => { const more = split(raw); setDraft(""); if (more.length) onChange([...new Set([...list, ...more])].join(", ")); };
  const remove = (a: string) => onChange(list.filter((x) => x !== a).join(", "));
  const offer = named.filter((a) => !list.includes(a));
  return (
    <div className="rcp-wrap">
      <div className="rcp" dir="ltr" onClick={(e) => (e.currentTarget.querySelector("input") as HTMLInputElement | null)?.focus()}>
        {list.map((a) => { const p = problem(a); return (
          <span key={a} className={`rcp-chip${p ? " bad" : ""}`} title={p || a}>{a}{p ? ` · ${p}` : ""}
            <button type="button" aria-label={`${removeLabel} ${a}`} onClick={(e) => { e.stopPropagation(); remove(a); }}>×</button>
          </span>); })}
        <input value={draft} placeholder={list.length ? "" : placeholder} aria-label={placeholder}
          onChange={(e) => { const v = e.target.value; if (/[,;\s]$/.test(v)) add(v); else setDraft(v); }}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(draft); } else if (e.key === "Backspace" && !draft && list.length) remove(list[list.length - 1]); }}
          onPaste={(e) => { const t = e.clipboardData.getData("text"); if (/[,;\s]/.test(t.trim())) { e.preventDefault(); add(draft + " " + t); } }}
          onBlur={() => add(draft)} />
      </div>
      {offer.length > 0 && <div className="rcp-offer" dir="ltr">{offer.map((a) => <button key={a} type="button" onClick={() => add(a)}>+ {a}</button>)}</div>}
    </div>
  );
}
