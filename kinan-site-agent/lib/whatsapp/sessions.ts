import type { ChatTurn } from "../core/llm/types";
import { readJson, writeJson } from "../store";

export interface WaSession {
  name: string;
  history: ChatTurn[];
  here?: { locationId: string; at: string; source: "gps" | "text" };
  focusDocId?: string;
  /** Photo/PDF received but not yet filed (bytes kept in storage under `key`). */
  pending?: { key: string; mime: string; filename: string; caption: string; at: string };
  seen: string[];
  lastSeen: string;
  /** The project this conversation is about ("kinan-heights" or a generated project's id), chosen from the list. */
  projectId?: string;
  /** A question sent before a project was chosen: answered as soon as one is. */
  queued?: string;
  /** Photos/PDFs just filed from this chat, waiting to be linked to an activity as evidence (cleared once used, or after 30 min). */
  evidence?: { docIds: string[]; at: string; /** the activity the photo reading suggested — "yes" records it */ suggest?: { activityId: string; state: "completed" | "in_progress" | "pending"; percent?: number } };
  /** In a facility conversation: the technician this phone belongs to ("I am Ahmed Bakr"), for their personal agent. */
  techId?: string;
  /** Set when this message starts a new conversation (first ever, or after a long silence). */
  fresh?: boolean;
}

// One storage object per sender, so concurrent conversations never overwrite each other.
const key = (waId: string) => `whatsapp/sessions/${waId.replace(/\D/g, "")}.json`;

export async function loadSession(waId: string, name: string): Promise<WaSession> {
  const r = await readJson<WaSession>(key(waId));
  const s: WaSession = r?.value ?? { name, history: [], seen: [], lastSeen: new Date().toISOString() };
  s.seen ??= [];
  s.name = name || s.name;
  // a new conversation: first message ever, or nothing for 12 hours — ask which project again
  s.fresh = !r || Date.now() - Date.parse(s.lastSeen) > 12 * 3600_000;
  s.lastSeen = new Date().toISOString();
  // "Here" from GPS/text expires after 3 h — people move around site.
  if (s.here && Date.now() - Date.parse(s.here.at) > 3 * 3600_000) s.here = undefined;
  return s;
}
export async function saveSession(waId: string, s: WaSession) {
  delete s.fresh;
  s.seen = s.seen.slice(-200);
  s.history = s.history.slice(-24);
  await writeJson(key(waId), s);
}
/** True the first time a message id is seen for this sender (Meta retries deliveries). */
export function firstTime(s: WaSession, messageId: string): boolean {
  if (s.seen.includes(messageId)) return false;
  s.seen.push(messageId);
  return true;
}

/** Allowed senders: WHATSAPP_ALLOWED_NUMBERS="966500000102:Development Manager,9665…:Name" */
export function allowed(waId: string): { ok: boolean; name?: string } {
  if ((process.env.WHATSAPP_ALLOW_ALL ?? "").toLowerCase() === "true") return { ok: true };
  const list = (process.env.WHATSAPP_ALLOWED_NUMBERS ?? "").split(",").map((x) => x.trim()).filter(Boolean);
  for (const e of list) {
    const [num, ...rest] = e.split(":");
    if (num.replace(/\D/g, "") === waId.replace(/\D/g, "")) return { ok: true, name: rest.join(":").trim() || undefined };
  }
  return { ok: false };
}

// ---- Guests: anyone who sends the join code (WHATSAPP_JOIN_CODE, shown at a demo) is let in for a while
// (WHATSAPP_GUEST_HOURS, default 72) without being added to WHATSAPP_ALLOWED_NUMBERS. Kept in one storage object.
export interface Guest { name: string; joined: string; until: string }
const GUESTS = "whatsapp/guests.json";
export const joinCode = () => (process.env.WHATSAPP_JOIN_CODE ?? "").trim();
const guestHours = () => Math.max(1, Number(process.env.WHATSAPP_GUEST_HOURS) || 72);
const digits = (x: string) => x.replace(/\D/g, "");
export async function listGuests(): Promise<Record<string, Guest>> {
  const all = (await readJson<Record<string, Guest>>(GUESTS))?.value ?? {};
  const now = Date.now();
  return Object.fromEntries(Object.entries(all).filter(([, g]) => Date.parse(g.until) > now));
}
export async function guest(waId: string): Promise<Guest | null> { return (await listGuests())[digits(waId)] ?? null; }
/** Does this message carry the join code? Accepts "KINAN", "join KINAN", "code: kinan" — case and spacing ignored. */
export function isJoin(text: string): boolean {
  const code = joinCode(); if (!code) return false;
  const t = text.trim().toLowerCase().replace(/^(join|code|access|انضمام|رمز)\s*:?\s*/i, "").replace(/[\s.!]+/g, "");
  return t === code.toLowerCase().replace(/\s+/g, "");
}
export async function admitGuest(waId: string, name: string): Promise<Guest> {
  const all = await listGuests();
  const g: Guest = { name: name || "Guest", joined: new Date().toISOString(), until: new Date(Date.now() + guestHours() * 3600_000).toISOString() };
  all[digits(waId)] = g;
  await writeJson(GUESTS, all);
  return g;
}
export async function clearGuests(): Promise<number> { const n = Object.keys(await listGuests()).length; await writeJson(GUESTS, {}); return n; }
