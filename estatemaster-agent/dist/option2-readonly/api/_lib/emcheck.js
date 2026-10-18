// Reads an EstateMaster Office Links export (outputs by row label, the input rows, the stored Option and the saved
// sensitivity tables) and checks it for likely mistakes. Used by the morning report on the server; the app carries the
// same emChecks() (copied at build time by tools/sync_emcheck.py) for the EstateMaster tab and the chat.
// Nothing here changes anything: a check is a sentence for a person to look at.
// headline labels as developers, banks and EstateMaster write them (UK, US, Gulf), each a whole-phrase match
const LAB = [['levered_irr', /(equity|levered|geared|investor|lp)\s*(x?irr)\b|\birr\s*(\(|-|–|on|to)\s*(equity|levered|geared)|irr\s*after\s*(finance|debt|funding)|leveraged\s*irr|\bnet\s+irr\b|\birr\b.{0,20}\b(lps?|limited partners?|investors?)\b/i], ['unlevered_irr', /(unlevered|ungeared|project|asset|unleveraged)\s*(x?irr)\b|\birr\s*(\(|-|–|on|to)\s*(unlevered|ungeared|project)|irr\s*(before|pre)\s*(finance|debt|funding)/i], ['profit_on_cost', /(profit|margin|return)\s*on\s*(total\s*)?(cost|development)|development\s*margin/i], ['net_profit', /(net|development|developer'?s?|total)\s*profit\b/i], ['total_cost', /total\s*(development|project|scheme)?\s*costs?\b|\btdc\b|total\s*uses\b/i], ['gross_revenue', /(gross|total)\s*(revenue|realisation|realization|sales|development\s*value)|\bgdv\b|gross\s*sales\s*(value|proceeds)/i], ['equity_multiple', /equity\s*multiple|\bmoic\b|\btvpi\b|multiple\s*on\s*(invested\s*)?(capital|equity)|\bem\s*\(x\)/i], ['peak_debt', /peak\s*(debt|funding|loan|facility)|maximum\s*(debt|loan)\s*(balance|outstanding)?/i]];
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
  // a developer's own model has formulas: an assumption is then a number typed into a cell, never a formula's result, read from every sheet.
  // An EstateMaster export is values only: its input sheets are read as before.
  const isF = (s, ri, j) => { const z = s.ws && s.ws[A1('', j, ri).slice(1)]; return !!(z && z.f); };
  const anyF = sheets.some(s => s.ws && Object.keys(s.ws).some(k => k[0] !== '!' && s.ws[k] && s.ws[k].f));
  const want = sheets.filter(s => /input|assumption|intro|summary|setup|financ|loan/i.test(s.name)); const use = anyF ? sheets : want.length ? want : sheets; const out = [], seen = new Set();
  // the column heading of a value: up its own column through numbers (three blanks at most), never above the block the input sits in, to a text cell on a row that is a heading row (no figures on it)
  const headOf = (s, ri, j, top) => { let gap = 0; for (let r = ri - 1; r >= Math.max(0, ri - 80, top || 0); r--) { const h = (s.rows[r] || [])[j];
    if (h == null || h === '') { if (++gap > 3) return ''; continue; } gap = 0; if (typeof h === 'number') continue;
    return typeof h === 'string' && h.trim().length < 50 && !(s.rows[r] || []).slice(Math.max(0, j - 8), j + 3).some(c => typeof c === 'number') ? h.trim() : ''; } return ''; };   // a heading row has no figures near the column (a monthly block further right does not count)
  // the block an input sits in ("MEZZ DEBT", "Construction Financing", "Exit Assumptions"): up its own label column to a label with no figure beside it
  const blockOf = (s, ri, i) => { for (let r = ri - 1; r >= Math.max(3, ri - 30); r--) { const rr = s.rows[r] || [], c = rr[i]; if (!emIsLabel(c)) continue; const t = String(c).trim(); if (t.length > 50) continue;
      const nx = rr.slice(i + 1, i + 4).find(x => x != null && x !== ''); if (typeof nx === 'number' || rr.slice(i + 1, emNextLabel(rr, i)).some(x => typeof x === 'number')) continue; if (typeof nx === 'string' && !/^[^a-z]{4,}$/.test(t)) continue;   // "City, State: Orlando, FL" is a label and its value, not a heading
      return { t, r }; } return null; };
  // the line a sub-row belongs to ("$/Per Occupied Room" under "Food & Beverage"): the nearest label above, up to 3 columns further left on a line with figures, within 8 rows
  const parentOf = (s, ri, i) => { for (let r = ri - 1; r >= Math.max(0, ri - 5); r--) { const rr = s.rows[r] || []; if (!rr.some(c => typeof c === 'number')) continue; for (let c = Math.max(0, i - 3); c < i; c++) if (emIsLabel(rr[c]) && String(rr[c]).trim().length <= 60) return String(rr[c]).trim(); } return ''; };
  for (const s of use) { let section = ''; s.rows.forEach((row, ri) => {
    if (!row || out.length >= 800) return;
    // a section heading: text only, in capitals or ending with a colon ("LAND PURCHASE & ACQUISITION COSTS")
    const txt = row.filter(c => c !== '' && c != null); if (txt.length && txt.length <= 2 && txt.every(c => typeof c === 'string') && /^[^a-z]{5,70}$/.test(String(txt[0]).trim()) && /[A-Z]/.test(txt[0])) { section = String(txt[0]).trim().replace(/\s+/g, ' '); return; }
    const fr = (s.frows && s.frows[ri]) || [];
    let i = row.findIndex(c => emIsLabel(c) && c.length <= 70);
    /* a row named by a short code in a table whose first column is headed Floor, Unit, Plot… (“L1”, “B2”, “T3”) is named by its code */
    if (i < 0 && typeof row[0] === 'string' && /^\s*[A-Za-z]{1,2}-?\d{1,3}\s*$/.test(row[0]) && row.slice(1, 9).some(c => typeof c === 'number')) { for (let r = ri - 1; r >= Math.max(0, ri - 40); r--) { const h = (s.rows[r] || [])[0]; if (typeof h === 'string' && h.trim() && !/^\s*[A-Za-z]{1,2}-?\d{1,3}\s*$/.test(h)) { if (/floor|level|unit|plot|block|tower|asset|lot|phase|building|bay|villa|apartment|tenant|suite/i.test(h)) i = 0; break } } }
    while (i >= 0 && i < row.length) {
      let end = emNextLabel(row, i); if (end === i + 1 && end < row.length && /^\s*(date|dates|text|y\/n|yes\/no|dd\/mm\/yy(yy)?)\s*$/i.test(String(row[end]))) end = emNextLabel(row, end);   /* a units column saying “date” is not the next label */
      const lab = String(row[i]).trim(), key = s.name + '|' + lab + (anyF ? '|' + ri : '');
      const next = () => { const k = row.slice(end).findIndex(c => emIsLabel(c) && c.length <= 70); i = k < 0 ? -1 : end + k; };
      if (lab.length > 70 || (!anyF && LAB.some(([, re]) => re.test(lab)))) { next(); continue; }   // in a model with formulas a typed “Total development cost” is an input (its outputs are formulas, skipped below)
      const blk = anyF ? blockOf(s, ri, i) : null; const cells = []; for (let j = i + 1; j < Math.min(end, i + 9); j++) { const n = numOf(row[j]); if (n == null || !Number.isFinite(n)) continue; if (anyF && isF(s, ri, j)) continue; if (anyF && /^\s*(month|year|period|quarter|week|day|yr|qtr)\s*\d+\s*$/i.test(String(fr[j] == null ? '' : fr[j]))) continue; /* a period counter ("Month 7") is a row index, not an assumption */ const t = String(fr[j] == null ? '' : fr[j]); if (/^[a-z]{3}[- ]\d{2,4}$|\d+\/\d+\/\d+/i.test(t.trim())) continue; const pc = /%\s*$/.test(t.trim()) || /^\s*[-(]?[$£€]?\s*[\d,.]+\s*%/.test(t) || (typeof row[j] === 'string' && /%\s*$/.test(row[j])); const zf = s.ws && s.ws[A1('', j, ri).slice(1)] && String(s.ws[A1('', j, ri).slice(1)].z || ''); const lit = pc && typeof row[j] === 'number' && !!zf && /%/.test(zf) && !/%/.test(zf.replace(/"[^"]*"|\\%/g, ''));   /* 4 formatted 0.0"%" shows 4.0%: the % is text, the cell holds 4 */
        cells.push({ v: pc && typeof row[j] === 'number' && !lit ? n * 100 : n, t, pct: pc, whole: lit || undefined, fmt: emFmt(t, pc), j, h: anyF ? headOf(s, ri, j, blk ? blk.r : 0) : '' }); }
      if (!cells.length) {
        // a text, date or yes/no input on an input sheet ("Date of First Period: Oct-26", "Add GST on Land Price? Y", "Cash Flow Title: Build to Hold")
        const headerRow = row.filter(c => typeof c === 'string' && c.trim() && c.trim().length <= 30 && !/:/.test(c)).length >= 3 && !row.some(c => typeof c === 'number');   /* a note beside the value (“Allowed: Base, Downside”) is not a heading */   // “Assumption | Unit | Option A | Option B | Selected”: a table's header, not a text input
        if (!headerRow && (/input|assumption/i.test(s.name) || /\b(select(ed)?|active|switch|choose|chosen|option|case|scenario)\b/i.test(lab)) && !seen.has(key)) {   // a case or option switch (“Selected option (A or B): A”) on any sheet
          let tj = -1; for (let j = i + 1; j < Math.min(end, i + 6); j++) { if (anyF && isF(s, ri, j)) continue; const t = String(fr[j] == null ? (row[j] == null ? '' : row[j]) : fr[j]).trim(); if (/^\s*(date|dates|text|y\/n|yes\/no|dd\/mm\/yy(yy)?)\s*$/i.test(t)) continue; /* the units column, not the value */ if (/^\s*(units?|values?|amount|notes?|comments?|source|description)\s*$/i.test(t) || (/^\s*(base|case)\s*$/i.test(t) && !/\b(select(ed)?|active|switch|choose|chosen|option|case|scenario)\b/i.test(lab))) break;   /* “Base” is the value of a scenario switch */ /* a table's header row, not a text input */ if (t && t.length <= 40 && t !== '-') { tj = j; break; } }
          // a long text value (a title) reads as a label: taken as the value when nothing else sits between the two
          if (tj < 0 && end < row.length && end <= i + 3 && String(row[end]).length <= 60 && (emNextLabel(row, end) === row.length || (/\b(select(ed)?|active|switch|choose|chosen|option|case|scenario)\b/i.test(lab) && String(row[end]).trim().length <= 40 && !/:/.test(row[end]))) && !row.slice(end + 1).some(c => numOf(c) != null)) { tj = end; end = emNextLabel(row, end); }   /* a switch's value (“Scenario: Base”) with a note after it */
          if (tj >= 0) { seen.add(key); out.push({ label: lab, value: null, text: String(fr[tj] == null ? row[tj] : fr[tj]).trim(), pct: false, vals: [], sheet: s.name, section, unit: '', cell: A1(s.name, tj, ri) }); }
        }
        next(); continue;
      }
      const unitCell = row.slice(i + 1, end).find(c => typeof c === 'string' && EM_UNIT_RX.test(c) && c.trim().length < 30 && !/^\s*[a-z]{1,2}\s*$/i.test(c));
      // a table (USES · START · END · METHOD · /SF · AMOUNT; SUITE · TENANT · SF · RENT/SF/YR): a text under a column heading is a value of that
      // column (a method chosen, a tenant's name), not the line's label; and each typed figure under its own heading is its own assumption
      if (anyF) { const per = h => /^\s*(year|yr|month|mo|quarter|q[1-4]|fy|period|h[12])\b|^\s*(19|20)\d\d\s*$|^\s*\d+\s*$/i.test(h || ''), top = Math.max(0, ri - 40);
        // up the label's own column, past the other rows' choices ("S-Curve", "Straight-Line"), to the column heading ("METHOD")
        const hl = (() => { let gap = 0; for (let r = ri - 1; r >= top; r--) { const rr = s.rows[r] || [], h = rr[i]; if (h == null || h === '') { if (++gap > 3) return ''; continue } gap = 0; if (typeof h !== 'string') continue;
          if (rr.slice(Math.max(0, i - 8), i + 3).some(c => typeof c === 'number')) continue; return h.trim().length < 50 ? h.trim() : '' } return '' })();
        for (const c of cells) if (!c.h) c.h = headOf(s, ri, c.j, top);
        let rep = 0; for (let r = Math.max(0, ri - 20); r <= Math.min(s.rows.length - 1, ri + 20); r++) if (r !== ri && (s.rows[r] || [])[i] === row[i]) rep++;
        const colVal = !!hl && hl !== lab && !per(hl) && (rep >= 2 || /method|status|type|tenant|order|basis|timing|curve|profile|draw|option|source|structure|lender|class/i.test(hl) || /^(see\b|n\/a$|tbd$|\[)/i.test(lab));
        let kL = -1; for (let k = i - 1; k >= 0; k--) if (emIsLabel(row[k]) && String(row[k]).length <= 70) { kL = k; break; }
        // the row's name column (Asset, Country, Deal, Tenant …): "Leipzig Park · Disposal date", not "Germany · Disposal date" (the text just left of the figures)
        const colHead = k => { for (let r = ri - 1; r >= top; r--) { const rr = s.rows[r] || [], h = rr[k]; if (h == null || h === '') continue; if (typeof h !== 'string') return ''; if (rr.slice(Math.max(0, k - 8), k + 3).some(c => typeof c === 'number')) continue; return h.trim().length < 50 ? h.trim() : ''; } return ''; };   // the column's heading: past the data rows above, to the row with no figures
        let nameLab = ''; for (let k = 0; k < i; k++) { if (!emIsLabel(row[k]) || String(row[k]).length > 70) continue; const hk = colHead(k); if (hk && /^(name|asset|deal|tenant|property|project|unit|phase|product|country|item|description|scheme|site|fund|entity|lease|loan|tranche|building|hotel|level)s?\b/i.test(hk)) { nameLab = String(row[k]).trim(); break; } }
        const own = colVal && kL >= 0 ? String(row[kL]).trim() : (nameLab && nameLab !== lab ? nameLab : '');
        const heads = cells.map(c => c.h).filter(Boolean), split = cells.length > 1 && heads.length === cells.length && new Set(heads).size === heads.length && !heads.some(per);
        if ((colVal && own) || split || (own && cells.length)) { const base = colVal && own && nameLab === '' && /tenant|name|asset|deal|property/i.test(hl) && own !== lab ? `${own} · ${lab}` : own || lab,   /* a floor and its tenant: “Ground · Fenchurch Retail” */ tc = h => String(h).split(/([\s\/(]+)/).map((w, k) => /[a-z]/.test(String(h)) && /^[A-Z]{2,5}s?$|^[A-Z]+\d+$/.test(w.replace(/[).,:]+$/, '')) ? w : k > 0 && w === w.toLowerCase() && /^(a|an|and|at|by|for|in|of|on|or|per|the|to|sq|ft|m|m2|psf|psm|sqm|sf|yr|pa|mo)$/.test(w.replace(/[).,:]+$/, '')) ? w : w.toLowerCase().replace(/^([a-z])/, c => c.toUpperCase())).join('');   /* small words stay small: “Area (sq ft)”, “Planted in Year” */   /* “Discount to NAV” keeps its acronym: “Discount To NAV”, “Equity In (EUR M)” */
          for (const c of (split ? cells : [cells[0]])) { const L = c.h && !per(c.h) ? `${base} · ${tc(c.h)}` : base, kk = s.name + '|' + L + '|' + ri; if (seen.has(kk)) continue; seen.add(kk); seen.add(key);
            out.push({ label: L, value: +c.v.toFixed(6), text: (c.t || String(c.v)).trim(), pct: c.pct, pctWhole: c.whole, fmt: c.fmt, vals: [c.v], cols: [{ h: c.h, t: String(c.t || c.v).trim() }], head: c.h || '', note: base !== lab ? lab : undefined, parent: blk ? blk.t : '', sheet: s.name, section, unit: c.pct ? '%' : (unitCell ? unitCell.trim().replace(/\bAUD\b/g, 'USD') : ''), cell: A1(s.name, c.j, ri) }) }
          next(); continue } }
      if (!seen.has(key)) { seen.add(key); out.push({ label: lab, value: +cells[0].v.toFixed(6), text: (cells[0].t || String(cells[0].v)).trim(), pct: cells[0].pct, pctWhole: cells[0].whole, fmt: cells[0].fmt, vals: cells.map(c => c.v).slice(0, 6), cols: anyF ? cells.slice(0, 6).map(c => ({ h: c.h, t: String(c.t || c.v).trim() })) : undefined, head: cells[0].h || '', parent: anyF ? ((li0 => li0 > 0 ? parentOf(s, ri, li0) : '')(row.findIndex(c => emIsLabel(c))) || (blk ? blk.t : '')) : '', sheet: s.name, section, unit: cells[0].pct ? '%' : (unitCell ? unitCell.trim().replace(/\bAUD\b/g, 'USD') : ''), cell: A1(s.name, cells[0].j, ri) }); }   // the demo shows AUD as USD, units included
      next();
    }
  }); }
  for (const i of out) { i.cat = emCat(i.label, (i.section || '') + ' ' + (i.parent || '')); if (i.cat === 'Development costs' && /op(erating)?\.?\s*(cash|cf)|operat|p\s*&\s*l|income|opex/i.test(i.sheet)) i.cat = 'Revenue & operations'; }   // a cost line on the operating sheet is an operating expense
  if (anyF) { out.forEach((i, k) => { i.section = i.cat; i.ord = k; }); out.sort((a, b) => EM_CATS.indexOf(a.cat) - EM_CATS.indexOf(b.cat) || a.ord - b.ord); out.forEach(i => { delete i.ord; i.typed = true; }); }
  /* the same label typed on several sheets (Exit cap · Base on four deal sheets, ADR on three hotels): each carries its sheet */
  { const bySh = {}; for (const o of out) (bySh[o.label] = bySh[o.label] || new Set()).add(o.sheet); for (const o of out) if (bySh[o.label].size > 1 && !new RegExp('\\b' + o.sheet.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i').test(o.label + ' ' + (o.parent || ''))) o.label = o.label + ' · ' + o.sheet; }
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
const EX_SKIP=(k,c)=>/irr|profit_on_cost|equity_multiple/.test(k)?/target|hurdle|required|minimum|\bmin\b|benchmark|threshold|cost of (equity|capital)|discount rate|\btier\b|promote|\breq'?d\b/i.test(c):/net_profit|total_cost|gross_revenue|peak_debt/.test(k)?/\bper\b|\/\s*(sqm|m2|m²|sq\s?m|sq\s?ft|unit|bed|key)|\bpsm\b|\bpsf\b|\barea\b|\bunits?\b|%|ratio|\brate\b|yield|margin|count|number of|\b(nla|gfa|gla|nsa|bua)\b|\bsqm\b|\bm2\b/i.test(c):false;
function parseWorkbook(wb, XLSX, fileName) {
  const sheets = (wb.SheetNames || []).map(name => ({ name, ws: wb.Sheets[name], rows: emRows(XLSX, wb.Sheets[name], true), frows: emRows(XLSX, wb.Sheets[name], false) }));
  const { out, found, cells } = emHeadline(sheets);
  const sens = []; for (const s of sheets) { let r = parseSens(s.rows, s.name); if (!r.length && /sensitiv/i.test(s.name)) { const T = []; s.rows.forEach((row, i) => (row || []).forEach((c, j) => { (T[j] = T[j] || [])[i] = c; })); r = parseSens(T, s.name); } sens.push(...r); }
  const meta = detectMeta(sheets, fileName);
  emPreferCcy(sheets, out, found, cells, meta); emOtherCcy(out, found, cells, meta);
  return { out, found, cells, sens, inputs: parseInputs(sheets), opt: detectOpt(sheets, fileName), meta, sheets: sheets.map(s => s.name).slice(0, 40), cf: parseCashFlow(sheets) };
}

/* ---- checks (kept identical in the app) ---- */
/*EMCHECKS-START*/
// a money figure whose own label names another currency ("Net profit (USD, hedged)" on a GBP asset) is not the model's headline figure
// in its currency: it stays among the other results, shown in its own currency
// a model reporting in two currencies (a EUR asset in a USD fund: “Levered IRR (EUR)”, “Levered IRR (USD)”): each headline is the
// line in the model's own currency when the model has one, read again with the other currency's lines set aside
function emPreferCcy(sheets, out, found, cells, meta) {
  const cur = meta && meta.currency, ISO = /\b(SAR|USD|EUR|GBP|AED|QAR|KWD|OMR|BHD|EGP|JPY|CNY|INR|PLN|CHF|SEK|NOK|DKK|AUD|NZD|CAD|HKD|SGD|BRL|MXN|ZAR|KRW|TRY|CZK|HUF|RON|ILS|THB|MYR|IDR|PHP)\b/g; if (!cur) return;
  const other = l => { const c = String(l || '').match(ISO) || []; return c.length && !c.includes(cur); };
  if (!Object.keys(found).some(k => other(String(found[k]).split(' / ').slice(1).join(' / ')))) return;
  const mine = sheets.some(s => s.rows.some(r => (r || []).some(c => typeof c === 'string' && c.length < 80 && new RegExp('\\b' + cur + '\\b').test(c) && /irr|profit|return|cost|revenue|debt/i.test(c)))); if (!mine) return;
  const keep = sheets.map(s => ({ ...s, rows: s.rows.map(r => (r || []).some(c => typeof c === 'string' && c.length < 80 && other(c)) ? [] : r), frows: (s.frows || []).map((r, i) => (s.rows[i] || []).some(c => typeof c === 'string' && c.length < 80 && other(c)) ? [] : r) }));
  const h = emHeadline(keep);
  for (const k of Object.keys(h.out)) if (!(k in out) || other(String(found[k]).split(' / ').slice(1).join(' / '))) { out[k] = h.out[k]; found[k] = h.found[k]; cells[k] = h.cells[k]; } }
function emOtherCcy(out, found, cells, meta) {
  const SYM = { '$': 'USD', '£': 'GBP', '€': 'EUR' }, cur = meta && meta.currency; if (!cur) return;
  for (const k of ['net_profit', 'total_cost', 'gross_revenue', 'peak_debt', 'lp_profit', 'gp_profit']) { if (!(k in out)) continue;
    const lab = String(found[k] || '').split(' / ').slice(1).join(' / '), iso = (lab.match(/\b(SAR|USD|EUR|GBP|AED|QAR|KWD|OMR|BHD|EGP|JPY|CNY|INR|PLN|CHF|SEK|NOK|DKK|AUD|NZD|CAD|HKD|SGD|BRL|MXN|ZAR|KRW|TRY|CZK|HUF|RON|ILS|THB|MYR|IDR|PHP)\b/) || [])[1], sym = (lab.match(/\((?:[^)]*?)([$£€])\)/) || [])[1], c2 = iso || (sym && SYM[sym]);
    if (c2 && c2 !== cur && !(sym === '$' && /^[A-Z]{2,3}D$/.test(cur) && !iso)) { delete out[k]; delete found[k]; delete cells[k]; } } }

/* The group an assumption belongs to, in the order an analyst reads a model: what and when, the land, the costs, the income, the funding, the exit. */
const EM_CATS = ['Project & timing', 'Land & acquisition', 'Development costs', 'Revenue & operations', 'Financing', 'Exit', 'Other'];
function emCat(label, section) { const t = (label + ' ' + (section || '')).toLowerCase();
  return /\bexit\b|terminal|reversion|hold(ing)? period|cap(itali[sz]ation)? rate|going[- ]in cap|sale expenses|disposal|selling costs?/.test(t) ? 'Exit'
    : /\bkeys\b|\bgsf\b|\bgfa\b|\bnla\b|\bgla\b|\bbua\b|site area|\barea\b|\bsqm\b|sq\.? ?f(ee)?t|\bdate\b|start|completion|duration|programme|^month$|^year$|analysis|number of units|unit count/.test(t) ? 'Project & timing'
    : /debt|loan|\bltc\b|\bltv\b|interest|mezz|equity|facility|sofr|libor|saibor|amorti[sz]|refinanc|lender|dscr|\bfloor\b|\bceiling\b|spread|i\/o|murabaha|financ|funding|preferred return|promote|hurdle|waterfall/.test(t) ? 'Financing'
    : /\bland\b|acquisition|purchase price|stamp duty|transfer tax|due diligence|site cost/.test(t) ? 'Land & acquisition'
    : /cost|construction|hard|soft|ff&e|os&e|contingen|architect|engineer|legal|permit|entitlement|professional fee|developer'?s? fee|development fee|marketing|g&a|budget|sitework|foundation|structure|\bmep\b|interior|exterior|furniture|fixture|equipment|supplies|escalat|consultant/.test(t) ? 'Development costs'
    : /revenue|rent|\badr\b|occupan|revpar|room|f&b|food|beverage|income|sale|price|growth|inflation|expense|payroll|utilit|management|franchise|reserve|vacan|absorption|lease|noi\b|operat|departmental|commission|property tax|insurance/.test(t) ? 'Revenue & operations' : 'Other'; }
/* Reading a sheet: always from A1 (sheet_to_json starts at the first used cell, which shifted every "original cell" address), blank rows kept.
   EstateMaster lays inputs out in side-by-side blocks (label · value · unit · label · value · unit on one row): a label only takes the numbers
   and the unit between it and the next label on the row, never a figure from the neighbouring block. */
function emRows(XLSX, ws, raw) { if (!ws || !ws['!ref']) return []; const r = XLSX.utils.decode_range(ws['!ref']); r.s.r = 0; r.s.c = 0; return XLSX.utils.sheet_to_json(ws, { header: 1, raw: raw !== false, range: r, blankrows: true }); }
const EM_UNIT_RX = /^\s*(%\s*[a-z.\s\/]{0,12}|sar|aud|usd|aed|eur|gbp|nzd|qar|kwd|\$|sqm|sq\.?\s?m|sq\.?\s?ft|m2|m²|gfa|nla|gla|nsa|bua|months?|years?|yrs?|days?|weeks?|quarters?|p\.?\s?a\.?|pa|per\b.{0,24}|units?\b.{0,16}|(sar|aud|usd|aed|eur|gbp)\s*\/[a-z²\s\/.]{0,16}|[a-z]{2,4}\s*\/\s*[a-z²]{1,8}[a-z²\s\/.]{0,12}|[a-z]{1,2})\s*$/i;   // “EUR/sqm/yr” is a unit, “EUR/PLN exchange rate” a label
/* units written in lower case in a units column (“beds”, “£/bed/week”, “weeks/yr”): a label is written “Beds” */
const EM_UNIT2 = /^\s*([£€$]\s*(\/.{0,24})?|(beds?|keys?|homes?|lots?|rooms?|apartments?|doors?|mw|kw|sf|psf|#)(\s*\/.{0,16})?|(weeks?|months?|years?|days?)\s*\/\s*[a-z]{1,6})\s*$/;
const EM_PAIR = /\b(sar|usd|eur|gbp|aed|qar|kwd|omr|bhd|chf|jpy|cny|inr|pln|sek|nok|dkk|aud|nzd|cad|hkd|sgd|brl|zar|try)\s*\/\s*(sar|usd|eur|gbp|aed|qar|kwd|omr|bhd|chf|jpy|cny|inr|pln|sek|nok|dkk|aud|nzd|cad|hkd|sgd|brl|zar|try)\b.*\s[a-z]{3,}/i;   // “GBP/USD drift a year” is a line, not a unit
const emIsLabel = c => typeof c === 'string' && c.trim().length > 2 && /[a-z]/i.test(c) && (!EM_UNIT_RX.test(c) || EM_PAIR.test(c)) && !EM_UNIT2.test(c) && !/^\s*-?[\d,.]+\s*%?\s*$/.test(c) && !/^\s*(true|false|yes|no|y|n|n\/a|-)\s*$/i.test(c) && !/^\s*([a-z]{3}[- ]\d{2,4}|\d{1,2}[- ][a-z]{3}[- ]\d{2,4}|\d+\/\d+\/\d+)\s*$/i.test(c);   // a date typed as text is a value
/* What a number is, from the cell's own Excel number format (the displayed text), never from its label: "5%" a percentage,
   "SOFR +500 bps" basis points, "$4,567,339" money, "2.78x" a multiple, "3,500,000" a plain number. */
const emFmt = (t, pc) => { t = String(t == null ? '' : t); return pc || /%\s*\)?\s*$/.test(t.trim()) ? 'pct' : /\bbps\b|basis points/i.test(t) ? 'bps' : /[$€£¥﷼]|\b(SAR|USD|AED|EUR|GBP|AUD|QAR|KWD|SR)\b/i.test(t) ? 'money' : /^\s*-?[\d.,]+\s*x\s*$/i.test(t) ? 'x' : 'num'; };
/* A row of period values (a year or month per column) has no single figure: only a column headed "Total" counts. */
function emSeriesCol(rows, ri, j) { const row = rows[ri] || []; const nums = row.slice(j).filter(c => typeof c === 'number').length;
  // fewer than six values is still a series when the columns are headed by periods (year 0 1 2 3, dates, "Year 1", "Q2", "FY25")
  const per = c => typeof c === 'number' ? (Number.isInteger(c) && c >= 0 && c <= 600) || (c > 20000 && c < 80000) : typeof c === 'string' && /^\s*(year|yr|month|mo|quarter|q[1-4]|fy|period|h[12])\b|^\s*(19|20)\d\d\s*$|^\s*[a-z]{3}[- ]?\d{2,4}\s*$/i.test(c);
  const headed = () => { for (let k = ri - 1; k >= Math.max(0, ri - 12); k--) { const h = rows[k] || []; let n = 0; for (let c = j; c < Math.min(h.length, j + 12); c++) if (per(h[c])) n++; if (n >= 3) return true } return false };
  if (nums < 3 || (nums < 6 && !headed())) return false;
  for (let k = ri - 1; k >= Math.max(0, ri - 10); k--) { const h = (rows[k] || [])[j]; if (typeof h === 'string' && /total|sum\b/i.test(h)) return false; } return true; }
/* A returns table (rows Levered / Unlevered, columns IRR · Profit · MOIC · Cash outflow), as many developer models lay their headline out. */
function emMatrix(sheets) {
  const out = {}, found = {}, cells = {};
  for (const s of sheets) for (let ri = 0; ri < Math.min(s.rows.length, 200); ri++) { const row = s.rows[ri] || [];
    const col = re => row.findIndex(c => typeof c === 'string' && re.test(c.trim()));
    const ci = col(/^(irr|xirr)$/i); if (ci < 0) continue;
    const cp = col(/^(net\s*)?profit$/i), cm = col(/^(moic|equity multiple|multiple|em|emx|em\s*\(?x\)?|equity\s*multiple\s*\(x\))$/i), co = col(/^(cash\s*outflow|equity|investment|total\s*cost|cost)$/i);
    for (let r = ri + 1; r < Math.min(s.rows.length, ri + 9); r++) { const rr = s.rows[r] || []; let li = -1; for (let j = ci - 1; j >= 0; j--) if (typeof rr[j] === 'string' && rr[j].trim()) { li = j; break; }   // the row's own label: the text nearest the table, not a cell of the block beside it
      if (li < 0) continue; const lab = String(rr[li]).trim(), unl = /\b(unlevered|ungeared|project|asset)\b/i.test(lab), lev = !unl && /\b(levered|geared|equity)\b/i.test(lab); if (!unl && !lev) continue;
      const fr = (s.frows && s.frows[r]) || [], put = (k, j, f) => { if (j < 0 || k in out || typeof rr[j] !== 'number') return; out[k] = +f(rr[j]).toFixed(4); found[k] = `${s.name} / ${lab} · ${String(row[j]).trim()}${fr[j] ? ' (' + String(fr[j]).trim() + ')' : ''}`; cells[k] = A1(s.name, j, r); };
      const pc = v => Math.abs(v) < 1.5 ? v * 100 : v;
      if (unl) { put('unlevered_irr', ci, pc); put('total_cost', co, Math.abs); }
      else { put('levered_irr', ci, pc); put('net_profit', cp, v => v); put('equity_multiple', cm, v => v); }
    }
    // a summary table may hold only the IRRs: later tables (the full returns table) fill what it leaves out, never what it holds
    if (['levered_irr', 'net_profit', 'equity_multiple'].every(k => k in out)) return { out, found, cells };
  }
  // the same table the other way round: columns Unlevered / Levered, rows IRR · Profit · MOIC · Cost
  for (const s of sheets) for (let ri = 0; ri < Math.min(s.rows.length, 200); ri++) { const row = s.rows[ri] || [];
    const cu = row.findIndex(c => typeof c === 'string' && /^(unlevered|ungeared|project|unleveraged)(\s*(returns?|cash\s*flow))?$/i.test(c.trim())), cl = row.findIndex(c => typeof c === 'string' && /^(levered|geared|equity|leveraged)(\s*(returns?|cash\s*flow))?$/i.test(c.trim()));
    if (cu < 0 || cl < 0) continue;
    for (let r = ri + 1; r < Math.min(s.rows.length, ri + 12); r++) { const rr = s.rows[r] || [], fr = (s.frows && s.frows[r]) || []; let li = -1; for (let j = Math.min(cu, cl) - 1; j >= 0; j--) if (typeof rr[j] === 'string' && rr[j].trim()) { li = j; break; } if (li < 0) continue;
      const lab = rr[li].trim(), put = (k, j, f) => { if (k in out || typeof rr[j] !== 'number') return; out[k] = +f(rr[j]).toFixed(4); found[k] = `${s.name} / ${lab} · ${String(row[j]).trim()}${fr[j] ? ' (' + String(fr[j]).trim() + ')' : ''}`; cells[k] = A1(s.name, j, r); };
      const pc = v => Math.abs(v) < 1.5 ? v * 100 : v;
      if (/^x?irr$/i.test(lab)) { put('unlevered_irr', cu, pc); put('levered_irr', cl, pc); }
      else if (/^(net\s*)?profit$/i.test(lab)) put('net_profit', cl, v => v);
      else if (/^(moic|equity multiple|multiple)$/i.test(lab)) put('equity_multiple', cl, v => v);
      else if (/^(total\s*)?(cost|cash\s*outflow|investment)$/i.test(lab)) put('total_cost', cu, Math.abs);
    }
    if (Object.keys(out).length) return { out, found, cells };
  }
  return { out, found, cells };
}
/* Amounts stated in thousands or millions ("($000s)", "USD m", "in millions") are scaled to full units: from the label, the column heading or the sheet's title rows. */
const EM_K = /\(\s*[^)]{0,8}?(000s?|'000s?|’000s?|k)\s*\)|\bk(chf|eur|usd|gbp|sar|aed|qar|kwd|jpy|inr|sgd|hkd)\b|in\s*thousands|\bthousands\b|['’]000s?\b|[$€£]\s*000s?\b|\b(usd|sar|eur|aed|gbp|qar)\s*(000s?|k)\b/i;
const EM_M = /\(\s*[^)]{0,8}?(m|mm|mn|mio|millions?)\s*\)|\bm(chf|eur|usd|gbp|sar|aed)\b|in\s*millions|\bmillions?\b|\b(usd|sar|eur|aed|gbp|qar|us\$|\$|€|£)\s*(m|mm|mn)\b/i;
const EM_CR = /\bcrores?\b|\(\s*[^)]{0,6}?\bcr\.?\s*\)/i, EM_LK = /\blakhs?\b|\blacs?\b/i;   // Indian units: 1 crore = 10 million, 1 lakh = 100,000
function emUnitScale(s, ri, j, label) {
  const sc = t => EM_CR.test(t) ? 1e7 : EM_LK.test(t) ? 1e5 : EM_M.test(t) ? 1e6 : EM_K.test(t) ? 1e3 : 0; let k = sc(label || ''); if (k) return { k, from: `“${String(label).trim().slice(0, 40)}”` };
  for (let r = ri - 1; r >= Math.max(0, ri - 15); r--) { const h = (s.rows[r] || [])[j]; if (typeof h === 'string' && (k = sc(h))) return { k, from: `column heading “${h.trim().slice(0, 30)}”` }; }
  for (let r = 0; r < Math.min(6, s.rows.length); r++) for (const c of s.rows[r] || []) if (typeof c === 'string' && c.length < 90 && (k = sc(c))) return { k, from: `sheet heading “${c.trim().slice(0, 40)}”` };
  return null;
}
/* The headline figures, the same way in the app and on the server: a returns table first, then each figure by its label, its value to the right of
   the label or, for a heading over its figure, directly below; never the first period of a time series; percentages and scale from the cells' formats. */
function emHeadline(sheets) {
  // in a model with formulas a headline figure is a formula's result: a typed number under the same words (an asset's
  // "exit multiple on equity" in an assumptions table) is an input, never the deal's return
  const anyF = sheets.some(s => s.ws && Object.keys(s.ws).some(k => k[0] !== '!' && s.ws[k] && s.ws[k].f)), typed = (s, r, j) => { if (!anyF || !s.ws) return false; const z = s.ws[A1('', j, r).slice(1)]; return !!z && !z.f; };
  const mx = emMatrix(sheets), out = { ...mx.out }, found = { ...mx.found }, cells = { ...mx.cells }, later = {}, isNum = x => typeof x === 'number' || (typeof x === 'string' && /^\s*-?[\d,.]+\s*%?\s*$/.test(x) && !!x.trim());
  // a sheet named for the results (Returns, Summary, Outputs, Dashboard, KPIs) is read first: the fund's LP TVPI there is the headline,
  // never a deal sheet's own "Deal equity multiple" further on
  const isSum = s => /return|summary|output|dashboard|result|kpi|headline|overview/i.test(s.name), ordered = [...sheets.filter(isSum), ...sheets.filter(s => !isSum(s))], held = {};
  for (const s of ordered) for (let ri = 0; ri < s.rows.length; ri++) { const row = s.rows[ri]; if (!row) continue;
    for (let i = 0; i < row.length; i++) {
      const c = row[i]; if (typeof c !== 'string' || c.length > 80) continue;
      for (const [k, re] of LAB) {
        if (k in out || !re.test(c)) continue; if (held[k] && !isSum(s)) continue; if (k === 'levered_irr' && /unlevered|ungeared|unleveraged/i.test(c)) continue; if (EX_SKIP(k, c)) continue;
        // an operating income line (effective or potential gross income, a stabilised year) is not the scheme's gross revenue
        if (k === 'gross_revenue' && /\b(effective|potential|egi|pgi|egr|stabili[sz]ed|in-place|annual|per annum|year\s*1)\b/i.test(c)) continue;
        // an LP's or GP's own figure is kept aside: the scheme's figure, when the model has one, pairs with the scheme's IRR
        const lpTo = /\b(to|for)\s+(the\s+)?(lps?|limited partners?|investors?)\b|\bnet\s+tvpi\b/i.test(c), party = /levered_irr|equity_multiple|net_profit/.test(k) && (/^\s*(lp|gp|limited partner|general partner|investor|sponsor|promote)\b/i.test(c) || lpTo);
        const end = emNextLabel(row, i), seg = row.slice(i + 1, end); let v = seg.find(isNum), r0 = ri, j0 = i + 1 + seg.indexOf(v), amt = false;
        // a table with several columns (%, per SF, Amount): the figure is the one under "Amount" / "Total"
        if (/net_profit|total_cost|gross_revenue|peak_debt/.test(k) && seg.filter(isNum).length > 1) { for (let r = ri - 1; r >= Math.max(0, ri - 12) && !amt; r--) { const h = s.rows[r] || []; for (let cc = i + 1; cc < end; cc++) if (typeof h[cc] === 'string' && /^\s*(amount|total|total amount|value|\$|usd|sar|eur|gbp|aed)\s*$/i.test(h[cc]) && isNum(row[cc])) { v = row[cc]; j0 = cc; amt = true; break } } }
        if (v == null) { for (let r = ri + 1; r <= ri + 2 && r < s.rows.length; r++) { const b = (s.rows[r] || [])[i]; if (isNum(b)) { v = b; r0 = r; j0 = i; break; } if (b != null && b !== '') break; } }   // a heading with its figure underneath
        // a figure read under a column heading belongs to its row: a tier, hurdle or promote row is an assumption; an unlevered row is not the equity's figure
        if (v != null && r0 !== ri) { const rr = s.rows[r0] || []; let rl = ''; for (let j = j0 - 1; j >= 0; j--) if (typeof rr[j] === 'string' && rr[j].trim()) { rl = rr[j].trim(); break; }
          if (/\b(tier|promote|hurdle|pref(erred)?|catch[- ]?up|target|threshold|minimum|required)\b/i.test(rl) || (/levered_irr|net_profit|equity_multiple/.test(k) && /\b(unlevered|ungeared|unleveraged|project|asset|property)\b/i.test(rl) && !/\blevered\b/i.test(rl.replace(/unlevered/ig, '')))) continue }
        if (v == null) continue;
        if (r0 === ri && !amt && emSeriesCol(s.rows, ri, j0)) continue;   // year 1 of a revenue line is not the gross revenue
        if (typed(s, r0, j0)) continue;
        let n = typeof v === 'number' ? v : parseFloat(v.replace(/[,%\s]/g, '')); if (!Number.isFinite(n)) continue;
        const w = String(((s.frows || [])[r0] || [])[j0] == null ? '' : s.frows[r0][j0]).trim();
        if (/irr|profit_on_cost/.test(k) && ((/%\s*$/.test(w) && Math.abs(n) < 50 && typeof v === 'number') || (Math.abs(n) < 1.5 && (/%\s*$/.test(w) || (Math.abs(n) < 1 && !(typeof v === 'string' && /%/.test(v))))))) n *= 100;   /* a %-formatted cell holds a fraction whatever its size: 2.14 shown “214.0%” is 214% */
        let note = ''; if (/net_profit|total_cost|gross_revenue|peak_debt/.test(k) && Math.abs(n) < 1e6) { const u = emUnitScale(s, r0, j0, c); if (u) { n *= u.k; note = ` × ${u.k === 1e6 ? '1,000,000' : '1,000'} (${u.from})`; } }
        if (party) { if (!(k in later)) later[k] = { v: +n.toFixed(4), f: `${s.name} / ${c.trim()}${w ? ' (' + w + ')' : ''}${note}`, a: A1(s.name, j0, r0) }; if (isSum(s)) held[k] = true;
          // a partner's own return (LP IRR, GP equity multiple) is kept as its own output, beside the scheme's
          const pk = (/^\s*(lp|limited|investor)/i.test(c) || lpTo ? 'lp' : 'gp') + (k === 'equity_multiple' ? '_multiple' : k === 'net_profit' ? '_profit' : '_irr'); if (!(pk in out)) { out[pk] = +n.toFixed(4); found[pk] = `${s.name} / ${c.trim()}`; cells[pk] = A1(s.name, j0, r0) } continue }
        out[k] = +n.toFixed(4); found[k] = `${s.name} / ${c.trim()}${w ? ' (' + w + ')' : ''}${note}`; cells[k] = A1(s.name, j0, r0); break;
      }
    }
  }
  for (const k in later) if (!(k in out)) { out[k] = later[k].v; found[k] = later[k].f; cells[k] = later[k].a }   // only an LP/GP figure in the model: that one
  if (!('levered_irr' in out) && !('unlevered_irr' in out)) for (const s of sheets) { for (let ri = 0; ri < s.rows.length; ri++) { const row = s.rows[ri] || []; const i = row.findIndex(c => typeof c === 'string' && /\bIRR\b/i.test(c) && c.length < 60 && !EX_SKIP('levered_irr', c)); if (i < 0) continue; const seg = row.slice(i + 1, emNextLabel(row, i)), v = seg.find(x => typeof x === 'number'); if (v == null) continue;
      out.levered_irr = +(Math.abs(v) < 1 ? v * 100 : v).toFixed(4); found.levered_irr = `${s.name} / ${row[i].trim()} (taken as the levered IRR: check)`; cells.levered_irr = A1(s.name, i + 1 + seg.indexOf(v), ri); break; } if ('levered_irr' in out) break; }
  return { out, found, cells };
}
function emNextLabel(row, i) { for (let j = i + 1; j < row.length; j++) if (emIsLabel(row[j])) return j; return row.length; }
/* Likely mistakes in an EstateMaster export: unit slips, outputs that do not reconcile, sensitivity tables not refreshed,
   implausible inputs, jumps since the previous export with no approved change behind them, a stale export.
   x = {out, inputs, sens, at, file}; prev = the previous export of the same option; opt = {now, hurdle, register, approvedBetween}. */
function emChecks(x, prev, opt) {
  opt = opt || {}; const o = x.out || {}, p = prev && prev.out || {}, res = [], C = x.cells || {}, at = (...ks) => ks.map(k => C[k]).filter(Boolean).join(', '), add = (level, code, text, cell) => res.push({ level, code, text, cell: cell || '' });
  const mt = x.meta || {}, wbk = mt.source === 'excel' ? 'workbook' : 'export', CY = mt.currency ? mt.currency + ' ' : (mt.source ? '' : 'SAR ');
  const fin = v => typeof v === 'number' && Number.isFinite(v), M = v => CY + (Math.abs(v) / 1e6).toLocaleString('en-GB', { maximumFractionDigits: 1 }) + 'M', P = v => v.toFixed(2) + '%';
  for (const k of ['levered_irr', 'profit_on_cost', 'net_profit', 'total_cost']) if (!fin(o[k])) add('note', 'missing', `${ROWS.find(r => r[0] === k)[1]} is not in the ${wbk} (no row or column with that label)${wbk === 'export' ? ': include the Summary sheet' : ''}.`);
  for (const k of ['total_cost', 'gross_revenue', 'net_profit', 'peak_debt']) if (fin(o[k]) && o[k] !== 0 && Math.abs(o[k]) < 5e6) add('warn', 'units', `${ROWS.find(r => r[0] === k)[1]} reads ${o[k].toLocaleString('en-GB')}: that looks like thousands or millions rather than full currency units (unit setting in the export?).`, at(k));
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
  // a percentage only when the cell is formatted as one (or holds a fraction ≤ 1 in a rate-like row with no format), basis points converted;
  // an amount in a "Contingency" or "Interest" row (3,500,000) is money, never 3,500,000%
  const nm = i => i.label.toLowerCase(), RATE = /%|rate|margin|contingen|escalat|commission|vat|tax|ltc|ltv|share|yield|interest/i;
  const pct = i => i.pct || i.fmt === 'pct' ? i.value : i.fmt === 'bps' ? i.value / 100 : (i.fmt === 'money' || i.fmt === 'x') ? null : Math.abs(i.value) <= 1 && RATE.test(i.label + ' ' + (i.unit || '')) ? i.value * 100 : /%/.test(i.unit || '') ? i.value : null;
  for (const i of x.inputs || []) {
    if (!fin(i.value)) continue; // text inputs (names, Y/N, dates) have nothing to range-check
    const l = nm(i), v = pct(i), isP = v != null;
    if (/contingen|escalat|commission|selling cost|sales cost|interest|profit rate|cap(italisation)? rate|exit yield|land (cost|price|value)|construction cost/.test(l) && i.value === 0) add('warn', 'input-zero', `Input “${i.label}” is 0 on sheet ${i.sheet}: left blank?`, i.cell);
    if (isP && /interest|profit rate|finance rate|loan rate/.test(l) && !/fee|margin over|spread|reserve|pre-interest|sofr|libor|saibor|eibor|curve|base rate|index/.test(l) && v !== 0 && (v < 2 || v > 15)) add('warn', 'input-range', `Input “${i.label}” = ${v}% p.a. is outside 2–15%.`, i.cell);
    if (isP && /cap(italisation)? rate|exit yield|terminal yield/.test(l) && v !== 0 && (v < 2.5 || v > 12)) add('warn', 'input-range', `Input “${i.label}” = ${v}% is outside 2.5–12%.`, i.cell);   // prime Zurich, Tokyo and Munich yields sit near 3%
    if (isP && /contingen/.test(l) && v > 15) add('warn', 'input-range', `Input “${i.label}” = ${v}%: contingency above 15%.`, i.cell);
    if (isP && /\bvat\b|value added tax/.test(l) && v !== 0 && Math.abs(v - 15) > 0.01) add('note', 'input-range', `Input “${i.label}” = ${v}%: Saudi VAT is 15%.`, i.cell);
    if (isP && (i.pct || i.fmt === 'pct' || /%/.test(i.unit || '')) && Math.abs(v) > 100 && !/escalat/.test(l)) add('error', 'input-range', `Input “${i.label}” = ${i.value}: a percentage above 100%.`, i.cell);
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
  const meta = { title: '', type: '', currency: '', site: null, gfa: null, source: '' }, cur = {}, ev = {}; let usLoc = '';
  const vote = (c, e) => { cur[c] = (cur[c] || 0) + 1; if (!ev[c]) ev[c] = e; };
  // the cells' own number formats ("$4,567,339", "SAR 1,000", "€ 5.0") are the strongest evidence of the currency
  // one vote per row: a row of PMT results that Excel formatted as "$" on its own is one piece of evidence, not twenty
  const fseen = new Set();
  for (const s of sheets.slice(0, 8)) (s.frows || []).slice(0, 220).forEach((fr, ri) => (fr || []).forEach((w, j) => { if (typeof w !== 'string' || typeof (s.rows[ri] || [])[j] !== 'number') return; const t = w.trim();
    const c = /^\(?-?\s*(US)?\$/.test(t) ? 'USD' : /€/.test(t) ? 'EUR' : /£/.test(t) ? 'GBP' : /﷼|^SAR\b|\bSAR$|^SR\b/.test(t) ? 'SAR' : /^AED\b|\bAED$/.test(t) ? 'AED' : ''; if (c && !fseen.has(s.name + '|' + ri + '|' + c)) { fseen.add(s.name + '|' + ri + '|' + c); vote(c, `${s.name}!${A1('', j, ri).slice(1)} shows “${t.slice(0, 20)}”`); } }));
  const after = (row, i) => row.slice(i + 1).find(x => (typeof x === 'string' && x.trim()) || typeof x === 'number');
  for (const s of sheets.slice(0, 5)) for (const row of s.rows.slice(0, 160)) {
    if (!row) continue;
    for (let i = 0; i < row.length; i++) {
      const c = row[i]; if (typeof c !== 'string') continue; const t = c.trim();
      for (const m of t.matchAll(/(?:\b|(?<=\b(?:k|m|mn|bn)))(SAR|AUD|USD|AED|EUR|GBP|NZD|QAR|KWD|BHD|OMR|JOD|EGP|CHF|JPY|CNY|HKD|SGD|INR|CAD|ZAR|SEK|NOK|DKK|PLN|TRY|MAD|BRL|MXN|CLP|COP|KRW|TWD|THB|MYR|IDR|PHP|KES|NGN|ILS|CZK|HUF|RON)\b/g)) { const c = m[1] === 'AUD' ? 'USD' : m[1]; vote(c, `“${t.slice(0, 40)}”`); }
      if (/(^|[\s(\-–])(US)?\$\s?\d|^\s*(US)?\$\s*$/.test(t)) vote('USD', `“${t.slice(0, 40)}”`); { const dm = t.match(/(?:^|[^A-Z])(NZ|C|HK|S|R)\$/); if (dm) vote({ NZ: 'NZD', C: 'CAD', HK: 'HKD', S: 'SGD', R: 'BRL' }[dm[1]], `“${t.slice(0, 40)}”`); } if (/€/.test(t)) vote('EUR', `“${t.slice(0, 40)}”`); if (/₹/.test(t)) vote('INR', `“${t.slice(0, 40)}”`); if (/¥/.test(t) && !/\bCNY\b|RMB|元/.test(t)) vote('JPY', `“${t.slice(0, 40)}”`); if (/£/.test(t)) vote('GBP', `“${t.slice(0, 40)}”`); if (/﷼|ر\.س|\bSR\s?\d/.test(t)) vote('SAR', `“${t.slice(0, 40)}”`);
      if (/^(.*,\s*)?(AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY)\s*$/.test(t) && /,/.test(t)) usLoc = t;
      if (/estate\s*master|office\s*links|\bargus\b|cash flow title/i.test(t)) meta.source = 'estatemaster';
      if (!meta.title && /^(cash flow title|project name|project title|project|scheme name|development name|title)\s*:?$/i.test(t) && !(row.filter(c => typeof c === 'string' && c.trim()).length >= 3 && !row.some(c => typeof c === 'number'))) { const v = after(row, i); if (typeof v === 'string' && v.trim().length > 2) { meta.title = v.trim().slice(0, 80); meta.titleFrom = 'cell'; } }
      if (!meta.type && /^(type|property type|asset type|land use)\s*:?$/i.test(t)) { const v = after(row, i); if (typeof v === 'string') meta.type = v.trim(); }
      if (!meta.type) { const m = t.match(/^type\s*:\s*(.+)$/i); if (m) meta.type = m[1].trim(); }
      if (meta.site == null && /^site area\s*:?$/i.test(t)) { const v = row.slice(i + 1).map(numOf).find(x => x != null && x > 0); if (v) meta.site = v; }
      if (meta.gfa == null && /^(project size \(b\)|gross floor area|gfa)\s*:?$/i.test(t)) { const v = row.slice(i + 1).map(numOf).find(x => x != null && x > 1); if (v) meta.gfa = v; }
    }
  }
  if (!meta.type) { const all = sheets.slice(0, 3).flatMap(s => s.rows.slice(0, 80).flat()).filter(c => typeof c === 'string').join(' '); const m = all.match(/\b(industrial|logistics|warehouse|residential|retail|office|hotel|hospitality|mixed[- ]use|build to rent)\b/i); if (m) meta.type = m[1]; }
  // the model's horizon: the last period of each timeline (a row headed Year / Month / Quarter followed by 0,1,2… or 1,2,3…), so a hold or exit
  // moved past the last column is flagged instead of shown as a result
  meta.horizon = {}; for (const s of sheets) for (const row of s.rows) { if (!row) continue; const i = row.findIndex(c => typeof c === 'string' && /^\s*(years?|yrs?|months?|quarters?|qtrs?|periods?)\s*$/i.test(c)); if (i < 0) continue;
    const u = /^\s*m/i.test(row[i]) ? 'month' : /^\s*q/i.test(row[i]) ? 'quarter' : /^\s*p/i.test(row[i]) ? 'period' : 'year'; const ns = row.slice(i + 1).filter(v => typeof v === 'number' && Number.isInteger(v));
    if (ns.length >= 4 && ns.every((v, k) => k === 0 || v === ns[k - 1] + 1)) meta.horizon[u] = Math.max(meta.horizon[u] || 0, ns[ns.length - 1]); }
  // never a default: no evidence → no currency, and the app asks
  meta.currency = Object.entries(cur).sort((a, b) => b[1] - a[1]).map(e => e[0])[0] || '';
  meta.ccyFrom = meta.currency ? ev[meta.currency] + (meta.currency === 'USD' && usLoc ? `; US location “${usLoc.slice(0, 40)}”` : '') : '';
  if (!meta.source) meta.source = 'excel';
  if (usLoc) { meta.country = 'US'; meta.place = usLoc.trim().slice(0, 60); }
  if (meta.title && /\[[^\]]*\]/.test(meta.title)) meta.title = '';
  // the model's own name slot left as the template's placeholder ("[INVESTMENT NAME]"): the file's name, not a section heading further down
  if (!meta.title) { const f0 = sheets[0] && sheets[0].rows.flat().find(c => typeof c === 'string' && c.trim()); if (f0 && /^\s*\[[^\]]*\]\s*$/.test(f0)) { meta.title = String(fileName || '').replace(/\.[^.]+$/, '').replace(/[_]+/g, ' ').trim().slice(0, 80); meta.titleFrom = 'file'; } }
  if (!meta.title) { const first = (sheets[0] && sheets[0].rows.flat().find(c => typeof c === 'string' && c.trim().length > 4 && !/\[[^\]]*\]/.test(c) && !/argus|estatemaster|summary|licensed/i.test(c) && !/^\s*(project|title|scheme|development|option|stage|date|type|site|location|inputs?|assumptions?|model|cash ?flow)\s*:?\s*$/i.test(c))) || ''; meta.title = String(first).trim().replace(/\s*[·•|:\-–—]\s*(returns?|summary|outputs?|results?|dashboard|overview|key figures)\s*$/i, '').trim().slice(0, 80) || String(fileName || '').replace(/\.[^.]+$/, ''); }   // a heading like “Riverside · returns” names the scheme, not its sheet
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
  meta = meta || {}; const ty = benchType(meta.type) || 'mixed', B = { ...BENCH.common, ...BENCH[ty] }, ccy = FX[meta.currency] ? meta.currency : '', fx = FX[ccy] || 0;
  // the benchmarks are Riyadh's: a model of a project elsewhere is not compared with them
  if (!meta.country && meta.currency && !['SAR', 'USD'].includes(meta.currency)) return { type: ty, bench: BENCH[ty].name, currency: ccy, fx: '', rows: [], away: `The model is in ${meta.currency} with no Saudi location: the Riyadh market benchmarks do not apply.` };   // a Zurich office in CHF is not compared with Riyadh (USD is pegged and common in Saudi models: it is converted)
  if (meta.country && meta.country !== 'SA') return { type: ty, bench: BENCH[ty].name, currency: ccy, fx: '', rows: [], away: `The model is of a project outside Saudi Arabia (${meta.place || meta.country}): the Riyadh market benchmarks do not apply.` };
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
        let v = v0; if (it.pct) { if (i.fmt && i.fmt !== 'pct' && !i.pct && !(i.fmt === 'num' && Math.abs(v) <= 1)) break;   // an amount, not a rate
          if (Math.abs(v) <= 1 && !i.pct) v *= 100; if (v >= it.lo && v <= it.hi) { pick = i; val = v; break; } continue; }
        if (v >= it.lo && v <= it.hi) { pick = i; val = v; how = ''; break; }
        if (it.total && meta[it.total] && v > it.hi) { const per = v / meta[it.total]; if (per >= it.lo && per <= it.hi) { pick = i; val = per; how = ` (total ${v.toLocaleString('en-GB')} ÷ ${meta[it.total].toLocaleString('en-GB')} sqm ${it.total === 'gfa' ? 'GFA' : 'site'})`; break; } }
      }
      if (pick) break;
    }
    if (!pick || (!it.pct && !ccy)) continue;   // money in an unknown currency is not compared
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
  netE: /cash ?flow (to|after) (equity|funding|finance)|equity (net )?cash ?flow|(?<!un)geared cash|(?<!un)levered cash|net cash ?flow to (equity|investor|developer)/i,
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
  if (!convK) { const has = Number.isFinite(o.unlevered_irr) || Number.isFinite(o.levered_irr); R.need.push(has ? 'cash flow that reproduces the reported IRR' : 'the reported IRR');
    // a comparison only between two real numbers: an IRR that cannot be computed is "not computed", never NaN, and nothing is compared with a figure that was not read
    const pr = (lab, c, e) => Number.isFinite(e) ? (Number.isFinite(c) ? `${lab} ${c.toFixed(2)}% from the cash flow vs ${(+e).toFixed(2)}% in the Summary` : `${lab} could not be computed from the cash flow (${(+e).toFixed(2)}% in the Summary)`) : '';
    const parts = [pr('unlevered', ui.comp, o.unlevered_irr), pr('levered', ei && ei.comp, o.levered_irr)].filter(Boolean);
    if (has && parts.length) { R.notes.push(parts.join('; ')); R.computable = parts.some(t => / from the cash flow vs /.test(t)); } return R; }
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
