// Scheduled jobs that run on the server, with or without the app open (Vercel Cron, see vercel.json):
//   07:00 Riyadh  ?run=scan,report   email scan + the morning EstateMaster report
//   15:00 Riyadh  ?run=scan          email scan
// scan    reads the Outlook folder since the previous scheduled scan, asks the AI whether any email proposes a change
//         to an assumption. The findings show in the app's Daily feed as change requests a person must approve (the
//         app scans the same folder when it opens); ALERT_TO, if set, also gets an email. It changes nothing.
// report  reads the two latest EstateMaster exports from the exports folder (Option 2 and 3: the analyst saves each
//         Office Links export there) and emails REPORT_TO a KINAN-style report of EstateMaster's own figures.
// Environment variables:
//   CRON_SECRET          Vercel sends it as "Authorization: Bearer <secret>"; requests without it are refused
//   ALERT_TO             optional: also email assumption-change alerts (comma list, internal addresses); unset, they
//                        appear only in the app's Daily feed
//   REPORT_TO            who gets the morning report (comma list, internal addresses); REPORT_DAYS default sun,mon,tue,wed,thu
//   EXPORTS_FOLDER       Graph path of the exports folder, e.g. /sites/{site-id}/drive/root:/Bohio/Exports
//                        or /users/analyst@kinan.com.sa/drive/root:/Bohio/Exports  (needs Files.Read.All)
//   APP_URL              link in the emails (default: this deployment)
//   PROJECT_NAME         default "Al Narjis Mixed-Use"
// plus the Graph and AI variables in api/_lib/graph.js.
const G = require('./_lib/graph');
const EM = require('./_lib/emcheck');
const SCHED = require('./_lib/sched');
const { env } = G;
const SLOTS = [4, 12]; // UTC hours of the two scans (07:00 and 15:00 Riyadh)
const OR = '#f15a22', CH = '#2e2e2f', SOFT = '#6f6f6f', TAUPE = '#51473d', LINE = '#e3e2df';
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/* The scan window: everything since the previous scheduled slot, so two scans a day cover the day once. */
function windowFor(now = new Date()) {
  const h = now.getUTCHours(), d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const cur = [...SLOTS].reverse().find(s => h >= s);
  const slot = cur == null ? new Date(d.getTime() - 864e5 + SLOTS[SLOTS.length - 1] * 36e5) : new Date(d.getTime() + cur * 36e5);
  const i = SLOTS.indexOf(slot.getUTCHours());
  const prev = i > 0 ? new Date(slot.getTime() - (SLOTS[i] - SLOTS[i - 1]) * 36e5) : new Date(slot.getTime() - (24 - SLOTS[SLOTS.length - 1] + SLOTS[0]) * 36e5);
  return { since: prev.toISOString(), slot: slot.toISOString() };
}
const riyadh = iso => new Date(iso).toLocaleString('en-GB', { timeZone: 'Asia/Riyadh', weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

/* KINAN email frame: tables and inline styles only, so Outlook and Gmail show it as designed. */
function frame(kicker, title, sub, body, appUrl) {
  return `<!doctype html><html><body style="margin:0;background:#f4f4f4;font-family:Montserrat,'Segoe UI',Arial,sans-serif;color:${CH}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f4"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="640" cellpadding="0" cellspacing="0" style="max-width:640px;width:100%;background:#fff">
<tr><td style="background:${CH};padding:18px 26px;color:#fff;font-size:11px;letter-spacing:.32em;text-transform:uppercase;font-weight:700">KINAN <span style="color:${OR}">›</span> <span style="font-weight:600;color:#cfcfcf;letter-spacing:.24em">AI agent on EstateMaster</span></td></tr>
<tr><td style="background:${OR};padding:30px 26px;color:#fff"><div style="font-size:11px;letter-spacing:.3em;text-transform:uppercase;font-weight:700;opacity:.92">${esc(kicker)}</div><div style="font-size:24px;font-weight:700;text-transform:uppercase;letter-spacing:.02em;margin:10px 0 6px">${esc(title)}</div><div style="font-size:13px;opacity:.92">${esc(sub)}</div></td></tr>
<tr><td style="padding:22px 26px;font-size:14px;line-height:1.55">${body}</td></tr>
${appUrl ? `<tr><td style="padding:0 26px 24px"><a href="${esc(appUrl)}" style="display:inline-block;background:${OR};color:#fff;text-decoration:none;font-size:11px;letter-spacing:.24em;text-transform:uppercase;font-weight:700;padding:12px 20px">Open the agent</a></td></tr>` : ''}
<tr><td style="background:${CH};padding:16px 26px;color:#bbb;font-size:11px">Nothing changes in EstateMaster until a person approves it in the app. Sent by the Bohio agent from ${esc(env('OUTLOOK_MAILBOX'))}.</td></tr>
</table></td></tr></table></body></html>`;
}
const th = t => `<th align="left" style="background:${CH};color:#fff;font-size:10px;letter-spacing:.2em;text-transform:uppercase;padding:8px">${t}</th>`;
const td = (t, x = '') => `<td style="padding:9px 8px;border-top:1px solid ${LINE};font-size:13px;vertical-align:top${x}">${t}</td>`;

/* The emails since a given time and what they propose (used by the scan and by the morning report). */
async function scanFindings(token, since, models = []) {
  const msgs = await G.readMessages(token, since);
  if (!msgs.length) return { msgs, findings: [] };
  const system = `You read emails for a real estate development project and find any email that proposes, reports or asks approval for a change to an assumption of its financial model (sale prices, rents, construction costs and their elements, fees and commissions, contingency, timing and delays, areas, financing terms such as interest rate, margin, loan to cost, facility limits, equity terms, exit yields, land price). Requests for approval count: a discount or incentive on a number of units (state the blended effect on the average sale price, e.g. 5% off 24 of 180 units is about 0.7% off the average price), a rent-free period or a lower rent (effective rent over the term), a variation order or revised quote, a revised term sheet, a valuer's yield, a landowner's revised price.
Return JSON only: {"findings":[{"message_id":string,"assumption":string,"new_value":string,"previous_value":string|null,"change":"the change as a modelling input, e.g. average sale price −0.7%","reason":"why it is asked for or has happened, in one sentence","approval":true if the email asks KINAN to approve or decide something,"model":"which financial model it concerns: one of the model names listed, or null if unclear","deadline":"the date or time by which a decision is needed, if the email gives one, else null","quote":string,"confidence":number}]}.
"quote" is the exact text that supports it. Include an item only if the email states, proposes or asks approval for a change; ignore everything else. Confidence 0-1. ${models.length ? `Financial models: ${models.join('; ')}.` : `Project: ${env('PROJECT_NAME') || 'Al Narjis Mixed-Use'}.`}`;
  const user = msgs.map(m => `message_id: ${m.id}\nfrom: ${m.from}\ndate: ${m.date}\nsubject: ${m.subject}\n---\n${m.body}`).join('\n\n=====\n\n');
  const j = G.jsonOf(await G.ai(system, user));
  const byId = Object.fromEntries(msgs.map(m => [m.id, m]));
  const findings = (j.findings || []).filter(f => byId[f.message_id] && f.assumption).map(f => ({ ...f, msg: byId[f.message_id], confidence: Math.max(0, Math.min(1, +f.confidence || 0.5)) }));
  return { msgs, findings };
}
const IMP = [['levered_irr', 'Levered IRR', '%'], ['profit_on_cost', 'Profit on cost', '%'], ['net_profit', 'Net profit', 'M']];
const fmtImp = (v, u) => !Number.isFinite(v) ? '—' : u === '%' ? v.toFixed(2) + '%' : (Math.abs(v) >= 1e6 ? (v / 1e6).toFixed(1) + 'M' : Math.round(v).toLocaleString('en-GB'));
const findingRows = findings => findings.map(f => `<tr>${td(`<b>${esc(f.assumption)}</b>${f.modelName ? `<br><span style="color:${OR};font-size:11px;font-weight:700">${esc(f.modelName)}</span>` : ''}${f.change ? `<br><span style="color:${SOFT};font-size:12px">${esc(f.change)}</span>` : ''}`)}${td(`${f.previous_value ? esc(f.previous_value) + ' → ' : ''}<b style="color:${OR}">${esc(f.new_value)}</b>`)}${td(`${esc(f.msg.from)}<br><span style="color:${SOFT};font-size:12px">${esc(f.msg.subject)} · ${esc(riyadh(f.msg.date))}</span>`)}${td(`${f.reason ? esc(f.reason) + '<br>' : ''}<span style="color:${SOFT}">“${esc(f.quote)}”</span>`)}${td(f.impact ? (f.impact.flag ? `<span style="color:#d03b3b;font-weight:700">⚠ check failed</span><br>` : '') + IMP.map(([k, l, u]) => `${l}: ${fmtImp(f.impact.base[k], u)} → <b>${fmtImp(f.impact[k], u)}</b>${k === 'levered_irr' && f.impact.hurdle != null && f.impact[k] < f.impact.hurdle ? ` <span style="color:#d03b3b;font-weight:700">below hurdle</span>` : ''}`).join('<br>') + `<br><span style="color:${SOFT};font-size:11px">${esc(f.impact.working || '')}</span>` : `<span style="color:${SOFT}">${esc(f.impactNote || 'not estimated')}</span>`)}</tr>`).join('');
/* The impact of each finding on the key outputs, estimated from EstateMaster's figures by every AI provider configured
   (Claude and OpenAI when both keys are set: each calculates independently, the report shows the average and says
   whether they agree). An estimate, never EstateMaster's own figure, and the email says so. */
async function estimateImpacts(b, findings, hurdle) {
  const provs = G.aiProviders(); if (!provs.length || !findings.length) return;
  const o = b.out, ins = (b.inputs || []).slice(0, 120).map(i => `${i.label} = ${i.text || i.value}${i.unit && i.unit !== '%' ? ' ' + i.unit : ''}`).join('\n');
  const sens = (b.sens || []).map(t => t.kind === '1way' ? `Sensitivity (1-way) ${t.v} → ${t.metric}: ` + t.shifts.map((sh, i) => `${sh}%: ${t.values[i]}`).join(', ') : `Sensitivity (2-way) ${t.metric}, columns ${t.x} ${t.xs.join('/')}%, rows ${t.y}: ` + t.grid.map((r, i) => `${t.ys[i]}%: ${r.join('/')}`).join(' | ')).join('\n');
  const system = `You are a senior real estate development finance analyst. An ARGUS EstateMaster feasibility model (the trusted model) produced the outputs and inputs below. You cannot run EstateMaster: estimate, step by step, the effect of each proposed change on its outputs, the way an analyst would by hand (revenue and cost effects on net profit and profit on cost; timing, leverage and finance effects on the IRR; use the sensitivity tables where they apply, interpolating). Use only the figures given.
Return JSON only: {"impacts":[{"message_id":string,"levered_irr":number,"profit_on_cost":number,"net_profit":number,"working":"one or two sentences with the numbers"}]} with one entry per change. Percentages in percent (18.4 means 18.4%); money in full currency units.`;
  const user = `EstateMaster outputs (export ${b.name}): ${Object.entries(o).filter(([, v]) => Number.isFinite(v)).map(([k, v]) => `${k} = ${v}`).join('; ')}\nInputs:\n${ins}\n${sens}\n\nProposed changes:\n${findings.map(f => `- message_id ${f.msg.id}: ${f.assumption}: ${f.previous_value ? f.previous_value + ' → ' : ''}${f.new_value}${f.change ? ' (' + f.change + ')' : ''}`).join('\n')}`;
  const res = await Promise.allSettled(provs.map(p => G.ai(system, user, 4000, p).then(t => ({ p, j: G.jsonOf(t) }))));
  const ok = res.filter(r => r.status === 'fulfilled').map(r => r.value);
  const names = { anthropic: 'Claude', openai: 'OpenAI' };
  for (const f of findings) {
    const got = ok.map(r => ({ p: r.p, i: (r.j.impacts || []).find(x => String(x.message_id) === String(f.msg.id)) })).filter(x => x.i);
    if (!got.length) { f.impactNote = ok.length ? 'the AI returned no estimate for this change' : 'AI estimate failed: ' + res.map(r => r.reason && r.reason.message).filter(Boolean).join('; '); continue; }
    const avg = k => { const vs = got.map(g => +g.i[k]).filter(Number.isFinite); return vs.length ? vs.reduce((a, c) => a + c, 0) / vs.length : NaN; };
    const agree = got.length < 2 ? null : IMP.every(([k, , u]) => { const vs = got.map(g => +g.i[k]); return u === '%' ? Math.abs(vs[0] - vs[1]) <= 0.5 : Math.abs(vs[0] - vs[1]) <= 0.02 * Math.max(Math.abs(vs[0]), Math.abs(vs[1]), 1); });
    f.impact = { base: { levered_irr: o.levered_irr, profit_on_cost: o.profit_on_cost, net_profit: o.net_profit }, hurdle, levered_irr: avg('levered_irr'), profit_on_cost: avg('profit_on_cost'), net_profit: avg('net_profit'),
      working: `${got.map(g => names[g.p]).join(' and ')}${got.length > 1 ? (agree ? ' agree (average shown)' : ' differ: ' + got.map(g => `${names[g.p]} IRR ${fmtImp(+g.i.levered_irr, '%')}`).join(', ') + ' (average shown, check in EstateMaster)') : ' only, not cross-checked'}. ${(got[0].i.working || '').slice(0, 260)}` };
    // checks on the estimate: bounds, arithmetic (calibrated on EstateMaster's own base) and direction
    const chk = [], im = f.impact, fin = Number.isFinite;
    if (fin(im.levered_irr) && !(im.levered_irr > -95 && im.levered_irr < 100)) chk.push('IRR outside any plausible range');
    if ([o.net_profit, o.total_cost, o.profit_on_cost].every(fin) && Math.abs(o.net_profit / o.total_cost * 100 - o.profit_on_cost) <= 1.5 && fin(im.net_profit) && fin(im.profit_on_cost)) { const p2 = im.net_profit / o.total_cost * 100; if (Math.abs(p2 - im.profit_on_cost) > 1.5) chk.push(`profit on cost ${im.profit_on_cost.toFixed(2)}% does not reconcile with net profit / total cost (${p2.toFixed(2)}%)`); }
    const txt = `${f.assumption} ${f.change || ''} ${f.reason || ''} ${f.quote || ''}`.toLowerCase();
    const adverse = /(discount|incentive|rent[- ]?free|delay|slip|overrun|variation|softer|cost.*(up|increase|rise|higher)|rate.*(up|increase|rise|higher)|yield.*(up|higher|soft)|(price|rent).*(down|cut|lower|reduc|fall)|land.*(up|increase|higher))/.test(txt);
    if (adverse && fin(o.levered_irr) && fin(im.levered_irr) && im.levered_irr > o.levered_irr + 0.1) chk.push('the IRR improves although the change is adverse');
    im.flag = chk.length > 0; if (chk.length) im.working = `CHECK FAILED (${chk.join('; ')}): do not rely on this estimate. ` + im.working;
  }
}

/* ---- Stress tests before the daily report. The standard scenarios (the same the app runs) on each model's latest export:
   Claude and OpenAI each estimate every scenario from EstateMaster's outputs, inputs and its own sensitivity tables
   (cross-checked: the average when they agree within 0.5 pts, flagged when they do not); then the reasoning model
   (REASON_MODEL, default Claude Opus 5.5; GPT-5 as fallback) reviews the failing scenarios and the export's checks,
   names the risks and recommends a decision for each. Everything here is an AI estimate, never an EstateMaster figure. ---- */
const STRESS = [
  { name: 'Sale price −15%', d: 'sale prices −15%' }, { name: 'Construction cost +20%', d: 'construction cost +20%' },
  { name: '12-month delay', d: 'a 12-month delay to the programme' }, { name: 'Interest rate +300 bps', d: 'interest rate +300 bps' },
  { name: 'Exit cap rate +150 bps', d: 'exit cap rate +150 bps' }, { name: 'Retail rent −20%', d: 'retail rents −20%' },
  { name: 'Combined downside', d: 'sale prices −10%, construction cost +10%, 6-month delay, cap rate +75 bps, rates +100 bps' },
  { name: 'Severe combined', d: 'sale prices −20%, construction cost +20%, 12-month delay, cap rate +150 bps, rates +200 bps' }];
const prettyModel = m => String(m).replace(/^claude-(\w+)-(\d+)-(\d+)$/, (x, a, b, c) => `Claude ${a[0].toUpperCase()}${a.slice(1)} ${b}.${c}`).replace(/^gpt-(\S+)$/, 'OpenAI GPT-$1');
const REASON = () => [['anthropic', env('REASON_MODEL') || 'claude-opus-5-5'], ['openai', env('REASON_MODEL_OPENAI') || 'gpt-5']].filter(([p]) => G.aiProviders().includes(p));
async function stressRun(b, hurdle, checks = []) {
  const provs = G.aiProviders(); if (!provs.length) return null;
  const o = b.out, ins = (b.inputs || []).slice(0, 120).map(i => `${i.label} = ${i.text || i.value}${i.unit && i.unit !== '%' ? ' ' + i.unit : ''}`).join('\n');
  const sens = (b.sens || []).map(t => t.kind === '1way' ? `Sensitivity (1-way) ${t.v} → ${t.metric}: ` + t.shifts.map((sh, i) => `${sh}%: ${t.values[i]}`).join(', ') : `Sensitivity (2-way) ${t.metric}, columns ${t.x} ${t.xs.join('/')}%, rows ${t.y}: ` + t.grid.map((r, i) => `${t.ys[i]}%: ${r.join('/')}`).join(' | ')).join('\n');
  const system = `You are a senior real estate development finance analyst. An ARGUS EstateMaster feasibility model (the trusted model) produced the outputs and inputs below. You cannot run EstateMaster: estimate, step by step, each stress scenario's effect on its outputs the way an analyst would by hand (revenue and cost effects on net profit and profit on cost; timing, leverage and finance effects on the IRR; use EstateMaster's sensitivity tables where they apply, interpolating). Use only the figures given.
Return JSON only: {"scenarios":[{"name":string,"levered_irr":number,"profit_on_cost":number,"net_profit":number,"working":"one sentence with the numbers"}]} with one entry per scenario, names exactly as given. Percentages in percent (18.4 means 18.4%); money in full currency units.`;
  const user = `EstateMaster outputs (export ${b.name}): ${Object.entries(o).filter(([, v]) => Number.isFinite(v)).map(([k, v]) => `${k} = ${v}`).join('; ')}\nInputs:\n${ins}\n${sens}\n\nStress scenarios:\n${STRESS.map(s => `- ${s.name}: ${s.d}`).join('\n')}`;
  const res = await Promise.allSettled(provs.map(p => G.ai(system, user, 5000, p).then(t => ({ p, j: G.jsonOf(t) }))));
  const ok = res.filter(r => r.status === 'fulfilled').map(r => r.value), names = { anthropic: 'Claude', openai: 'OpenAI' };
  const scenarios = STRESS.map(s => {
    const got = ok.map(r => ({ p: r.p, i: (r.j.scenarios || []).find(x => String(x.name).toLowerCase().trim() === s.name.toLowerCase()) })).filter(x => x.i && Number.isFinite(+x.i.levered_irr));
    if (!got.length) return { name: s.name, note: ok.length ? 'no estimate returned' : 'AI estimate failed' };
    const avg = k => { const vs = got.map(g => +g.i[k]).filter(Number.isFinite); return vs.length ? vs.reduce((a, c) => a + c, 0) / vs.length : NaN; };
    const irr = avg('levered_irr'), poc = avg('profit_on_cost'), agree = got.length < 2 ? null : Math.abs(+got[0].i.levered_irr - +got[1].i.levered_irr) <= 0.5;
    const adverse = Number.isFinite(o.levered_irr) ? irr <= o.levered_irr + 0.1 : true;
    return { name: s.name, levered_irr: +irr.toFixed(2), profit_on_cost: Number.isFinite(poc) ? +poc.toFixed(2) : null, net_profit: Number.isFinite(avg('net_profit')) ? Math.round(avg('net_profit')) : null, pass: irr >= hurdle && (!Number.isFinite(poc) || poc >= +(env('HURDLE_POC') || 15)), agree, flag: !adverse,
      working: `${got.map(g => `${names[g.p]} ${(+g.i.levered_irr).toFixed(2)}%`).join(', ')}${got.length > 1 ? (agree ? ' (agree, average shown)' : ' (differ: average shown, check in EstateMaster)') : ' (one model only)'}. ${String(got[0].i.working || '').slice(0, 240)}${!adverse ? ' CHECK FAILED: the IRR improves under an adverse scenario; do not rely on it.' : ''}` };
  });
  const out = { by: ok.map(r => names[r.p]).join(' and ') || 'no model', scenarios, risks: [], reviewer: '' };
  const fails = scenarios.filter(x => x.pass === false), ev = [];
  fails.forEach(x => ev.push(`Stress test (AI estimate): ${x.name} → levered IRR ${x.levered_irr}% against the ${hurdle}% hurdle${x.agree === false ? ' (Claude and OpenAI differ)' : ''}`));
  checks.filter(c => c.level !== 'note').slice(0, 6).forEach(c => ev.push(`Check on the export (${c.level}): ${c.text}`));
  if (!ev.length) return out;
  const rsys = `You are the chief risk officer of KINAN, a Saudi real estate developer, reviewing what the AI agent on ARGUS EstateMaster found before the daily report. EstateMaster is the trusted source of every return figure; the stress results are AI estimates.
Reason like a senior development-finance professional: group evidence with the same cause, judge what could actually hurt the returns, the funding or the approvals, and how soon; then recommend the decision a committee should take for each risk.
Return JSON only: {"risks":[{"title":"short name (max 8 words)","evidence":"the one fact that shows it, figures quoted exactly","severity":"high|medium|low","recommendation":"one sentence starting with a verb"}]}. At most 4 risks, most severe first. Use only the evidence given; never invent figures. American English, plain and professional.`;
  const ruser = `Model: ${(b.meta && b.meta.title) || b.name}. EstateMaster base: levered IRR ${Number.isFinite(o.levered_irr) ? o.levered_irr.toFixed(2) + '%' : 'n/a'}, profit on cost ${Number.isFinite(o.profit_on_cost) ? o.profit_on_cost.toFixed(2) + '%' : 'n/a'}. Hurdles: IRR ${hurdle}%, profit on cost ${env('HURDLE_POC') || 15}%.\n\nEvidence:\n${ev.map((t, i) => `${i + 1}. ${t}`).join('\n')}`;
  for (const [p, model] of REASON()) { try { const j = G.jsonOf(await G.ai(rsys, ruser, 3000, p, model)); out.risks = (j.risks || []).filter(z => z && z.title && z.recommendation).slice(0, 4).map(z => ({ title: String(z.title).slice(0, 80), evidence: String(z.evidence || '').slice(0, 180), severity: /high|medium|low/.test(z.severity) ? z.severity : 'medium', recommendation: String(z.recommendation).slice(0, 200) })); out.reviewer = prettyModel(model); break; } catch (e) { out.reviewNote = e.message; } }
  return out;
}
function stressHtml(d, ar) {
  const ms = (d.stress || []).filter(m => m && m.scenarios && m.scenarios.length); if (!ms.length) return '';
  const h3 = t => `<h3 style="margin:22px 0 6px;font-size:11px;letter-spacing:.24em;text-transform:uppercase;color:${TAUPE}">${t}</h3>`;
  const hur = d.hurdle, bar = (v, ok) => { const w = Math.max(2, Math.min(100, (v + 5) / (hur + 15) * 100)); return `<div style="position:relative;height:14px;background:#f1efec;border-radius:2px"><div style="width:${w.toFixed(0)}%;height:14px;border-radius:2px;background:${ok ? '#1f8a4c' : '#d03b3b'}"></div><div style="position:absolute;top:-2px;bottom:-2px;left:${Math.min(100, (hur + 5) / (hur + 15) * 100).toFixed(0)}%;width:2px;background:${CH}"></div></div>`; };
  return h3(ar ? 'اختبارات الضغط قبل هذا التقرير (تقدير الذكاء الاصطناعي)' : 'Stress tests run before this report (AI estimates)') + ms.map(m => `<p style="margin:8px 0 4px;font-size:13px"><b>${esc(m.name)}</b> · ${m.scenarios.filter(x => x.pass === false).length} of ${m.scenarios.filter(x => x.pass != null).length} ${ar ? 'سيناريوهات دون الحد' : 'scenarios under the hurdle'} · ${esc(m.by)}${m.reviewer ? `, ${ar ? 'مراجعة المخاطر' : 'risks reviewed by'} ${esc(m.reviewer)}` : ''}</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse"><tr>${th(ar ? 'السيناريو' : 'Scenario')}${th(ar ? 'العائد الممول' : 'Levered IRR')}${th('')}${th(ar ? 'الربح على التكلفة' : 'Profit on cost')}${th('')}</tr>${m.scenarios.map(x => `<tr>${td(esc(x.name))}${td(x.note ? `<span style="color:${SOFT}">${esc(x.note)}</span>` : `<b style="color:${x.pass ? CH : '#d03b3b'}">${x.levered_irr.toFixed(2)}%</b>${x.agree === false ? ` <span style="color:${SOFT};font-size:11px">${ar ? 'النموذجان مختلفان' : 'models differ'}</span>` : ''}`, ';text-align:right;white-space:nowrap')}${td(x.note ? '' : bar(x.levered_irr, x.pass), ';width:34%')}${td(x.profit_on_cost == null ? '—' : x.profit_on_cost.toFixed(2) + '%', ';text-align:right')}${td(x.note ? '' : `<span style="display:inline-block;background:${x.pass ? '#1f8a4c' : '#d03b3b'};color:#fff;font-size:9px;letter-spacing:.16em;text-transform:uppercase;font-weight:700;padding:2px 6px;border-radius:3px">${x.pass ? (ar ? 'يجتاز' : 'pass') : (ar ? 'يخفق' : 'fail')}</span>`)}</tr>`).join('')}</table>` +
    (m.risks && m.risks.length ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-top:8px">${m.risks.map(z => `<tr>${td(`<span style="display:inline-block;background:${z.severity === 'high' ? '#d03b3b' : z.severity === 'medium' ? OR : SOFT};color:#fff;font-size:9px;letter-spacing:.16em;text-transform:uppercase;font-weight:700;padding:2px 6px;border-radius:3px">${esc(z.severity)}</span>`, ';width:80px')}${td(`<b>${esc(z.title)}</b><br><span style="color:${SOFT};font-size:12px">${esc(z.evidence)}</span><br><span style="font-size:12px"><b>${ar ? 'التوصية' : 'Recommended'}:</b> ${esc(z.recommendation)}</span>`)}</tr>`).join('')}</table>` : '')).join('') +
    `<p style="margin:8px 0 0;color:${SOFT};font-size:12px;font-style:italic">${ar ? 'تقديرات الذكاء الاصطناعي من أرقام إستيت ماستر وجداول حساسيته؛ أرقام إستيت ماستر نفسها تأتي عندما يشغّل محلل السيناريو.' : 'AI estimates from EstateMaster’s figures and its own sensitivity tables, cross-checked between Claude and OpenAI; EstateMaster’s own figure for any scenario comes once an analyst runs it.'}</p>`;
}
async function scanJob(token, now, dry, appUrl) {
  const w = windowFor(now), { msgs, findings } = await scanFindings(token, w.since);
  if (!msgs.length) return { job: 'scan', window: w, messages: 0, findings: 0, sent: false };
  const out = { job: 'scan', window: w, messages: msgs.length, findings: findings.length, items: findings.map(f => ({ from: f.msg.from, subject: f.msg.subject, assumption: f.assumption, new_value: f.new_value, quote: f.quote, confidence: f.confidence })), sent: false };
  if (!findings.length) return out;
  const to = G.checkRecipients(env('ALERT_TO').split(','));
  if (to.bad.length) out.rejected = to.bad;
  if (!to.ok.length) { out.note = 'No alert email (ALERT_TO not set): the findings show in the Daily feed'; return out; }
  const rows = findingRows(findings);
  const body = `<p style="margin:0 0 14px">The ${riyadh(w.slot).split(',').pop().trim()} scan read <b>${msgs.length}</b> new message${msgs.length > 1 ? 's' : ''} in the project folder and sensed <b>${findings.length}</b> possible assumption change${findings.length > 1 ? 's' : ''}:</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse"><tr>${th('Assumption')}${th('Proposed')}${th('From')}${th('Quote')}${th('Conf.')}</tr>${rows}</table>
<p style="margin:16px 0 0;color:${SOFT};font-size:12px">Open the agent to review them: each one becomes a change request for approval, checked against the model's current value. Nothing has been changed.</p>`;
  const html = frame('Assumption alert', `${findings.length} possible change${findings.length > 1 ? 's' : ''} in Outlook`, `${env('PROJECT_NAME') || 'Al Narjis Mixed-Use'} · scan of ${riyadh(w.slot)}`, body, appUrl);
  out.subject = `KINAN · ${findings.length} possible assumption change${findings.length > 1 ? 's' : ''} · ${env('PROJECT_NAME') || 'Al Narjis Mixed-Use'}`;
  if (dry) { out.preview = html; return out; }
  await G.sendMail(token, { to: to.ok, subject: out.subject, html }); out.sent = true; out.to = to.ok; return out;
}

/* EstateMaster's figures from an Office Links export, by row label (the same labels the app reads). */
const LAB = [['levered_irr', /(equity|levered|geared)\s*irr|irr\s*\((equity|levered|geared)/i], ['unlevered_irr', /(unlevered|ungeared|project)\s*irr|irr\s*\((unlevered|ungeared|project)/i], ['profit_on_cost', /(profit|margin)\s*on\s*(cost|development)|development\s*margin/i], ['net_profit', /(net|development)\s*profit/i], ['total_cost', /total\s*(development\s*)?costs?\b/i], ['gross_revenue', /(gross|total)\s*(revenue|realisation|realization|sales)/i], ['equity_multiple', /equity\s*multiple/i], ['peak_debt', /peak\s*(debt|funding|loan)/i]];
function readExport(buf, name) { const XLSX = require('xlsx'); return EM.parseWorkbook(XLSX.read(buf, { type: 'buffer' }), XLSX, name); }
const ROWS = [['levered_irr', 'Levered IRR', '%'], ['unlevered_irr', 'Unlevered IRR', '%'], ['profit_on_cost', 'Profit on cost', '%'], ['net_profit', 'Net profit', 'M'], ['total_cost', 'Total development cost', 'M'], ['gross_revenue', 'Gross revenue', 'M'], ['equity_multiple', 'Equity multiple', 'x'], ['peak_debt', 'Peak debt', 'M']];
const fmt = (v, u) => !Number.isFinite(v) ? '—' : u === '%' ? v.toFixed(2) + '%' : u === 'x' ? v.toFixed(2) + 'x' : 'SAR ' + Math.round(v / 1e6).toLocaleString('en-GB') + 'M';
const dlt = (a, b, u) => !Number.isFinite(a) || !Number.isFinite(b) || Math.abs(b - a) < 1e-9 ? '–' : u === '%' ? `${b > a ? '+' : '−'}${Math.abs(b - a).toFixed(2)} pts` : u === 'x' ? `${b > a ? '+' : '−'}${Math.abs(b - a).toFixed(2)}x` : `${b > a ? '+' : '−'}${Math.round(Math.abs(b - a) / 1e6)}M`;

/* Arabic version of the daily report: fixed labels from this table, the sentences the checks produce through the AI (numbers kept). */
const AR = { 'Daily EstateMaster report': 'تقرير إستيت ماستر اليومي', 'Levered IRR': 'معدل العائد الداخلي على حقوق الملكية', 'Unlevered IRR': 'معدل العائد الداخلي للمشروع', 'Profit on cost': 'الربح إلى التكلفة', 'Net profit': 'صافي الربح', 'Total development cost': 'إجمالي تكلفة التطوير', 'Gross revenue': 'إجمالي الإيرادات', 'Equity multiple': 'مضاعف حقوق الملكية', 'Peak debt': 'ذروة الدين',
  Output: 'المخرج', Previous: 'السابق', Latest: 'الأحدث', Change: 'التغير', 'Checks on the export': 'فحوصات ملف التصدير', 'Likely error': 'خطأ محتمل', Check: 'للمراجعة', Note: 'ملاحظة', 'Assumptions possibly changing (Outlook, last 24 hours)': 'افتراضات قد تتغير (أوتلوك، آخر 24 ساعة)', Assumption: 'الافتراض', Proposed: 'المقترح', From: 'المرسل', Quote: 'النص', 'Conf.': 'الثقة',
  'Assumptions vs market': 'الافتراضات مقارنة بالسوق', Model: 'النموذج', Market: 'السوق', Position: 'الموقع', within: 'ضمن النطاق', above: 'أعلى من النطاق', below: 'أدنى من النطاق', aggressive: 'متفائل', conservative: 'متحفظ',
  Rent: 'الإيجار', 'Sale price': 'سعر البيع', 'Exit cap rate / yield': 'معدل الرسملة عند التخارج', 'Construction cost': 'تكلفة البناء', 'Land price': 'سعر الأرض', Contingency: 'الاحتياطي', 'Finance rate': 'معدل التمويل', 'Sales commission': 'عمولة البيع' };
async function translateAr(texts) {
  const list = [...new Set(texts.filter(Boolean))]; if (!list.length || !G.aiConfigured()) return {};
  try { const j = G.jsonOf(await G.ai('Translate each English string to Modern Standard Arabic for a real estate investment report. Keep every number, unit, percentage, currency code, file name and id exactly as written. Return JSON only: {"t":[...]} in the same order.', JSON.stringify(list), 4000)); const out = {}; (j.t || []).forEach((t, i) => { if (list[i] && t) out[list[i]] = t; }); return out; } catch { return {}; }
}
/* Everything the daily report needs, read once: the two latest base exports, other options, checks, Outlook findings, market position. */
/* What the report needs to say first: the open decisions in the app's Daily feed (sent by the app, with the AI's impact),
   the emails of the last 24 hours that ask for a decision or would take the IRR under the hurdle, and likely errors in the export. */
function urgentItems(d) {
  const out = [], feed = d.feed && d.feed.items ? d.feed.items : [], subj = new Set(feed.map(i => i.title.toLowerCase()));
  for (const i of feed) out.push({ src: 'feed', title: i.title, change: i.change, why: i.why, from: i.from, impact: i.impact, below: i.impact.some(m => m.below), approval: true, id: i.id });
  for (const f of (d.flags && d.flags.findings) || []) {
    const below = f.impact && Number.isFinite(f.impact.levered_irr) && f.impact.levered_irr < d.hurdle;
    if (!(f.approval || below)) continue;
    if ([...subj].some(t => t.includes(String(f.msg.subject || '').toLowerCase().slice(0, 40)))) continue;
    out.push({ src: 'email', title: f.msg.subject, change: f.change || `${f.assumption}: ${f.previous_value ? f.previous_value + ' → ' : ''}${f.new_value}`, why: f.reason || '', from: f.msg.from, deadline: f.deadline || '', below, approval: !!f.approval,
      impact: f.impact ? IMP.map(([k, l, u]) => ({ k, label: l, base: fmtImp(f.impact.base[k], u), value: fmtImp(f.impact[k], u), below: k === 'levered_irr' && f.impact[k] < d.hurdle })) : [] });
  }
  for (const m of d.stress || []) for (const z of (m.risks || []).filter(z => z.severity === 'high')) out.push({ src: 'stress', title: `${z.title} (${m.name})`, change: z.evidence, why: `Recommended: ${z.recommendation}`, from: `Stress tests before the report · ${m.reviewer || m.by}`, impact: [], below: false, risk: true });
  for (const c of (d.checks || []).filter(c => c.level === 'error')) out.push({ src: 'check', title: c.text, change: '', why: 'Likely error in the latest EstateMaster export', impact: [], below: false });
  return out.sort((a, b) => (b.below - a.below) || ((b.risk ? 1 : 0) - (a.risk ? 1 : 0)) || (b.approval - a.approval));
}
function urgentHtml(d, ar) {
  const items = urgentItems(d);
  const h = `<h3 style="margin:0 0 8px;font-size:11px;letter-spacing:.24em;text-transform:uppercase;color:#d03b3b">${ar ? 'للعلم اليوم' : 'To know today'}</h3>`;
  if (!items.length) return h + `<p style="margin:0 0 6px;color:${SOFT}">${ar ? 'لا قرارات معلقة ولا أخطاء مرجحة.' : 'No decision waiting and no likely error.'}${d.feed ? '' : (ar ? '' : ' (The app has not shared its Daily feed yet: open the agent once and it does.)')}</p>`;
  return h + `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border:2px solid #d03b3b">` + items.slice(0, 12).map(i => `<tr>${td(`${i.below ? `<span style="display:inline-block;background:#d03b3b;color:#fff;font-size:9px;letter-spacing:.16em;text-transform:uppercase;font-weight:700;padding:2px 6px;border-radius:3px">${ar ? 'دون الحد' : 'below hurdle'}</span> ` : ''}${i.src === 'stress' ? `<span style="display:inline-block;background:#d03b3b;color:#fff;font-size:9px;letter-spacing:.16em;text-transform:uppercase;font-weight:700;padding:2px 6px;border-radius:3px">${ar ? 'خطر' : 'stress risk'}</span> ` : i.src === 'check' ? `<span style="display:inline-block;background:#d03b3b;color:#fff;font-size:9px;letter-spacing:.16em;text-transform:uppercase;font-weight:700;padding:2px 6px;border-radius:3px">${ar ? 'خطأ مرجح' : 'likely error'}</span> ` : i.approval ? `<span style="display:inline-block;background:${OR};color:#fff;font-size:9px;letter-spacing:.16em;text-transform:uppercase;font-weight:700;padding:2px 6px;border-radius:3px">${ar ? 'قرار مطلوب' : 'decision needed'}</span> ` : ''}<b>${esc(i.title)}</b>${i.id ? ` <span style="color:${SOFT}">${esc(i.id)}</span>` : ''}${i.change ? `<br>${esc(i.change)}` : ''}${i.why ? `<br><span style="color:${SOFT};font-size:12px">${ar ? 'السبب: ' : 'Why: '}${esc(i.why)}</span>` : ''}${i.from ? `<br><span style="color:${SOFT};font-size:12px">${esc(i.from)}${i.deadline ? ' · ' + (ar ? 'المهلة: ' : 'by ') + esc(i.deadline) : ''}</span>` : ''}`)}${td(i.impact && i.impact.length ? i.impact.map(m => `${esc(m.label)}: ${esc(m.base)} → <b style="color:${m.below ? '#d03b3b' : CH}">${esc(m.value)}</b>`).join('<br>') + `<br><span style="color:${SOFT};font-size:11px">${ar ? 'تقدير الذكاء الاصطناعي، ليس رقم إستيت ماستر' : 'AI estimate, not EstateMaster’s figure'}</span>` : '', ';width:42%')}</tr>`).join('') + `</table><p style="margin:6px 0 16px;color:${SOFT};font-size:12px">${ar ? 'كل بند ينتظر قرار شخص في التطبيق؛ لا يتغير شيء قبل الموافقة.' : `Each item waits for a person’s decision in the agent (Daily feed); nothing changes until it is approved.${d.feed ? ` Daily feed as shared by the app at ${esc(riyadh(d.feed.at))}.` : ''}`}</p>`;
}
async function dailyData(token, now, o = {}) {
  const folder = env('EXPORTS_FOLDER'); if (!folder) return { skipped: 'EXPORTS_FOLDER is not set' };
  const j = await G.graph(token, `${folder}:/children?$select=name,lastModifiedDateTime,id,file&$orderby=lastModifiedDateTime desc&$top=50`);
  // One file per stored Option / Stage may be in the folder ("… - Downside.xlsx", "… (Downside).xlsx"): the report follows the base, i.e. files with no option in the name or one named like a base case.
  const optOf = n => { const f = String(n).replace(/\.[^.]+$/, ''); const m = f.match(/\(([^)]{1,60})\)\s*$/) || f.match(/\s[-–]\s([^-–]{1,60})$/); return m ? m[1].trim() : ''; };
  const isBase = o => !o || /^(base|live|current|approved|main|master|as is)/i.test(o);
  const all = (j.value || []).filter(f => f.file && /\.(xlsx|xlsm|xls|csv)$/i.test(f.name)).sort((a, b) => b.lastModifiedDateTime.localeCompare(a.lastModifiedDateTime));
  // one financial model per file name (version and date suffixes ignored): "DF_CS046 v2.xlsx" and "DF_CS046.xlsx" are the same model
  const keyOf = n => { let k = String(n).replace(/\.[^.]+$/, ''); const o = optOf(n); if (o) k = k.replace(/\s*\([^)]*\)\s*$/, '').replace(/\s[-–]\s[^-–]*$/, ''); for (let i = 0; i < 4; i++) k = k.replace(/[\s_-]*(v\d+|rev\s?\d+|\d{4}[-_.]\d{2}[-_.]\d{2}|final|copy|\(\d+\))$/i, '').replace(/[\s_-]+(\d{3,8}|export|exported|em)$/i, ''); return k.trim().toLowerCase(); };
  const groups = new Map(); for (const f of all.filter(f => isBase(optOf(f.name)))) { const k = keyOf(f.name); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(f); }
  const files = all.filter(f => isBase(optOf(f.name))).slice(0, 2).filter((f, i, xs) => !i || keyOf(f.name) === keyOf(xs[0].name));
  if (!files.length) return { noExport: all.length ? `only option exports in the folder (${all.slice(0, 5).map(f => optOf(f.name)).join(', ')}); no base export` : 'no EstateMaster export in the exports folder yet: upload one in the agent (Financial modelling → Upload export) and it is copied there' };
  const base = folder.replace(/\/root:.*$/, '');
  const read = async f => ({ name: f.name, at: f.lastModifiedDateTime, ...readExport(await G.graphBytes(token, `${base}/items/${f.id}/content`), f.name) });
  const [b, a] = await Promise.all(files.map(read));
  // the other models in the folder (up to 8), each with its latest and previous export
  const others = [...groups.entries()].filter(([k]) => k !== keyOf(files[0].name)).slice(0, 7);
  const otherModels = (await Promise.all(others.map(async ([k, fs]) => { try { const [ob, oa] = await Promise.all(fs.slice(0, 2).map(read)); if (!Object.keys(ob.out).length) return null; return { key: k, b: ob, a: oa || null }; } catch { return null; } }))).filter(Boolean);
  const options = all.filter(f => !isBase(optOf(f.name))).slice(0, 10).map(f => ({ option: optOf(f.name), file: f.name, at: f.lastModifiedDateTime }));
  if (!Object.keys(b.out).length) return { skipped: `no EstateMaster returns found in ${b.name}` };
  const hurdle = +(env('HURDLE_IRR') || 18);
  const checks = EM.emChecks({ out: b.out, inputs: b.inputs, sens: b.sens, cells: b.cells, at: b.at, file: b.name }, a ? { out: a.out, file: a.name } : null, { now: now.toISOString(), hurdle }).filter(c => c.code !== 'hurdle');
  let flags = { msgs: [], findings: [], note: '' };
  const nameOf = x => (x.meta && x.meta.title) || x.name.replace(/\.[^.]+$/, '');
  const models = [{ key: keyOf(b.name), b, a: a || null }].concat(otherModels).map(m => ({ ...m, name: nameOf(m.b), checks: EM.emChecks({ out: m.b.out, inputs: m.b.inputs, sens: m.b.sens, cells: m.b.cells, at: m.b.at, file: m.b.name }, m.a ? { out: m.a.out, file: m.a.name } : null, { now: now.toISOString(), hurdle }).filter(c => c.code !== 'hurdle') }));
  if (G.aiConfigured() && !o.noStress) { await Promise.all(models.slice(0, 3).map(async m => { try { m.stress = await stressRun(m.b, hurdle, m.checks); } catch (e) { m.stress = { note: e.message, scenarios: [], risks: [] }; } })); }
  if (G.aiConfigured() && !o.stressOnly) { try {
    flags = await scanFindings(token, new Date(now.getTime() - 864e5).toISOString(), models.map(m => m.name));
    // each change is costed on the export of the model it concerns (the most recent model when the email does not say)
    const pick = f => models.find(m => f.model && m.name.toLowerCase() === String(f.model).toLowerCase()) || models.find(m => f.model && (m.name.toLowerCase().includes(String(f.model).toLowerCase()) || String(f.model).toLowerCase().includes(m.name.toLowerCase()))) || models[0];
    for (const m of models) { const fs = flags.findings.filter(f => pick(f) === m); fs.forEach(f => { f.modelName = m.name; }); if (fs.length) await estimateImpacts(m.b, fs, hurdle); }
  } catch (e) { flags.note = e.message; } } else flags.note = 'no AI key: emails not read';
  const market = EM.marketVsInputs(b.inputs, b.meta);
  const stress = models.filter(m => m.stress).map(m => ({ name: m.name, file: m.b.name, base_irr: m.b.out.levered_irr, base_poc: m.b.out.profit_on_cost, ...m.stress }));
  return { b, a, options, hurdle, checks, flags, market, models, stress, project: models.length > 1 ? `${models.length} financial models` : env('PROJECT_NAME') || (b.meta && b.meta.title) || 'Al Narjis Mixed-Use' };
}
async function dailyHtml(d, now, appUrl, lang) {
  const { b, a, options, hurdle, checks, flags, market } = d, ar = lang === 'ar';
  const tr = ar ? await translateAr([...checks.map(c => c.text), ...market.rows.map(r => r.item), flags.note]) : {};
  const T = t => ar ? (AR[t] || tr[t] || t) : t, X = t => ar ? (tr[t] || t) : t;
  const ok = Number.isFinite(b.out.levered_irr) ? b.out.levered_irr >= hurdle : null;
  const h3 = t => `<h3 style="margin:22px 0 6px;font-size:11px;letter-spacing:.24em;text-transform:uppercase;color:${TAUPE}">${esc(T(t))}</h3>`;
  const lvl = { error: ['Likely error', '#d03b3b'], warn: ['Check', OR], note: ['Note', SOFT] };
  const pill = (t, c) => `<span style="display:inline-block;background:${c};color:#fff;font-size:9px;letter-spacing:.16em;text-transform:uppercase;font-weight:700;padding:2px 6px;border-radius:3px;white-space:nowrap">${esc(t)}</span>`;
  const stats = ROWS.slice(0, 4).map(([k, l, u]) => `<td width="25%" style="padding:10px 8px 10px 0;border-top:2px solid ${OR};vertical-align:top"><div style="font-size:9px;letter-spacing:.22em;text-transform:uppercase;color:${TAUPE};font-weight:700">${esc(T(l))}</div><div style="font-size:24px;font-weight:700;margin-top:6px;color:${k === 'levered_irr' && ok === false ? '#d03b3b' : CH}">${fmt(b.out[k], u)}</div>${a ? `<div style="font-size:11px;color:${SOFT};margin-top:2px">${dlt(a.out[k], b.out[k], u)}</div>` : ''}</td>`).join('');
  const table = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-top:18px"><tr>${th(T('Output'))}${a ? th(T('Previous')) : ''}${th(T('Latest'))}${a ? th(T('Change')) : ''}</tr>${ROWS.map(([k, l, u]) => `<tr>${td(esc(T(l)))}${a ? td(fmt(a.out[k], u), ';text-align:right') : ''}${td(`<b>${fmt(b.out[k], u)}</b>`, ';text-align:right')}${a ? td(dlt(a.out[k], b.out[k], u), ';text-align:right') : ''}</tr>`).join('')}</table>`;
  const checksHtml = h3('Checks on the export') + (checks.length
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">${checks.map(c => `<tr>${td(pill(T(lvl[c.level][0]), lvl[c.level][1]), ';width:90px')}${td(esc(X(c.text)) + (c.cell ? ` <b>${esc(c.cell)}</b>` : ''))}</tr>`).join('')}</table><p style="margin:8px 0 0;color:${SOFT};font-size:12px">${ar ? `${checks.filter(c => c.level !== 'note').length} للمراجعة. فحوصات لشخص يراجعها؛ لم يتغير شيء.` : `${checks.filter(c => c.level !== 'note').length} to look at. These are checks for a person; nothing was changed.`}</p>`
    : `<p style="margin:0;color:${SOFT}">${ar ? 'المخرجات متطابقة والوحدات سليمة والمدخلات ضمن النطاق. لا شيء للمراجعة.' : 'Outputs reconcile, units look right, the sensitivity tables match the Summary and the inputs are in range. Nothing to look at.'}</p>`);
  const flagsHtml = h3('Assumption changes and approvals asked for in emails (last 24 hours)') + (flags.findings.length
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse"><tr>${th(T('Assumption'))}${th(T('Proposed'))}${th(T('From'))}${th(T('Why'))}${th(T('Impact if applied (AI estimate)'))}</tr>${findingRows(flags.findings)}</table><p style="margin:8px 0 0;color:${SOFT};font-size:12px">${ar ? `${flags.findings.length} تغيير محتمل. يصبح كل منها طلب تغيير في التطبيق؛ لا يتغير شيء قبل موافقة شخص. ملف التصدير أعلاه لا يتضمنها بعد.` : `${flags.findings.length} possible change${flags.findings.length > 1 ? 's' : ''} in ${flags.msgs.length} email${flags.msgs.length > 1 ? 's' : ''}. The impact is the AI’s estimate from EstateMaster’s figures, not EstateMaster’s own. Each one becomes a change request in the app; nothing changes until a person approves it. The export above does not include them yet.`}</p>`
    : `<p style="margin:0;color:${SOFT}">${flags.note ? esc(X(flags.note)) : ar ? 'لم يُرصد أي تغيير في الافتراضات في رسائل آخر 24 ساعة.' : `No assumption change sensed in the ${flags.msgs.length} email${flags.msgs.length === 1 ? '' : 's'} of the last 24 hours.`}</p>`);
  const stc = r => r.status === 'within' ? '#1f8a5a' : r.aggressive ? '#d03b3b' : OR;
  const marketHtml = h3('Assumptions vs market') + (market.rows.length
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse"><tr>${th(T('Assumption'))}${th(T('Model'))}${th(T('Market'))}${th(T('Position'))}</tr>${market.rows.map(r => `<tr>${td(`<b>${esc(T(r.item))}</b><br><span style="color:${SOFT};font-size:11px">${esc(r.input)} · ${esc(r.sheet)}</span>`)}${td(esc(r.model))}${td(esc(r.market), `;color:${SOFT}`)}${td(pill(T(r.status) + (r.status !== 'within' ? ' · ' + T(r.aggressive ? 'aggressive' : 'conservative') : ''), stc(r)))}</tr>`).join('')}</table><p style="margin:8px 0 0;color:${SOFT};font-size:12px">${esc(market.bench)} · ${ar ? 'بيانات سوق تجريبية' : 'demo market data (transactions, rentals and cost feeds in production)'}${market.fx ? ' · ' + esc(market.fx) : ''}.</p>`
    : `<p style="margin:0;color:${SOFT}">${ar ? 'لا توجد افتراضات في ملف التصدير يمكن مقارنتها بالسوق (أضيفوا ورقة المدخلات).' : 'No assumption in the export the market data covers (include the Input sheet in the export).'}</p>`);
  const hurdleLine = ok == null ? (ar ? 'لا يتضمن ملف التصدير معدل العائد على حقوق الملكية.' : 'The latest export has no levered IRR.') : ok ? (ar ? `معدل العائد أعلى من الحد ${hurdle}%.` : `Levered IRR is above the ${hurdle}% hurdle.`) : `<b style="color:#d03b3b">${ar ? `معدل العائد أدنى من الحد ${hurdle}%.` : `Levered IRR is below the ${hurdle}% hurdle.`}</b>`;
  const foot = ar ? `كل الأرقام من إستيت ماستر، مقروءة من ${esc(b.name)} (${esc(riyadh(b.at))}).` : `Every figure is EstateMaster's own, read from ${esc(b.name)} (${esc(riyadh(b.at))}${b.opt ? ', option ' + esc(b.opt) : ''})${a ? ` and compared with ${esc(a.name)} (${esc(riyadh(a.at))})` : ''}${options.length ? `. Other options in the folder: ${options.map(o => esc(o.option)).join(', ')}` : ''}. Market positions and checks are the agent's. Open the agent for the full report and ▶ Play.`;
  const models = d.models || [];
  const modelsHtml = models.length > 1 ? h3('All financial models') + `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse"><tr>${th(T('Model'))}${th(T('Levered IRR'))}${th(T('Profit on cost'))}${th(T('Net profit'))}${th(T('IRR since last export'))}${th(T('Checks'))}</tr>${models.map(m => { const o = m.b.out, pv = m.a && m.a.out, dI = pv && Number.isFinite(o.levered_irr) && Number.isFinite(pv.levered_irr) ? o.levered_irr - pv.levered_irr : null, nck = m.checks.filter(c => c.level !== 'note'), below = Number.isFinite(o.levered_irr) && o.levered_irr < hurdle;
      return `<tr>${td(`<b>${esc(m.name)}</b><br><span style="color:${SOFT};font-size:11px">${esc(m.b.name)} · ${esc(riyadh(m.b.at))}</span>`)}${td(`<b style="color:${below ? '#d03b3b' : CH}">${fmtImp(o.levered_irr, '%')}</b>${below ? ` <span style="color:#d03b3b;font-size:11px">${ar ? 'دون الحد' : 'below hurdle'}</span>` : ''}`, ';text-align:right')}${td(fmtImp(o.profit_on_cost, '%'), ';text-align:right')}${td(fmtImp(o.net_profit, 'M'), ';text-align:right')}${td(dI == null ? '—' : `${dI >= 0 ? '+' : ''}${dI.toFixed(2)} pts`, ';text-align:right')}${td(nck.length ? `<b style="color:${nck.some(c => c.level === 'error') ? '#d03b3b' : OR}">${nck.length}</b>` : (ar ? 'لا شيء' : 'none'), ';text-align:right')}</tr>`; }).join('')}</table><p style="margin:8px 0 0;color:${SOFT};font-size:12px">${ar ? 'كل نموذج من آخر ملف تصدير له في المجلد. الأرقام من إستيت ماستر.' : 'Every financial model in the exports folder, from its latest export. The figures are EstateMaster’s; the change since the last export is arithmetic on them.'}</p>`
    + (models.slice(1).some(m => m.checks.some(c => c.level !== 'note')) ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-top:10px">${models.slice(1).flatMap(m => m.checks.filter(c => c.level !== 'note').map(c => `<tr>${td(`<b>${esc(m.name)}</b>`, ';width:28%')}${td(pill(T(lvl[c.level][0]), lvl[c.level][1]), ';width:90px')}${td(esc(X(c.text)) + (c.cell ? ` <b>${esc(c.cell)}</b>` : ''))}</tr>`)).join('')}</table>` : '') : '';
  const body = urgentHtml(d, ar) + modelsHtml + (models.length > 1 ? h3(`${ar ? 'أحدث نموذج' : 'Most recent model'}: ${models[0].name}`) : '') + `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>${stats}</tr></table><p style="margin:16px 0 0">${hurdleLine}</p>${table}${checksHtml}${stressHtml(d, ar)}${flagsHtml}${marketHtml}<p style="margin:16px 0 0;color:${SOFT};font-size:12px">${foot}</p>`;
  let html = frame(T('Daily EstateMaster report'), d.project, riyadh(now.toISOString()), body, appUrl);
  if (ar) html = html.replace('<html>', '<html dir="rtl" lang="ar">');
  return html;
}
/* The daily report. opts: to (addresses), langs (['en','ar']), force (send whatever the day). Without opts it keeps the env-driven behaviour (REPORT_TO, REPORT_DAYS). */
/* Today's report in both languages, kept with the schedule so the app can show either at once (the Arabic is not built on demand) */
async function keepDaily(token, st, now, htmls, latest) {
  if (!st || !st.schedule) return;
  st.daily = { at: now.toISOString(), latest: latest || '', html: htmls };
  try { await SCHED.save(token, st); } catch { /* without write permission the copy is not kept */ }
}
async function reportJob(token, now, dry, appUrl, opts = {}) {
  if (!opts.force) {
    const days = (env('REPORT_DAYS') || 'sun,mon,tue,wed,thu').toLowerCase().split(',').map(s => s.trim().slice(0, 3));
    const today = now.toLocaleDateString('en-US', { timeZone: 'Asia/Riyadh', weekday: 'short' }).toLowerCase().slice(0, 3);
    if (!days.includes(today)) return { job: 'report', skipped: `not a report day (${today})` };
  }
  const st0 = await SCHED.load(token).catch(() => ({ feed: null }));
  let d = await dailyData(token, now);
  if (d.skipped) return { job: 'report', skipped: d.skipped };
  // No export in the folder: the report still goes out with what has to be known today (the Daily feed and the emails)
  if (d.noExport) {
    let flags = { msgs: [], findings: [], note: '' };
    if (G.aiConfigured()) { try { flags = await scanFindings(token, new Date(now.getTime() - 864e5).toISOString()); } catch (e) { flags.note = e.message; } }
    const hurdle = +(env('HURDLE_IRR') || 18), project = env('PROJECT_NAME') || (st0.feed && st0.feed.project) || 'Al Narjis Mixed-Use';
    const dd = { feed: st0.feed, flags, checks: [], hurdle, project };
    const langs = (opts.langs && opts.langs.length ? opts.langs : ['en']).filter(l => l === 'en' || l === 'ar');
    const to = G.checkRecipients(opts.to ? [].concat(opts.to).join(',').split(/[,;\s]+/) : env('REPORT_TO').split(','));
    const day = now.toLocaleDateString('en-GB', { timeZone: 'Asia/Riyadh', day: 'numeric', month: 'short' });
    const body = l => urgentHtml(dd, l === 'ar') + (flags.findings.length ? `<h3 style="margin:22px 0 6px;font-size:11px;letter-spacing:.24em;text-transform:uppercase;color:${TAUPE}">Assumption changes and approvals asked for in emails (last 24 hours)</h3><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse"><tr>${th('Assumption')}${th('Proposed')}${th('From')}${th('Why')}${th('Impact if applied (AI estimate)')}</tr>${findingRows(flags.findings)}</table>` : '') + `<p style="margin:16px 0 0;color:#d03b3b;font-size:13px"><b>No EstateMaster figures today:</b> ${esc(d.noExport)}.</p>`;
    const htmls = {}; for (const l of ['en', 'ar']) htmls[l] = frame(l === 'ar' ? 'التقرير اليومي' : 'Daily EstateMaster report', project, riyadh(now.toISOString()), body(l), appUrl).replace(l === 'ar' ? '<html>' : '\u0000', '<html dir="rtl" lang="ar">');
    await keepDaily(token, st0, now, htmls, null);
    const out = { job: 'report', latest: null, note: d.noExport, project, subject: `KINAN · Daily report · ${project} · ${day}`, sent: false, langs, flags: flags.findings.map(f => ({ assumption: f.assumption, new_value: f.new_value, from: f.msg.from })) };
    if (to.bad.length) out.rejected = to.bad;
    if (dry) { out.preview = htmls[langs[0]]; out.previews = htmls; out.daily = st0.daily || null; return out; }
    if (!to.ok.length) { out.note = 'REPORT_TO is not set (or has no internal address): report not sent'; return out; }
    for (const l of langs) await G.sendMail(token, { to: to.ok, subject: out.subject, html: htmls[l] });
    out.sent = true; out.to = to.ok; return out;
  }
  d.feed = st0.feed;
  if (d.stress && d.stress.length) { try { const st = await SCHED.load(token); st.stress = { at: now.toISOString(), models: d.stress }; await SCHED.save(token, st); } catch { /* without write permission the run is not kept */ } }
  const { b, a, checks, flags, market, options } = d;
  const langs = (opts.langs && opts.langs.length ? opts.langs : ['en']).filter(l => l === 'en' || l === 'ar');
  const to = G.checkRecipients(opts.to ? [].concat(opts.to).join(',').split(/[,;\s]+/) : env('REPORT_TO').split(','));
  const day = now.toLocaleDateString('en-GB', { timeZone: 'Asia/Riyadh', day: 'numeric', month: 'short' });
  const out = { job: 'report', latest: b.name, previous: a ? a.name : null, figures: b.out, checks, flags: flags.findings.map(f => ({ assumption: f.assumption, new_value: f.new_value, from: f.msg.from })), market: market.rows, options, stress: d.stress, project: d.project, subject: `KINAN · EstateMaster report · ${d.project} · ${day}`, sent: false, langs };
  if (to.bad.length) out.rejected = to.bad;
  const htmls = {}; for (const l of ['en', 'ar']) { try { htmls[l] = await dailyHtml(d, now, appUrl, l); } catch (e) { if (langs.includes(l)) throw e; } }
  await keepDaily(token, st0, now, htmls, b.name);
  if (dry) { out.preview = htmls[langs[0]]; out.previews = htmls; out.daily = st0.daily || null; return out; }
  if (!to.ok.length) { out.note = 'REPORT_TO is not set (or has no internal address): report not sent'; return out; }
  for (const l of langs) await G.sendMail(token, { to: to.ok, subject: l === 'ar' ? `كنان · تقرير إستيت ماستر · ${d.project} · ${day}` : out.subject, html: htmls[l] });
  out.sent = true; out.to = to.ok; return out;
}
/* Every 15 minutes (vercel.json): the two scans at 07:00 and 15:00 Riyadh, and the daily report when the saved schedule says so. */
async function tickJob(token, now, dry, appUrl) {
  const res = [];
  if (SLOTS.includes(now.getUTCHours()) && now.getUTCMinutes() < 15) res.push(G.aiConfigured() ? await scanJob(token, now, dry, appUrl) : { job: 'scan', skipped: 'no AI key' });
  const st = await SCHED.load(token);
  if (!SCHED.due(st.schedule, now, st.log)) { res.push({ job: 'report', skipped: 'not due', next: SCHED.nextRun(st.schedule, now) }); return res; }
  const r = await reportJob(token, now, dry, appUrl, { to: st.schedule.recipients, langs: st.schedule.languages, force: true });
  res.push(r);
  if (!dry) await SCHED.record(token, st, { kind: 'scheduled', status: r.sent ? 'sent' : r.skipped ? 'skipped' : 'failed', note: r.skipped || r.note || '', to: r.to || [], langs: r.langs || [], latest: r.latest || '' }, now);
  return res;
}
const status = () => ({ scan: { enabled: G.graphConfigured() && G.aiConfigured(), times: ['07:00', '15:00'], tz: 'Asia/Riyadh', alertTo: env('ALERT_TO') ? env('ALERT_TO').split(',').length + ' recipient(s)' : null },
  report: { enabled: G.graphConfigured() && !!env('EXPORTS_FOLDER') && !!env('REPORT_TO'), time: env('REPORT_TIME') || '07:00', days: env('REPORT_DAYS') || 'sun,mon,tue,wed,thu' }, secret: !!env('CRON_SECRET') });

module.exports = async function handler(req, res) {
  const u = new URL(req.url, 'http://x'), run = (u.searchParams.get('run') || '').split(',').filter(Boolean);
  // No job requested: the app asks what is scheduled (no secrets in the answer).
  if (!run.length) return G.send(res, 200, status());
  if (!env('CRON_SECRET') || req.headers.authorization !== `Bearer ${env('CRON_SECRET')}`) return G.send(res, 401, { error: 'Scheduled jobs need CRON_SECRET (Vercel sends it automatically).' });
  if (!G.graphConfigured()) return G.send(res, 501, { error: 'Microsoft Graph is not configured.' });
  const dry = u.searchParams.get('dry') === '1', now = u.searchParams.get('now') ? new Date(u.searchParams.get('now')) : new Date();
  const appUrl = env('APP_URL') || (req.headers.host ? `https://${req.headers.host}` : '');
  const results = [];
  try {
    const token = await G.graphToken();
    for (const j of run) {
      try {
        if (j === 'scan') { if (!G.aiConfigured()) results.push({ job: 'scan', skipped: 'no AI key' }); else results.push(await scanJob(token, now, dry, appUrl)); }
        else if (j === 'report') results.push(await reportJob(token, now, dry, appUrl));
        else if (j === 'tick') results.push(...await tickJob(token, now, dry, appUrl));
      } catch (e) { results.push({ job: j, error: e.message }); }
    }
  } catch (e) { return G.send(res, 502, { error: e.message }); }
  return G.send(res, 200, { at: now.toISOString(), dry, results });
};
module.exports.windowFor = windowFor;
module.exports.readExport = readExport;
module.exports.reportJob = reportJob;
module.exports.dailyData = dailyData;
module.exports.stressRun = stressRun;
module.exports.stressHtml = stressHtml;
module.exports.urgentItems = urgentItems;
