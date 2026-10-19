// The reader on the layouts of developers' own models it once got wrong (fixtures/models/reader_layouts.xlsx, made-up figures):
// a summary table holding only IRRs with the multiple headed "EMx"; Unlevered / Levered rows under EQUITY MULTIPLE · IRR · NET PROFIT;
// a promote tier's "Equity Multiple" column (hurdles); a sources & uses table (% · /SF · Amount); a five-year period row; a stabilised
// operating income; a METHOD column of choices; a rent roll; the template's [INVESTMENT NAME] placeholder.
const XLSX = require('../vendor/xlsx-0.18.5.full.min.js'), fs = require('fs'), E = require('../api/_lib/emcheck.js');
let pass = 0, fail = 0; const ok = (c, m) => { console.log((c ? 'PASS' : 'FAIL') + ' | ' + m); c ? pass++ : fail++ };
const wb = XLSX.read(fs.readFileSync(__dirname + '/fixtures/models/reader_layouts.xlsx'), { cellFormula: true, cellNF: true });
const r = E.parseWorkbook(wb, XLSX, 'reader_layouts.xlsx'), o = r.out, c = r.cells, I = r.inputs || [];
ok(c.levered_irr === 'Summary!P26' && Math.abs(o.levered_irr - 25.33) < 1e-9, 'levered IRR from the summary table: ' + c.levered_irr + ' ' + o.levered_irr);
ok(c.equity_multiple === 'Summary!O26' && o.equity_multiple === 1.99, 'the multiple headed "EMx", on the levered row (not the unlevered 1.56, not the 1.50x hurdle): ' + c.equity_multiple + ' ' + o.equity_multiple);
ok(c.net_profit === 'U!I13' && o.net_profit === 4360000, 'net profit from the levered row of the full returns table the summary left out: ' + c.net_profit + ' ' + o.net_profit);
ok(c.total_cost === 'Summary!K36' && o.total_cost === 8800000, 'total cost from the Amount column of Total Uses, not year 0 of a five-year row: ' + c.total_cost + ' ' + o.total_cost);
ok(!('gross_revenue' in o), 'a stabilised effective gross revenue is not taken as the scheme\'s revenue: ' + (c.gross_revenue || 'none'));
const lab = l => I.find(i => i.label === l);
ok(lab('Land Costs · Amount') && lab('Land Costs · Amount').cell === 'U!I3' && lab('Land Costs · Amount').value === 1600000, 'the land cost is "Land Costs · Amount" at U!I3, not the method "Straight-Line"');
ok(lab('Marketing · Amount') && lab('Construction Costs · Amount'), 'every line of the table is named by its row and column');
ok(!I.some(i => /^(straight-line|s-curve)$/i.test(i.label)), 'no assumption is labelled by a method chosen in its column: ' + I.filter(i => /straight|curve/i.test(i.label)).map(i => i.label).join(', '));
ok(lab('Acme Ltd · Rent/Sf/Yr') && lab('Acme Ltd · Rent/Sf/Yr').cell === 'U!H30' && lab('Acme Ltd · Rent Growth %'), 'a rent roll: each tenant\'s rent per SF and growth are their own assumptions');
ok(r.meta && r.meta.title === 'reader layouts', 'the template placeholder is not the project\'s name: "' + (r.meta && r.meta.title) + '"');
// a summary in thousands stated once at the top ("SAR '000 unless stated"): the large amounts are in thousands too, not only those under a million
{ const ws = XLSX.utils.aoa_to_sheet([['Deal summary'], [''], ["SAR '000 unless stated"], [''], ['', ''], ['Gross development value', 3013489.69], ['Total development cost', 1893865.2], ['Net profit', 1112629.07], ['Profit on cost', 0.5641]]);
  const w2 = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(w2, ws, 'Summary'); const r2 = E.parseWorkbook(w2, XLSX, 'thousands.xlsx').out;
  ok(Math.round(r2.gross_revenue) === 3013489690 && Math.round(r2.total_cost) === 1893865200 && Math.round(r2.net_profit) === 1112629070, 'every amount on a sheet headed SAR \'000 is in thousands, above a million too: ' + [r2.gross_revenue, r2.total_cost, r2.net_profit].join(', ')) }
