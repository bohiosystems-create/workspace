import { NextResponse } from "next/server";
import QRCode from "qrcode";
import { getRepo } from "@/lib/store";
import { COOKIE, cookieOptions, currentUser, demoSignIn, pollLogin, sessionValue, startLogin } from "@/lib/auth/session";
import { directory, findById, findByPhone, publicPerson } from "@/lib/auth/people";
import { waConfig } from "@/lib/whatsapp/graph";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Signing in with the phone number (lib/auth/session.ts).
// GET                         -> { me, demo, people? }  (people: the demo sign-in list, without numbers, when AUTH_DEMO is on)
// POST { op: "start" }        -> { loginId, code, link, qr }  send "LOGIN <code>" from your WhatsApp
// POST { op: "poll", loginId }-> { me } once the code arrived (sets the session cookie)
// POST { op: "demo", id }     -> { me }  demo sign-in as a directory person (AUTH_DEMO)
// POST { op: "logout" }
let waNumber: { at: number; digits: string } | null = null;
async function agentNumber(): Promise<string> {
  const env = (process.env.WHATSAPP_DISPLAY_NUMBER ?? "").replace(/\D/g, "");
  if (env) return env;
  if (waNumber && Date.now() - waNumber.at < 3600_000) return waNumber.digits;
  const c = waConfig();
  if (!c) return "";
  try {
    const r = await fetch(`${c.base}/${c.version}/${c.phoneNumberId}?fields=display_phone_number`, { headers: { authorization: `Bearer ${c.token}` }, cache: "no-store" });
    const j = (await r.json()) as { display_phone_number?: string };
    waNumber = { at: Date.now(), digits: String(j.display_phone_number ?? "").replace(/\D/g, "") };
    return waNumber.digits;
  } catch { return ""; }
}

export async function GET(req: Request) {
  const me = await currentUser(req);
  const db = (await getRepo()).db;
  return NextResponse.json({ me: me ? publicPerson(me) : null, demo: demoSignIn(), whatsapp: !!waConfig(),
    people: demoSignIn() ? directory(db).filter((p) => p.source !== "env").map(publicPerson) : undefined }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: Request) {
  try {
    const b = (await req.json().catch(() => ({}))) as { op?: string; loginId?: string; id?: string };
    const db = (await getRepo()).db;
    const signIn = (phone: string) => {
      const p = findByPhone(db, phone);
      if (!p) return NextResponse.json({ error: "This number isn't in the Kinan directory. Ask an admin to add you (People)." }, { status: 403 });
      const res = NextResponse.json({ me: publicPerson(p) });
      res.cookies.set(COOKIE, sessionValue(p.phone), cookieOptions());
      return res;
    };
    switch (b.op) {
      case "start": {
        const num = await agentNumber();
        if (!num) return NextResponse.json({ error: "WhatsApp isn't connected, so sign-in by code isn't available here." + (demoSignIn() ? " Pick a person from the demo list instead." : "") }, { status: 400 });
        const { loginId, code } = await startLogin();
        const link = `https://wa.me/${num}?text=${encodeURIComponent(`LOGIN ${code}`)}`;
        const qr = await QRCode.toString(link, { type: "svg", margin: 1, errorCorrectionLevel: "M", color: { dark: "#2e2e2f", light: "#ffffff" } });
        return NextResponse.json({ loginId, code, link, qr, number: `+${num}` });
      }
      case "poll": {
        const r = await pollLogin(String(b.loginId ?? ""));
        if (r.expired) return NextResponse.json({ expired: true });
        return r.phone ? signIn(r.phone) : NextResponse.json({ waiting: true });
      }
      case "demo": {
        if (!demoSignIn()) return NextResponse.json({ error: "Demo sign-in is off (AUTH_DEMO=0)." }, { status: 403 });
        const p = findById(db, String(b.id ?? ""));
        if (!p || p.source === "env") return NextResponse.json({ error: "Unknown person." }, { status: 400 });
        return signIn(p.phone);
      }
      case "logout": {
        const res = NextResponse.json({ me: null });
        res.cookies.set(COOKIE, "", { ...cookieOptions(), maxAge: 0 });
        return res;
      }
    }
    return NextResponse.json({ error: "Unknown op" }, { status: 400 });
  } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 400 }); }
}
