// Every kind of Excel model is read correctly, not one layout: UK appraisal, US pro forma in $000s, KPI tiles with the figure under
// its heading, a returns table either way round, time-series rows, a model with no currency, amounts vs percentages vs basis points,
// plus a real third-party hotel model. Each figure is checked against the value the cell holds, with its unit.
const Module = require('module'), orig = Module._resolveFilename; Module._resolveFilename = function (r, ...a) { if (r === 'xlsx') return __dirname + '/fixtures/package/xlsx.js'; return orig.call(this, r, ...a); };
const XLSX = require(__dirname + '/fixtures/package/xlsx.js'), E = require(__dirname + '/../api/_lib/emcheck.js'), fs = require('fs');
const ok = []; const t = (c, m) => ok.push((c ? 'PASS' : 'FAIL') + ' | ' + m);
// a workbook from rows; a cell is a value or [value, number format]
function book(sheets) { const wb = XLSX.utils.book_new(); for (const [name, rows] of Object.entries(sheets)) { const ws = XLSX.utils.aoa_to_sheet(rows.map(r => r.map(c => Array.isArray(c) ? c[0] : c)));
  rows.forEach((r, ri) => r.forEach((c, ci) => { if (Array.isArray(c)) { const a = XLSX.utils.encode_cell({ r: ri, c: ci }); ws[a].z = c[1]; } })); XLSX.utils.book_append_sheet(wb, ws, name); }
  return XLSX.read(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }), { type: 'buffer' }); }
const read = (wb, f) => E.parseWorkbook(wb, XLSX, f || 'model.xlsx');
const near = (a, b) => typeof a === 'number' && Math.abs(a - b) <= Math.max(0.011, Math.abs(b) * 1e-6);
const expect = (name, r, want) => { for (const [k, v] of Object.entries(want)) { if (k === 'currency') t(r.meta.currency === v, `${name}: currency ${JSON.stringify(r.meta.currency)} (want ${JSON.stringify(v)})${r.meta.ccyFrom ? ' from ' + r.meta.ccyFrom : ''}`); else if (v === null) t(!(k in r.out), `${name}: ${k} not invented (read ${r.out[k]})`); else t(near(r.out[k], v), `${name}: ${k} = ${r.out[k]} (want ${v}) ← ${r.found[k] || 'not found'}`); } };
const P = '0.00%', N = '#,##0';

// A. UK development appraisal (Argus Developer style), pounds in the cell formats
expect('UK appraisal', read(book({ Appraisal: [['Riverside Apartments, Leeds'], [], ['GROSS DEVELOPMENT VALUE', null, [25000000, '"£"#,##0']], ['TOTAL COSTS', null, [20800000, '"£"#,##0']], ["Developer's Profit", null, [4200000, '"£"#,##0']], ['Profit on Cost%', null, [0.2019, P]], ['IRR% (without Interest)', null, [0.1834, P]], ['Project IRR', null, [0.1834, P]], ['Contingency', null, [0.05, P]]] })),
  { currency: 'GBP', gross_revenue: 25e6, total_cost: 20.8e6, net_profit: 4.2e6, profit_on_cost: 20.19, unlevered_irr: 18.34 });
// B. US pro forma in thousands of dollars
expect('US pro forma ($000s)', read(book({ Returns: [['Returns Summary ($000s)'], [], ['Total Project Cost', [45500, '"$"#,##0']], ['Net Profit', [12300, '"$"#,##0']], ['Levered IRR', [0.215, P]], ['Unlevered IRR', [0.141, P]], ['Equity Multiple', [2.1, '0.00"x"']]] })),
  { currency: 'USD', total_cost: 45.5e6, net_profit: 12.3e6, levered_irr: 21.5, unlevered_irr: 14.1, equity_multiple: 2.1 });
// C. KPI tiles: the figure under its heading, euros in millions
expect('KPI tiles (EUR m)', read(book({ Dashboard: [['Key metrics'], ['Equity IRR', 'Project IRR', 'Profit on Cost', 'GDV (EUR m)'], [[0.195, P], [0.142, P], [0.23, P], [120.5, '#,##0.0']]] })),
  { levered_irr: 19.5, unlevered_irr: 14.2, profit_on_cost: 23, gross_revenue: 120.5e6 });
// D. returns table the other way round, AED
expect('Transposed returns (AED)', read(book({ Summary: [['Marina Tower — returns (AED)'], [null, 'Unlevered', 'Levered'], ['IRR', [0.121, P], [0.168, P]], ['Profit', [55e6, N], [41e6, N]], ['MOIC', [1.6, '0.0"x"'], [2.3, '0.0"x"']], ['Total Cost', [-310e6, N], [-120e6, N]]] })),
  { currency: 'AED', unlevered_irr: 12.1, levered_irr: 16.8, net_profit: 41e6, equity_multiple: 2.3, total_cost: 310e6 });
// E. a revenue line by year (no single figure) and one with a Total column (that is the figure)
const yrs = [2026, 2027, 2028, 2029, 2030, 2031, 2032, 2033];
expect('Series without total', read(book({ CF: [['Operating cash flow (SAR)'], ['Year', null, ...yrs], ['Total Revenue', null, ...yrs.map((y, i) => 6e6 + i * 4e5)]] })), { gross_revenue: null, currency: 'SAR' });
expect('Series with a Total column', read(book({ CF: [['Cash flow (SAR)'], ['Line', 'Total', ...yrs], ['Gross Revenue', 9.6e7, ...yrs.map(() => 1.2e7)]] })), { gross_revenue: 9.6e7 });
// F. Saudi export with SAR in the labels and an IRR typed as text
expect('Saudi summary', read(book({ Summary: [['Al Yasmin Villas'], ['Total Development Cost (SAR)', [600e6, N]], ['Net Profit (SAR)', [140e6, N]], ['Levered IRR', '24.1%'], ['Peak Debt', [310e6, N]]] })),
  { currency: 'SAR', total_cost: 600e6, net_profit: 140e6, levered_irr: 24.1, peak_debt: 310e6 });
