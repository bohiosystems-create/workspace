// Live drivers: sliders on the model's main drivers; each move recalculates the uploaded workbook with its own formulas.
// The figures shown equal the exact what-if for the same change; a position saves as a version and downloads as Excel.
import {chromium} from 'playwright';import fs from 'fs';
const sp=new globalThis.URL('./fixtures/',import.meta.url).pathname;
const b=await chromium.launch({executablePath:process.env.PW_CHROMIUM||undefined});const cx=await b.newContext({viewport:{width:1500,height:950},acceptDownloads:true});const p=await cx.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));
await cx.route('https://cdnjs.cloudflare.com/**',r=>r.fulfill({status:200,contentType:'application/javascript',body:fs.readFileSync(sp+'package/dist/xlsx.full.min.js')}));
await cx.route(/hyperformula/,r=>r.fulfill({status:200,contentType:'application/javascript',body:fs.readFileSync(sp+'package/hyperformula.full.min.js')}));
await p.goto(process.argv[2]||'http://localhost:4090/?mode=readonly');await p.evaluate(()=>localStorage.clear());await p.reload();await p.waitForTimeout(1500);
const ok=[];const t=(c,m)=>ok.push((c?'PASS':'FAIL')+' | '+m);
await p.evaluate(()=>openNewProject());await p.setInputFiles('#npFile',sp+'models/resi_uk.xlsx');await p.waitForTimeout(1200);await p.click('#npCreate');await p.waitForTimeout(3000);
await p.evaluate(()=>{toggleDock(false);try{dbgWMin(true)}catch(e){}showTab('em');emSection('drivers')});
await p.waitForFunction(()=>LDV.drv.length&&LDV.base,null,{timeout:120000});
const d=await p.evaluate(()=>LDV.drv.map(z=>({l:z.label,k:z.kind,cells:z.refs.length})));
t(d.length>=3&&d.some(z=>/Sales price/.test(z.l)&&z.k==='pct')&&d.some(z=>/Interest rate/.test(z.l)&&z.k==='pts'),'the drivers are found and typed (prices in %, rates in points): '+JSON.stringify(d));
const menu=await p.evaluate(()=>[...document.querySelectorAll('#emMenu .emm-it b')].map(e=>e.textContent).join('|'));t(/Live drivers/.test(menu),'Live drivers in the Financial modelling menu: '+menu);
const move=async(lab,v)=>{await p.evaluate(([lab,v])=>{const i=LDV.drv.findIndex(z=>z.label.includes(lab));const r=document.querySelector(`[data-lv="${i}"]`);r.value=v;r.dispatchEvent(new Event('input',{bubbles:true}))},[lab,v]);await p.waitForFunction(()=>!LDV.busy&&!LDV.pend,null,{timeout:30000});await p.waitForTimeout(150)};
await move('Sales price',-10);
let now=await p.evaluate(()=>({irr:LDV.now.levered_irr,poc:LDV.now.profit_on_cost,ms:LDV.ms,tile:document.querySelector('#lvTiles').innerText.replace(/\s+/g,' ')}));
const ref=await p.evaluate(async()=>{const r=await xcTest([{text:'sales price 10% lower'}],async()=>{});return{irr:r.metrics.find(m=>m.k==='levered_irr').value,poc:r.metrics.find(m=>m.k==='profit_on_cost').value}});
t(Math.abs(now.irr-ref.irr)<1e-6&&Math.abs(now.poc-ref.poc)<1e-6,`sales price −10% on the slider = the exact what-if: IRR ${now.irr.toFixed(4)} vs ${ref.irr.toFixed(4)}`);
t(now.ms<3000&&/14\.34%/.test(now.tile)&&/−10\.79 pts/.test(now.tile),`recalculated in ${now.ms} ms; the tiles show the new IRR and the move: `+now.tile.slice(0,160));
await move('Build cost',10);
now=await p.evaluate(()=>LDV.now.levered_irr);const ref2=await p.evaluate(async()=>{const r=await xcTest([{text:'sales price 10% lower and build cost +10%'}],async()=>{});return r.metrics.find(m=>m.k==='levered_irr').value});
t(Math.abs(now-ref2)<1e-6,`two sliders together = the exact what-if with both changes: ${now.toFixed(4)} vs ${ref2.toFixed(4)}`);
await p.screenshot({path:sp+'drivers.png',fullPage:false});
await p.click('#lvSave');await p.waitForTimeout(300);const v=await p.evaluate(()=>(MVERS[PROJ.id]||[]).slice(-1)[0]);t(v&&/Sales price .*−10%|Sales price/.test(v.label)&&v.sets.length>=2&&Math.abs(v.out.levered_irr-ref2)<1e-6,'saved as a version for Compare: '+(v&&v.label));
const [dl]=await Promise.all([p.waitForEvent('download',{timeout:30000}),p.click('#lvXl')]);t(/\.xlsx$/.test(dl.suggestedFilename()),'downloads the workbook with these values: '+dl.suggestedFilename());
await p.click('#lvReset');await p.waitForTimeout(300);t(await p.evaluate(()=>Math.abs(LDV.now.levered_irr-LDV.base.levered_irr)<1e-9&&LDV.drv.every(z=>!z.s)),'reset returns to the model as uploaded');
t(!errs.length,'no page errors '+errs.join(';'));console.log(ok.join('\n'));await b.close();
