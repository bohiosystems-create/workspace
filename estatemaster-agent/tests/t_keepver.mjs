// Versions kept in the company database (Jadwa): before a change to a model's structure the model as it is is saved there as a
// write-once version (the store refuses to replace or delete one; bohio-demos/_shared/store/test.js checks the server). What-ifs are not
// saved, unless the user makes one the model. A version that cannot be saved stops the change; a viewer cannot change a model; with no
// database connected the version stays on the device and the answer says so. KINAN changes no model's structure.
import {chromium} from 'playwright';import fs from 'fs';
const F=new globalThis.URL('./fixtures/models/',import.meta.url).pathname;const base=process.argv[2]||'http://localhost:4090/?mode=readonly';
const b=await chromium.launch({executablePath:process.env.PW_CHROMIUM||undefined}),ctx=await b.newContext({viewport:{width:1500,height:1000}}),p=await ctx.newPage();
await p.addInitScript(()=>{window.BOHIO_BRAND='jadwa'});await p.route(/cdn\.jsdelivr\.net|unpkg\.com|cdnjs\.cloudflare\.com/,r=>r.abort());await p.route('https://fonts.googleapis.com/**',r=>r.fulfill({status:200,contentType:'text/css',body:''}));
const errs=[];p.on('pageerror',e=>errs.push(e.message));await p.route('**/api/log',r=>r.fulfill({status:200,body:'{}'}));
await p.route('**/api/llm',r=>r.request().method()==='GET'?r.fulfill({status:200,contentType:'application/json',body:'{"providers":{}}'}):r.fulfill({status:503,body:'{}'}));
/* the company store, as api/store.js answers: who am I, and saves (a saved version is never replaced) */
const DB={cfg:{configured:true,role:'editor'},fail:false,saved:[]};
await p.route('**/api/store*',async r=>{const q=r.request();if(q.method()==='GET')return DB.cfg?r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,user:'ana',ws:'jadwa',...DB.cfg})}):r.fulfill({status:404,body:''});
  const j=JSON.parse(q.postData()||'{}');if(DB.fail)return r.fulfill({status:500,contentType:'application/json',body:'{"error":"The store could not complete this. Try again."}'});
  if(j.kind==='version'&&DB.saved.some(z=>z.kind==='version'&&z.key===j.key))return r.fulfill({status:409,contentType:'application/json',body:'{"error":"A saved version is kept as it was"}'});
  DB.saved.push({kind:j.kind,key:j.key,name:j.name,data:Buffer.from(j.data||'','base64')});return r.fulfill({status:200,contentType:'application/json',body:'{"ok":true}'})});
let pass=0,fail=0;const ok=(c,name,detail)=>{c?pass++:fail++;console.log((c?'PASS':'FAIL')+' | '+name+(detail?' → '+String(detail).slice(0,400):''))};
const near=(a,e,tol=1e-9)=>Number.isFinite(a)&&Math.abs(a-e)<=tol*Math.max(1,Math.abs(e));
const up=async f=>{await p.evaluate(()=>{STORE=undefined;openNewProject()});await p.setInputFiles('#npFile',F+f);await p.waitForTimeout(1800);await p.click('#npCreate');await p.waitForTimeout(3500);return p.evaluate(async()=>{const x=latestExport();await xcEngine(x);return{id:x.id,n:EXPORTS.length}})};
const A=(tool,args)=>p.evaluate(async([tool,args])=>{window.LASTKEPT=null;const o=await handle('','web','Investment Director',{k:'a33',tool,args});return{plain:o.plain||'',kept:window.LASTKEPT,latest:latestExport().id,n:EXPORTS.length}},[tool,args]);
await p.goto(base);await p.evaluate(()=>localStorage.clear());await p.reload();await p.waitForTimeout(1500);
const orig=fs.readFileSync(F+'r33_waha_sar.xlsx');

// 1. a structure added: the model as it was is saved first, byte for byte, with its record; the change then goes ahead
let w=await up('r33_waha_sar.xlsx');let r=await A('add_structure',{structure:'tax',label:'Zakat',rate:2.5,base:'noi'});
const v1=DB.saved.find(z=>z.kind==='version'&&!/ record$/.test(z.key)),rec=DB.saved.find(z=>/ record$/.test(z.key));
ok(v1&&/^r33_waha_sar v1 \(\d{4}-\d\d-\d\d \d\d\.\d\d\)$/.test(v1.key)&&v1.data.equals(orig),'before the zakat line is added, the model as it was is saved as a version, byte for byte',v1&&v1.key);
let R={};try{R=JSON.parse(rec.data.toString())}catch(e){}
ok(rec&&R.id===w.id&&near(R.out.levered_irr,15.343073610135,1e-4)&&/Zakat|tax/i.test(R.reason)&&R.cells&&R.cells.levered_irr,'its record goes with it: the figures, the headline cells and why it was kept',JSON.stringify(R).slice(0,200));
ok(/equity IRR 15\.34% → 15\.11%/.test(r.plain)&&r.latest!==w.id&&/kept in the company database as “r33_waha_sar v1/.test(r.kept||''),'the change goes ahead and the answer says where the previous version is kept',r.kept);

