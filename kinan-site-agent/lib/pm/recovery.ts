// Getting back to the contract date: options on the critical path, each one tried on the network before it is
// proposed, so its effect is what the logic gives — not what the activity's own dates suggest (a near-critical path can
// take over and eat the gain). Three kinds, as a planner would look for them:
//   crash      a second crew or a night shift on a critical activity: its remaining duration down by about a quarter,
//              at a cost per day saved
//   overlap    fast-track two critical activities that follow each other: the second starts when the first is partly
//              done (start-to-start) — no direct cost, a coordination and rework risk
//   lag        a long waiting time on the critical path (an inspection booked months later, a curing period padded):
//              challenge it — shorter by a third
// Then the cheapest combination that recovers the negative float, tried as a whole.
import type { Activity } from "../types";
import { cpm, days, network, type Net } from "./cpm";

export interface RecoveryOption {
  id: string; kind: "crash" | "overlap" | "lag"; activityId: string; predId?: string;
  title: string; detail: string;
  /** days it brings completion forward (what the network gives), and its cost (SAR) */
  saves: number; cost: number; risk: "low" | "medium" | "high";
  change: { duration?: { id: string; finish: string; remaining: number }; rel?: { succ: string; pred: string; type: "FS" | "SS" | "FF" | "SF"; lag: number } };
}

// what an extra crew or a night shift costs a day, by trade (SAR, demo estimates)
const CREW_DAY: [RegExp, number][] = [[/struct|concrete|pt|slab/i, 6_500], [/lift|elevator/i, 4_200], [/test|commission|t&c/i, 3_800], [/fa[cç]ade|curtain/i, 5_200], [/mep|hvac|plumb|electr/i, 4_600], [/finish|fit/i, 3_900], [/landscap|road|infra/i, 3_400]];
const crewDay = (a: Activity) => CREW_DAY.find(([re]) => re.test(`${a.trade} ${a.name}`))?.[1] ?? 4_000;

function tryNet(schedule: Activity[], dataDate: string, edits: ((n: Net) => void)[]) {
  const net = network(schedule, dataDate);
  for (const e of edits) e(net);
  return cpm(net).finishDay;
}
const durEdit = (id: string, dur: number) => (n: Net) => { const x = n.nodes.get(id); if (x) x.dur = dur; };
const relEdit = (succ: string, pred: string, type: "FS" | "SS" | "FF" | "SF", lag: number) => (n: Net) => { const r = n.rels.find((x) => x.succ === succ && x.pred === pred); if (r) { r.type = type; r.lag = lag; } };