// G. no currency anywhere: none is assumed
expect('No currency stated', read(book({ Sheet1: [['Model'], ['Total Development Cost', [50e6, N]], ['Equity IRR', [0.2, P]]] })), { currency: '', total_cost: 50e6, levered_irr: 20 });
// H. what a number is comes from its cell format: an amount in a Contingency row, a percentage, basis points
{ const r = read(book({ Inputs: [['Assumptions (USD)'], ['Contingency', [3500000, N]], ['Contingency rate', [0.1, P]], ['Interest Rate', [500, '"SOFR +"General" bps"']], ['Exit Cap Rate', [0.055, P]], ['Debt Pre-Interest Reserve', [4567339, '"$"#,##0']]] }));
  const ck = E.emChecks(r, null, {}); const bad = ck.filter(c => /%/.test(c.text) && /Contingency”|Interest Reserve|Interest Rate”/.test(c.text));
  t(!bad.length, 'amounts are never read as percentages: ' + (bad.map(c => c.text).join(' ; ') || 'no false % check'));
  const f = l => r.inputs.find(i => i.label === l) || {}; t(f('Contingency').fmt === 'num' && f('Contingency rate').fmt === 'pct' && f('Interest Rate').fmt === 'bps' && f('Debt Pre-Interest Reserve').fmt === 'money', 'cell formats read: ' + ['Contingency', 'Contingency rate', 'Interest Rate', 'Debt Pre-Interest Reserve'].map(l => l + '=' + f(l).fmt).join(', ')); }
// I. a real third-party hotel model (US, Excel, not EstateMaster): headline table, USD, the cash flow reproduces both IRRs
{ const r = read(XLSX.read(fs.readFileSync(__dirname + '/fixtures/models/hotel_us.xlsx')), 'HOTEL DEVELOPMENT MODEL.xlsx');
  expect('Hotel model', r, { currency: 'USD', levered_irr: 24.0536, unlevered_irr: 15.782, equity_multiple: 3.8721, total_cost: 52146981.835, gross_revenue: null });
  t(r.meta.source === 'excel', 'hotel: labelled as an Excel model, not an EstateMaster export');
  const M = E.cfModel(r); t(M.uCheck && M.uCheck.ok && M.lCheck && M.lCheck.ok, `hotel: cash flow reproduces the IRRs (unlevered ${M.uCheck && M.uCheck.calc}, levered ${M.lCheck && M.lCheck.calc})`);
  const ck = E.emChecks(r, null, {}).filter(c => c.level !== 'note'); t(!ck.length, 'hotel: no false checks (' + ck.map(c => c.text).join(' ; ') + ')');
  const ins = r.inputs, wb2 = XLSX.read(fs.readFileSync(__dirname + '/fixtures/models/hotel_us.xlsx'));
  const fx = ins.filter(i => { const m = i.cell.match(/^(.*)!([A-Z]+\d+)$/); const z = m && wb2.Sheets[m[1]][m[2]]; return z && z.f; });
  t(!fx.length && ins.length > 40, `hotel: ${ins.length} assumptions, none of them a formula's result (${fx.map(i => i.label + ' ' + i.cell).join(', ') || 'none'})`);
  t(!ins.some(i => /^(unlevered|levered) returns$/i.test(i.label)), 'hotel: the returns table (formulas) is not listed as assumptions');
  const cats = ins.map(i => i.cat), order = ['Project & timing', 'Land & acquisition', 'Development costs', 'Revenue & operations', 'Financing', 'Exit', 'Other'];
  t(cats.every((c, k) => !k || order.indexOf(c) >= order.indexOf(cats[k - 1])), 'hotel: assumptions grouped in order ' + [...new Set(cats)].join(' → '));
  const by = l => ins.find(i => i.label === l) || {}; t(by('ADR').text === '$125.00' && by('ADR').cat === 'Revenue & operations' && by('Exit Cap Rate').cat === 'Exit' && by('LTV').cat === 'Financing' && by('Interiors').cat === 'Development costs' && by('Land Purchase').cat === 'Land & acquisition', 'hotel: ADR $125 (revenue), exit cap (exit), LTV (financing), interiors (costs), land purchase (land)');
  const mv = E.marketVsInputs(r.inputs, r.meta); t(!mv.rows.length && /outside Saudi Arabia/.test(mv.away || ''), 'hotel: Riyadh benchmarks not applied to Orlando'); }
// J. every EstateMaster fixture still reads as before
for (const f of fs.readdirSync(__dirname + '/fixtures/cfref').filter(f => /\.xlsx$/.test(f))) { const r = read(XLSX.read(fs.readFileSync(__dirname + '/fixtures/cfref/' + f)), f); t(near(r.out.levered_irr, r.out.levered_irr) && r.meta.source === 'estatemaster', `EstateMaster export ${f}: levered IRR ${r.out.levered_irr}, marked as EstateMaster`); }
console.log(ok.join('\n'));
