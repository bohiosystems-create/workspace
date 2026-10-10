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
    if (run_.length >= 3 && shifts.includes(0) && shifts.some(v => v < 0) && shifts.some(v => v > 0) && shifts.every((v, k) => !k || v > shifts[k - 1]) && !row.slice(run_[run_.length - 1] + 1).some(c => typeof c === 'number')) {
      let title = row.slice(0, run_[0]).find(c => typeof c === 'string' && c.trim() && SHIFT(c) == null) || '';
      for (let k = i - 1; k >= Math.max(0, i - 4) && !title; k--) { const t = (rows[k] || []).find(c => typeof c === 'string' && c.trim() && SHIFT(c) == null); if (t) title = t; }
      title = String(title).replace(/sensitivity( analysis| table)?/i, '').replace(/\b(one|two|three|1|2|3)[- ]way\b/i, '').replace(/^[\s:–-]+|[\s:–-]+$/g, '').trim();
      const one = [], grid = [], ys = []; let k = i + 1;
      for (; k < rows.length; k++) {
        const r = rows[k] || []; if (!r.some(c => c !== '' && c != null)) break;
        const vals = run_.map(j => numOf(r[j])); if (vals.filter(v => v != null).length < 2) break;
        const lead = r.slice(0, run_[0]).filter(c => c !== '' && c != null); const lab = lead.find(c => typeof c === 'string' && SHIFT(c) == null); const ysh = lead.map(SHIFT).find(v => v != null);
        if (lab && /[a-z]{3}/i.test(lab) && !/^\s*\//.test(lab)) one.push({ metric: String(lab).trim(), values: vals }); else if (ysh != null) { ys.push(ysh); grid.push(vals); } else break;
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
/* Excel address of a cell, for the checks ("Input!C12") */
const A1 = (sheet, col, row) => { let c = '', n = col + 1; while (n > 0) { c = String.fromCharCode(64 + ((n - 1) % 26 + 1)) + c; n = Math.floor((n - 1) / 26); } return `${sheet}!${c}${row + 1}`; };
function parseInputs(sheets) {
  const want = sheets.filter(s => /input|assumption|intro|summary|setup|financ|loan/i.test(s.name)); const use = want.length ? want : sheets; const out = [], seen = new Set();
  for (const s of use) { let section = ''; s.rows.forEach((row, ri) => {
    if (!row || out.length >= 800) return;
    // a section heading: text only, in capitals or ending with a colon ("LAND PURCHASE & ACQUISITION COSTS")
    const txt = row.filter(c => c !== '' && c != null); if (txt.length && txt.length <= 2 && txt.every(c => typeof c === 'string') && /^[^a-z]{5,70}$/.test(String(txt[0]).trim()) && /[A-Z]/.test(txt[0])) { section = String(txt[0]).trim().replace(/\s+/g, ' '); return; }
    const i = row.findIndex(c => typeof c === 'string' && c.trim().length > 2 && c.length <= 70 && /[a-z]/i.test(c)); if (i < 0) return;
    const lab = row[i].trim(); if (LAB.some(([, re]) => re.test(lab))) return;
    const fr = (s.frows && s.frows[ri]) || [];
    const cells = []; for (let j = i + 1; j < Math.min(row.length, i + 9); j++) { const n = numOf(row[j]); if (n == null || !Number.isFinite(n)) continue; const t = String(fr[j] == null ? '' : fr[j]); if (/^[a-z]{3}[- ]\d{2,4}$|\d+\/\d+\/\d+/i.test(t.trim())) continue; const pc = /%\s*$/.test(t.trim()) || (typeof row[j] === 'string' && /%\s*$/.test(row[j])); cells.push({ v: pc && typeof row[j] === 'number' ? n * 100 : n, t, pct: pc, j }); }
    if (!cells.length) {
      // a text or date input on an input sheet ("Date of First Period: Oct-26", "Add GST on Land Price? Y") is part of the full list too
      if (!/input|assumption/i.test(s.name)) return;
      const tv = row.slice(i + 1, i + 6).map((c, j) => String(fr[i + 1 + j] == null ? (c == null ? '' : c) : fr[i + 1 + j]).trim()).find(t => t && t.length <= 40 && t !== '-');
      const key0 = s.name + '|' + lab; if (!tv || seen.has(key0)) return; seen.add(key0);
      const tj = row.slice(i + 1, i + 6).findIndex((c, j) => String(fr[i + 1 + j] == null ? (c == null ? '' : c) : fr[i + 1 + j]).trim() === tv);
      out.push({ label: lab, value: null, text: tv, pct: false, vals: [], sheet: s.name, section, unit: '', cell: A1(s.name, i + 1 + Math.max(0, tj), ri) }); return;
    }
    const unitCell = row.slice(i + 1, i + 9).find(c => typeof c === 'string' && /%|sar|aud|usd|sqm|m2|month|year|annum|p\.a\./i.test(c) && c.length < 30);
    const key = s.name + '|' + lab; if (seen.has(key)) return; seen.add(key);
    out.push({ label: lab, value: +cells[0].v.toFixed(6), text: cells[0].t || String(cells[0].v), pct: cells[0].pct, vals: cells.map(c => c.v).slice(0, 6), sheet: s.name, section, unit: cells[0].pct ? '%' : (unitCell ? unitCell.trim() : ''), cell: A1(s.name, cells[0].j, ri) });
  }); }
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
  const sheets = (wb.SheetNames || []).map(name => ({ name, rows: XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: true }), frows: XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: false }) }));
  const out = {}, found = {}, cells = {};
  for (const s of sheets) for (let ri = 0; ri < s.rows.length; ri++) { const row = s.rows[ri];
    if (!row) continue;
    for (let i = 0; i < row.length; i++) {
      const c = row[i]; if (typeof c !== 'string' || c.length > 80) continue;
      for (const [k, re] of LAB) {
        if (k in out || !re.test(c)) continue; if (k === 'levered_irr' && /unlevered|ungeared/i.test(c)) continue;
        const v = row.slice(i + 1).find(x => typeof x === 'number' || (typeof x === 'string' && /^\s*-?[\d,.]+\s*%?\s*$/.test(x) && x.trim())); if (v == null) continue;
        let n = typeof v === 'number' ? v : parseFloat(v.replace(/[,%\s]/g, '')); if (!Number.isFinite(n)) continue;
        if (/irr|profit_on_cost/.test(k) && Math.abs(n) < 1 && !(typeof v === 'string' && /%/.test(v))) n *= 100;
        out[k] = +n.toFixed(4); found[k] = `${s.name} / ${c.trim()}`; cells[k] = A1(s.name, i + 1 + row.slice(i + 1).indexOf(v), ri); break;
      }
    }
  }
  const sens = []; for (const s of sheets) { let r = parseSens(s.rows, s.name); if (!r.length && /sensitiv/i.test(s.name)) { const T = []; s.rows.forEach((row, i) => (row || []).forEach((c, j) => { (T[j] = T[j] || [])[i] = c; })); r = parseSens(T, s.name); } sens.push(...r); }
  return { out, found, cells, sens, inputs: parseInputs(sheets), opt: detectOpt(sheets, fileName), meta: detectMeta(sheets, fileName), sheets: sheets.map(s => s.name).slice(0, 40) };
}

