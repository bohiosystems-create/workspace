// CRM signals: anomalies in what the CRM shows, for the whole portfolio, each project and each campaign.
// They feed the market-initiative ideation (lib/ideation.ts): when leads, qualified leads or sales fall unusually
// (or a channel surges), an initiative is proposed to answer it.
//
// Everything is computed from CRM leads (lib/crm.ts) by week of creation (leads, qualified) and by month of closing
// (contracts, sales). Only complete weeks / months up to the CRM's latest data are used.
//   SUDDEN_DROP     last 3 weeks vs the 8 weeks before: ≥25% lower and far outside normal week-to-week variation
//                   (z ≤ −2, with the baseline's own over-dispersion)
//   DECLINE         a steady fall over 12 weeks: fitted trend ≥25% down with t ≤ −2.5 (not already a sudden drop)
//   SURGE           last 3 weeks ≥30% higher, z ≥ 2.5 (an opportunity to scale)
//   QUAL_RATE_DROP  qualified share of leads ≥20% lower (relative), two-proportion z ≤ −2
//   SALES_DROP      contracts in the last complete month ≤70% of the 3 months before and unlikely by chance (p < 0.1)
//   LOST_REASON     a market reason for lost leads (price, financing, competitor, location) up ≥6 points, z ≥ 2.5
// Leads, follow-up and sales handling belong to Kinan's agent: signals only drive marketing initiatives.
import { prisma } from "./prisma";
import { ensureCrmSynced } from "./crm";
import { familyOf, FAMILY_LABEL } from "./history";
import { type Lang, nm, dt } from "./i18n";

type Bi = { en: string; ar: string };
const bi = (en: string, ar: string): Bi => ({ en, ar });
const DAY = 86_400_000;
const QUAL = new Set(["QUALIFIED", "VIEWING", "RESERVED", "WON"]);
const MARKET_REASONS: Record<string, Bi> = { Price: bi("price", "السعر"), Financing: bi("financing", "التمويل"), "Chose competitor": bi("chose a competitor", "اختيار منافس"), Location: bi("location", "الموقع") };
const r1 = (x: number) => Math.round(x * 10) / 10;
const pctS = (x: number) => `${x > 0 ? "+" : x < 0 ? "−" : ""}${Math.abs(Math.round(x * 100))}%`;

export type SignalKind = "SUDDEN_DROP" | "DECLINE" | "SURGE" | "QUAL_RATE_DROP" | "SALES_DROP" | "LOST_REASON";
export type SignalMetric = "leads" | "qualified" | "qualRate" | "contracts" | "lost";
export type Driver = { campaign: string; vendor: string; channel: string; family: string; perWeek: number; note: Bi | null };
export type Signal = {
  id: string; kind: SignalKind; metric: SignalMetric; direction: "down" | "up"; severity: "crit" | "warn" | "info";
  scope: "portfolio" | "project" | "campaign"; project: string | null; campaign: string | null; vendor: string | null; family: string | null;
  recent: number; baseline: number; changePct: number; stat: number; from: string; to: string; reason?: string;
  drivers: Driver[]; title: Bi; why: Bi;
};

const monday = (d: Date) => { const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())); x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7)); return x; };
const mean = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);
const variance = (xs: number[]) => { const m = mean(xs); return xs.length > 1 ? xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1) : 0; };
/** P(X ≤ k) for X ~ Poisson(lambda). */
const poissonCdf = (k: number, lambda: number) => { let p = Math.exp(-lambda), s = p; for (let i = 1; i <= k; i++) { p *= lambda / i; s += p; } return s; };
/** OLS slope, its t statistic and the fitted values at both ends. */
function trend(ys: number[]) {
  const n = ys.length, xs = ys.map((_, i) => i), mx = mean(xs), my = mean(ys);
  const sxx = xs.reduce((s, x) => s + (x - mx) ** 2, 0);
  const b = xs.reduce((s, x, i) => s + (x - mx) * (ys[i] - my), 0) / sxx, a = my - b * mx;
  const resid = ys.reduce((s, y, i) => s + (y - (a + b * i)) ** 2, 0) / Math.max(1, n - 2);
  const se = Math.sqrt(resid / sxx) || 1e-9;
  return { slope: b, t: b / se, first: a, last: a + b * (n - 1) };
}

