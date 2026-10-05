// Reads an EstateMaster Office Links export (outputs by row label, the input rows, the stored Option and the saved
// sensitivity tables) and checks it for likely mistakes. Used by the morning report on the server; the app carries the
// same emChecks() (copied at build time by tools/sync_emcheck.py) for the EstateMaster tab and the chat.
// Nothing here changes anything: a check is a sentence for a person to look at.
const LAB = [['levered_irr', /(equity|levered|geared)\s*irr|irr\s*\((equity|levered|geared)/i], ['unlevered_irr', /(unlevered|ungeared|project)\s*irr|irr\s*\((unlevered|ungeared|project)/i], ['profit_on_cost', /(profit|margin)\s*on\s*(cost|development)|development\s*margin/i], ['net_profit', /(net|development)\s*profit/i], ['total_cost', /total\s*(development\s*)?costs?\b/i], ['gross_revenue', /(gross|total)\s*(revenue|realisation|realization|sales)/i], ['equity_multiple', /equity\s*multiple/i], ['peak_debt', /peak\s*(debt|funding|loan)/i]];
const ROWS = [['levered_irr', 'Levered IRR', '%'], ['unlevered_irr', 'Unlevered IRR', '%'], ['profit_on_cost', 'Profit on cost', '%'], ['net_profit', 'Net profit', 'M'], ['total_cost', 'Total development cost', 'M'], ['gross_revenue', 'Gross revenue', 'M'], ['equity_multiple', 'Equity multiple', 'x'], ['peak_debt', 'Peak debt', 'M']];

const numOf = v => typeof v === 'number' ? v : (typeof v === 'string' && /^\s*-?[\d,.]+\s*%?\s*$/.test(v) && v.trim() ? parseFloat(v.replace(/[,%\s]/g, '')) : null);
const SHIFT = c => { if (typeof c === 'number') return Number.isInteger(c) ? (Math.abs(c) <= 60 ? c : null) : (Math.abs(c) <= 1 && Math.abs(c) >= .005 ? +(c * 100).toFixed(2) : null); if (typeof c === 'string') { const t = c.trim(); const m = t.match(/^([+\-−]?\d{1,2}(?:\.\d+)?)\s*%$/); if (m) return +m[1].replace('−', '-'); if (/^base(\s*case)?$/i.test(t)) return 0; } return null; };
const SENSMET = m => /irr/i.test(m) ? (/unlev|ungear|project/i.test(m) ? 'uirr' : 'irr') : /margin|on cost/i.test(m) ? 'poc' : /npv/i.test(m) ? 'npv' : /profit/i.test(m) ? 'profit' : 'other';

/* 1-way: a row of shifts (−20 … +20, with 0) then one row per metric. 2-way: a row of shifts and a column of shifts around a grid. */
function parseSens(rows, sheet) {
  const res = []; let i = 0;
  while (i < rows.length) {
    const row = rows[i] || []; let run_ = [];
    for (let j = 0; j < row.length; j++) { if (SHIFT(row[j]) != null && !(typeof row[j] === 'number' && row[j] > 1 && !Number.isInteger(row[j]))) { if (run_.length && j !== run_[run_.length - 1] + 1) { if (run_.length >= 3) break; run_ = []; } run_.push(j); } }
    const shifts = run_.map(j => SHIFT(row[j]));
    if (run_.length >= 3 && shifts.includes(0) && shifts.every((v, k) => !k || v > shifts[k - 1]) && !row.slice(run_[run_.length - 1] + 1).some(c => typeof c === 'number')) {
      let title = row.slice(0, run_[0]).find(c => typeof c === 'string' && c.trim() && SHIFT(c) == null) || '';
      for (let k = i - 1; k >= Math.max(0, i - 4) && !title; k--) { const t = (rows[k] || []).find(c => typeof c === 'string' && c.trim() && SHIFT(c) == null); if (t) title = t; }
      title = String(title).replace(/sensitivity( analysis| table)?/i, '').replace(/\b(one|two|three|1|2|3)[- ]way\b/i, '').replace(/^[\s:–-]+|[\s:–-]+$/g, '').trim();
      const one = [], grid = [], ys = []; let k = i + 1;
      for (; k < rows.length; k++) {
        const r = rows[k] || []; if (!r.some(c => c !== '' && c != null)) break;
        const vals = run_.map(j => numOf(r[j])); if (vals.filter(v => v != null).length < 2) break;
        const lead = r.slice(0, run_[0]).filter(c => c !== '' && c != null); const lab = lead.find(c => typeof c === 'string' && SHIFT(c) == null); const ysh = lead.map(SHIFT).find(v => v != null);
        if (lab) one.push({ metric: String(lab).trim(), values: vals }); else if (ysh != null) { ys.push(ysh); grid.push(vals); } else break;
      }
      const norm = (key, vals) => vals.map(v => v == null ? null : (['irr', 'uirr', 'poc'].includes(key) && Math.abs(v) < 1 ? +(v * 100).toFixed(4) : +v));
      if (grid.length >= 2) {
        const mm = title.match(/(equity irr|levered irr|geared irr|project irr|unlevered irr|development margin|margin on cost|profit on cost|npv|net profit|irr)/i); const metric = mm ? mm[1] : 'Levered IRR', mk = SENSMET(metric);
        const rest = title.replace(mm ? mm[0] : '', '').replace(/[()]/g, ' ').replace(/^[\s:–-]+|[\s:–-]+$/g, '').trim(); const pr = rest.match(/^(.*?)\s+(?:vs\.?|v\.|\/|×|x|and|&|by)\s+(.*)$/i);
        res.push({ kind: '2way', x: pr ? pr[1].trim() : (rest || 'X'), y: pr ? pr[2].trim() : 'Y', metric, mk, xs: shifts, ys, grid: grid.map(r => norm(mk, r)), sheet });
      } else for (const o of one) { const mk = SENSMET(o.metric); res.push({ kind: '1way', v: title || 'assumption', metric: o.metric, mk, shifts, values: norm(mk, o.values), sheet }); }
      i = Math.max(k, i + 1);
    } else i++;
  }
  return res;
}
/* Input rows: a label and a number, from the input-like sheets (else every sheet), the outputs excluded. */
function parseInputs(sheets) {
  const want = sheets.filter(s => /input|assumption|intro|summary|setup|financ|loan/i.test(s.name)); const use = want.length ? want : sheets; const out = [];
  for (const s of use) for (const row of s.rows) {
    if (!row || out.length >= 600) continue; const i = row.findIndex(c => typeof c === 'string' && c.trim().length > 2 && c.length <= 70); if (i < 0) continue;
    const lab = row[i].trim(); if (LAB.some(([, re]) => re.test(lab))) continue; const v = row.slice(i + 1, i + 6).map(numOf).find(x => x != null && Number.isFinite(x)); if (v == null) continue;
    const unitCell = row.slice(i + 1, i + 6).find(c => typeof c === 'string' && /%|sar|sqm|month|year|p\.a\./i.test(c) && c.length < 30);
    out.push({ label: lab, value: v, sheet: s.name, unit: unitCell ? unitCell.trim() : '' });
  }
  return out;
}
function detectOpt(sheets, fileName) {
  for (const s of sheets.slice(0, 4)) for (const row of s.rows.slice(0, 80)) {
    if (!row) continue;
    for (let i = 0; i < row.length; i++) {
      const c = row[i]; if (typeof c !== 'string') continue; const t = c.trim();
      const m = t.match(/^(?:stored\s+)?(?:option|stage|scenario)(?:\s*(?:name|description|\/\s*stage))?\s*[:\-–]\s*(.{1,60})$/i); if (m) return m[1].trim();
      if (/^(?:stored\s+)?(?:option|stage|scenario)(?:\s*(?:name|description|\/\s*stage))?\s*:?$/i.test(t)) { const v = row.slice(i + 1).find(x => (typeof x === 'string' && x.trim()) || typeof x === 'number'); if (v != null) return String(v).trim().slice(0, 60); }
    }
  }
  const f = String(fileName || '').replace(/\.[^.]+$/, ''); const m = f.match(/\(([^)]{1,60})\)\s*$/) || f.match(/\s[-–]\s([^-–]{1,60})$/); return m ? m[1].trim() : '';
}
/* Everything the app and the server read from one workbook. */
function parseWorkbook(wb, XLSX, fileName) {
  const sheets = (wb.SheetNames || []).map(name => ({ name, rows: XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: true }) }));
  const out = {}, found = {};
  for (const s of sheets) for (const row of s.rows) {
    if (!row) continue;
    for (let i = 0; i < row.length; i++) {
      const c = row[i]; if (typeof c !== 'string' || c.length > 80) continue;
      for (const [k, re] of LAB) {
        if (k in out || !re.test(c)) continue; if (k === 'levered_irr' && /unlevered|ungeared/i.test(c)) continue;
        const v = row.slice(i + 1).find(x => typeof x === 'number' || (typeof x === 'string' && /^\s*-?[\d,.]+\s*%?\s*$/.test(x) && x.trim())); if (v == null) continue;
        let n = typeof v === 'number' ? v : parseFloat(v.replace(/[,%\s]/g, '')); if (!Number.isFinite(n)) continue;
        if (/irr|profit_on_cost/.test(k) && Math.abs(n) < 1 && !(typeof v === 'string' && /%/.test(v))) n *= 100;
        out[k] = +n.toFixed(4); found[k] = `${s.name} / ${c.trim()}`; break;
      }
    }
  }
  const sens = []; for (const s of sheets) { let r = parseSens(s.rows, s.name); if (!r.length && /sensitiv/i.test(s.name)) { const T = []; s.rows.forEach((row, i) => (row || []).forEach((c, j) => { (T[j] = T[j] || [])[i] = c; })); r = parseSens(T, s.name); } sens.push(...r); }
  return { out, found, sens, inputs: parseInputs(sheets), opt: detectOpt(sheets, fileName), sheets: sheets.map(s => s.name).slice(0, 40) };
}

