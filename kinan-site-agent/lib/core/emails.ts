import type { ProjectData } from "../types";
/**
 * Contractor emails: the shape the agent reads, the search over them, and the demo inbox. IO-free, so it runs on the
 * server (lib/inbox.ts reads the Outlook mailbox through Microsoft Graph) and in the standalone build (demo inbox).
 */
export interface Email {
  id: string;
  received: string;          // ISO date-time
  from: string;              // address
  fromName: string;
  company: string;           // from the project directory or the sender's domain
  to: string[];
  subject: string;
  text: string;              // plain-text body, quoted history trimmed
  attachments: string[];     // file names
  conversationId?: string;
  importance?: "low" | "normal" | "high";
  webLink?: string;
}
export interface InboxState { mode: "demo" | "live"; mailbox: string; lastSync: string | null; error: string | null; emails: Email[] }

/** Strip HTML to readable text and cut the quoted history ("From: … Sent: …", "-----Original Message-----", "On … wrote:"). */
export function plainText(html: string, isHtml = true): string {
  let t = html;
  if (isHtml) t = t.replace(/<(style|script)[\s\S]*?<\/\1>/gi, "").replace(/<br\s*\/?>/gi, "\n").replace(/<\/(p|div|li|tr|h\d)>/gi, "\n").replace(/<li[^>]*>/gi, "• ").replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'");
  const cut = t.search(/\n\s*(-{2,}\s*Original Message|From:\s.+\n\s*(Sent|Date):|On .{5,80} wrote:)/i);
  if (cut > 40) t = t.slice(0, cut);
  return t.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim().slice(0, 12_000);
}

const fold = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const words = (s: string) => fold(s).split(/[^\p{L}\p{N}-]+/u).filter((w) => w.length > 1);
/** Newest first; keyword match on subject, sender, company, body and attachment names. */
export function searchEmails(all: Email[], q: { query?: string; from?: string; since?: string; until?: string; limit?: number }) {
  const ws = q.query ? words(q.query) : [];
  const from = q.from?.toLowerCase();
  const hits = all.filter((e) => {
    if (q.since && e.received.slice(0, 10) < q.since) return false;
    if (q.until && e.received.slice(0, 10) > q.until) return false;
    if (from && !fold(`${e.from} ${e.fromName} ${e.company}`).includes(fold(from))) return false;
    if (!ws.length) return true;
    const hay = fold(`${e.subject} ${e.fromName} ${e.company} ${e.text} ${e.attachments.join(" ")}`);
    return ws.every((w) => hay.includes(w));
  }).sort((a, b) => b.received.localeCompare(a.received));
  return {
    total: hits.length,
    emails: hits.slice(0, Math.min(q.limit ?? 15, 40)).map((e) => ({ id: e.id, received: e.received.slice(0, 16).replace("T", " "), from: `${e.fromName} <${e.from}>`, company: e.company, subject: e.subject, preview: e.text.replace(/\s+/g, " ").slice(0, 220), attachments: e.attachments, importance: e.importance })),
  };
}

// ---------------------------------------------------------------- demo inbox (matches the seeded programme and procurement)
const D = (day: number, hm: string) => { const d = new Date(Date.UTC(2026, 9, 1 + day)); return `${d.toISOString().slice(0, 10)}T${hm}:00Z`; };
const m = (id: string, received: string, fromName: string, from: string, company: string, subject: string, text: string, attachments: string[] = [], importance: Email["importance"] = "normal"): Email =>
  ({ id: `demo-${id}`, received, from, fromName, company, to: ["projectupdates@kinan.example"], subject, text, attachments, importance, conversationId: `c-${id}` });

/** The demo inbox: the emails of the base week, plus what the contractors write each day as the programme moves on
 *  (slabs poured, façade zones done, delayed loads, the weekly HSE report) — so every day has new mail. */
export function demoEmails(data?: ProjectData): Email[] {
  return [...baseEmails(), ...(data ? dailyEmails(data) : [])].sort((a, b) => b.received.localeCompare(a.received));
}