export function recoveryOptions(schedule: Activity[], dataDate: string, completionId = "M-990"): { negativeFloat: number; options: RecoveryOption[]; plan: { ids: string[]; saves: number; cost: number } } {
  const net = network(schedule, dataDate), base = cpm(net);
  const pc = schedule.find((a) => a.id === completionId);
  const negativeFloat = pc ? Math.max(0, days(pc.baselineFinish, base.finish)) : 0;
  const by = new Map(schedule.map((a) => [a.id, a]));
  const crit = schedule.filter((a) => base.critical.has(a.id) && a.status !== "completed" && !a.milestone).sort((a, b) => (base.es.get(a.id) ?? 0) - (base.es.get(b.id) ?? 0));
  const options: RecoveryOption[] = [];
  for (const a of crit) {
    const n = net.nodes.get(a.id)!;
    // crash: a quarter off the remaining duration (at least two days)
    const cut = Math.max(2, Math.round(n.dur * 0.25));
    if (n.dur > 3) {
      const after = tryNet(schedule, dataDate, [durEdit(a.id, n.dur - cut)]);
      const saves = base.finishDay - after;
      if (saves > 0) options.push({ id: `crash:${a.id}:${cut}`, kind: "crash", activityId: a.id, title: `A second crew / night shift on ${a.id} — ${cut} days off its ${n.dur}`, detail: `${a.name}: ${n.dur} → ${n.dur - cut} days remaining (${a.contractor || "the contractor"}).`,
        saves, cost: cut * crewDay(a), risk: "low", change: { duration: { id: a.id, remaining: n.dur - cut, finish: addFinish(a, -cut) } } });
    }
    // overlap with its critical predecessor (finish-to-start → start-to-start at 60 % of the predecessor)
    for (const r of net.rels.filter((x) => x.succ === a.id && x.type === "FS" && base.critical.has(x.pred))) {
      const p = by.get(r.pred)!, pd = net.nodes.get(r.pred)!.dur;
      if (p.milestone || pd < 5 || p.status === "completed") continue;
      const lag = Math.round(pd * 0.6) + r.lag;
      const after = tryNet(schedule, dataDate, [relEdit(a.id, r.pred, "SS", lag)]);
      const saves = base.finishDay - after;
      if (saves > 0) options.push({ id: `overlap:${r.pred}:${a.id}`, kind: "overlap", activityId: a.id, predId: r.pred, title: `Start ${a.id} when ${r.pred} is 60 % done, not finished`, detail: `${p.name} → ${a.name}: finish-to-start becomes start-to-start + ${lag} days. Needs the two crews coordinated in the same area.`,
        saves, cost: 0, risk: "medium", change: { rel: { succ: a.id, pred: r.pred, type: "SS", lag } } });
    }
  }
  // long lags on the critical path (into milestones too)
  for (const r of net.rels.filter((x) => x.lag >= 14 && base.critical.has(x.succ) && (base.critical.has(x.pred) || by.get(x.pred)?.status !== "completed"))) {
    const lag = Math.round(r.lag * 0.67);
    const after = tryNet(schedule, dataDate, [relEdit(r.succ, r.pred, r.type, lag)]);
    const saves = base.finishDay - after;
    if (saves > 0) options.push({ id: `lag:${r.pred}:${r.succ}`, kind: "lag", activityId: r.succ, predId: r.pred, title: `Challenge the ${r.lag}-day wait between ${r.pred} and ${r.succ}`, detail: `${by.get(r.pred)?.name} → ${by.get(r.succ)?.name}: ${r.lag} days of lag, not shown as work. Book it earlier or run it in parallel: ${r.lag} → ${lag} days.`,
      saves, cost: 0, risk: "medium", change: { rel: { succ: r.succ, pred: r.pred, type: r.type, lag } } });
  }
  options.sort((x, y) => y.saves / Math.max(1, y.cost) - x.saves / Math.max(1, x.cost) || y.saves - x.saves);
  // the plan: cheapest first, tried together, until the negative float is recovered
  const plan: RecoveryOption[] = [];
  let saved = 0;
  const ranked = [...options].sort((x, y) => (x.cost === 0 && y.cost === 0 ? (x.risk === "medium" ? 1 : 0) - (y.risk === "medium" ? 1 : 0) || y.saves - x.saves : x.cost / x.saves - y.cost / y.saves));
  for (const o of ranked) {
    if (saved >= negativeFloat) break;
    if (plan.some((p) => p.activityId === o.activityId && p.kind === o.kind)) continue;
    const trial = [...plan, o];
    const after = tryNet(schedule, dataDate, trial.map(edit));
    if (base.finishDay - after > saved) { plan.push(o); saved = base.finishDay - after; }
  }
  return { negativeFloat, options: options.slice(0, 12), plan: { ids: plan.map((p) => p.id), saves: saved, cost: plan.reduce((s, p) => s + p.cost, 0) } };
}

export const edit = (o: RecoveryOption) => (n: Net) => {
  if (o.change.duration) durEdit(o.change.duration.id, o.change.duration.remaining)(n);
  if (o.change.rel) relEdit(o.change.rel.succ, o.change.rel.pred, o.change.rel.type, o.change.rel.lag)(n);
};
function addFinish(a: Activity, d: number) { return new Date(Date.parse(a.finish) + d * 86_400_000).toISOString().slice(0, 10); }

/** What-if: delay (or bring forward) one activity by some days — what happens to completion and the milestones. */
export function whatIf(schedule: Activity[], dataDate: string, activityId: string, deltaDays: number) {
  const net = network(schedule, dataDate), base = cpm(net);
  const n = net.nodes.get(activityId);
  if (!n) throw new Error(`No activity ${activityId}.`);
  const mod = network(schedule, dataDate);
  mod.nodes.get(activityId)!.dur = Math.max(n.milestone ? 0 : 1, n.dur + deltaDays);
  const after = cpm(mod);
  const ms = schedule.filter((a) => a.milestone && a.status !== "completed").map((a) => ({ id: a.id, name: a.name, moves: (after.ef.get(a.id) ?? 0) - (base.ef.get(a.id) ?? 0) })).filter((x) => x.moves !== 0);
  return { activityId, deltaDays, completionMoves: after.finishDay - base.finishDay, floatBefore: base.tf.get(activityId) ?? 0, completion: after.finish, milestones: ms };
}
