// The sensitivity table is computed exactly on EstateMaster's cash flow: every cell against the independent reference.
import {chromium} from 'playwright';import fs from 'fs';import {createRequire} from 'module';
const require=createRequire(import.meta.url);const sp=new URL('./fixtures/',import.meta.url).pathname;const {model}=require(sp+'cfref/refmodel.cjs');
const P={land:90e6,cons:420e6,gdv:760e6,consStart:3,consM:28,rate:8,equity:180e6},xs=[-10,0,10],ys=[-10,0,10];const truth=ys.map(y=>xs.map(x=>model(P,{price:x,cost:y}).lirr)),truthD=ys.map(y=>[0,3,6].map(m=>model(P,{price:y,delay:m}).lirr));
const b=await chromium.launch({executablePath:process.env.PW_CHROMIUM||undefined});const p=await b.newPage({viewport:{width:1500,height:950}});const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.route('https://cdnjs.cloudflare.com/**',r=>r.fulfill({status:200,contentType:'application/javascript',body:fs.readFileSync(sp+'package/dist/xlsx.full.min.js')}));
await p.route('https://fonts.googleapis.com/**',r=>r.fulfill({status:200,contentType:'text/css',body:''}));
await p.goto(process.argv[2]||'http://localhost:4090/?mode=readonly');await p.evaluate(()=>localStorage.clear());await p.reload();await p.waitForTimeout(1500);
const b64=fs.readFileSync(sp+'cfref/ref_export.xlsx').toString('base64');
const r=await p.evaluate(async b64=>{await loadXLSX();await uploadExport(new File([Uint8Array.from(atob(b64),c=>c.charCodeAt(0))],'Reference Tower.xlsx'));let calls=0;window.callOne=async()=>{calls++;return{text:'{}'}};
  const g=await aiSensGrid({assumption:'Sale price',kind:'pct',shifts:[-10,0,10]},{assumption:'Construction cost',kind:'pct',shifts:[-10,0,10]},'levered_irr');
  const gd=await aiSensGrid({assumption:'Construction delay',kind:'months',shifts:[0,3,6]},{assumption:'Sale price',kind:'pct',shifts:[-10,0,10]},'levered_irr');
  let html='';try{AS.res=g;html=asHTML(g).replace(/<[^>]+>/g,' ')}catch(e){html='ERR '+e.message}const work=asCellWork(g,0,0);return{grid:g.grid,gd:gd.grid,st:g.status.flat(),calls,mode:g.mode,html:html.slice(0,300),work:work.slice(0,200)}},b64);
const ok=[];const t=(c,m)=>ok.push((c?'PASS':'FAIL')+' | '+m);
let worst=0;r.grid.forEach((row,i)=>row.forEach((v,k)=>{worst=Math.max(worst,Math.abs(v-truth[i][k]))}));t(worst<0.01&&r.mode==='exact'&&r.st.every(s=>s==='exact'),'price × construction cost: all 9 cells exact (worst gap '+worst.toFixed(5)+' pts), e.g. −10%/−10% → '+r.grid[0][0].toFixed(3)+'% vs '+truth[0][0].toFixed(3)+'%');
let w2=0;r.gd.forEach((row,i)=>row.forEach((v,k)=>{w2=Math.max(w2,Math.abs(v-truthD[i][k]))}));t(w2<0.01,'delay × sale price: all 9 cells exact (worst gap '+w2.toFixed(5)+' pts)');
t(r.calls===0,'no AI call was needed for an exact table');t(!/^ERR/.test(r.html)&&/Computed exactly/.test(r.work),'the table renders and each cell says it was computed exactly: '+r.work.slice(0,140));
t(!errs.length,'no page errors '+errs.join('; '));console.log(ok.join('\n'));console.log('t_cfsens:',ok.filter(x=>x.startsWith('PASS')).length+'/'+ok.length);await b.close();
