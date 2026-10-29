// Tenants' and occupants' complaints: a lounge too hot, a leak in a washroom, a lift that keeps stopping. Each one is
// logged (the app, WhatsApp through the agent, a QR code on site, the helpdesk, a tenant portal through the API), read
// for what it is about and how serious it is (English and Arabic words; a person can correct it), placed in an area and
// tied to the equipment behind it. The analysis finds what one complaint can't show: several about the same thing in
// the same place (a cluster), a tenant who keeps complaining, how the categories move day to day — and what the
// equipment says at the same time (a supply-air temperature rising where people say it is hot). The orchestrator turns
// clusters into work, links complaints to the job already open, raises its priority, and tells the tenants when it is
// fixed. Deterministic and offline: no AI provider needed to classify.
import type { Asset, Complaint, ComplaintCategory, FmData } from "./types";
import { isOpen } from "./engine";
import { predictions } from "./predict";

export { CATEGORY_LABEL } from "./complaintLabels";
import { CATEGORY_LABEL } from "./complaintLabels";
// what the words say: English and Arabic, most specific first
const CATS: [ComplaintCategory, RegExp][] = [
  ["lift_escalator", /\b(lifts?|elevators?|escalators?|travelators?|moving walk)\b|مصعد|المصاعد|سلم متحرك|الدرج الكهربائي/i],
  ["baggage", /\b(bags?|baggage|luggage|carousel|reclaim belt|belt \d)\b|حقائب|الأمتعة|سير الحقائب/i],
  ["leak", /\b(leak\w*|drip\w*|flood\w*|burst|tap|basin|toilet\w*|urinal|water on the floor|blocked drain)\b|تسرب|تسريب|ماء على الأرض|مياه/i],
  ["temperature", /\b(hot|warm|cold|freezing|stuffy|humid|air ?con\w*|a\/c|ac not|no cool air|temperature|sweat\w*)\b|حار|حارة|حر|بارد|التكييف|مكيف|رطوبة/i],
  ["lighting", /\b(lights?|lighting|dark|flicker\w*|bulb|lamp)\b|إضاءة|الإضاءة|مظلم|ظلام/i],
  ["odour", /\b(smell\w*|odou?r|stink\w*|sewage)\b|رائحة|ريحة/i],
  ["cleaning", /\b(dirty|clean\w*|trash|rubbish|bins?|spill\w*|litter|stain\w*)\b|وسخ|متسخ|نظافة|قمامة/i],
  ["noise", /\b(nois\w*|loud|bang\w*|squeal\w*|rattl\w*|hum\w*)\b|ضجيج|إزعاج|صوت عال/i],
  ["power", /\b(power|socket|outlet|charging point|no electricity|outage|trip(ped)?)\b|كهرباء|انقطاع/i],
  ["access", /\b(door\w*|lock\w*|gate won.t|access card|turnstile|boarding bridge|jet ?bridge|bridge)\b|باب|الباب|قفل|جسر/i],
];
const URGENT = /\b(stuck|trapped|flood\w*|sparks?|smoke|fire|burning|injur\w*|fell|slip\w*|unsafe|danger\w*|wheelchair|prm|reduced mobility)\b|عالق|محتجز|حريق|دخان|خطر|إصابة/i;
const MINOR = /\b(minor|slightly|a bit|small)\b|بسيط/i;

/** What a complaint is about, and how serious it is. */
export function classify(text: string): { category: ComplaintCategory; severity: Complaint["severity"] } {
  const category = CATS.find(([, re]) => re.test(text))?.[0] ?? "other";
  const severity = URGENT.test(text) ? "high" : MINOR.test(text) ? "low" : "medium";
  return { category, severity };
}

// the equipment behind each kind of complaint
const CLASSES: Partial<Record<ComplaintCategory, string[]>> = { temperature: ["ahu", "chiller"], lift_escalator: ["lift", "escalator"], baggage: ["bhs"], power: ["ups", "genset"], leak: ["building"], cleaning: ["building"], odour: ["building"], lighting: ["building"], access: ["building", "pbb"], noise: ["building"] };