const dayAdd = (iso: string, n: number) => new Date(Date.parse(iso.slice(0, 10) + "T00:00:00Z") + n * 86_400_000).toISOString().slice(0, 10);
const nice = (iso: string) => new Date(iso.slice(0, 10) + "T12:00:00Z").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
/** Mail generated from the programme and procurement for the 14 days up to the data date (after the base week). */
function dailyEmails(data: ProjectData): Email[] {
  const d0 = data.meta.dataDate, from = dayAdd(d0, -13), base = "2026-10-02", out: Email[] = [];
  const inWindow = (d: string) => d >= from && d <= d0 && d >= base;
  const towers: Record<string, { cm: [string, string]; name: string }> = {
    TA: { cm: ["Karim Mansour", "k.mansour@albunyan.example"], name: "Tower A" }, TB: { cm: ["Karim Mansour", "k.mansour@albunyan.example"], name: "Tower B" },
    HC: { cm: ["Yousef Darwish", "y.darwish@albunyan.example"], name: "Hotel C" },
  };
  for (const a of data.schedule) {
    const t = /^(TA|TB|HC)-STR-L(\d+)$/.exec(a.id);
    if (t && inWindow(a.finish)) {
      const tw = towers[t[1]], lv = Number(t[2]), next = data.schedule.find((x) => x.id === `${t[1]}-STR-L${lv + 1}`);
      const late = Math.round((Date.parse(a.finish) - Date.parse(a.baselineFinish)) / 86_400_000);
      out.push(m(`str-${a.id}`, `${a.finish}T17:${String(10 + (lv % 40)).padStart(2, "0")}:00Z`, tw.cm[0], tw.cm[1], "Al-Bunyan Contracting", `${tw.name} L${lv} slab poured`,
        `Hi all,\n\n${tw.name} level ${lv} slab was poured today (${a.id}). Pour started 04:30 and finished 13:10; cubes taken, curing compound applied, PT stressing planned in 7 days.${late > 0 ? `\n\nWe are ${late} day${late > 1 ? "s" : ""} behind the baseline on this level.` : ""}\n\n${next ? `Next: L${lv + 1} — columns and core walls start ${nice(next.start)}, pour planned ${nice(next.finish)}.` : "This was the roof slab — topping out."}\n\n${tw.cm[0]}\nAl-Bunyan Contracting`));
    }
    const f = /^(TA|TB|HC)-FAC-Z(\d+)$/.exec(a.id);
    if (f && inWindow(a.finish)) out.push(m(`fac-${a.id}`, `${a.finish}T15:20:00Z`, "Daniel Lee", "daniel.lee@skyline-facade.example", "Skyline Façade Systems", `${towers[f[1]].name} façade zone ${f[2]} installed`,
      `Dear Kinan team,\n\nAll unitised panels of ${a.name.replace(/^.*?façade/, "façade")} are installed and sealed. Water test booked for ${nice(dayAdd(a.finish, 2))}; the cradle moves up to the next zone tomorrow.\n\nDaniel Lee\nSkyline Façade Systems`));
    if (a.milestone && inWindow(a.finish)) out.push(m(`ms-${a.id}`, `${a.finish}T12:00:00Z`, "Ahmed Saleh", "a.saleh@albunyan.example", "Al-Bunyan Contracting", `Milestone reached: ${a.name}`,
      `Dear Kinan,\n\nWe confirm the milestone "${a.name}" (${a.id}) is achieved today${a.finish > a.baselineFinish ? `, ${Math.round((Date.parse(a.finish) - Date.parse(a.baselineFinish)) / 86_400_000)} days after the baseline date` : ""}. Supporting records will follow with the monthly report.\n\nAhmed Saleh\nProject Manager, Al-Bunyan Contracting`, [], "high"));
  }
  // delayed loads: the procurement manager warns the day before
  const sup = new Map(data.procurement.suppliers.map((x) => [x.id, x.name]));
  for (const dl of data.procurement.deliveries.filter((x) => x.status === "Delayed")) {
    const sent = dayAdd(d0, -1 - (Number(dl.id.replace(/\D/g, "")) % 3));
    if (!inWindow(sent)) continue;
    const po = data.procurement.pos.find((p) => p.po === dl.po);
    out.push(m(`dl-${dl.id}-${sent}`, `${sent}T10:05:00Z`, "Ibrahim Al-Zahrani", "i.alzahrani@albunyan.example", "Al-Bunyan Contracting", `Delayed load — ${dl.items.split(",")[0]} (${dl.po})`,
      `Team,\n\n${po ? sup.get(po.supplierId) ?? "The supplier" : "The supplier"} advises the load of ${dl.items} on ${dl.po} will not arrive on ${nice(dl.date)} as booked.${dl.remarks ? ` ${dl.remarks}.` : ""} Gate 2 slot released; we will rebook when the supplier confirms dispatch.\n\nIbrahim Al-Zahrani\nProcurement Manager`, [], "high"));
  }
  // the main contractor's daily site report, every evening (18:30 Riyadh)
  const pct = (a: { start: string; finish: string }, d: string) => (a.finish <= d ? 100 : a.start > d ? 0 : Math.min(99, Math.max(1, Math.round(((Date.parse(d) - Date.parse(a.start)) / Math.max(86_400_000, Date.parse(a.finish) - Date.parse(a.start))) * 100))));
  const st0 = data.safety.stats as Record<string, number>;
  for (let i = 0; i < 14; i++) {
    const d = dayAdd(d0, -i), prev = dayAdd(d, -1);
    if (!inWindow(d)) continue;
    const live = data.schedule.filter((a) => !a.milestone && a.start <= d && a.finish > d);
    const moved = live.filter((a) => a.start <= prev).map((a) => ({ a, p0: pct(a, prev), p1: pct(a, d) })).filter((x) => x.p1 > x.p0).sort((x, y) => Number(y.a.critical) - Number(x.a.critical) || (y.p1 - y.p0) - (x.p1 - x.p0)).slice(0, 5);
    const fin = data.schedule.filter((a) => !a.milestone && a.finish === d);
    const recv = data.procurement.deliveries.filter((x) => x.date === d && (x.status === "Received" || x.status === "Rejected"));
    const next = data.schedule.filter((a) => /-STR-L\d+$/.test(a.id) && a.finish === dayAdd(d, 1));
    const crew = Math.round((st0.workforceToday || 2200) * (0.94 + ((i * 37) % 11) / 100));
    out.push(m(`dsr-${d}`, `${d}T15:30:00Z`, "Peter Novak", "p.novak@albunyan.example", "Al-Bunyan Contracting", `Daily site report — ${nice(d)}`,
      `Daily site report, ${nice(d)}.\n\n• Manpower on site: ${crew}\n• Activities in progress: ${live.length}${fin.length ? `\n• Completed today: ${fin.slice(0, 4).map((a) => a.name).join("; ")}${fin.length > 4 ? ` (+${fin.length - 4})` : ""}` : ""}\n• Deliveries received: ${recv.length}${recv.some((x) => x.status === "Rejected") ? ` (${recv.filter((x) => x.status === "Rejected").length} rejected)` : ""}\n\nProgress today:\n${moved.map((x) => `• ${x.a.name}: ${x.p0}% → ${x.p1}%`).join("\n") || "• no measurable change"}${next.length ? `\n\nTomorrow: ${next.map((a) => a.name.split(" — ")[0] + " slab pour").join(", ")}.` : ""}\n\nPeter Novak\nPlanning Manager, Al-Bunyan Contracting`, [`DSR_${d}.pdf`]));
  }
  // weekly HSE report every Sunday
  for (let i = 0; i < 14; i++) {
    const d = dayAdd(d0, -i);
    if (!inWindow(d) || new Date(d + "T12:00:00Z").getUTCDay() !== 0) continue;
    const st = data.safety.stats as Record<string, number>;
    const wk = Math.ceil((Date.parse(d) - Date.parse("2026-01-01")) / (7 * 86_400_000));
    out.push(m(`hse-${d}`, `${d}T07:40:00Z`, "Sanjay Menon", "s.menon@albunyan.example", "Al-Bunyan Contracting", `Weekly HSE report — week ${wk}`,
      `Week ${wk} summary:\n• LTI-free days: ${st.ltiFreeDays}\n• Workforce today: ${st.workforceToday}\n• Near misses this week: ${2 + (wk % 4)}\n• Live permits: ${data.safety.permits.filter((p) => p.status === "Active").length}\n• Heat stress: midday work ban observed; no cases this week\n\nFull report attached.`, [`HSE_Weekly_Report_W${wk}.pdf`]));
  }
  return out;
}

