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
    const fr = (s.frows && s.frows[ri]) || [];
    let i = row.findIndex(c => emIsLabel(c) && c.length <= 70);
    while (i >= 0 && i < row.length) {
      let end = emNextLabel(row, i); const lab = String(row[i]).trim(), key = s.name + '|' + lab;
      const next = () => { const k = row.slice(end).findIndex(c => emIsLabel(c) && c.length <= 70); i = k < 0 ? -1 : end + k; };
      if (lab.length > 70 || LAB.some(([, re]) => re.test(lab))) { next(); continue; }
      const cells = []; for (let j = i + 1; j < Math.min(end, i + 9); j++) { const n = numOf(row[j]); if (n == null || !Number.isFinite(n)) continue; const t = String(fr[j] == null ? '' : fr[j]); if (/^[a-z]{3}[- ]\d{2,4}$|\d+\/\d+\/\d+/i.test(t.trim())) continue; const pc = /%\s*$/.test(t.trim()) || (typeof row[j] === 'string' && /%\s*$/.test(row[j])); cells.push({ v: pc && typeof row[j] === 'number' ? n * 100 : n, t, pct: pc, j }); }
      if (!cells.length) {
        // a text, date or yes/no input on an input sheet ("Date of First Period: Oct-26", "Add GST on Land Price? Y", "Cash Flow Title: Build to Hold")
        if (/input|assumption/i.test(s.name) && !seen.has(key)) {
          let tj = -1; for (let j = i + 1; j < Math.min(end, i + 6); j++) { const t = String(fr[j] == null ? (row[j] == null ? '' : row[j]) : fr[j]).trim(); if (t && t.length <= 40 && t !== '-') { tj = j; break; } }
          // a long text value (a title) reads as a label: taken as the value when nothing else sits between the two
          if (tj < 0 && end < row.length && end <= i + 3 && String(row[end]).length <= 60 && emNextLabel(row, end) === row.length && !row.slice(end + 1).some(c => numOf(c) != null)) { tj = end; end = row.length; }
          if (tj >= 0) { seen.add(key); out.push({ label: lab, value: null, text: String(fr[tj] == null ? row[tj] : fr[tj]).trim(), pct: false, vals: [], sheet: s.name, section, unit: '', cell: A1(s.name, tj, ri) }); }
        }
        next(); continue;
      }
      const unitCell = row.slice(i + 1, end).find(c => typeof c === 'string' && EM_UNIT_RX.test(c) && c.trim().length < 30 && !/^\s*[a-z]{1,2}\s*$/i.test(c));
      if (!seen.has(key)) { seen.add(key); out.push({ label: lab, value: +cells[0].v.toFixed(6), text: cells[0].t || String(cells[0].v), pct: cells[0].pct, vals: cells.map(c => c.v).slice(0, 6), sheet: s.name, section, unit: cells[0].pct ? '%' : (unitCell ? unitCell.trim().replace(/\bAUD\b/g, 'USD') : ''), cell: A1(s.name, cells[0].j, ri) }); }   // the demo shows AUD as USD, units included
      next();
    }
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
const EX_SKIP=(k,c)=>/irr|profit_on_cost|equity_multiple/.test(k)?/target|hurdle|required|minimum|\bmin\b|benchmark|threshold|cost of (equity|capital)|discount rate/i.test(c):/net_profit|total_cost|gross_revenue|peak_debt/.test(k)?/\bper\b|\/\s*(sqm|m2|m²|sq\s?m|sq\s?ft|unit|bed|key)|\bpsm\b|\bpsf\b|\barea\b|\bunits?\b|%|ratio|\brate\b|yield|margin|count|number of|\b(nla|gfa|gla|nsa|bua)\b|\bsqm\b|\bm2\b/i.test(c):false;
function parseWorkbook(wb, XLSX, fileName) {
  const sheets = (wb.SheetNames || []).map(name => ({ name, rows: emRows(XLSX, wb.Sheets[name], true), frows: emRows(XLSX, wb.Sheets[name], false) }));
  const out = {}, found = {}, cells = {};
  for (const s of sheets) for (let ri = 0; ri < s.rows.length; ri++) { const row = s.rows[ri];
    if (!row) continue;
    for (let i = 0; i < row.length; i++) {
      const c = row[i]; if (typeof c !== 'string' || c.length > 80) continue;
      for (const [k, re] of LAB) {
        if (k in out || !re.test(c)) continue; if (k === 'levered_irr' && /unlevered|ungeared/i.test(c)) continue; if (EX_SKIP(k, c)) continue;
        const seg = row.slice(i + 1, emNextLabel(row, i)), v = seg.find(x => typeof x === 'number' || (typeof x === 'string' && /^\s*-?[\d,.]+\s*%?\s*$/.test(x) && x.trim())); if (v == null) continue;
        let n = typeof v === 'number' ? v : parseFloat(v.replace(/[,%\s]/g, '')); if (!Number.isFinite(n)) continue;
        if (/irr|profit_on_cost/.test(k) && Math.abs(n) < 1 && !(typeof v === 'string' && /%/.test(v))) n *= 100;
        out[k] = +n.toFixed(4); found[k] = `${s.name} / ${c.trim()}`; cells[k] = A1(s.name, i + 1 + seg.indexOf(v), ri); break;
      }
    }
  }
  const sens = []; for (const s of sheets) { let r = parseSens(s.rows, s.name); if (!r.length && /sensitiv/i.test(s.name)) { const T = []; s.rows.forEach((row, i) => (row || []).forEach((c, j) => { (T[j] = T[j] || [])[i] = c; })); r = parseSens(T, s.name); } sens.push(...r); }
  return { out, found, cells, sens, inputs: parseInputs(sheets), opt: detectOpt(sheets, fileName), meta: detectMeta(sheets, fileName), sheets: sheets.map(s => s.name).slice(0, 40), cf: parseCashFlow(sheets) };
}