/* ---- checks (kept identical in the app) ---- */
/*EMCHECKS-START*/
/* Likely mistakes in an EstateMaster export: unit slips, outputs that do not reconcile, sensitivity tables not refreshed,
   implausible inputs, jumps since the previous export with no approved change behind them, a stale export.
   x = {out, inputs, sens, at, file}; prev = the previous export of the same option; opt = {now, hurdle, register, approvedBetween}. */
function emChecks(x, prev, opt) {
  opt = opt || {}; const o = x.out || {}, p = prev && prev.out || {}, res = [], C = x.cells || {}, at = (...ks) => ks.map(k => C[k]).filter(Boolean).join(', '), add = (level, code, text, cell) => res.push({ level, code, text, cell: cell || '' });
  const fin = v => typeof v === 'number' && Number.isFinite(v), M = v => 'SAR ' + (Math.abs(v) / 1e6).toLocaleString('en-GB', { maximumFractionDigits: 1 }) + 'M', P = v => v.toFixed(2) + '%';
  for (const k of ['levered_irr', 'profit_on_cost', 'net_profit', 'total_cost']) if (!fin(o[k])) add('note', 'missing', `${ROWS.find(r => r[0] === k)[1]} is not in the export (no row with that label): include the Summary sheet.`);
  for (const k of ['total_cost', 'gross_revenue', 'net_profit', 'peak_debt']) if (fin(o[k]) && o[k] !== 0 && Math.abs(o[k]) < 5e6) add('warn', 'units', `${ROWS.find(r => r[0] === k)[1]} reads ${o[k].toLocaleString('en-GB')}: that looks like thousands or millions rather than full SAR (unit setting in the export?).`, at(k));
  if (fin(o.net_profit) && fin(o.total_cost) && fin(o.profit_on_cost) && o.total_cost > 0) { const calc = o.net_profit / o.total_cost * 100; if (Math.abs(calc - o.profit_on_cost) > 1.5) add('error', 'reconcile', `Profit on cost ${P(o.profit_on_cost)} does not reconcile with net profit / total cost (${P(calc)}): one of the three rows is wrong or from a different option.`, at('profit_on_cost', 'net_profit', 'total_cost')); }
  if (fin(o.gross_revenue) && fin(o.total_cost) && fin(o.net_profit) && o.gross_revenue > 0 && Math.abs(o.gross_revenue - o.total_cost - o.net_profit) > 0.03 * o.gross_revenue) add('warn', 'reconcile', `Revenue ${M(o.gross_revenue)} − total cost ${M(o.total_cost)} = ${M(o.gross_revenue - o.total_cost)}, but net profit reads ${M(o.net_profit)}: check tax, land or finance lines are counted once.`, at('gross_revenue', 'total_cost', 'net_profit'));
  if (fin(o.peak_debt) && fin(o.total_cost) && o.peak_debt > o.total_cost) add('error', 'debt', `Peak debt ${M(o.peak_debt)} is above total development cost ${M(o.total_cost)}: facility or drawdown inputs look wrong.`, at('peak_debt', 'total_cost'));
  if (fin(o.levered_irr) && fin(o.unlevered_irr) && fin(o.net_profit) && o.net_profit > 0 && (!fin(o.peak_debt) || o.peak_debt > 0) && o.levered_irr < o.unlevered_irr - 0.2) add('warn', 'leverage', `Levered IRR ${P(o.levered_irr)} is below the unlevered IRR ${P(o.unlevered_irr)} on a profitable scheme: the facility costs more than it earns (profit rate, fees or drawdown timing?).`, at('levered_irr', 'unlevered_irr'));
  if (fin(o.levered_irr) && (o.levered_irr > 60 || o.levered_irr < -20)) add('warn', 'range', `Levered IRR ${P(o.levered_irr)} is outside the plausible range: check the timing inputs (dates, spans) and the equity injection.`, at('levered_irr'));
  if (fin(o.profit_on_cost) && o.profit_on_cost > 80) add('warn', 'range', `Profit on cost ${P(o.profit_on_cost)} is implausibly high: a cost section may be missing.`, at('profit_on_cost'));
  if (fin(o.profit_on_cost) && fin(o.net_profit) && (o.profit_on_cost < 0) !== (o.net_profit < 0)) add('error', 'sign', `Profit on cost ${P(o.profit_on_cost)} and net profit ${M(o.net_profit)} have different signs.`, at('profit_on_cost', 'net_profit'));
  if (fin(o.equity_multiple) && (o.equity_multiple < 0.2 || o.equity_multiple > 6)) add('warn', 'range', `Equity multiple ${o.equity_multiple.toFixed(2)}x is outside the plausible range.`, at('equity_multiple'));
  for (const t of x.sens || []) {
    const key = t.mk === 'irr' ? 'levered_irr' : t.mk === 'uirr' ? 'unlevered_irr' : t.mk === 'poc' ? 'profit_on_cost' : null; if (!key || !fin(o[key])) continue;
    const base = t.kind === '1way' ? t.values[t.shifts.indexOf(0)] : (t.grid[t.ys.indexOf(0)] || [])[t.xs.indexOf(0)];
    if (fin(base) && Math.abs(base - o[key]) > 0.3) add('error', 'sens-stale', `Sensitivity table “${t.kind === '1way' ? t.v : t.x + ' × ' + t.y}” has ${t.metric} ${P(base)} at the base, but the Summary says ${P(o[key])}: the table was not refreshed after the last change (Recalc All, then export).`);
    if (t.kind === '1way' && t.values.every(fin)) { const up = /price|revenue|rent|sales|yield on/i.test(t.v), dn = /cost|rate|cap|delay|month|fee|contingen/i.test(t.v); const inc = t.values.every((v, i) => !i || v >= t.values[i - 1]), dec = t.values.every((v, i) => !i || v <= t.values[i - 1]);
      if ((up && !dn && !inc) || (dn && !up && !dec)) add('warn', 'sens-dir', `Sensitivity “${t.v}”: ${t.metric} does not move in the expected direction across the shifts (${t.values.map(P).join(', ')}).`); }
  }
  const nm = i => i.label.toLowerCase(), pct = i => i.value <= 1 && i.value >= -1 && /%|rate|margin|contingen|escalat|commission|vat|tax|ltc|ltv|share/i.test(i.label + ' ' + i.unit) ? i.value * 100 : i.value;
  for (const i of x.inputs || []) {
    if (!fin(i.value)) continue; // text inputs (names, Y/N, dates) have nothing to range-check
    const l = nm(i), v = pct(i);
    if (/contingen|escalat|commission|selling cost|sales cost|interest|profit rate|cap(italisation)? rate|exit yield|land (cost|price|value)|construction cost/.test(l) && i.value === 0) add('warn', 'input-zero', `Input “${i.label}” is 0 on sheet ${i.sheet}: left blank?`, i.cell);
    if (/interest|profit rate|saibor|finance rate|loan rate/.test(l) && !/fee|margin over|spread/.test(l) && v !== 0 && (v < 2 || v > 15)) add('warn', 'input-range', `Input “${i.label}” = ${v}% p.a. is outside 2–15%.`, i.cell);
    if (/cap(italisation)? rate|exit yield|terminal yield/.test(l) && v !== 0 && (v < 4 || v > 12)) add('warn', 'input-range', `Input “${i.label}” = ${v}% is outside 4–12%.`, i.cell);
    if (/contingen/.test(l) && v > 15) add('warn', 'input-range', `Input “${i.label}” = ${v}%: contingency above 15%.`, i.cell);
    if (/\bvat\b|value added tax/.test(l) && v !== 0 && Math.abs(v - 15) > 0.01) add('note', 'input-range', `Input “${i.label}” = ${v}%: Saudi VAT is 15%.`, i.cell);
    if (/%|rate|margin|share/.test(l + ' ' + i.unit) && !/sar|sqm|month|year/i.test(i.unit) && Math.abs(v) > 100 && !/escalat/.test(l)) add('error', 'input-range', `Input “${i.label}” = ${i.value}: a percentage above 100%.`, i.cell);
    if (/delay|duration|span|months/.test(l) && /month/.test(l + ' ' + i.unit) && (i.value < 0 || i.value > 120)) add('warn', 'input-range', `Input “${i.label}” = ${i.value} months is outside 0–120.`, i.cell);
  }
  if (opt.register) for (const i of x.inputs || []) {
    if (!fin(i.value)) continue; const r = opt.register.find(rg => rg.match(i.label)); if (!r || !fin(r.value) || r.value === 0) continue;
    const ratios = [1, 1e3, 1e6, 1e-3, 1e-6, 100, 0.01].map(f => Math.abs(i.value * f / r.value - 1)); const d = Math.min(...ratios);
    if (d > 0.02 && d < 100) add('warn', 'register', `Input “${i.label}” reads ${i.value.toLocaleString('en-GB')} in the export but the approved register has ${r.label} = ${r.text}: an unapproved change or a typing slip.`, i.cell);
  }
  if (prev && p) {
    const hop = (k, lim, u) => { if (!fin(o[k]) || !fin(p[k])) return; const d = u === 'pts' ? o[k] - p[k] : (o[k] - p[k]) / Math.abs(p[k] || 1) * 100; if (Math.abs(d) > lim) add(opt.approvedBetween ? 'note' : 'warn', 'jump', `${ROWS.find(r => r[0] === k)[1]} moved ${d > 0 ? '+' : '−'}${Math.abs(d).toFixed(1)}${u === 'pts' ? ' pts' : '%'} since the previous export${prev.file ? ' (' + prev.file + ')' : ''}${opt.approvedBetween ? ', with approved changes in between' : ' and no approved change in between: a typing slip or an unapproved change?'}`, at(k)); };
    hop('levered_irr', 3, 'pts'); hop('profit_on_cost', 3, 'pts'); hop('total_cost', 10, '%'); hop('gross_revenue', 10, '%'); hop('peak_debt', 25, '%');
  }
  if (x.at && opt.now) { const days = (new Date(opt.now) - new Date(x.at)) / 864e5; if (days > 7) add('note', 'stale', `The latest export is ${Math.floor(days)} days old.`); }
  if (opt.hurdle && fin(o.levered_irr) && o.levered_irr < opt.hurdle) add('note', 'hurdle', `Levered IRR ${P(o.levered_irr)} is below the ${opt.hurdle}% hurdle.`);
  const order = { error: 0, warn: 1, note: 2 }; return res.sort((a, b) => order[a.level] - order[b.level]);
}
/* What the export is: title, asset type, currency, site area and GFA (from the Intro / Summary cells). */
function detectMeta(sheets, fileName) {
  const meta = { title: '', type: '', currency: '', site: null, gfa: null }, cur = {};
  const after = (row, i) => row.slice(i + 1).find(x => (typeof x === 'string' && x.trim()) || typeof x === 'number');
  for (const s of sheets.slice(0, 5)) for (const row of s.rows.slice(0, 160)) {
    if (!row) continue;
    for (let i = 0; i < row.length; i++) {
      const c = row[i]; if (typeof c !== 'string') continue; const t = c.trim();
      for (const m of t.matchAll(/\b(SAR|AUD|USD|AED|EUR|GBP|NZD|QAR|KWD)\b/g)) { const c = m[1] === 'AUD' ? 'USD' : m[1]; cur[c] = (cur[c] || 0) + 1; }
      if (!meta.title && /^(cash flow title|project name|project title|title)\s*:?$/i.test(t)) { const v = after(row, i); if (typeof v === 'string') meta.title = v.trim().slice(0, 80); }
      if (!meta.type && /^(type|property type|asset type|land use)\s*:?$/i.test(t)) { const v = after(row, i); if (typeof v === 'string') meta.type = v.trim(); }
      if (!meta.type) { const m = t.match(/^type\s*:\s*(.+)$/i); if (m) meta.type = m[1].trim(); }
      if (meta.site == null && /^site area\s*:?$/i.test(t)) { const v = row.slice(i + 1).map(numOf).find(x => x != null && x > 0); if (v) meta.site = v; }
      if (meta.gfa == null && /^(project size \(b\)|gross floor area|gfa)\s*:?$/i.test(t)) { const v = row.slice(i + 1).map(numOf).find(x => x != null && x > 1); if (v) meta.gfa = v; }
    }
  }
  if (!meta.type) { const all = sheets.slice(0, 3).flatMap(s => s.rows.slice(0, 80).flat()).filter(c => typeof c === 'string').join(' '); const m = all.match(/\b(industrial|logistics|warehouse|residential|retail|office|hotel|hospitality|mixed[- ]use|build to rent)\b/i); if (m) meta.type = m[1]; }
  meta.currency = Object.entries(cur).sort((a, b) => b[1] - a[1]).map(e => e[0])[0] || 'SAR';
  if (!meta.title) { const first = (sheets[0] && sheets[0].rows.flat().find(c => typeof c === 'string' && c.trim().length > 4 && !/argus|estatemaster|summary|licensed/i.test(c))) || ''; meta.title = String(first).trim().slice(0, 80) || String(fileName || '').replace(/\.[^.]+$/, ''); }
  return meta;
}
/* Market benchmarks by asset type (SAR, Riyadh; demo data: in production the transactions, rentals and cost feeds). [low, median, high] */
const BENCH = {
  industrial: { name: 'Industrial / logistics, Riyadh', rent: [150, 230, 320], cap: [7, 7.75, 8.5], build: [1800, 2300, 2800], land: [600, 950, 1500] },
  residential: { name: 'Residential for sale, Riyadh', sale: [9000, 12500, 16000], rent: [700, 950, 1300], build: [3500, 4400, 5500], land: [2500, 4000, 6000] },
  retail: { name: 'Retail, Riyadh', rent: [1800, 2400, 3200], cap: [7.25, 8, 8.75], build: [4500, 5500, 6500], land: [3000, 4500, 7000] },
  office: { name: 'Office, Riyadh', rent: [1200, 1650, 2200], cap: [7, 7.75, 8.5], build: [5000, 6200, 7500], land: [3000, 5000, 8000] },
  hotel: { name: 'Hotel, Riyadh', cap: [7.5, 8.5, 9.5], build: [8000, 10000, 12000], land: [3000, 5000, 8000] },
  mixed: { name: 'Mixed-use, Riyadh', sale: [9000, 12500, 16000], rent: [1800, 2400, 3200], cap: [7.25, 8, 8.75], build: [4000, 5000, 6200], land: [3000, 4500, 7000] },
  common: { contingency: [5, 7.5, 10], interest: [6.5, 7.5, 8.5], commission: [1.5, 2.5, 3.5], devfee: [2, 3, 4] },
};
const FX = { SAR: 1, AUD: 2.45, USD: 3.75, AED: 1.02, EUR: 4.05, GBP: 4.75, NZD: 2.25, QAR: 1.03, KWD: 12.2 };
const benchType = t => { t = String(t || '').toLowerCase(); return /industr|logist|warehouse/.test(t) ? 'industrial' : /resid|apartment|villa|build to rent/.test(t) ? 'residential' : /retail|mall|shop/.test(t) ? 'retail' : /office/.test(t) ? 'office' : /hotel|hospitality/.test(t) ? 'hotel' : /mixed/.test(t) ? 'mixed' : ''; };
/* The export's assumptions against the market: each input the benchmarks cover, with its position and whether it looks aggressive. */
function marketVsInputs(inputs, meta) {
  meta = meta || {}; const ty = benchType(meta.type) || 'mixed', B = { ...BENCH.common, ...BENCH[ty] }, ccy = FX[meta.currency] ? meta.currency : 'SAR', fx = FX[ccy];
  const items = [
    { k: 'rent', name: 'Rent', re: /\brent(al)?\b/i, not: /free|review|escalat|vacan|period|incentive|turnover cost|letting|ground rent|% of/i, unit: '/sqm/yr', perArea: true, revenue: true, lo: 15, hi: 20000 },
    { k: 'sale', name: 'Sale price', re: /(sale|selling) price|price per|sales rate|\basp\b|sale value/i, not: /land|purchase|%|commission/i, unit: '/sqm', perArea: true, revenue: true, lo: 300, hi: 200000 },
    { k: 'cap', name: 'Exit cap rate / yield', re: /cap(itali[sz]ation)?\s*rate|exit yield|terminal yield|\byield\b/i, not: /on cost|return/i, pct: true, aggressiveBelow: true, lo: 2, hi: 20 },
    { k: 'build', name: 'Construction cost', re: /construction cost|build(ing)? cost|hard cost|construction rate/i, not: /contingen|escalat|%/i, unit: '/sqm GFA', perArea: true, cost: true, lo: 200, hi: 60000, total: 'gfa' },
    { k: 'land', name: 'Land price', re: /land (purchase )?(price|cost|value)/i, not: /%|tax|duty|deposit|payment/i, unit: '/sqm site', perArea: true, cost: true, lo: 50, hi: 100000, total: 'site' },
    { k: 'contingency', name: 'Contingency', re: /contingen/i, not: /amount/i, pct: true, aggressiveBelow: true, lo: 0.01, hi: 40 },
    { k: 'interest', name: 'Finance rate', re: /interest rate|profit rate|finance rate|loan rate|\binterest\b/i, not: /fee|received|margin over|spread|deposit/i, pct: true, aggressiveBelow: true, lo: 0.5, hi: 25 },
    { k: 'commission', name: 'Sales commission', re: /commission/i, not: /pre-?sale/i, pct: true, aggressiveBelow: true, lo: 0.1, hi: 10 },
  ];
  const rows = [];
  for (const it of items) {
    const b = B[it.k]; if (!b) continue;
    const cand = (inputs || []).filter(i => it.re.test(i.label) && !(it.not && it.not.test(i.label)));
    let pick = null, val = null, how = '';
    for (const i of cand) {
      for (const v0 of (i.vals && i.vals.length ? i.vals : [i.value])) {
        let v = v0; if (it.pct) { if (Math.abs(v) <= 1 && !i.pct) v *= 100; if (v >= it.lo && v <= it.hi) { pick = i; val = v; break; } continue; }
        if (v >= it.lo && v <= it.hi) { pick = i; val = v; how = ''; break; }
        if (it.total && meta[it.total] && v > it.hi) { const per = v / meta[it.total]; if (per >= it.lo && per <= it.hi) { pick = i; val = per; how = ` (total ${v.toLocaleString('en-GB')} ÷ ${meta[it.total].toLocaleString('en-GB')} sqm ${it.total === 'gfa' ? 'GFA' : 'site'})`; break; } }
      }
      if (pick) break;
    }
    if (!pick) continue;
    const sar = it.pct ? val : val * fx, [lo, med, hi] = b, st = sar < lo ? 'below' : sar > hi ? 'above' : 'within';
    const aggressive = !!(st !== 'within' && ((it.revenue && st === 'above') || (it.cost && st === 'below') || (it.aggressiveBelow && st === 'below')));
    const f = v => it.pct ? v.toFixed(2).replace(/\.?0+$/, '') + '%' : Math.round(v).toLocaleString('en-GB');
    rows.push({ k: it.k, item: it.name, input: pick.label, sheet: pick.sheet, model: it.pct ? f(val) : `${ccy} ${f(val)}${it.unit}${ccy !== 'SAR' ? ` (SAR ${f(sar)})` : ''}${how}`, market: it.pct ? `${f(lo)}–${f(hi)} (median ${f(med)})` : `SAR ${f(lo)}–${f(hi)}${it.unit} (median ${f(med)})`, status: st, aggressive,
      text: `${it.name}: ${it.pct ? f(val) : `${ccy} ${f(val)}${it.unit}${ccy !== 'SAR' ? ` = SAR ${f(sar)}` : ''}`} vs market ${it.pct ? '' : 'SAR '}${f(lo)}–${f(hi)} (median ${f(med)}): ${st === 'within' ? 'within the range' : st + ' the range' + (aggressive ? ', aggressive' : ', conservative')}.` });
  }
  return { type: ty, bench: BENCH[ty].name, currency: ccy, fx: ccy !== 'SAR' ? `${ccy} converted at ${fx} SAR (fixed demo rate)` : '', rows };
}
/*EMCHECKS-END*/
module.exports = { parseWorkbook, parseSens, parseInputs, detectOpt, detectMeta, emChecks, marketVsInputs, BENCH, FX, LAB, ROWS };