function baseEmails(): Email[] {
  return [
    m("01", D(0, "05:42"), "Daniel Lee", "daniel.lee@skyline-facade.example", "Skyline Façade Systems", "PKG-06 Tower A unitised panels — batch 4 delay (PO-4500136)",
      "Dear Kinan team,\n\nFurther to our call, the float-glass supplier has advised a further delay on the low-iron glass for batch 4 of the Tower A unitised panels (types A1 and A2 corner).\n\nRevised dates:\n• Batch 4 ex-works: 18 Nov 2026 (was 31 Oct)\n• Delivery to site, Gate 2: 2 Dec 2026 (was 14 Nov)\n\nThis is an 18-day slip against PO-4500136. Zone 4 (L13–L16) installation would start on 4 Dec instead of 21 Nov. We are looking at air-freighting 40 panels to keep the south elevation going and will confirm the cost by Sunday.\n\nRegards,\nDaniel Lee\nFaçade Package Manager, Skyline Façade Systems",
      ["Skyline_PKG06_batch4_recovery_programme.pdf"], "high"),
    m("02", D(0, "16:10"), "Karim Mansour", "k.mansour@albunyan.example", "Al-Bunyan Contracting", "Tower A L13 slab — pour moved to 7 Oct",
      "Hi all,\n\nThe Tower A L13 slab pour planned for 5 Oct is moved to 7 Oct. The PT anchorages for the east bays arrived short (PT-Tech DN-00412) and the replacement set is on site tomorrow morning. Core walls L14 are not affected and the jump-form climbs on Saturday as planned.\n\nImpact: +2 days on TA-STR-L13 (critical). We will try to recover it on L14–L15 with a 7-day cycle and an extra rebar gang on night shift.\n\nKarim Mansour\nConstruction Manager — Towers, Al-Bunyan Contracting"),
    m("03", D(-1, "09:05"), "Sanjay Menon", "s.menon@albunyan.example", "Al-Bunyan Contracting", "Weekly HSE report — week 39",
      "Week 39 summary:\n• Man-hours: 418,600 (LTI-free days: 212)\n• Near misses: 3 (dropped object Tower B L27, forklift reversing at laydown 2, unsecured ladder podium L3)\n• Heat stress: midday work ban observed 12:00–15:00; 2 workers referred to the clinic, both returned to work\n• Permits: 11 live (3 hot work, 3 work at height, 2 critical lifts, 2 confined space, 1 excavation)\n• Action: debris netting on Tower B L26–L28 to be extended before façade zone 8 starts.\n\nFull report attached.",
      ["HSE_Weekly_Report_W39.pdf"]),
    m("04", D(-2, "11:30"), "George Thomas", "george.thomas@gulf-mep.example", "Gulf Integrated MEP Services", "Substation — SEC inspection booked 15 Oct",
      "Dear Kinan,\n\nThe SEC inspection of the 33/11 kV substation is confirmed for 15 Oct 2026, 09:00. Both 2.5 MVA transformers are energised for testing and the protection relay settings were approved on 28 Sep.\n\nPlease make sure the access road to the substation is clear of material deliveries that morning.\n\nGeorge Thomas\nMEP Manager"),
    m("05", D(-3, "14:20"), "Huang Wei", "huang.wei@vertexlifts.example", "Vertex Lifts Arabia", "Tower B lifts — shaft handover request L1–L20",
      "Hello,\n\nWe are ready to start rail installation in Tower B shafts L1–L20 from 12 Oct. We need the shafts handed over clean, with the temporary protection removed and the pit ladders installed. Can Al-Bunyan confirm the handover date?\n\nBest regards,\nHuang Wei\nLift Project Manager, Vertex Lifts Arabia"),
    m("06", D(-4, "08:15"), "Ibrahim Al-Zahrani", "i.alzahrani@albunyan.example", "Al-Bunyan Contracting", "Rebar deliveries next 2 weeks",
      "Team,\n\nNajd Steel confirmed rebar deliveries for Tower A L13–L16 and Hotel C L1–L4: 6 trucks over the next 14 days, all through Gate 2, 08:00–10:00 slots. The low-bed escort for the 4 Oct load is booked.\n\nStock in the rebar yard is 640 t, above the 500 t minimum.\n\nIbrahim"),
    m("07", D(-5, "17:45"), "Yousef Darwish", "y.darwish@albunyan.example", "Al-Bunyan Contracting", "Hotel C — raft complete, superstructure start 4 Oct",
      "Dear all,\n\nThe Hotel C raft was completed on 20 Sep (late against the 25 Aug baseline because of the piling rig breakdown). TC3 passed its load test on 12 Sep. The first deck (L1) formwork starts on 4 Oct, with a 10-day cycle planned.\n\nYousef Darwish\nConstruction Manager — Hotel & Podium"),
    m("08", D(-6, "10:00"), "Marco Bianchi", "marco.bianchi@skyline-facade.example", "Skyline Façade Systems", "RFI-0157 Tower B embeds tolerance — proposal",
      "Hi Rania,\n\nOn RFI-0157 (embed tolerance L2–L9 Tower B), we propose slotted brackets type SB-2 for the 23 embeds out of tolerance, with no change to the panel design. Calculation and shop drawing attached for the structural engineer's review.\n\nMarco Bianchi\nFaçade Coordinator",
      ["SB-2_bracket_calc.pdf", "RFI-0157_response_sketch.pdf"]),
  ];
}
