import {chromium} from 'playwright';import fs from 'fs';
const sp=new globalThis.URL('./fixtures/',import.meta.url).pathname;
const b=await chromium.launch({executablePath:process.env.PW_CHROMIUM||undefined});const p=await b.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.route('https://cdnjs.cloudflare.com/**',r=>r.fulfill({status:200,contentType:'application/javascript',body:fs.readFileSync(sp+'package/dist/xlsx.full.min.js')}));
await p.goto('http://localhost:4090/?mode=readonly');await p.waitForTimeout(2000);
let pass=0,fail=0;const ok=(c,m)=>{c?pass++:fail++;console.log(c?'PASS':'FAIL',m)};
const out=await p.evaluate(async()=>{await loadXLSX();const wb=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([
    ['Summary'],
    ['Target Equity IRR',null,'%',0.18],            // a target, not the result: must not be read as the IRR
    ['Total cost per sqm GFA',null,'SAR',9200],        // a rate, not the total
    ['Total sales area',null,'sqm',41000],             // an area, not revenue
    ['Equity IRR',null,'%',0.1375],                    // stored as a fraction by Excel
    ['Unlevered IRR',null,'%',0.1297],
    ['Development Margin (on cost)',null,'%',0.2326],
    ['Net Development Profit',null,'SAR',129500000],
    ['Total Development Cost',null,'SAR',556800000],
    ['Total Revenue',null,'SAR',686300000],
    ['Peak Debt',null,'SAR',136000000],
    ['Equity Multiple',null,'x',1.62]]),'Summary');
  return parseExport(wb,'m.xlsx').out});
ok(Math.abs(out.levered_irr-13.75)<1e-6,'levered IRR read from the result row, not the target row: '+out.levered_irr);
ok(Math.abs(out.unlevered_irr-12.97)<1e-6,'unlevered IRR: '+out.unlevered_irr);
ok(Math.abs(out.profit_on_cost-23.26)<1e-6,'profit on cost as %: '+out.profit_on_cost);
ok(out.total_cost===556800000,'total cost is the total, not the per-sqm rate: '+out.total_cost);
ok(out.gross_revenue===686300000,'revenue is revenue, not the sales area: '+out.gross_revenue);
ok(out.net_profit===129500000&&out.peak_debt===136000000&&out.equity_multiple===1.62,'net profit, peak debt, multiple');
console.log(JSON.stringify(out));console.log('errors',errs);console.log(`${pass} pass, ${fail} fail`);await b.close();
