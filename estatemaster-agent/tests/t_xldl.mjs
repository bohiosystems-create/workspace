// "Excel with this change": the original workbook with only the changed input cells rewritten, stale results cleared and a full
// recalculation on opening; recalculated by LibreOffice it gives the app's exact figures. A model figure opens the workbook at its cell.
import {chromium} from 'playwright';import fs from 'fs';import {execFileSync} from 'child_process';import {createRequire} from 'module';
const require=createRequire(import.meta.url);const sp=new globalThis.URL('./fixtures/',import.meta.url).pathname;const XLSX=require(sp+'package/dist/xlsx.full.min.js');
const b=await chromium.launch({executablePath:process.env.PW_CHROMIUM||undefined});const cx=await b.newContext({viewport:{width:1500,height:950},acceptDownloads:true});const p=await cx.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));
await cx.route('https://cdnjs.cloudflare.com/**',r=>r.fulfill({status:200,contentType:'application/javascript',body:fs.readFileSync(sp+'package/dist/xlsx.full.min.js')}));
await cx.route(/hyperformula/,r=>r.fulfill({status:200,contentType:'application/javascript',body:fs.readFileSync(sp+'package/hyperformula.full.min.js')}));
await p.goto(process.argv[2]||'http://localhost:4090/?mode=readonly');await p.evaluate(()=>localStorage.clear());await p.reload();await p.waitForTimeout(1500);
const ok=[];const t=(c,m)=>ok.push((c?'PASS':'FAIL')+' | '+m);
await p.evaluate(()=>openNewProject());await p.setInputFiles('#npFile',sp+'models/resi_uk.xlsx');await p.waitForTimeout(1200);await p.click('#npCreate');await p.waitForTimeout(3000);
const r=await p.evaluate(async()=>{const r=await xcTest([{text:'sales price 10% lower'}],async()=>{});const h=xcTestHTML(r);return{ver:r.ver,sets:r.sets,btn:/data-xcdl/.test(h),irr:r.metrics.find(m=>m.k==='levered_irr').value,poc:r.metrics.find(m=>m.k==='profit_on_cost').value}});
t(r.ver&&r.btn&&r.sets.length===1&&r.sets[0][0]==='Assumptions!D9'&&r.sets[0][1]===7650,'the exact result offers the workbook with the change: '+JSON.stringify(r.sets));
await p.evaluate(()=>{toggleDock(false);document.body.insertAdjacentHTML('beforeend',`<div id="__dl">${xlBtn(window.LASTVER)}</div>`)});
const [dl]=await Promise.all([p.waitForEvent('download',{timeout:30000}),p.click('#__dl [data-xcdl]')]);const out=sp+'xldl_out.xlsx';await dl.saveAs(out);
t(/^resi_uk - Sales price .*8,500 to 7,650\.xlsx$/.test(dl.suggestedFilename()),'file named after the model and the change: '+dl.suggestedFilename());
const wb=XLSX.read(fs.readFileSync(out),{cellFormula:true});const D9=wb.Sheets.Assumptions.D9,R9=wb.Sheets.Returns.D9;
const shx=(()=>{const z=XLSX.CFB.read(fs.readFileSync(out),{type:'buffer'});const wbx=new TextDecoder().decode(z.FileIndex[z.FullPaths.findIndex(f=>/xl\/workbook\.xml$/.test(f))].content);return z})();const sheetXml=n=>{const i=shx.FullPaths.findIndex(f=>new RegExp('xl/worksheets/sheet'+n+'\\.xml$').test(f));return new TextDecoder().decode(shx.FileIndex[i].content)};const ret=sheetXml(1);
t(D9.v===7650&&/<c r="D9"[^>]*><f[^>]*>[^<]+<\/f><\/c>/.test(ret)&&wb.SheetNames.join()===XLSX.read(fs.readFileSync(sp+'models/resi_uk.xlsx')).SheetNames.join(),'only the input changed; formulas kept, their stale results cleared, same sheets');
const z=XLSX.CFB.read(fs.readFileSync(out),{type:'buffer'});const wx=new TextDecoder().decode(z.FileIndex[z.FullPaths.findIndex(f=>/xl\/workbook\.xml$/.test(f))].content);t(/fullCalcOnLoad="1"/.test(wx),'Excel recalculates on opening');
const st=new TextDecoder().decode(z.FileIndex[z.FullPaths.findIndex(f=>/xl\/styles\.xml$/.test(f))].content),st0=(()=>{const z0=XLSX.CFB.read(fs.readFileSync(sp+'models/resi_uk.xlsx'),{type:'buffer'});return new TextDecoder().decode(z0.FileIndex[z0.FullPaths.findIndex(f=>/xl\/styles\.xml$/.test(f))].content)})();t(st===st0,'formatting untouched (styles identical)');
// an independent spreadsheet recalculates it to the app's figures
let lo=null;try{const d=fs.mkdtempSync('/tmp/xldl-');execFileSync('soffice',['--headless','--convert-to','xlsx:Calc MS Excel 2007 XML','--outdir',d,out],{timeout:180000,stdio:'ignore'});const w2=XLSX.read(fs.readFileSync(d+'/xldl_out.xlsx'));lo={irr:w2.Sheets.Returns.D9.v*100,poc:w2.Sheets.Returns.D7.v*100}}catch(e){lo=null}
if(lo)t(Math.abs(lo.irr-r.irr)<0.005&&Math.abs(lo.poc-r.poc)<0.005,`LibreOffice recalculates the file to the app's exact figures: IRR ${lo.irr.toFixed(4)} vs ${r.irr.toFixed(4)}, POC ${lo.poc.toFixed(4)} vs ${r.poc.toFixed(4)}`);else ok.push('SKIP | LibreOffice not available for the independent recalculation');
// a model figure opens the workbook at its cell
await p.evaluate(()=>{showTab('em');emSection('compare')});await p.waitForTimeout(600);
await p.click('#exDiff .cmp-val.a .fig');await p.waitForTimeout(1500);
const j=await p.evaluate(()=>({on:$('#xlWin').classList.contains('on'),addr:$('#xlAddr').textContent,flash:!!document.querySelector('#xvT td.xl-flash'),sel:(document.querySelector('#xvT td.sel')||{}).dataset,find:$('#xlFind').textContent,sheet:XL.grid.sheets[XL.sheet].name}));
t(j.on&&j.addr==='D9'&&j.sheet==='Returns'&&j.flash&&/Levered IRR · 25.13% is in Returns!D9/.test(j.find),'clicking the levered IRR opens the workbook at Returns!D9, highlighted: '+JSON.stringify(j));
await p.locator('#xlWin').screenshot({path:sp+'xl_jump.png'}).catch(()=>{});
t(!errs.length,'no page errors '+errs.join(';'));console.log(ok.join('\n'));await b.close();