/* ---- checks (kept identical in the app) ---- */
/*EMCHECKS-START*/
/* Reading a sheet: always from A1 (sheet_to_json starts at the first used cell, which shifted every "original cell" address), blank rows kept.
   EstateMaster lays inputs out in side-by-side blocks (label · value · unit · label · value · unit on one row): a label only takes the numbers
   and the unit between it and the next label on the row, never a figure from the neighbouring block. */
function emRows(XLSX, ws, raw) { if (!ws || !ws['!ref']) return []; const r = XLSX.utils.decode_range(ws['!ref']); r.s.r = 0; r.s.c = 0; return XLSX.utils.sheet_to_json(ws, { header: 1, raw: raw !== false, range: r, blankrows: true }); }
const EM_UNIT_RX = /^\s*(%\s*[a-z.\s\/]{0,12}|sar|aud|usd|aed|eur|gbp|nzd|qar|kwd|\$|sqm|sq\.?\s?m|sq\.?\s?ft|m2|m²|gfa|nla|gla|nsa|bua|months?|years?|yrs?|days?|weeks?|quarters?|p\.?\s?a\.?|pa|per\b.{0,24}|units?\b.{0,16}|(sar|aud|usd|aed|eur|gbp)\s*\/.{0,24}|[a-z]{2,4}\s*\/\s*[a-z²]{1,8}.{0,16}|[a-z]{1,2})\s*$/i;
const emIsLabel = c => typeof c === 'string' && c.trim().length > 2 && /[a-z]/i.test(c) && !EM_UNIT_RX.test(c) && !/^\s*-?[\d,.]+\s*%?\s*$/.test(c) && !/^\s*(true|false|yes|no|y|n|n\/a|-)\s*$/i.test(c) && !/^\s*([a-z]{3}[- ]\d{2,4}|\d{1,2}[- ][a-z]{3}[- ]\d{2,4}|\d+\/\d+\/\d+)\s*$/i.test(c);   // a date typed as text is a value
function emNextLabel(row, i) { for (let j = i + 1; j < row.length; j++) if (emIsLabel(row[j])) return j; return row.length; }
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
      if (!meta.title && /^(cash flow title|project name|project title|project|scheme name|development name|title)\s*:?$/i.test(t)) { const v = after(row, i); if (typeof v === 'string' && v.trim().length > 2) { meta.title = v.trim().slice(0, 80); meta.titleFrom = 'cell'; } }
      if (!meta.type && /^(type|property type|asset type|land use)\s*:?$/i.test(t)) { const v = after(row, i); if (typeof v === 'string') meta.type = v.trim(); }
      if (!meta.type) { const m = t.match(/^type\s*:\s*(.+)$/i); if (m) meta.type = m[1].trim(); }
      if (meta.site == null && /^site area\s*:?$/i.test(t)) { const v = row.slice(i + 1).map(numOf).find(x => x != null && x > 0); if (v) meta.site = v; }
      if (meta.gfa == null && /^(project size \(b\)|gross floor area|gfa)\s*:?$/i.test(t)) { const v = row.slice(i + 1).map(numOf).find(x => x != null && x > 1); if (v) meta.gfa = v; }
    }
  }
  if (!meta.type) { const all = sheets.slice(0, 3).flatMap(s => s.rows.slice(0, 80).flat()).filter(c => typeof c === 'string').join(' '); const m = all.match(/\b(industrial|logistics|warehouse|residential|retail|office|hotel|hospitality|mixed[- ]use|build to rent)\b/i); if (m) meta.type = m[1]; }
  meta.currency = Object.entries(cur).sort((a, b) => b[1] - a[1]).map(e => e[0])[0] || 'SAR';
  if (!meta.title) { const first = (sheets[0] && sheets[0].rows.flat().find(c => typeof c === 'string' && c.trim().length > 4 && !/argus|estatemaster|summary|licensed/i.test(c) && !/^\s*(project|title|scheme|development|option|stage|date|type|site|location|inputs?|assumptions?|model|cash ?flow)\s*:?\s*$/i.test(c))) || ''; meta.title = String(first).trim().slice(0, 80) || String(fileName || '').replace(/\.[^.]+$/, ''); }
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
/* ===== EstateMaster's own cash flow: the IRR engine =====
   1. read the cash-flow sheet (period columns, every line); 2. prove the base: the IRRs recomputed from its flows must match EstateMaster's
   own reported IRRs; 3. a change is applied to the lines on their real timeline (revenue and what moves with it, construction and what moves
   with it, land, a delay shifts revenue) and the funding is re-run period by period with the structure that reproduces EstateMaster's equity
   flows. Nothing is assumed: what cannot be proved from the export is reported as missing, never filled in. */
