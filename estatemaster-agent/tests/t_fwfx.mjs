import {chromium} from 'playwright';import fs from 'fs';
const sp=new globalThis.URL('./fixtures/',import.meta.url).pathname;
const b=await chromium.launch({executablePath:process.env.PW_CHROMIUM||undefined});const p=await b.newPage({viewport:{width:1300,height:900}});const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.route('https://cdnjs.cloudflare.com/**',r=>r.fulfill({status:200,contentType:'application/javascript',body:fs.readFileSync(sp+'package/dist/xlsx.full.min.js')}));
await p.goto('http://localhost:4090/?mode=readonly');await p.waitForTimeout(2500);
let pass=0,fail=0;const ok=(c,m)=>{c?pass++:fail++;console.log(c?'PASS':'FAIL',m)};
await p.evaluate(async()=>{await loadXLSX();const wb=XLSX.utils.book_new();
  const ws=XLSX.utils.aoa_to_sheet([['Summary'],['Equity IRR',null,'%',26.8],['Net Development Profit',null,'SAR',130e6],['Total Development Cost',null,'SAR',557e6],['Total Revenue',null,'SAR',687e6]]);ws['D3']={t:'n',v:130e6,f:'D5-D4'};XLSX.utils.book_append_sheet(wb,ws,'Summary');
  const wi=XLSX.utils.aoa_to_sheet([['MAIN INPUTS'],['Sale price',13500,'SAR/sqm'],['GFA',40000,'sqm']]);XLSX.utils.book_append_sheet(wb,wi,'Input');
  showTab('em');emSection('upload');await uploadExport(new File([XLSX.write(wb,{type:'array',bookType:'xlsx'})],'model.xlsx'))});
await p.waitForTimeout(800);
// a figure read from the export, with its cell: the window shows the Excel formula and the cells it uses
await p.evaluate(()=>{const x=latestExport();toggleDock(true);addMsg('agent',`Net profit ${figq('em','SAR 130M',`EstateMaster’s own figure: export ${x.id} (model.xlsx), cell ${x.cells.net_profit}. Not calculated by the agent.`)} and sale price ${figq('em','13,500',`EstateMaster input “Sale price” on sheet Input of export ${x.id} (model.xlsx), cell Input!B2. Read from EstateMaster, not calculated by the agent.`)}`)});
await p.locator('#msgs .fig').first().click();await p.waitForTimeout(600);
const fw=await p.locator('#figWin .fw-xl').textContent();
ok(/Excel formula/.test(fw)&&/=D5-D4/.test(fw),'figure window shows the real Excel formula: '+fw.replace(/\s+/g,' ').slice(0,90));
ok(/D5/.test(fw)&&/687/.test(fw)&&/D4/.test(fw)&&/557/.test(fw),'and the referenced cells with their values');
await p.locator('#figWin').screenshot({path:sp+'fw_formula.png'});
await p.click('#fwClose');await p.locator('#msgs .fig').nth(1).click();await p.waitForTimeout(600);
ok(/Typed value, no formula/.test(await p.locator('#figWin .fw-xl').textContent()),'an input cell is reported as a typed value');
await p.click('#fwClose');
// bullets in boxes; no boxed ×
await p.evaluate(()=>addMsg('agent',mdLite('These are the weak points:\n- **Contingency is thin.** 5% only.\n• Finance inputs unclear.\n· Export missing pieces.\nAsk me more.')));await p.waitForTimeout(100);
ok(await p.locator('#msgs .msg:last-child .bul').count()===3,'each bullet in its own rounded box');
ok(await p.evaluate(()=>['#chatClose','#fwClose'].every(s=>{const e=$(s);const c=getComputedStyle(e);return c.borderTopWidth==='0px'&&c.backgroundColor==='rgba(0, 0, 0, 0)'})),'× buttons have no box');
await p.locator('#msgs .msg:last-child').screenshot({path:sp+'bullets.png'});
console.log('errors',errs);console.log(`${pass} pass, ${fail} fail`);await b.close();