/** The area a complaint is in: a zone named in the text or the place, a gate number (airports), or none. */
export function placeOf(d: FmData, facilityId: string, text: string): string | undefined {
  const zones = d.zones.filter((z) => z.facilityId === facilityId);
  const t = text.toLowerCase();
  // the area's full name, or its first word when that is distinctive ("departures", "baggage", "pier")
  const GENERIC = new Set(["airport", "main", "robot", "central", "export", "control", "utilities", "main"]);
  const named = zones.find((z) => t.includes(z.name.toLowerCase())) ?? zones.find((z) => { const w = z.name.toLowerCase().split(/[ &,(]/)[0]; return w.length >= 4 && !GENERIC.has(w) && new RegExp(`\\b${w}\\b`).test(t); });
  if (named) return named.name;
  const gate = /\bgates?\s*(\d{1,3})/i.exec(text);
  if (gate) {
    // gates 2xx are on pier B in the demo airport; a boarding bridge names its gate
    const pbb = d.assets.find((a) => a.facilityId === facilityId && a.name.includes(`gate ${gate[1]}`));
    if (pbb) return zones.find((z) => pbb.zone.startsWith(z.name))?.name ?? pbb.zone;
    if (/^2\d\d$/.test(gate[1])) return zones.find((z) => /pier b/i.test(z.name))?.name;
  }
  if (/lounge|pier/i.test(text)) return zones.find((z) => /pier/i.test(z.name))?.name;
  if (/check-?in|security lane|duty free|departure/i.test(text)) return zones.find((z) => /departures/i.test(z.name))?.name;
  if (/reclaim|arrival/i.test(text)) return zones.find((z) => /arrivals/i.test(z.name))?.name;
  return undefined;
}

/** The equipment a complaint is most likely about: named outright (a tag, "escalator D2", "gate 203"), else the
 *  equipment of that kind in that area — the one in the worst state first. */
export function assetFor(d: FmData, facilityId: string, text: string, category: ComplaintCategory, zone?: string): Asset | undefined {
  const mine = d.assets.filter((a) => a.facilityId === facilityId);
  const t = text.toUpperCase();
  const byTag = mine.find((a) => new RegExp(`\\b${a.tag.replace(/[-]/g, "[- ]?")}\\b`).test(t));
  if (byTag) return byTag;
  const esc = /escalator\s*([a-z])?\s*-?(\d{1,2})/i.exec(text), lift = /lift\s*(\d{1,2})/i.exec(text), gate = /gate\s*(\d{1,3})/i.exec(text), car = /(carousel|belt)\s*([a-z]?\d{1,2})/i.exec(text);
  if (esc) { const n = esc[2].padStart(2, "0"), hit = mine.find((a) => a.class === "escalator" && a.tag.endsWith(n) && (!esc[1] || a.tag.includes(`-${esc[1].toUpperCase()}`))); if (hit) return hit; }
  if (lift) { const hit = mine.find((a) => a.class === "lift" && a.tag.endsWith(lift[1].padStart(2, "0"))); if (hit) return hit; }
  if (car) { const hit = mine.find((a) => /carousel/i.test(a.name) && a.tag.toUpperCase().endsWith(car[2].toUpperCase())); if (hit) return hit; }
  if (gate && (category === "access" || category === "temperature" || /bridge|jet ?way/i.test(text))) { const hit = mine.find((a) => a.class === "pbb" && a.name.includes(`gate ${gate[1]}`)); if (hit && (category !== "temperature" || /bridge|jet ?way/i.test(text))) return hit; }
  const classes = CLASSES[category];
  if (!classes) return undefined;
  const worst = (xs: Asset[]) => [...xs].sort((a, b) => a.condition - b.condition)[0];
  const here = mine.filter((a) => classes.includes(a.class) && (!zone || a.zone === zone || a.zone.startsWith(zone)));
  // in the area first; for cooling, the area's air handler, else the central plant
  return worst(here.filter((a) => a.class !== "chiller")) ?? worst(here) ?? (category === "temperature" ? worst(mine.filter((a) => a.class === "chiller" && a.status !== "standby")) : category === "leak" || category === "cleaning" || category === "odour" || category === "lighting" ? mine.find((a) => a.class === "building") : undefined);
}

/** A new complaint from its words: classified, placed, tied to equipment — and to the job already open on it. */
export function makeComplaint(d: FmData, x: { facilityId: string; text: string; from: string; contact?: string; where?: string; channel: Complaint["channel"]; at?: string; id?: string }): Complaint {
  const { category, severity } = classify(`${x.text} ${x.where ?? ""}`);
  const zone = placeOf(d, x.facilityId, `${x.where ?? ""} ${x.text}`);
  const a = assetFor(d, x.facilityId, `${x.where ?? ""} ${x.text}`, category, zone);
  const wo = a ? d.workOrders.find((w) => w.assetId === a.id && isOpen(w) && w.type !== "PM") : undefined;
  return { id: x.id ?? newComplaintId(d, x.facilityId), facilityId: x.facilityId, at: x.at ?? new Date().toISOString(), channel: x.channel, from: x.from.slice(0, 80), ...(x.contact ? { contact: x.contact.slice(0, 120) } : {}),
    ...(x.where ? { where: x.where.slice(0, 120) } : {}), ...(zone ? { zone } : {}), text: x.text.slice(0, 1000), category, severity, ...(a ? { assetId: a.id } : {}), ...(wo ? { woId: wo.id } : {}), status: wo ? "in_progress" : "open" };
}
export function newComplaintId(d: FmData, facilityId: string) {
  const n = d.complaints.filter((c) => c.facilityId === facilityId).length + 1;
  return `CMP-${facilityId.toUpperCase()}-${String(n).padStart(3, "0")}-${Date.now().toString(36).slice(-3)}`;
}

export interface Cluster { key: string; category: ComplaintCategory; zone: string; ids: string[]; assetId?: string; woId?: string; first: string; last: string; signal?: string }

/** The analysis: clusters, categories over fourteen days, tenants who keep complaining, time to resolve, and what the
 *  equipment says in the same place. */
export function complaintInsights(d: FmData, facilityId: string, now = Date.now()) {
  const all = d.complaints.filter((c) => c.facilityId === facilityId).sort((a, b) => b.at.localeCompare(a.at));
  const open = all.filter((c) => c.status !== "resolved");
  const day = (iso: string) => iso.slice(0, 10);
  const days = Array.from({ length: 14 }, (_, k) => new Date(now - (13 - k) * 86_400_000).toISOString().slice(0, 10));
  const perDay = days.map((dd) => ({ day: dd, n: all.filter((c) => day(c.at) === dd).length }));
  const cats = Object.keys(CATEGORY_LABEL) as ComplaintCategory[];
  const last7 = all.filter((c) => now - Date.parse(c.at) < 7 * 86_400_000), prev7 = all.filter((c) => now - Date.parse(c.at) >= 7 * 86_400_000 && now - Date.parse(c.at) < 14 * 86_400_000);
  const byCategory = cats.map((k) => ({ category: k, label: CATEGORY_LABEL[k], week: last7.filter((c) => c.category === k).length, before: prev7.filter((c) => c.category === k).length, open: open.filter((c) => c.category === k).length })).filter((x) => x.week || x.before || x.open).sort((a, b) => b.week - a.week);
  // clusters: open complaints of one kind in one place within a day, or about the same equipment
  const preds = predictions(d, facilityId, now);
  const groups = new Map<string, Complaint[]>();
  for (const c of open.filter((x) => now - Date.parse(x.at) < 24 * 3600_000)) {
    const key = c.assetId ? `asset:${c.assetId}` : `${c.category}|${c.zone ?? "?"}`;
    groups.set(key, [...(groups.get(key) ?? []), c]);
  }
  const clusters: Cluster[] = [...groups.entries()].filter(([, xs]) => xs.length >= 2 || xs.some((c) => c.severity === "high")).map(([key, xs]) => {
    const a = d.assets.find((x) => x.id === xs[0].assetId);
    const p = a && preds.find((y) => y.assetId === a.id);
    const off = a?.readings.find((r) => (r.high !== undefined && r.value > r.high) || (r.low !== undefined && r.value < r.low));
    const signal = p ? `${a!.tag}: ${p.reading.name} ${p.value} ${p.reading.unit}, heading for ${p.limit} in about ${Math.round(p.days)} days` : off ? `${a!.tag}: ${off.name} ${off.value} ${off.unit}, past its limit` : a && a.status !== "running" ? `${a.tag} is ${a.status}` : undefined;
    return { key, category: xs[0].category, zone: xs[0].zone ?? a?.zone ?? "—", ids: xs.map((c) => c.id), ...(a ? { assetId: a.id } : {}), ...(xs.find((c) => c.woId)?.woId ? { woId: xs.find((c) => c.woId)!.woId } : {}),
      first: xs[xs.length - 1].at, last: xs[0].at, ...(signal ? { signal } : {}) };
  }).sort((a, b) => b.ids.length - a.ids.length);
  // tenants who keep complaining (two or more in a week)
  const repeat = [...new Set(last7.map((c) => c.from))].map((f) => ({ from: f, n: last7.filter((c) => c.from === f).length })).filter((x) => x.n >= 2 && !/^passenger/i.test(x.from)).sort((a, b) => b.n - a.n);
  const done = all.filter((c) => c.status === "resolved" && c.resolvedAt);
  const hours = done.map((c) => (Date.parse(c.resolvedAt!) - Date.parse(c.at)) / 3600_000).filter((h) => h >= 0);
  return {
    open: open.length, today: all.filter((c) => day(c.at) === days[13]).length, week: last7.length, weekBefore: prev7.length,
    resolveHours: hours.length ? Math.round((hours.reduce((s, h) => s + h, 0) / hours.length) * 10) / 10 : null,
    unlinked: open.filter((c) => !c.woId).length, perDay, byCategory, clusters, repeat,
  };
}