// a 0 typed in a percentage cell shows as "-" (0.0%;(0.0%);-): it is still a percentage, so a goal seek moves it in points, not by a share of zero
{ const ws = XLSX.utils.aoa_to_sheet([['Assumptions'], ['Price adjustment vs base', 0], ['Exit cap rate', 0.08]]); ws.B2.z = '0.0%;\\(0.0%\\);\\-'; ws.B3.z = '0.00%';
  const w3 = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(w3, ws, 'Assumptions'); const I3 = E.parseWorkbook(w3, XLSX, 'zero_pct.xlsx').inputs || [];
  const z = I3.find(i => /price adjustment/i.test(i.label)); ok(z && z.pct === true, 'a zero in a % cell is a percentage input: ' + JSON.stringify(z && { pct: z.pct, text: z.text })) }
// a fund's summary: "Fund gross IRR (levered, pre-promote)" is the levered IRR (pre-promote is not a promote tier); the LP net IRR is the LPs' own figure
{ const ws = XLSX.utils.aoa_to_sheet([['Deal summary'], ['', '', '', 'Partner returns'], ['Project unlevered IRR', 0.1601, '', 'Fund gross IRR (levered, pre-promote)', 0.1522], ['Project profit (unlevered)', 1112629, '', 'LP net IRR (after all fees & promote)', 0.1316], ['', '', '', 'Kinan total profit incl. development fee', 379116]]);
  ['B3','E3','E4'].forEach(a => ws[a].z = '0.0%'); const w4 = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(w4, ws, 'Summary'); const r4 = E.parseWorkbook(w4, XLSX, 'fund.xlsx');
  ok(r4.cells.levered_irr === 'Summary!E3' && Math.abs(r4.out.levered_irr - 15.22) < 1e-6, 'the fund gross (pre-promote) IRR is the levered IRR, not the LP net IRR: ' + r4.cells.levered_irr + ' ' + r4.out.levered_irr);
  ok(r4.cells.lp_irr === 'Summary!E4' && Math.abs(r4.out.lp_irr - 13.16) < 1e-6, 'the LP net IRR is kept as the LPs\' own figure: ' + r4.cells.lp_irr);
  ok(r4.cells.net_profit === 'Summary!B4', 'net profit is the project profit, not the sponsor\'s: ' + r4.cells.net_profit) }
// a returns table whose rows say "Unlevered Project Level" and "Levered Project Level": the second is levered, though it says "project"
{ const ws = XLSX.utils.aoa_to_sheet([['Summary'], ['', 'Project Costs', 'Total Profit', 'Equity Multiple', 'IRR'], ['Unlevered Project Level', 51080000, 21816377, 1.441, 0.1689], ['Levered Project Level ', 18525313, 19966913, 2.078, 0.2348]]);
  ws.E3.z = ws.E4.z = '0.00%'; const w5 = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(w5, ws, 'Summary'); const r5 = E.parseWorkbook(w5, XLSX, 'lev.xlsx');
  ok(r5.cells.levered_irr === 'Summary!E4' && Math.abs(r5.out.levered_irr - 23.48) < 1e-6 && r5.cells.unlevered_irr === 'Summary!E3', '"Levered Project Level" is the levered row, "Unlevered Project Level" the unlevered: ' + r5.cells.levered_irr + ' ' + r5.cells.unlevered_irr) }
// an acquisition template: two rows labelled just "IRR", one under "Unlevered Return Summary", one under "Levered Return Summary"
{ const ws = XLSX.utils.aoa_to_sheet([['Returns'], [], ['Unlevered Return Summary'], ['IRR', 0.0819], ['Equity Multiple', 1.397], ['Net Gain (loss)', 7689146], ['Levered Return Summary'], ['IRR', 0.1046], ['Equity Multiple', 1.496]]);
  ws.B4.z = ws.B8.z = '0.00%'; const w6 = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(w6, ws, 'Returns'); const r6 = E.parseWorkbook(w6, XLSX, 'acq.xlsx');
  ok(r6.cells.levered_irr === 'Returns!B8' && r6.cells.unlevered_irr === 'Returns!B4' && r6.cells.equity_multiple === 'Returns!B9', 'a bare "IRR" is read by its section heading; the equity multiple is the levered side\'s: ' + [r6.cells.levered_irr, r6.cells.unlevered_irr, r6.cells.equity_multiple].join(' ')) }
console.log(`${pass} pass, ${fail} fail`); process.exit(fail ? 1 : 0);
