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
console.log(`${pass} pass, ${fail} fail`); process.exit(fail ? 1 : 0);