function cfIsDateSerial(v) { return typeof v === 'number' && v > 20000 && v < 80000; }
const CF_MON = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
function cfTextDate(v) { if (typeof v !== 'string') return null; const t = v.trim(); let m = t.match(/^([A-Za-z]{3})[a-z]*[-\s']+(\d{2}|\d{4})$/); if (m && m[1].toLowerCase() in CF_MON) { const y = +m[2] < 100 ? 2000 + +m[2] : +m[2]; return y * 12 + CF_MON[m[1].toLowerCase()]; } m = t.match(/^Q([1-4])[-\s']*(\d{2}|\d{4})$/i); if (m) { const y = +m[2] < 100 ? 2000 + +m[2] : +m[2]; return y * 12 + (+m[1] - 1) * 3; } return null; }
function parseCashFlow(sheets) {
  const order = sheets.slice().sort((a, b) => (/cash ?flow|\bcf\b|monthly|quarterly/i.test(b.name) ? 1 : 0) - (/cash ?flow|\bcf\b|monthly|quarterly/i.test(a.name) ? 1 : 0));
  for (const s of order) {
    const rows = s.rows || []; let best = null;
    for (let ri = 0; ri < Math.min(rows.length, 40); ri++) { const row = rows[ri] || []; const cols = []; const keys = [];
      for (let c = 0; c < row.length; c++) { const v = row[c]; let k = null; if (cfIsDateSerial(v)) { const d = new Date(Math.round((v - 25569) * 864e5)); k = d.getUTCFullYear() * 12 + d.getUTCMonth(); } else k = cfTextDate(v); if (k != null) { cols.push(c); keys.push(k); } }
      if (cols.length < 6) continue; const steps = keys.slice(1).map((k, i) => k - keys[i]); const st = steps.sort((a, b) => a - b)[Math.floor(steps.length / 2)];
      const okSteps = keys.slice(1).every((k, i) => k - keys[i] === st) && [1, 3, 6, 12].includes(st); if (!okSteps) continue;
      if (!best || cols.length > best.cols.length) best = { ri, cols, keys, freq: 12 / st };
    }
    if (!best) continue;
    const lines = []; const c0 = best.cols[0];
    for (let ri = best.ri + 1; ri < rows.length && lines.length < 400; ri++) { const row = rows[ri] || []; const lab = row.slice(0, c0).filter(v => typeof v === 'string' && v.trim()).map(v => v.trim()).join(' · '); if (!lab) continue;
      const v = best.cols.map(c => { const x = row[c]; return typeof x === 'number' && Number.isFinite(x) ? Math.round(x * 100) / 100 : (typeof x === 'string' && /^\s*-?[\d,.]+\s*$/.test(x) ? +x.replace(/,/g, '') : 0); });
      if (v.some(x => x !== 0)) lines.push({ label: lab, v, row: ri }); }
    if (lines.length >= 3) return { sheet: s.name, freq: best.freq, start: best.keys[0], n: best.cols.length, lines };
  }
  return null;
}
function cfIRR(fl, ppy) { const f = r => { let s = 0; for (let t = 0; t < fl.length; t++) s += fl[t] / Math.pow(1 + r, t); return s; }; if (!fl.some(v => v < 0) || !fl.some(v => v > 0)) return { comp: NaN, nom: NaN };
  let lo = -0.99, hi = 1, flo = f(lo), fhi = f(hi); if (flo * fhi > 0) { hi = 5; fhi = f(hi); if (flo * fhi > 0) return { comp: NaN, nom: NaN }; }
  for (let i = 0; i < 300; i++) { const m = (lo + hi) / 2, fm = f(m); if (flo * fm <= 0) hi = m; else { lo = m; flo = fm; } } const r = (lo + hi) / 2; return { comp: (Math.pow(1 + r, ppy) - 1) * 100, nom: r * ppy * 100 }; }