type Lead = { createdAt: Date; stage: string; closedAt: Date | null; dealValueM: number | null; lostReason: string | null; campaignId: string | null };
type Camp = { id: string; name: string; project: string; vendor: string; channel: string; family: string; status: string; endDate: Date; startDate: Date };

export async function crmSignals() {
  await ensureCrmSynced();
  const [campaigns, leads] = await Promise.all([prisma.campaign.findMany({ include: { asset: true, vendor: true } }), prisma.crmLead.findMany()]);
  const camps: Camp[] = campaigns.map((c) => ({ id: c.id, name: c.name, project: c.asset.name, vendor: c.vendor.name, channel: c.channel, family: familyOf(c.channel), status: c.status, endDate: c.endDate, startDate: c.startDate }));
  const byId = new Map(camps.map((c) => [c.id, c]));
  const att = (leads as Lead[]).filter((l) => l.campaignId && byId.has(l.campaignId));
  if (!att.length) return { asOf: null as string | null, weeks: [] as string[], signals: [] as Signal[] };

  // Complete weeks up to the CRM's latest data.
  const dataEnd = new Date(Math.max(...att.map((l) => l.createdAt.getTime())));
  let lastStart = monday(dataEnd);
  if (lastStart.getTime() + 7 * DAY > dataEnd.getTime() + DAY) lastStart = new Date(lastStart.getTime() - 7 * DAY);
  const W = 12, weeks = Array.from({ length: W }, (_, i) => new Date(lastStart.getTime() - (W - 1 - i) * 7 * DAY));
  const wIdx = (d: Date) => { const k = Math.floor((d.getTime() - weeks[0].getTime()) / (7 * DAY)); return k >= 0 && k < W ? k : -1; };
  const RECENT = 3, BASE = 8; // last 3 weeks vs the 8 before
  const from = weeks[W - RECENT], to = new Date(lastStart.getTime() + 6 * DAY);
  const baseFrom = weeks[W - RECENT - BASE];

  type Series = { leads: number[]; qualified: number[]; lost: Map<string, [number, number]>; lostTot: [number, number] };
  const newSeries = (): Series => ({ leads: Array(W).fill(0), qualified: Array(W).fill(0), lost: new Map(), lostTot: [0, 0] });
  const groups = new Map<string, Series>();
  const g = (k: string) => groups.get(k) ?? (groups.set(k, newSeries()), groups.get(k)!);
  const LOST_WIN = 6; // lost reasons: last 6 weeks vs the 6 before
  for (const l of att) {
    const c = byId.get(l.campaignId!)!, i = wIdx(l.createdAt);
    if (i < 0) continue;
    for (const k of ["ALL", `P:${c.project}`, `C:${c.id}`]) {
      const s = g(k);
      s.leads[i]++;
      if (QUAL.has(l.stage)) s.qualified[i]++;
      if (l.stage === "LOST" && l.lostReason) {
        const half = i >= W - LOST_WIN ? 1 : 0;
        s.lostTot[half]++;
        const e = s.lost.get(l.lostReason) ?? [0, 0]; e[half]++; s.lost.set(l.lostReason, e);
      }
    }
  }
  // Contracts by month of closing (complete months only).
  const lastMonthEnd = new Date(Date.UTC(dataEnd.getUTCFullYear(), dataEnd.getUTCMonth() + 1, 0));
  const lastMonth = lastMonthEnd.getUTCDate() === dataEnd.getUTCDate() ? dataEnd.toISOString().slice(0, 7) : new Date(Date.UTC(dataEnd.getUTCFullYear(), dataEnd.getUTCMonth() - 1, 1)).toISOString().slice(0, 7);
  const prevMonths = [1, 2, 3].map((k) => { const d = new Date(`${lastMonth}-01T00:00:00Z`); d.setUTCMonth(d.getUTCMonth() - k); return d.toISOString().slice(0, 7); });
  const won = new Map<string, Map<string, [number, number]>>(); // group → month → [contracts, salesM]
  for (const l of att) {
    if (l.stage !== "WON" || !l.closedAt) continue;
    const c = byId.get(l.campaignId!)!, m = l.closedAt.toISOString().slice(0, 7);
    for (const k of ["ALL", `P:${c.project}`, `C:${c.id}`]) {
      const gm = won.get(k) ?? (won.set(k, new Map()), won.get(k)!);
      const e = gm.get(m) ?? [0, 0]; e[0]++; e[1] += l.dealValueM ?? 0; gm.set(m, e);
    }
  }

  const label = (k: string): { scope: Signal["scope"]; project: string | null; campaign: Camp | null; en: string; ar: string } => {
    if (k === "ALL") return { scope: "portfolio", project: null, campaign: null, en: "All projects", ar: "جميع المشاريع" };
    if (k.startsWith("P:")) { const p = k.slice(2); return { scope: "project", project: p, campaign: null, en: p, ar: nm("ar", p) }; }
    const c = byId.get(k.slice(2))!; return { scope: "campaign", project: c.project, campaign: c, en: c.name, ar: nm("ar", c.name) };
  };
  const range = (a: Date, b: Date): Bi => bi(`${dt("en", a, { day: "numeric", month: "short" })}–${dt("en", b, { day: "numeric", month: "short" })}`, `${dt("ar", a, { day: "numeric", month: "short" })}–${dt("ar", b, { day: "numeric", month: "short" })}`);
  const recentR = range(from, to);
  const METRIC: Record<"leads" | "qualified", Bi> = { leads: bi("new leads", "العملاء المحتملين الجدد"), qualified: bi("CRM-qualified leads", "العملاء المؤهلين في النظام") };

  // Which campaigns moved a group's numbers (for project / portfolio signals).
  const drivers = (k: string, metric: "leads" | "qualified", a: [number, number], b: [number, number]): Driver[] => {
    if (k.startsWith("C:")) return [];
    const inScope = camps.filter((c) => k === "ALL" || `P:${c.project}` === k);
    return inScope.map((c) => {
      const s = groups.get(`C:${c.id}`); if (!s) return null;
      const x = s[metric], before = mean(x.slice(a[0], a[1])), after = mean(x.slice(b[0], b[1]));
      const paused = c.status === "PAUSED", ended = c.status === "ENDED" || c.endDate.getTime() < to.getTime();
      return { campaign: c.name, vendor: c.vendor, channel: c.channel, family: c.family, perWeek: r1(after - before),
        note: paused ? bi("paused", "متوقفة") : ended ? bi("ended", "انتهت") : null };
    }).filter((d): d is Driver => !!d && Math.abs(d.perWeek) >= 1).sort((p, q) => p.perWeek - q.perWeek);
  };
  const drvText = (ds: Driver[], dir: "down" | "up"): Bi => {
    const top = (dir === "down" ? ds.filter((d) => d.perWeek < 0) : [...ds].reverse().filter((d) => d.perWeek > 0)).slice(0, 2);
    if (!top.length) return bi("", "");
    return bi(` Biggest ${dir === "down" ? "falls" : "gains"}: ${top.map((d) => `${d.campaign} (${d.vendor}${d.note ? `, ${d.note.en}` : ""}) ${d.perWeek > 0 ? "+" : ""}${d.perWeek} a week`).join("; ")}.`,
      ` ${dir === "down" ? "أكبر الانخفاضات" : "أكبر الزيادات"}: ${top.map((d) => `${nm("ar", d.campaign)} (${nm("ar", d.vendor)}${d.note ? `، ${d.note.ar}` : ""}) ${d.perWeek > 0 ? "+" : ""}${d.perWeek} أسبوعياً`).join("؛ ")}.`);
  };

  const out: Signal[] = [];
  for (const [k, s] of groups) {
    const L = label(k);
    const c = L.campaign;
    const base = (L.scope === "campaign" ? { project: c!.project, campaign: c!.name, vendor: c!.vendor, family: c!.family } : { project: L.project, campaign: null, vendor: null, family: null });
    // Skip campaigns that were not running for the whole window (a paused or new campaign is not an anomaly).
    if (c && (c.status !== "LIVE" || c.startDate.getTime() > baseFrom.getTime())) continue;
    for (const metric of ["leads", "qualified"] as const) {
      const x = s[metric], b = x.slice(W - RECENT - BASE, W - RECENT), r = x.slice(W - RECENT);
      const bMean = mean(b), rSum = r.reduce((p, q) => p + q, 0), exp = bMean * RECENT;
      if (bMean < (metric === "leads" ? 8 : 4)) continue;
      const phi = Math.max(1, variance(b) / (bMean || 1));
      const z = (rSum - exp) / Math.sqrt(exp * phi), ch = rSum / exp - 1;
      const id = `${k}|${metric}`;
      if (ch <= -0.25 && z <= -2) {
        const ds = drivers(k, metric, [W - RECENT - BASE, W - RECENT], [W - RECENT, W]);
        out.push({ id: `SUDDEN_DROP|${id}`, kind: "SUDDEN_DROP", metric, direction: "down", severity: ch <= -0.4 && z <= -3 ? "crit" : "warn", scope: L.scope, ...base,
          recent: r1(rSum / RECENT), baseline: r1(bMean), changePct: Math.round(ch * 100), stat: r1(z), from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10), drivers: ds,
          title: bi(`${L.en}: ${METRIC[metric].en} down ${pctS(ch).slice(1)} in the last 3 weeks`, `${L.ar}: انخفاض ${METRIC[metric].ar} ${pctS(ch).slice(1)} في آخر 3 أسابيع`),
          why: bi(`${r1(rSum / RECENT)} a week (${recentR.en}) vs ${r1(bMean)} a week over the 8 weeks before — well outside the normal week-to-week swing (z ${r1(z)}).${drvText(ds, "down").en}`,
            `${r1(rSum / RECENT)} أسبوعياً (${recentR.ar}) مقابل ${r1(bMean)} أسبوعياً في الأسابيع الثمانية السابقة — خارج التذبذب المعتاد بوضوح (z ${r1(z)}).${drvText(ds, "down").ar}`) });
        continue;
      }
      if (ch >= 0.3 && z >= 2.5) {
        const ds = drivers(k, metric, [W - RECENT - BASE, W - RECENT], [W - RECENT, W]);
        out.push({ id: `SURGE|${id}`, kind: "SURGE", metric, direction: "up", severity: "info", scope: L.scope, ...base,
          recent: r1(rSum / RECENT), baseline: r1(bMean), changePct: Math.round(ch * 100), stat: r1(z), from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10), drivers: ds,
          title: bi(`${L.en}: ${METRIC[metric].en} up ${pctS(ch).slice(1)} in the last 3 weeks`, `${L.ar}: ارتفاع ${METRIC[metric].ar} ${pctS(ch).slice(1)} في آخر 3 أسابيع`),
          why: bi(`${r1(rSum / RECENT)} a week (${recentR.en}) vs ${r1(bMean)} before (z ${r1(z)}) — room to scale while it lasts.${drvText(ds, "up").en}`, `${r1(rSum / RECENT)} أسبوعياً (${recentR.ar}) مقابل ${r1(bMean)} سابقاً (z ${r1(z)}) — فرصة للتوسع ما دام مستمراً.${drvText(ds, "up").ar}`) });
        continue;
      }
      // Sustained decline over the 12 weeks.
      const t = trend(x);
      const fall = t.first > 0 ? t.last / t.first - 1 : 0;
      if (mean(x) >= (metric === "leads" ? 8 : 4) && fall <= -0.25 && t.t <= -2.5) {
        const ds = drivers(k, metric, [0, 4], [W - 4, W]);
        out.push({ id: `DECLINE|${id}`, kind: "DECLINE", metric, direction: "down", severity: fall <= -0.4 ? "crit" : "warn", scope: L.scope, ...base,
          recent: r1(mean(x.slice(W - 4))), baseline: r1(mean(x.slice(0, 4))), changePct: Math.round(fall * 100), stat: r1(t.t), from: weeks[0].toISOString().slice(0, 10), to: to.toISOString().slice(0, 10), drivers: ds,
          title: bi(`${L.en}: ${METRIC[metric].en} falling for 12 weeks (${pctS(fall)})`, `${L.ar}: تراجع ${METRIC[metric].ar} منذ 12 أسبوعاً (${pctS(fall)})`),
          why: bi(`From about ${r1(t.first)} a week in early ${dt("en", weeks[0], { month: "long" })} to ${r1(t.last)} a week by ${dt("en", to, { day: "numeric", month: "long" })} — a steady fall, not a one-off week (trend t ${r1(t.t)}).${drvText(ds, "down").en}`,
            `من نحو ${r1(t.first)} أسبوعياً مطلع ${dt("ar", weeks[0], { month: "long" })} إلى ${r1(t.last)} أسبوعياً بحلول ${dt("ar", to, { day: "numeric", month: "long" })} — تراجع مستمر وليس أسبوعاً عابراً (t ${r1(t.t)}).${drvText(ds, "down").ar}`) });
      }
    }
    // Qualified rate.
    {
      const lb = s.leads.slice(W - RECENT - BASE, W - RECENT).reduce((p, q) => p + q, 0), qb = s.qualified.slice(W - RECENT - BASE, W - RECENT).reduce((p, q) => p + q, 0);
      const lr = s.leads.slice(W - RECENT).reduce((p, q) => p + q, 0), qr = s.qualified.slice(W - RECENT).reduce((p, q) => p + q, 0);
      if (lb >= 60 && lr >= 30 && qb > 0) {
        const pb = qb / lb, pr = qr / lr, p = (qb + qr) / (lb + lr);
        const z = (pr - pb) / Math.sqrt(p * (1 - p) * (1 / lb + 1 / lr));
        if (pr / pb - 1 <= -0.2 && z <= -2) out.push({ id: `QUAL_RATE_DROP|${k}|qualRate`, kind: "QUAL_RATE_DROP", metric: "qualRate", direction: "down", severity: pr / pb - 1 <= -0.35 ? "crit" : "warn", scope: L.scope, ...base,
          recent: r1(pr * 100), baseline: r1(pb * 100), changePct: Math.round((pr / pb - 1) * 100), stat: r1(z), from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10), drivers: [],
          title: bi(`${L.en}: lead quality down — ${r1(pr * 100)}% qualified vs ${r1(pb * 100)}%`, `${L.ar}: تراجع جودة العملاء — ${r1(pr * 100)}% مؤهلون مقابل ${r1(pb * 100)}%`),
          why: bi(`In the CRM, ${qr} of ${lr} leads (${recentR.en}) reached qualified or beyond, vs ${qb} of ${lb} in the 8 weeks before (z ${r1(z)}). Volume without quality predicted weak sales in the history.`, `في النظام، بلغ ${qr} من ${lr} عميلاً (${recentR.ar}) مرحلة التأهيل أو ما بعدها، مقابل ${qb} من ${lb} في الأسابيع الثمانية السابقة (z ${r1(z)}). تنبأ الحجم دون الجودة بمبيعات ضعيفة في التاريخ.`) });
      }
    }
    // Lost reasons (market reasons only).
    if (s.lostTot[0] >= 40 && s.lostTot[1] >= 40) for (const [reason, [b0, r0]] of s.lost) {
      if (!MARKET_REASONS[reason]) continue;
      const pb = b0 / s.lostTot[0], pr = r0 / s.lostTot[1], p = (b0 + r0) / (s.lostTot[0] + s.lostTot[1]);
      const z = (pr - pb) / Math.sqrt(p * (1 - p) * (1 / s.lostTot[0] + 1 / s.lostTot[1]));
      if (pr - pb >= 0.06 && z >= 2.5) out.push({ id: `LOST_REASON|${k}|${reason}`, kind: "LOST_REASON", metric: "lost", direction: "up", severity: "warn", scope: L.scope, ...base, reason,
        recent: r1(pr * 100), baseline: r1(pb * 100), changePct: Math.round((pr / pb - 1) * 100), stat: r1(z), from: weeks[W - LOST_WIN].toISOString().slice(0, 10), to: to.toISOString().slice(0, 10), drivers: [],
        title: bi(`${L.en}: more leads lost on ${MARKET_REASONS[reason].en} (${r1(pr * 100)}% of losses vs ${r1(pb * 100)}%)`, `${L.ar}: خسارة عملاء أكثر بسبب ${MARKET_REASONS[reason].ar} (${r1(pr * 100)}% من الخسائر مقابل ${r1(pb * 100)}%)`),
        why: bi(`Lost-reason codes in the CRM over the last 6 weeks vs the 6 before (z ${r1(z)}). A market reason, so a marketing answer (offer, partnership, proof) can help.`, `رموز أسباب الخسارة في النظام خلال آخر 6 أسابيع مقابل الستة السابقة (z ${r1(z)}). سبب سوقي، لذا قد تساعد استجابة تسويقية (عرض، شراكة، أدلة).`) });
    }
  }
  // Sales: contracts closed in the last complete month vs the 3 before.
  for (const [k, gm] of won) {
    const L = label(k), c = L.campaign;
    if (c && c.status !== "LIVE") continue;
    const rec = gm.get(lastMonth) ?? [0, 0], prev = prevMonths.map((m) => gm.get(m) ?? [0, 0]);
    const bC = mean(prev.map((x) => x[0])), bS = mean(prev.map((x) => x[1]));
    if (bC < 2) continue;
    const p = poissonCdf(rec[0], bC);
    if (rec[0] <= bC * 0.7 && p < 0.1) {
      const base = (L.scope === "campaign" ? { project: c!.project, campaign: c!.name, vendor: c!.vendor, family: c!.family } : { project: L.project, campaign: null, vendor: null, family: null });
      const mL = (l: Lang) => dt(l, `${lastMonth}-01`, { month: "long", year: "numeric" });
      out.push({ id: `SALES_DROP|${k}|contracts`, kind: "SALES_DROP", metric: "contracts", direction: "down", severity: p < 0.02 ? "crit" : "warn", scope: L.scope, ...base,
        recent: rec[0], baseline: r1(bC), changePct: Math.round((rec[0] / bC - 1) * 100), stat: Math.round(p * 1000) / 1000, from: `${lastMonth}-01`, to: lastMonthEnd.toISOString().slice(0, 10), drivers: [],
        title: bi(`${L.en}: contracts down — ${rec[0]} in ${mL("en")} vs ${r1(bC)} a month before`, `${L.ar}: تراجع العقود — ${rec[0]} في ${mL("ar")} مقابل ${r1(bC)} شهرياً سابقاً`),
        why: bi(`Won deals in the CRM by closing month: ${rec[0]} (SAR ${r1(rec[1])}M) vs an average of ${r1(bC)} (SAR ${r1(bS)}M) over the 3 months before; a fall this large happens by chance less than ${Math.max(1, Math.round(p * 100))}% of the time.`, `الصفقات المكسوبة في النظام حسب شهر الإغلاق: ${rec[0]} (${r1(rec[1])} مليون ر.س) مقابل متوسط ${r1(bC)} (${r1(bS)} مليون ر.س) في الأشهر الثلاثة السابقة؛ ولا يحدث تراجع بهذا الحجم مصادفةً إلا في أقل من ${Math.max(1, Math.round(p * 100))}% من الحالات.`) });
    }
  }
  // A campaign-level signal that explains a project-level one is kept as its driver, not listed twice.
  const keep = out.filter((sg) => sg.scope !== "campaign" || !out.some((o) => o.scope === "project" && o.project === sg.project && o.metric === sg.metric && o.direction === sg.direction && o.drivers.filter((d) => d.perWeek * (o.direction === "down" ? 1 : -1) < 0).slice(0, 2).some((d) => d.campaign === sg.campaign)));
  // The portfolio line only when no single project explains it.
  const final = keep.filter((sg) => sg.scope !== "portfolio" || !keep.some((o) => o.scope !== "portfolio" && o.metric === sg.metric && o.direction === sg.direction));
  const SEV = { crit: 0, warn: 1, info: 2 } as const;
  final.sort((p, q) => SEV[p.severity] - SEV[q.severity] || (p.direction === q.direction ? 0 : p.direction === "down" ? -1 : 1) || Math.abs(q.changePct) - Math.abs(p.changePct));
  return { asOf: to.toISOString().slice(0, 10), weeks: weeks.map((w) => w.toISOString().slice(0, 10)), signals: final };
}
export type CrmSignals = Awaited<ReturnType<typeof crmSignals>>;

