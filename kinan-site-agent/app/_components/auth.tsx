"use client";
/**
 * Signing in with your phone number (lib/auth/session.ts): get a code, send it from your own WhatsApp, and this page
 * signs in as that number — your name, role and approval limits come from the directory. For demos, a person can also
 * be picked from the directory list (AUTH_DEMO). Shared by the app and the field app.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PublicPerson } from "@/lib/auth/people";

export type Me = PublicPerson;
type AuthState = { me: Me | null; demo: boolean; whatsapp: boolean; people?: Me[]; /** no signal: `me` is the copy kept on this device */ offline?: boolean };

/** The signed-in person (undefined while loading). Re-reads when anyone signs in or out on this page. */
export function useMe(): { me: Me | null | undefined; auth: AuthState | null; reload: () => void } {
  const [auth, setAuth] = useState<AuthState | null>(null);
  const reload = useCallback(() => {
    fetch("/api/auth", { cache: "no-store" }).then((r) => r.json()).then((j: AuthState) => {
      setAuth(j);
      try { if (j.me) localStorage.setItem(ME_KEY, JSON.stringify(j.me)); else localStorage.removeItem(ME_KEY); } catch { /* storage off */ }
    }).catch(() => {
      // no signal: who was signed in on this phone (the server still checks the session when the changes are sent)
      let me: Me | null = null;
      try { const s = localStorage.getItem(ME_KEY); me = s ? JSON.parse(s) : null; } catch { /* storage off */ }
      setAuth({ me, demo: false, whatsapp: false, offline: true });
    });
  }, []);
  useEffect(() => {
    reload();
    window.addEventListener("kinan:auth", reload); window.addEventListener("online", reload);
    return () => { window.removeEventListener("kinan:auth", reload); window.removeEventListener("online", reload); };
  }, [reload]);
  return { me: auth ? auth.me : undefined, auth, reload };
}
const ME_KEY = "kinan.me";
const announce = () => window.dispatchEvent(new Event("kinan:auth"));

export async function signOut() { await fetch("/api/auth", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ op: "logout" }) }).catch(() => undefined); announce(); }

const DOMAIN_LABEL: Record<string, string> = { site: "Construction", fm: "Operations", all: "Construction & operations" };

/** The sign-in panel: WhatsApp code (when the server has WhatsApp) and the demo directory. `only` narrows the list
 *  (the field app shows the operations teams first). */
export function SignInPanel({ auth, onDone, only }: { auth: AuthState | null; onDone: (me: Me) => void; only?: (p: Me) => boolean }) {
  const [mode, setMode] = useState<"wa" | "demo">(auth?.whatsapp ? "wa" : "demo");
  const [code, setCode] = useState<{ loginId: string; code: string; link: string; qr: string; number: string } | null>(null);
  const [err, setErr] = useState("");
  const [q, setQ] = useState("");
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => () => { if (timer.current) clearInterval(timer.current); }, []);
  const call = async (body: Record<string, unknown>) => {
    const r = await fetch("/api/auth", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j.error) throw new Error(j.error ?? "Sign-in failed.");
    return j;
  };
  const done = (me: Me) => { if (timer.current) clearInterval(timer.current); announce(); onDone(me); };
  const start = async () => {
    setErr(""); setCode(null);
    try {
      const c = await call({ op: "start" });
      setCode(c);
      if (timer.current) clearInterval(timer.current);
      timer.current = setInterval(async () => {
        try { const j = await call({ op: "poll", loginId: c.loginId }); if (j.me) done(j.me); else if (j.expired) { clearInterval(timer.current!); setCode(null); setErr("The code expired. Get a new one."); } }
        catch (e) { clearInterval(timer.current!); setErr((e as Error).message); }
      }, 2000);
    } catch (e) { setErr((e as Error).message); }
  };
  const people = useMemo(() => (auth?.people ?? []).filter((p) => (!only || only(p)) && (!q || `${p.name} ${p.title} ${p.org} ${p.roleLabel}`.toLowerCase().includes(q.toLowerCase()))), [auth, only, q]);
  const groups = useMemo(() => {
    const m = new Map<string, Me[]>();
    for (const p of people) { const g = p.domain === "fm" ? p.org : DOMAIN_LABEL[p.domain]; if (!m.has(g)) m.set(g, []); m.get(g)!.push(p); }
    const rank = { admin: 0, director: 1, manager: 2, supervisor: 3, field: 4, guest: 5 } as const;
    for (const xs of m.values()) xs.sort((a, b) => rank[a.role] - rank[b.role] || a.name.localeCompare(b.name));
    return [...m.entries()];
  }, [people]);
  return (
    <div className="signin">
      {auth?.whatsapp && auth.demo && (
        <div className="seg3 two" role="group" aria-label="How to sign in">
          <button className={mode === "wa" ? "on" : ""} onClick={() => setMode("wa")}>With WhatsApp</button>
          <button className={mode === "demo" ? "on" : ""} onClick={() => setMode("demo")}>Demo people</button>
        </div>
      )}
      {err && <div className="studio-err">{err}</div>}
      {mode === "wa" && (
        <div className="si-wa">
          <p className="small">Your phone number is your sign-in. Send the code from <b>your own WhatsApp</b> to the agent, and this page opens as you — with your role and approval limits.</p>
          {!code && <button className="studio-add" onClick={start}>Get a sign-in code</button>}
          {code && (
            <div className="si-code">
              <div className="si-qr" aria-hidden="true" dangerouslySetInnerHTML={{ __html: code.qr }} />
              <div className="si-steps">
                <span className="kl">Send to {code.number}</span>
                <b className="si-num">LOGIN {code.code}</b>
                <a className="studio-add" href={code.link} target="_blank" rel="noreferrer">Open WhatsApp</a>
                <em>Or scan the code with your phone. Waiting for your message…</em>
              </div>
            </div>
          )}
        </div>
      )}
      {mode === "demo" && auth?.demo && (
        <div className="si-demo">
          <p className="small">Demo: sign in as anyone in the directory to see what their role may approve. In production this list is switched off (AUTH_DEMO=0) and everyone signs in from their own phone.</p>
          <input className="ops-search" type="search" placeholder="Search name, role, company…" value={q} onChange={(e) => setQ(e.target.value)} />
          {groups.map(([g, xs]) => (
            <div key={g} className="si-group">
              <div className="rpt-label">{g}</div>
              <ul>{xs.map((p) => (
                <li key={p.id}><button onClick={async () => { setErr(""); try { done((await call({ op: "demo", id: p.id })).me); } catch (e) { setErr((e as Error).message); } }}>
                  <span className="grow"><b>{p.name}</b><em>{p.title} · {p.org}</em></span><span className={`role-pill ${p.role}`}>{p.roleLabel}</span>
                </button></li>
              ))}</ul>
            </div>
          ))}
          {!groups.length && <p className="muted small">Nobody matches.</p>}
        </div>
      )}
      {mode === "demo" && !auth?.demo && <p className="small">Demo sign-in is switched off on this deployment.</p>}
    </div>
  );
}

/** The sign-in sheet inside the app. */
export function SignInSheet({ auth, onClose }: { auth: AuthState | null; onClose: () => void }) {
  return (
    <div className="modal" role="dialog" aria-label="Sign in" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-card ops-drawer si-sheet">
        <div className="sheet-h"><b>Sign in</b><button className="x" onClick={onClose} aria-label="Close">×</button></div>
        <SignInPanel auth={auth} onDone={onClose} />
      </div>
    </div>
  );
}