const CFRX = { netU: /net (project )?cash ?flow (before|excl\.?|excluding|pre)[- ]?(funding|finance|financing|interest)|^project (net )?cash ?flow|ungeared cash|unlevered cash|net development cash|^net cash ?flow$/i,
  netE: /cash ?flow (to|after) (equity|funding|finance)|equity (net )?cash ?flow|geared cash|levered cash|net cash ?flow to (equity|investor|developer)/i,
  eqIn: /equity (contribution|injection|drawdown|funding|in)\b|^equity$/i, draw: /(loan|debt|facility|senior).*(drawdown|draw)|drawdown/i, rep: /(loan|debt|facility|senior).*(repay)|repayment/i, int: /interest/i,
  total: /^(total|sub-?total|cumulative|net)\b|cumulative|balance/i, rev: /revenue|sales|settlement|deposit|\brent|income|proceeds|gdv|disposal|sale of|exit (value|sale|proceeds)|\(exit\)|capital value|en bloc/i, notRev: /cost|commission|agent|marketing|\btax|fee|interest|vat/i,
  land: /\bland\b|acquisition|stamp duty|transfer (duty|tax)|purchase price/i, cons: /construction|build(ing)? cost|hard cost|infrastructure|civil|\bmep\b|fit[- ]?out|substructure|superstructure|externals?|preliminar/i };