/** A signal in one language, for pages, reports and the assistant. */
export const signalView = (lang: Lang) => (s: Signal) => ({
  id: s.id, kind: s.kind, metric: s.metric, direction: s.direction, severity: s.severity, scope: s.scope,
  project: s.project ? nm(lang, s.project) : null, projectKey: s.project, campaign: s.campaign ? nm(lang, s.campaign) : null, vendor: s.vendor ? nm(lang, s.vendor) : null,
  family: s.family, familyLabel: s.family && FAMILY_LABEL[s.family] ? FAMILY_LABEL[s.family][lang === "ar" ? 1 : 0] : null,
  changePct: s.changePct, recent: s.recent, baseline: s.baseline, from: s.from, to: s.to,
  title: lang === "ar" ? s.title.ar : s.title.en, why: lang === "ar" ? s.why.ar : s.why.en,
});
export type SignalView = ReturnType<ReturnType<typeof signalView>>;

/** Compact form for the AI prompts. */
export const signalsForModel = (ss: Signal[]) => ss.map((s) => ({ id: s.id, kind: s.kind, metric: s.metric, direction: s.direction, severity: s.severity, project: s.project, campaign: s.campaign, vendor: s.vendor, channel: s.family, changePct: s.changePct, recentPerPeriod: s.recent, baselinePerPeriod: s.baseline, lostReason: s.reason ?? null, what: s.title.en, detail: s.why.en }));

