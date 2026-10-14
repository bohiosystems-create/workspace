import {chromium} from 'playwright';import fs from 'fs';
const sp=new URL('./fixtures/',import.meta.url).pathname;
const URL=process.argv[2]||'http://localhost:4090/?mode=readonly',TAG=process.argv[3]||'ro';
const b=await chromium.launch({executablePath:process.env.PW_CHROMIUM||undefined});const p=await b.newPage({viewport:{width:1400,height:950}});const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.route('https://cdnjs.cloudflare.com/**',r=>r.fulfill({status:200,contentType:'application/javascript',body:fs.readFileSync(sp+'package/dist/xlsx.full.min.js')}));
await p.addInitScript(()=>{setInterval(()=>{const w=document.querySelector('#dispWin');if(w)w.classList.remove('on')},250)});
await p.goto(URL);await p.waitForTimeout(2500);
let pass=0,fail=0;const ok=(c,m)=>{c?pass++:fail++;console.log(c?'PASS':'FAIL',m)};
// 1. the demo model: a reproduction is shown with a live cash flow
await p.evaluate(()=>{showTab('em');try{emSection('upload')}catch(e){}renderEMTab()});await p.waitForTimeout(800);
ok(await p.locator('#exWb .xl-prev').count()===1&&/reproduction/.test(await p.locator('#exWb').textContent()),'demo model: the reproduction preview is shown');
await p.click('#exWb .xl-prev');await p.waitForTimeout(500);
const tabs=await p.locator('#xlTabs .xl-tab').allTextContents();ok(tabs.includes('Summary')&&tabs.includes('Cash flow'),'sheets: '+tabs.join(', '));
await p.click('[data-xlsheet="'+tabs.indexOf('Cash flow')+'"]');await p.waitForTimeout(300);
const f=await p.evaluate(()=>{const td=[...document.querySelectorAll('#xvT td.f')];return td.length});ok(f>=10,'cash flow sheet carries live formulas: '+f);
await p.evaluate(()=>{const td=document.querySelector('#xvT td[data-a="C4"]');td&&td.click()});ok(/^=C3\+C2$/.test(await p.locator('#xlFx').textContent()),'clicking a net cash flow cell shows its formula: '+await p.locator('#xlFx').textContent());
await p.screenshot({path:sp+`wbsynth_${TAG}.png`});await p.keyboard.press('Escape');
// 2. an export uploaded without a stored workbook (as before the feature): reproduction with its inputs and original cells
await p.evaluate(()=>{const x=latestExport();x.inputs=[{label:'Land Purchase Price',value:90000000,text:'90,000,000',unit:'SAR',section:'LAND',sheet:'Input',cell:'Input!C5'},{label:'Construction Costs',value:95000000,text:'95,000,000',unit:'SAR',section:'COSTS',sheet:'Input',cell:'Input!C9'}];x.src='file';x.file='old.xlsx';delete x.wb;x.cells={levered_irr:'Summary!D2'};renderEMTab()});await p.waitForTimeout(800);
const t2=await p.locator('#exWb').textContent();ok(/could not be fetched from the exports folder|uploaded before the workbook was kept/.test(t2)&&/Upload the workbook/.test(t2),'older upload: explains and offers the upload');
await p.click('#exWb .xl-prev');await p.waitForTimeout(400);const tabs2=await p.locator('#xlTabs .xl-tab').allTextContents();ok(tabs2.includes('Input'),'its Input sheet lists every assumption');
await p.click('[data-xlsheet="'+tabs2.indexOf('Input')+'"]');await p.waitForTimeout(300);ok(/Input!C5/.test(await p.locator('#xvT').textContent()),'with the original cell of each assumption');
await p.click('[data-xlsheet="0"]');await p.waitForTimeout(300);ok(await p.locator('#xvT td.f').count()>=1,'the Summary sheet carries check formulas');await p.keyboard.press('Escape');
// 3. a model created with + keeps its real workbook
await p.evaluate(async()=>{await loadXLSX();const wb=XLSX.utils.book_new();const ws=XLSX.utils.aoa_to_sheet([['Summary'],['Equity IRR',null,'%',0.2],['Net Development Profit',null,'SAR',90e6],['Total Development Cost',null,'SAR',400e6],['Total Revenue',null,'SAR',490e6]]);ws['D3']={t:'n',v:90e6,f:'D5-D4'};XLSX.utils.book_append_sheet(wb,ws,'Summary');
  const pr=await readExportFile(new File([XLSX.write(wb,{type:'array',bookType:'xlsx'})],'plus.xlsx'));newProjectFromExport(pr,'plus.xlsx','Plus Model');showTab('em');try{emSection('upload')}catch(e){}renderEMTab()});
await p.waitForTimeout(1200);const t3=await p.locator('#exWb').textContent();ok(/plus\.xlsx/.test(t3)&&!/reproduction/.test(t3)&&/1 formula/.test(t3),'model created with +: the real workbook is kept and shown');
console.log('errors',errs);console.log(`${pass} pass, ${fail} fail`);await b.close();
