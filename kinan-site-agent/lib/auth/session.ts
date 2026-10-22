// Signing in: the person's phone number is the identity. The browser shows a six-digit code; the person sends
// "LOGIN 123456" to the agent's WhatsApp number from their own phone; the webhook sees which number sent it, and the
// browser (polling) receives a signed session cookie for that number. No SMS provider, no password, no Meta template.
// For demos without WhatsApp, AUTH_DEMO (on unless set to "0") also lets you pick a person from the directory.
// The cookie only carries the number: the role and limits are read from the directory on every request, so a change
// made by an admin applies at once.
import crypto from "node:crypto";
import { readJson, writeJson, getRepo } from "../store";
import { digits, findByPhone, type Person } from "./people";

export const COOKIE = "kinan_sid";
const LOGINS = "auth/logins.json";
const TTL_MS = 7 * 24 * 3600_000;
const LOGIN_MS = 10 * 60_000;

function secret(): string {
  if (process.env.AUTH_SECRET) return process.env.AUTH_SECRET;
  // stable across instances when any deployment secret is set; set AUTH_SECRET in production (SETUP.md)
  return crypto.createHash("sha256").update(`kinan-auth:${process.env.WHATSAPP_APP_SECRET ?? ""}:${process.env.APP_PASSWORD ?? ""}:${process.env.BLOB_READ_WRITE_TOKEN ?? ""}:${process.env.ANTHROPIC_API_KEY ?? ""}`).digest("hex");
}
const b64 = (s: string) => Buffer.from(s).toString("base64url");
const sign = (v: string) => crypto.createHmac("sha256", secret()).update(v).digest("base64url");

export const demoSignIn = () => (process.env.AUTH_DEMO ?? "1") !== "0";

export function sessionValue(phone: string): string {
  const v = b64(JSON.stringify({ p: digits(phone), exp: Date.now() + TTL_MS }));
  return `${v}.${sign(v)}`;
}
export const cookieOptions = () => ({ httpOnly: true, sameSite: "lax" as const, secure: process.env.NODE_ENV === "production", path: "/", maxAge: TTL_MS / 1000 });

function phoneFromCookie(header: string | null): string | null {
  const raw = (header ?? "").split(/;\s*/).find((c) => c.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1);
  if (!raw) return null;
  const [v, sig] = decodeURIComponent(raw).split(".");
  if (!v || !sig) return null;
  const want = sign(v);
  if (want.length !== sig.length || !crypto.timingSafeEqual(Buffer.from(want), Buffer.from(sig))) return null;
  try { const j = JSON.parse(Buffer.from(v, "base64url").toString()) as { p: string; exp: number }; return j.exp > Date.now() ? j.p : null; } catch { return null; }
}

/** The signed-in person for this request (null when not signed in, or no longer in the directory). */
export async function currentUser(req: Request): Promise<Person | null> {
  const phone = phoneFromCookie(req.headers.get("cookie"));
  if (!phone) return null;
  return findByPhone((await getRepo()).db, phone) ?? null;
}

// ---- WhatsApp sign-in codes
interface Login { code: string; at: string; phone?: string }
async function logins(): Promise<Record<string, Login>> {
  const all = (await readJson<Record<string, Login>>(LOGINS))?.value ?? {};
  return Object.fromEntries(Object.entries(all).filter(([, l]) => Date.now() - Date.parse(l.at) < LOGIN_MS));
}
export async function startLogin(): Promise<{ loginId: string; code: string }> {
  const all = await logins();
  const loginId = crypto.randomBytes(12).toString("base64url");
  let code = "";
  do code = String(crypto.randomInt(100000, 1000000)); while (Object.values(all).some((l) => l.code === code));
  all[loginId] = { code, at: new Date().toISOString() };
  await writeJson(LOGINS, all);
  return { loginId, code };
}
/** The webhook saw "LOGIN <code>" from this number: the waiting browser signs in as it. */
export async function confirmLogin(code: string, phone: string): Promise<boolean> {
  const all = await logins();
  const hit = Object.entries(all).find(([, l]) => l.code === code && !l.phone);
  if (!hit) return false;
  hit[1].phone = digits(phone);
  await writeJson(LOGINS, all);
  return true;
}
/** The browser asks: has my code arrived? Returns the number once (the login is then used up). */
export async function pollLogin(loginId: string): Promise<{ phone?: string; expired?: boolean }> {
  const all = await logins();
  const l = all[loginId];
  if (!l) return { expired: true };
  if (!l.phone) return {};
  delete all[loginId];
  await writeJson(LOGINS, all);
  return { phone: l.phone };
}
export const isLoginMessage = (text: string) => /^\s*login\s*(\d{6})\s*$/i.exec(text)?.[1] ?? null;