/** Short answer for the assistant: what the CRM shows and where the initiatives answering it are. */
export async function signalsAnswer(lang: Lang) {
  const T = (en: string, ar: string) => (lang === "ar" ? ar : en);
  const s = await crmSignals();
  const v = s.signals.map(signalView(lang));
  if (!v.length) return T(`**What the CRM shows** (to ${s.asOf ? dt("en", s.asOf) : "—"})\nNo unusual change in leads, qualified leads, sales or lost reasons. Checked: last 3 weeks vs the 8 before, the 12-week trend, and contracts by month.`, `**ما يُظهره النظام** (حتى ${s.asOf ? dt("ar", s.asOf) : "—"})\nلا تغيّر غير معتاد في العملاء أو المؤهلين أو المبيعات أو أسباب الخسارة. فُحص: آخر 3 أسابيع مقابل الثمانية السابقة، واتجاه 12 أسبوعاً، والعقود شهرياً.`);
  return T(`**What the CRM shows** (to ${s.asOf ? dt("en", s.asOf) : "—"})\n`, `**ما يُظهره النظام** (حتى ${s.asOf ? dt("ar", s.asOf) : "—"})\n`) +
    v.map((x) => `- **${x.title}** — ${x.why}`).join("\n") +
    T("\n\nEach of these gets a market initiative that answers it in the daily report and on the **Initiatives** page (\"Initiatives for this\"). Follow-up of the leads themselves stays with Kinan's agent.", "\n\nلكل إشارة مبادرة سوق تستجيب لها في التقرير اليومي وفي صفحة **المبادرات** («مبادرات لهذه الإشارة»). وتبقى متابعة العملاء أنفسهم لدى وكيل كنان.");
}
