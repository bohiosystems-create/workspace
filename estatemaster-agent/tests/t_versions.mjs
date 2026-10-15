// Every change tested on an uploaded model is recorded as a version; Compare lists them in a dropdown and shows any of them
// side by side (the first picked is the reference), with the assumptions each version changed.
import {chromium} from 'playwright';import fs from 'fs';
const sp=new globalThis.URL('./fixtures/',import.meta.url).pathname;
const b=await chromium.launch({executablePath:process.env.PW_CHROMIUM||undefined});const cx=await b.newContext({viewport:{width:1500,height:950}});const p=await cx.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));
await cx.route('https://cdnjs.cloudflare.com/**',r=>r.fulfill({status:200,contentType:'application/javascript',body:fs.readFileSync(sp+'package/dist/xlsx.full.min.js')}));
await cx.route(/hyperformula/,r=>r.fulfill({status:200,contentType:'application/javascript',body:fs.readFileSync(sp+'package/hyperformula.full.min.js')}));
await p.goto(process.argv[2]||'http://localhost:4090/?mode=readonly');await p.evaluate(()=>localStorage.clear());await p.reload();await p.waitForTimeout(1500);
const ok=[];const t=(c,m)=>ok.push((c?'PASS':'FAIL')+' | '+m);
await p.evaluate(()=>openNewProject());await p.setInputFiles('#npFile',sp+'models/resi_uk.xlsx');await p.waitForTimeout(1200);await p.click('#npCreate');await p.waitForTimeout(3000);
const r=await p.evaluate(async()=>{await xcTest([{text:'sales price 10% lower'}],async()=>{});await xcTest([{text:'build cost +10%'}],async()=>{});await xcTest([{text:'sales price 10% lower'}],async()=>{});return(MVERS[PROJ.id]||[]).map(v=>({id:v.id,base:!!v.base,label:v.label,irr:v.out.levered_irr}))});
t(r.length===3&&r[0].base&&/Sales price/.test(r[1].label)&&/7,650/.test(r[1].label)&&/Build cost/.test(r[2].label),'the workbook as uploaded is version 1, each new tested change a new version (a repeat is not duplicated): '+JSON.stringify(r).slice(0,300));
t(r[1].irr<r[0].irr&&r[2].irr<r[0].irr,'each version keeps its recalculated outputs');
await p.evaluate(()=>{toggleDock(false);showTab('em');emSection('compare')});await p.waitForTimeout(500);
let v=await p.evaluate(()=>({n:document.querySelectorAll('#mvPick [data-mv]').length,checked:document.querySelectorAll('#mvPick [data-mv]:checked').length,cols:document.querySelectorAll('#mvTable thead th').length,rows:[...document.querySelectorAll('#mvTable tbody tr')].map(r=>r.innerText.replace(/\s+/g,' ').slice(0,120))}));
t(v.n>=3&&v.checked===3&&v.cols===4,'the dropdown lists the versions; the uploaded workbook and the tested versions are shown side by side: '+JSON.stringify({n:v.n,checked:v.checked,cols:v.cols}));
t(v.rows.some(x=>/^Levered IRR/.test(x)&&/pts/.test(x))&&v.rows.some(x=>/Assumptions changed/i.test(x))&&v.rows.some(x=>/^Sales price/.test(x)&&/7,650/.test(x)&&/as uploaded/.test(x)),'outputs with differences against the reference, then the assumptions each version changed: '+v.rows.join(' || ').slice(0,400));
// untick one: two columns left; tick another model in
await p.evaluate(()=>{$('#mvPick details').open=true});const ids=await p.evaluate(()=>[...document.querySelectorAll('#mvPick [data-mv]')].map(e=>e.dataset.mv));
await p.click(`#mvPick [data-mv="${ids.find(i=>/V2$/.test(i))}"]`);await p.waitForTimeout(300);
v=await p.evaluate(()=>document.querySelectorAll('#mvTable thead th').length);t(v===3,'unticking a version removes its column');
const oth=ids.find(i=>i.startsWith('X:'));if(oth){await p.click(`#mvPick [data-mv="${oth}"]`);await p.waitForTimeout(300);v=await p.evaluate(()=>document.querySelector('#mvTable thead').innerText);t(/Al Narjis|Narjis/i.test(v),'another model can be added to the comparison: '+v.replace(/\s+/g,' ').slice(0,160))}
// two models in different currencies: each keeps its own; money is not subtracted across currencies
const cc=await p.evaluate(()=>{const t=$('#exDiff').innerText;return{gbp:/GBP 18\.70M/.test(t),sar:/SAR 129\.67M/.test(t),wrong:/GBP 129\.67M/.test(t),vs:/GBP vs SAR|SAR vs GBP/.test(t)}});
t(cc.gbp&&cc.sar&&!cc.wrong&&cc.vs,'comparing a GBP model with a SAR model: each in its own currency, no cross-currency difference: '+JSON.stringify(cc));
const eqm=await p.evaluate(()=>{const v=(MVERS[PROJ.id]||[]).find(z=>!z.base);return v&&v.out.equity_multiple});t(eqm===undefined,'an output the recalculation did not produce is not copied from the uploaded workbook');
// kept across a reload
v=await p.evaluate(()=>{saveMem();return 1});await p.reload();await p.waitForTimeout(2500);v=await p.evaluate(()=>{const L=Object.values(MVERS).flat();return L.length});t(v>=3,'versions are kept after a reload: '+v);
await p.evaluate(()=>{showTab('em');emSection('compare')});await p.waitForTimeout(400);await p.locator('#p-em .emsec.on').screenshot({path:sp+'versions.png'});
t(!errs.length,'no page errors '+errs.join(';'));console.log(ok.join('\n'));await b.close();