function cfAdd(a, b, k = 1) { const n = Math.max(a.length, b.length), o = Array(n).fill(0); for (let t = 0; t < n; t++) o[t] = (a[t] || 0) + k * (b[t] || 0); return o; }
function cfSum(a) { return a.reduce((s, v) => s + v, 0); }
function cfFund(u, p) { // equity first (up to E0) then debt with capitalised interest at r per period, repaid from positive flows; or pro-rata at share `ltc`
  let used = 0, bal = 0, peak = 0, int = 0; const eq = [];
  for (let t = 0; t < u.length; t++) { const i = bal * p.r; bal += i; int += i; const cf = u[t];
    if (cf < 0) { let need = -cf, e; if (p.mode === 'prorata') e = need * (1 - p.ltc); else e = Math.min(need, Math.max(0, p.E0 - used)); used += e; need -= e; bal += need; eq.push(-e); }
    else { const r = Math.min(bal, cf); bal -= r; eq.push(cf - r); }
    if (bal > peak) peak = bal; }
  if (bal > 1) eq[eq.length - 1] -= bal; return { eq, peak, int };
}
function cfModel(x) {
  const cf = x && x.cf, o = (x && x.out) || {}, R = { ok: false, need: [], notes: [] }; if (!cf) { R.need.push('cashflow'); return R; }
  const ppy = cf.freq, L = cf.lines, find = rx => L.filter(l => rx.test(l.label) && !/cumulative/i.test(l.label));
  const conv = (fl) => { const r = cfIRR(fl, ppy); return r; };
  // unlevered base: the net-before-funding line, or rebuilt from the component lines
  const isFund = l => CFRX.eqIn.test(l.label) || CFRX.draw.test(l.label) || CFRX.rep.test(l.label) || CFRX.int.test(l.label) || CFRX.netE.test(l.label);
  const comps = L.filter(l => !CFRX.total.test(l.label) && !isFund(l));
  const sgn = l => { const tot = cfSum(l.v); const rev = CFRX.rev.test(l.label) && !CFRX.notRev.test(l.label); return rev ? (tot >= 0 ? 1 : -1) : (tot >= 0 ? -1 : 1); }; // revenue in, costs out, whatever the sheet's sign convention
  let u = null, uSrc = '';
  const netU = find(CFRX.netU).find(l => !CFRX.netE.test(l.label));
  const rebuilt = comps.reduce((a, l) => cfAdd(a, l.v, sgn(l)), Array(cf.n).fill(0));
  if (netU) { u = netU.v.slice(); uSrc = netU.label; const err = Math.max(...u.map((v, t) => Math.abs(v - rebuilt[t]))) / Math.max(1, ...u.map(Math.abs)); R.rebuildErr = err; }
  else if (comps.length >= 2) { u = rebuilt; uSrc = 'rebuilt from ' + comps.length + ' lines'; }
  if (!u) { R.need.push('net cash flow before funding'); return R; }
  // which IRR convention EstateMaster uses (compound or nominal), proved on the unlevered or levered base
  const ui = conv(u); R.base = { uirr: ui }; let convK = null;
  if (Number.isFinite(o.unlevered_irr)) { const dc = Math.abs(ui.comp - o.unlevered_irr), dn = Math.abs(ui.nom - o.unlevered_irr); if (Math.min(dc, dn) <= 0.05) convK = dc <= dn ? 'comp' : 'nom'; R.uCheck = { em: o.unlevered_irr, calc: convK ? ui[convK] : ui.comp, ok: !!convK }; }
  // levered: the equity line, and the funding structure that reproduces it
  const netE = find(CFRX.netE)[0]; const eqIn = find(CFRX.eqIn)[0];
  let E = netE ? netE.v.slice() : null;
  const ei = E ? conv(E) : null; if (E && Number.isFinite(o.levered_irr)) { const dc = Math.abs(ei.comp - o.levered_irr), dn = Math.abs(ei.nom - o.levered_irr); const k = Math.min(dc, dn) <= 0.05 ? (dc <= dn ? 'comp' : 'nom') : null; if (!convK) convK = k; R.lCheck = { em: o.levered_irr, calc: k ? ei[k] : ei.comp, ok: !!k }; }
  if (!convK) { R.need.push(Number.isFinite(o.unlevered_irr) || Number.isFinite(o.levered_irr) ? 'cash flow that reproduces EstateMaster’s IRR' : 'EstateMaster’s reported IRR'); R.notes.push(`IRR recomputed from the cash flow: unlevered ${ui.comp.toFixed(2)}%${ei ? ', levered ' + ei.comp.toFixed(2) + '%' : ''}; EstateMaster reports ${Number.isFinite(o.unlevered_irr) ? 'unlevered ' + o.unlevered_irr + '%' : ''}${Number.isFinite(o.levered_irr) ? ' levered ' + o.levered_irr + '%' : ''}`); return R; }
  R.conv = convK; R.ppy = ppy;
  // the funding structure: equity first or pro-rata, the period rate; fitted so the simulated equity flows match EstateMaster's
  let fund = null;
  if (E) { const tgt = E, scale = Math.max(1, ...tgt.map(Math.abs)); const negE = -cfSum(tgt.filter(v => v < 0)); const E0s = [eqIn ? Math.abs(cfSum(eqIn.v)) : null, negE].filter(v => v > 0);
    const intL = find(CFRX.int)[0]; const err = p => { const s = cfFund(u, p).eq; return Math.max(...tgt.map((v, t) => Math.abs(v - (s[t] || 0)))) / scale; };
    const fitR = base => { let lo = 0, hi = 0.05; for (let i = 0; i < 80; i++) { const a = lo + (hi - lo) / 3, b = hi - (hi - lo) / 3; if (err({ ...base, r: a }) < err({ ...base, r: b })) hi = b; else lo = a; } return (lo + hi) / 2; };
    const cands = []; for (const E0 of E0s) { const p = { mode: 'equity', E0 }; p.r = fitR(p); cands.push({ ...p, e: err(p) }); }
    const drawT = cfSum((find(CFRX.draw)[0] || { v: [] }).v), costT = -cfSum(u.filter(v => v < 0)); if (drawT > 0 && costT > 0) { const p = { mode: 'prorata', ltc: Math.min(0.95, drawT / costT) }; p.r = fitR(p); cands.push({ ...p, e: err(p) }); }
    cands.sort((a, b) => a.e - b.e); const best = cands[0];
    if (best) { const s = cfFund(u, best), si = conv(s.eq)[convK]; R.fundFit = { ...best, irr: si, err: best.e }; if (best.e <= 0.002 && Math.abs(si - o.levered_irr) <= 0.05) fund = best; }
    if (!fund) R.need.push('funding structure that reproduces EstateMaster’s equity cash flow');
  } else if (Number.isFinite(o.levered_irr)) R.need.push('the equity cash flow line (net cash flow to equity)');
  // what moves with what: revenue-linked lines (selling costs) and construction-linked lines (fees, contingency), proved by a constant ratio period by period
  const revL = comps.filter(l => CFRX.rev.test(l.label) && !CFRX.notRev.test(l.label)), consL = comps.filter(l => CFRX.cons.test(l.label) && !CFRX.rev.test(l.label)), landL = comps.filter(l => CFRX.land.test(l.label) && !CFRX.cons.test(l.label) && !CFRX.rev.test(l.label));
  const flow = ls => ls.reduce((a, l) => cfAdd(a, l.v, sgn(l)), Array(cf.n).fill(0));
  const linked = (base, l) => { const idx = base.map((v, t) => Math.abs(v) > 1 ? t : -1).filter(t => t >= 0); if (idx.length < 2) return false; const rs = idx.map(t => l.v[t] / base[t]); const m = rs.reduce((a, b) => a + b, 0) / rs.length; if (!Number.isFinite(m) || Math.abs(m) < 1e-6) return false; const cv = Math.sqrt(rs.reduce((a, r) => a + (r - m) * (r - m), 0) / rs.length) / Math.abs(m); const out = l.v.every((v, t) => Math.abs(base[t]) > 1 || Math.abs(v) < 1); return cv < 0.005 && out; };
  const revBase = flow(revL).map(Math.abs), consBase = flow(consL).map(Math.abs);
  const others = comps.filter(l => !revL.includes(l) && !consL.includes(l) && !landL.includes(l));
  const revLinked = others.filter(l => linked(revBase, l)), consLinked = others.filter(l => !revLinked.includes(l) && linked(consBase, l));
  R.lines = { revenue: revL.map(l => l.label), construction: consL.map(l => l.label), land: landL.map(l => l.label), withRevenue: revLinked.map(l => l.label), withConstruction: consLinked.map(l => l.label), other: others.filter(l => !revLinked.includes(l) && !consLinked.includes(l)).map(l => l.label) };
  const rentL = revL.filter(l => /\brent|lease|leasing|tenan|income/i.test(l.label));
  R.flows = { rev: flow(revL.concat(revLinked)), cons: flow(consL.concat(consLinked)), land: flow(landL), rent: flow(rentL) };
  const exitRx = /exit|terminal|capital value|investment sale|disposal|en bloc|sale of (the )?investment/i, exitL = revL.filter(l => exitRx.test(l.label));
  R.exitLine = exitL.length > 0; R.flows.exit = flow(exitL);
  // rent: the rent lines (never the exit) and what moves with rent (operating costs as a share of it); an exit value is capitalised rent, so a rent change moves it too
  const rentOnly = rentL.filter(l => !exitRx.test(l.label)), rentBase = flow(rentOnly).map(Math.abs), rentLinked = others.filter(l => linked(rentBase, l));
  R.flows.rent = flow(rentOnly.concat(rentLinked)); R.lines.withRent = rentLinked.map(l => l.label); R.lines.exit = exitL.map(l => l.label);
  R.u = u; R.uSrc = uSrc; R.fund = fund; R.E = E; R.cf = cf; R.ok = true; R.levOk = !!fund;
  return R;
}
function cfRun(M, d) { // d: {price, cost, land, delay (months), rate (pts)} → exact recomputation on the cash flow
  if (!M || !M.ok) return null; const conv = M.conv; let u = M.u.slice(); const k = (d.price || 0) / 100;
  // shocks on the same lines compound (a rent cut and a softer cap rate both move the exit: × (1 + rent) × cap ÷ (cap + Δ))
  const revF = 1 + k, rentF = 1 + (d.rent || 0) / 100, capF = d.cap && d.capBase > 0 ? d.capBase / (d.capBase + d.cap) : 1;
  if (d.price) u = cfAdd(u, M.flows.rev, k); if (d.cost) u = cfAdd(u, M.flows.cons, (d.cost || 0) / 100); if (d.land) u = cfAdd(u, M.flows.land, (d.land || 0) / 100); if (d.rent && M.flows.rent) u = cfAdd(u, M.flows.rent, revF * (rentF - 1));
  if ((d.rent || capF !== 1) && M.flows.exit) u = cfAdd(u, M.flows.exit, revF * (rentF * capF - 1));   // exit value = rent ÷ cap rate
  if (d.delay) { const sh = Math.round(d.delay * M.ppy / 12); if (sh > 0) { const rv = cfAdd(M.flows.rev, M.flows.rev, k); u = cfAdd(u, rv, -1); const moved = Array(sh).fill(0).concat(rv); u = cfAdd(u, moved, 1); } }
  const out = { uirr: cfIRR(u, M.ppy)[conv], profitU: cfSum(u) };
  if (M.fund) { const p = { ...M.fund, r: M.fund.r + (d.rate || 0) / 100 / M.ppy }; const f = cfFund(u, p), f0 = cfFund(M.u, M.fund); out.lirr = cfIRR(f.eq, M.ppy)[conv]; out.peak = f.peak; out.int = f.int; out.dInt = f.int - f0.int; const pos = f.eq.filter(v => v > 0).reduce((a, v) => a + v, 0), neg = -f.eq.filter(v => v < 0).reduce((a, v) => a + v, 0); out.em = neg > 0 ? pos / neg : NaN; }
  return out;
}
/*EMCHECKS-END*/
module.exports = { parseCashFlow, cfModel, cfRun, cfIRR, cfFund, parseWorkbook, parseSens, parseInputs, detectOpt, detectMeta, emChecks, marketVsInputs, BENCH, FX, LAB, ROWS };