/* ---- checks (kept identical in the app) ---- */
/*EMCHECKS-START*/
/* Likely mistakes in an EstateMaster export: unit slips, outputs that do not reconcile, sensitivity tables not refreshed,
   implausible inputs, jumps since the previous export with no approved change behind them, a stale export.
   x = {out, inputs, sens, at, file}; prev = the previous export of the same option; opt = {now, hurdle, register, approvedBetween}. */
function emChecks(x, prev, opt) {
  opt = opt || {}; const o = x.out || {}, p = prev && prev.out || {}, res = [], add = (level, code, text) => res.push({ level, code, text });
  const fin = v => typeof v === 'number' && Number.isFinite(v), M = v => 'SAR ' + (Math.abs(v) / 1e6).toLocaleString('en-GB', { maximumFractionDigits: 1 }) + 'M', P = v => v.toFixed(2) + '%';
  for (const k of ['levered_irr', 'profit_on_cost', 'net_profit', 'total_cost']) if (!fin(o[k])) add('note', 'missing', `${ROWS.find(r => r[0] === k)[1]} is not in the export (no row with that label): include the Summary sheet.`);
  for (const k of ['total_cost', 'gross_revenue', 'net_profit', 'peak_debt']) if (fin(o[k]) && o[k] !== 0 && Math.abs(o[k]) < 5e6) add('warn', 'units', `${ROWS.find(r => r[0] === k)[1]} reads ${o[k].toLocaleString('en-GB')}: that looks like thousands or millions rather than full SAR (unit setting in the export?).`);
  if (fin(o.net_profit) && fin(o.total_cost) && fin(o.profit_on_cost) && o.total_cost > 0) { const calc = o.net_profit / o.total_cost * 100; if (Math.abs(calc - o.profit_on_cost) > 1.5) add('error', 'reconcile', `Profit on cost ${P(o.profit_on_cost)} does not reconcile with net profit / total cost (${P(calc)}): one of the three rows is wrong or from a different option.`); }
  if (fin(o.gross_revenue) && fin(o.total_cost) && fin(o.net_profit) && o.gross_revenue > 0 && Math.abs(o.gross_revenue - o.total_cost - o.net_profit) > 0.03 * o.gross_revenue) add('warn', 'reconcile', `Revenue ${M(o.gross_revenue)} − total cost ${M(o.total_cost)} = ${M(o.gross_revenue - o.total_cost)}, but net profit reads ${M(o.net_profit)}: check tax, land or finance lines are counted once.`);
  if (fin(o.peak_debt) && fin(o.total_cost) && o.peak_debt > o.total_cost) add('error', 'debt', `Peak debt ${M(o.peak_debt)} is above total development cost ${M(o.total_cost)}: facility or drawdown inputs look wrong.`);
  if (fin(o.levered_irr) && fin(o.unlevered_irr) && fin(o.net_profit) && o.net_profit > 0 && (!fin(o.peak_debt) || o.peak_debt > 0) && o.levered_irr < o.unlevered_irr - 0.2) add('warn', 'leverage', `Levered IRR ${P(o.levered_irr)} is below the unlevered IRR ${P(o.unlevered_irr)} on a profitable scheme: the facility costs more than it earns (profit rate, fees or drawdown timing?).`);
  if (fin(o.levered_irr) && (o.levered_irr > 60 || o.levered_irr < -20)) add('warn', 'range', `Levered IRR ${P(o.levered_irr)} is outside the plausible range: check the timing inputs (dates, spans) and the equity injection.`);
  if (fin(o.profit_on_cost) && o.profit_on_cost > 80) add('warn', 'range', `Profit on cost ${P(o.profit_on_cost)} is implausibly high: a cost section may be missing.`);
  if (fin(o.profit_on_cost) && fin(o.net_profit) && (o.profit_on_cost < 0) !== (o.net_profit < 0)) add('error', 'sign', `Profit on cost ${P(o.profit_on_cost)} and net profit ${M(o.net_profit)} have different signs.`);
  if (fin(o.equity_multiple) && (o.equity_multiple < 0.2 || o.equity_multiple > 6)) add('warn', 'range', `Equity multiple ${o.equity_multiple.toFixed(2)}x is outside the plausible range.`);
  for (const t of x.sens || []) {
    const key = t.mk === 'irr' ? 'levered_irr' : t.mk === 'uirr' ? 'unlevered_irr' : t.mk === 'poc' ? 'profit_on_cost' : null; if (!key || !fin(o[key])) continue;
    const base = t.kind === '1way' ? t.values[t.shifts.indexOf(0)] : (t.grid[t.ys.indexOf(0)] || [])[t.xs.indexOf(0)];
    if (fin(base) && Math.abs(base - o[key]) > 0.3) add('error', 'sens-stale', `Sensitivity table “${t.kind === '1way' ? t.v : t.x + ' × ' + t.y}” has ${t.metric} ${P(base)} at the base, but the Summary says ${P(o[key])}: the table was not refreshed after the last change (Recalc All, then export).`);
    if (t.kind === '1way' && t.values.every(fin)) { const up = /price|revenue|rent|sales|yield on/i.test(t.v), dn = /cost|rate|cap|delay|month|fee|contingen/i.test(t.v); const inc = t.values.every((v, i) => !i || v >= t.values[i - 1]), dec = t.values.every((v, i) => !i || v <= t.values[i - 1]);
      if ((up && !dn && !inc) || (dn && !up && !dec)) add('warn', 'sens-dir', `Sensitivity “${t.v}”: ${t.metric} does not move in the expected direction across the shifts (${t.values.map(P).join(', ')}).`); }
  }
  const nm = i => i.label.toLowerCase(), pct = i => i.value <= 1 && i.value >= -1 && /%|rate|margin|contingen|escalat|commission|vat|tax|ltc|ltv|share/i.test(i.label + ' ' + i.unit) ? i.value * 100 : i.value;
  for (const i of x.inputs || []) {
    const l = nm(i), v = pct(i);
    if (/contingen|escalat|commission|selling cost|sales cost|interest|profit rate|cap(italisation)? rate|exit yield|land (cost|price|value)|construction cost/.test(l) && i.value === 0) add('warn', 'input-zero', `Input “${i.label}” is 0 on sheet ${i.sheet}: left blank?`);
    if (/interest|profit rate|saibor|finance rate|loan rate/.test(l) && !/fee|margin over|spread/.test(l) && v !== 0 && (v < 2 || v > 15)) add('warn', 'input-range', `Input “${i.label}” = ${v}% p.a. is outside 2–15%.`);
    if (/cap(italisation)? rate|exit yield|terminal yield/.test(l) && v !== 0 && (v < 4 || v > 12)) add('warn', 'input-range', `Input “${i.label}” = ${v}% is outside 4–12%.`);
    if (/contingen/.test(l) && v > 15) add('warn', 'input-range', `Input “${i.label}” = ${v}%: contingency above 15%.`);
    if (/\bvat\b|value added tax/.test(l) && v !== 0 && Math.abs(v - 15) > 0.01) add('note', 'input-range', `Input “${i.label}” = ${v}%: Saudi VAT is 15%.`);
    if (/%|rate|margin|share/.test(l + ' ' + i.unit) && !/sar|sqm|month|year/i.test(i.unit) && Math.abs(v) > 100 && !/escalat/.test(l)) add('error', 'input-range', `Input “${i.label}” = ${i.value}: a percentage above 100%.`);
    if (/delay|duration|span|months/.test(l) && /month/.test(l + ' ' + i.unit) && (i.value < 0 || i.value > 120)) add('warn', 'input-range', `Input “${i.label}” = ${i.value} months is outside 0–120.`);
  }
  if (opt.register) for (const i of x.inputs || []) {
    const r = opt.register.find(rg => rg.match(i.label)); if (!r || !fin(r.value) || r.value === 0) continue;
    const ratios = [1, 1e3, 1e6, 1e-3, 1e-6, 100, 0.01].map(f => Math.abs(i.value * f / r.value - 1)); const d = Math.min(...ratios);
    if (d > 0.02 && d < 100) add('warn', 'register', `Input “${i.label}” reads ${i.value.toLocaleString('en-GB')} in the export but the approved register has ${r.label} = ${r.text}: an unapproved change or a typing slip.`);
  }
  if (prev && p) {
    const hop = (k, lim, u) => { if (!fin(o[k]) || !fin(p[k])) return; const d = u === 'pts' ? o[k] - p[k] : (o[k] - p[k]) / Math.abs(p[k] || 1) * 100; if (Math.abs(d) > lim) add(opt.approvedBetween ? 'note' : 'warn', 'jump', `${ROWS.find(r => r[0] === k)[1]} moved ${d > 0 ? '+' : '−'}${Math.abs(d).toFixed(1)}${u === 'pts' ? ' pts' : '%'} since the previous export${prev.file ? ' (' + prev.file + ')' : ''}${opt.approvedBetween ? ', with approved changes in between' : ' and no approved change in between: a typing slip or an unapproved change?'}`); };
    hop('levered_irr', 3, 'pts'); hop('profit_on_cost', 3, 'pts'); hop('total_cost', 10, '%'); hop('gross_revenue', 10, '%'); hop('peak_debt', 25, '%');
  }
  if (x.at && opt.now) { const days = (new Date(opt.now) - new Date(x.at)) / 864e5; if (days > 7) add('note', 'stale', `The latest export is ${Math.floor(days)} days old.`); }
  if (opt.hurdle && fin(o.levered_irr) && o.levered_irr < opt.hurdle) add('note', 'hurdle', `Levered IRR ${P(o.levered_irr)} is below the ${opt.hurdle}% hurdle.`);
  const order = { error: 0, warn: 1, note: 2 }; return res.sort((a, b) => order[a.level] - order[b.level]);
}
/*EMCHECKS-END*/
module.exports = { parseWorkbook, parseSens, parseInputs, detectOpt, emChecks, LAB, ROWS };
