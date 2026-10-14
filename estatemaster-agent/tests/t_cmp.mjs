import {chromium} from 'playwright';import fs from 'fs';
const sp=new globalThis.URL('./fixtures/',import.meta.url).pathname;
const b=await chromium.launch({executablePath:process.env.PW_CHROMIUM||undefined});const p=await b.newPage({viewport:{width:1300,height:900}});const errs=[];p.on('pageerror',e=>errs.push(e.stack.split('\n').slice(0,3).join(' | ')));
await p.route('https://cdnjs.cloudflare.com/**',r=>r.fulfill({status:200,contentType:'application/javascript',body:fs.readFileSync(sp+'package/dist/xlsx.full.min.js')}));
await p.goto('http://localhost:4090/?mode=readonly');await p.waitForTimeout(2500);
let pass=0,fail=0;const ok=(c,m)=>{c?pass++:fail++;console.log(c?'PASS':'FAIL',m)};
// a second export of this model with inputs, and another model
await p.evaluate(async()=>{await loadXLSX();const mk=(irr,poc,price,name)=>{const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([['Summary'],['Equity IRR',null,'%',irr],['Development Margin (on cost)',null,'%',poc],['Net Development Profit',null,'SAR',130e6],['Total Development Cost',null,'SAR',557e6],['Total Revenue',null,'SAR',687e6],['Peak Debt',null,'SAR',136e6]]),'Summary');XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([['MAIN INPUTS'],['Sale price',price,'SAR/sqm'],['Construction cost',4200,'SAR/sqm'],['Contingency',0.05,'%']]),'Input');return new File([XLSX.write(wb,{type:'array',bookType:'xlsx'})],name)};
  await uploadExport(mk(26.8,23.3,13500,'v1.xlsx'));await uploadExport(mk(24.1,21.0,12800,'v2.xlsx'));showTab('em');emSection('compare');renderEMTab()});
await p.waitForTimeout(800);
ok(await p.locator('#exDiff .cmp-row').count()>=6,'mirrored rows for each output');
ok(await p.locator('#exDiff .cmp-bar i.win').count()>=1,'better side highlighted');
ok(/has the (higher|lower) /.test(await p.locator('#exDiff .cmp-verdict').textContent()),'verdict line');
const dif=await p.locator('#exDiff .cmp-t tr').count();ok(dif>=2&&/Sale price/.test(await p.locator('#exDiff .cmp-t').textContent()),'assumptions that differ listed: '+(dif-1));
ok(await p.locator('#exA optgroup').count()>=1,'picker grouped by model');
await p.locator('#exDiff .cmp-val .fig').first().click();await p.waitForTimeout(200);ok(await p.evaluate(()=>document.querySelector('#figWin').classList.contains('on')),'figure click opens the source');await p.click('#fwClose');
await p.locator('#exDiff').screenshot({path:sp+'compare.png'});
// typed delete confirmation
await p.evaluate(()=>{PROJECTS.t2={...PROJECTS[PROJ.id],id:'t2',name:'Test Tower',xl:undefined};renderProjRail();document.querySelector('#projRail').classList.add('open')});await p.waitForTimeout(200);
await p.locator('#projRail [data-proj="t2"]').click({button:'right'});await p.click('#prMenu [data-prm="delete"]');await p.waitForTimeout(200);
ok(await p.evaluate(()=>document.querySelector('#delModal').classList.contains('on')&&document.querySelector('#delYes').disabled),'modal opens, Delete disabled');
await p.fill('#delInput','wrong');ok(await p.evaluate(()=>document.querySelector('#delYes').disabled),'wrong name keeps it disabled');
await p.fill('#delInput','test tower');ok(!(await p.evaluate(()=>document.querySelector('#delYes').disabled)),'typing the name enables Delete');
await p.click('#delYes');await p.waitForTimeout(400);ok(await p.evaluate(()=>!PROJECTS.t2),'deleted after typed confirmation');
console.log('errors',errs);console.log(`${pass} pass, ${fail} fail`);await b.close();