// 2. a what-if is not saved; made the model by the user, it is (shortened to 7 years: LibreOffice 16.59%)
w=await up('r33_waha_sar.xlsx');const n0=DB.saved.length;r=await A('shorten_cashflow',{years:7});
ok(/Levered IRR 15\.34% → 16\.59%/.test(r.plain)&&DB.saved.length===n0&&r.latest===w.id,'a what-if changes no workbook and nothing is saved to the database',DB.saved.length-n0);
const btn=await p.evaluate(()=>{const m=addMsg('agent',xlBtn(window.LASTVER));return!!m.querySelector('[data-mvpush]')});
await p.click('#msgs .msg.agent:last-child [data-mvpush]');await p.waitForFunction(()=>/is now the model|Not changed/.test(([...document.querySelectorAll('#msgs .msg.agent')].pop()||{}).innerText||''),null,{timeout:120000}).catch(()=>{});await p.waitForTimeout(800);
const pu=await p.evaluate(()=>{const x=latestExport();const m=[...document.querySelectorAll('#msgs .msg.agent')].pop();return{id:x.id,file:x.file,irr:+(x.out||{}).levered_irr,derived:x.derivedFrom,t:m.innerText}});
const v2=DB.saved.slice(n0).find(z=>z.kind==='version'&&!/ record$/.test(z.key));
ok(btn&&pu.derived===w.id&&near(pu.irr,16.59,5e-4)&&v2&&v2.data.equals(orig)&&/to 7\.xlsx$/.test(pu.file)&&/is now the model/.test(pu.t)&&/kept in the company database/.test(pu.t),'“Make this the model” writes the what-if into the workbook (16.59%, as LibreOffice), keeps the model as it was first, and says so',JSON.stringify({...pu,t:pu.t.slice(0,300)}));

// 3. the version cannot be saved: nothing is changed
w=await up('r33_waha_sar.xlsx');DB.fail=true;r=await A('add_structure',{structure:'tax',label:'Zakat',rate:2.5,base:'noi'});DB.fail=false;
ok(r.latest===w.id&&r.n===w.n&&/could not be kept in the company database.*Nothing was changed/.test(r.plain),'when the previous version cannot be saved, the change is not made',r.plain.slice(0,300));

// 4. a viewer cannot change a model; 5. no database connected: kept on the device, and said
w=await up('r33_waha_sar.xlsx');DB.cfg={configured:true,role:'viewer'};await p.evaluate(()=>{STORE=undefined});r=await A('add_structure',{structure:'tax',label:'Zakat',rate:2.5,base:'noi'});
ok(r.latest===w.id&&/Viewers can open models but not change them/.test(r.plain),'a viewer cannot change a model’s structure',r.plain.slice(0,200));
DB.cfg=null;await p.evaluate(()=>{STORE=undefined});const n1=DB.saved.length;r=await A('add_structure',{structure:'tax',label:'Zakat',rate:2.5,base:'noi'});
ok(r.latest!==w.id&&DB.saved.length===n1&&/kept on this device only: no company database is connected/.test(r.kept||''),'with no database connected the change goes ahead, and the answer says the previous version is on this device only',r.kept);

// 6. KINAN: no model is changed, so nothing to keep and no “Make this the model”
const kn=await p.evaluate(async()=>{window.BOHIO_BRAND='kinan';let e='';try{await keepVersion(latestExport(),'x')}catch(z){e=z.message}const h=xlBtn('V1');window.BOHIO_BRAND='jadwa';return{e,h}});
ok(/In (KINAN|Jadwa) a model is changed at its source/.test(kn.e)   /* the Jadwa build rewrites the brand word in every string */&&!/data-mvpush/.test(kn.h)&&/data-xcdl/.test(kn.h),'in KINAN nothing changes a model’s structure: no version to keep, no “Make this the model”, the download stays',kn.e.slice(0,80));
ok(errs.length===0,'no page errors',errs.join(' | '));
console.log(`\n${pass} pass, ${fail} fail`);await b.close();process.exit(fail?1:0);
