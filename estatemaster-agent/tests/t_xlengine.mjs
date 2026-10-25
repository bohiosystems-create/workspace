// Which server engine takes a workbook the browser engine cannot reproduce: Excel itself (/api/xl) first, LibreOffice (/api/lo) next,
// each only when its check reproduces the workbook's stored results; later calls go to the engine that passed (by hash, the file sent
// again when that engine no longer holds it), and the answer names the engine. Stand-ins for both engines: no Microsoft 365 or
// LibreOffice needed.
import {chromium} from 'playwright';import fs from 'fs';
const F=new globalThis.URL('./fixtures/models/',import.meta.url).pathname;const base=process.argv[2]||'http://localhost:4090/?mode=readonly';
let pass=0,fail=0;const ok=(c,m,d)=>{if(c){pass++;console.log('PASS | '+m)}else{fail++;console.log('FAIL | '+m+(d!==undefined?' → '+JSON.stringify(d).slice(0,300):''))}};
const b=await chromium.launch({executablePath:process.env.PW_CHROMIUM||undefined});
const bytes=[...fs.readFileSync(F+'lease_freq.xlsx')];
// one session per case: E = how each engine answers
async function session(E){const ctx=await b.newContext(),p=await ctx.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));const calls=[];
  const engine=name=>async route=>{const rq=route.request(),e=E[name];if(rq.method()==='GET')return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(e.up?{ok:true,version:name==='xl'?'Microsoft Excel (Microsoft 365)':'LibreOffice 25.2'}:{ok:false,why:'not set up'})});
    const j=JSON.parse(rq.postData()||'{}');calls.push({eng:name,file:!!j.file,hash:j.hash||'',check:!!j.check,sets:j.sets||[]});
    if(!j.file&&e.forget){e.forget=false;return route.fulfill({status:404,contentType:'application/json',body:JSON.stringify({error:'unknown workbook',need_file:true})})}
    const read=j.read||[];const val=r=>r==='Leases!F2'?(j.sets&&j.sets.length?4:3):r==='Leases!I5'?0.6:3;
    route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({hash:'h_'+name,...(j.check?{check:{tot:20,match:e.match,bad:[]}}:{}),values:read.map(val)})})};
  await ctx.route('**/api/xl',engine('xl'));await ctx.route('**/api/lo',engine('lo'));
  await p.goto(base);await p.waitForTimeout(2500);
  const r=await p.evaluate(async bytes=>{const buf=new Uint8Array(bytes).buffer;xcRaw=async()=>buf;LO.avail=null;const info=await xcEngine({id:'LF',src:'file',cells:{}});
    let v0=null,v1=null;if(info.ok&&info.engine==='server'){v0=await xcQ(()=>xcCall({op:'get',refs:['Leases!F2']}));[v1]=await xcQ(()=>xcCall({op:'run',runs:[[['Leases!B3',2026]]],read:['Leases!F2'],reset:true}))}
    return{ok:info.ok,engine:info.engine,engVer:info.engVer||'',pct:info.pct,lo:info.lo||null,v0,v1}},bytes);
  await ctx.close();return{r,calls,errs}}

// 1. both set up, Excel reproduces the stored results: Excel takes the workbook, LibreOffice is not asked
let s=await session({xl:{up:true,match:20},lo:{up:true,match:20}});
ok(s.r.engine==='server'&&/Excel/.test(s.r.engVer)&&s.r.pct===100&&!s.calls.some(c=>c.eng==='lo'),'Excel first: it reproduces the stored results and takes the workbook; LibreOffice is not asked',s);
ok(s.r.v0&&s.r.v0[0]===3&&s.r.v1&&s.r.v1[0]===4&&s.calls.filter(c=>c.eng==='xl'&&!c.check).every(c=>c.hash==='h_xl'&&!c.file),'its figures and a what-if come from Excel, by the workbook\'s hash',s.calls);
// 2. Excel does not reproduce them (it differs on 2 of 20): LibreOffice is tried and takes it
s=await session({xl:{up:true,match:18},lo:{up:true,match:20}});
ok(s.r.engine==='server'&&/LibreOffice/.test(s.r.engVer)&&s.calls.some(c=>c.eng==='xl'&&c.check)&&s.calls.filter(c=>!c.check).every(c=>c.eng==='lo'),'Excel short of the bar (90%): LibreOffice is tried, passes and answers the figures',s);
// 3. Excel not set up: LibreOffice as before
s=await session({xl:{up:false},lo:{up:true,match:20}});
ok(s.r.engine==='server'&&/LibreOffice/.test(s.r.engVer)&&!s.calls.some(c=>c.eng==='xl'),'Excel not set up: LibreOffice as before',s);
// 4. neither reproduces the workbook: not taken over, and what each gave is kept for the answer
s=await session({xl:{up:true,match:10},lo:{up:true,match:12}});
ok(s.r.engine!=='server'&&s.r.lo&&s.r.lo.eng&&/Excel/.test(s.r.lo.eng),'neither engine reproduces it: the workbook is not taken over, what Excel gave is kept for the answer',s.r);
// 5. Excel no longer holds the workbook (its copies are swept daily): the file is sent again to Excel, not to another engine
const s5=await (async()=>{const ctx=await b.newContext(),p=await ctx.newPage();const calls=[];let forgot=false;
  await ctx.route('**/api/xl',async route=>{const rq=route.request();if(rq.method()==='GET')return route.fulfill({status:200,contentType:'application/json',body:'{"ok":true,"version":"Microsoft Excel (Microsoft 365)"}'});const j=JSON.parse(rq.postData()||'{}');calls.push({file:!!j.file,hash:j.hash||'',check:!!j.check});
    if(!j.check&&!j.file&&!forgot){forgot=true;return route.fulfill({status:404,contentType:'application/json',body:'{"error":"unknown workbook","need_file":true}'})}
    route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({hash:'h_xl',...(j.check?{check:{tot:20,match:20,bad:[]}}:{}),values:(j.read||[]).map(()=>3)})})});
  await ctx.route('**/api/lo',r=>r.fulfill({status:200,contentType:'application/json',body:'{"ok":false}'}));
  await p.goto(base);await p.waitForTimeout(2500);
  const v=await p.evaluate(async bytes=>{const buf=new Uint8Array(bytes).buffer;xcRaw=async()=>buf;LO.avail=null;await xcEngine({id:'LF',src:'file',cells:{}});return xcQ(()=>xcCall({op:'get',refs:['Leases!F2']}))},bytes);
  await ctx.close();return{v,calls}})();
ok(s5.v&&s5.v[0]===3&&s5.calls.length===3&&s5.calls[1].hash==='h_xl'&&!s5.calls[1].file&&s5.calls[2].file,'Excel no longer holds the workbook: it is sent again to Excel and the figure comes back',s5);
// 6. the source: the system check lists the Excel engine when the server reports it set up
{const ctx=await b.newContext(),p=await ctx.newPage();await ctx.route('**/api/health',r=>r.fulfill({status:200,contentType:'application/json',body:'{"ok":true,"services":{"excelEngine":true,"serverEngine":false}}'}));
  await ctx.route('**/api/xl',r=>r.fulfill({status:200,contentType:'application/json',body:'{"ok":true,"version":"Microsoft Excel (Microsoft 365)"}'}));await ctx.route('**/api/llm',r=>r.fulfill({status:200,contentType:'application/json',body:'{"providers":{}}'}));
  await p.goto(base);await p.waitForTimeout(2000);const d=await p.evaluate(async()=>{location.protocol;await sysCheck(false);const t=document.body.textContent;const i=t.indexOf('Excel engine');return i<0?'':t.slice(i,i+200)});
  ok(/Excel engine/.test(d)&&/Microsoft Excel answers/.test(d),'Settings → System check shows the Excel engine',d);await ctx.close()}
// 7. set up but not answering: the card says why (the server's reason), never a bare failure
{const ctx=await b.newContext(),p=await ctx.newPage();await ctx.route('**/api/health',r=>r.fulfill({status:200,contentType:'application/json',body:'{"ok":true,"services":{"excelEngine":true,"serverEngine":false}}'}));
  await ctx.route('**/api/xl',r=>r.fulfill({status:200,contentType:'application/json',body:'{"ok":false,"why":"the folder /sites/x:/sites/y:/drive/root:/Z does not answer (404: itemNotFound)"}'}));await ctx.route('**/api/llm',r=>r.fulfill({status:200,contentType:'application/json',body:'{"providers":{}}'}));
  await p.goto(base);await p.waitForTimeout(2000);const d=await p.evaluate(async()=>{await sysCheck(false);const t=document.body.textContent;const i=t.indexOf('Excel engine');return i<0?'':t.slice(i,i+400)});
  ok(/Set up but not answering: the folder/.test(d)&&/404: itemNotFound/.test(d),'the card says why the Excel engine does not answer',d);await ctx.close()}
await b.close();console.log(`${pass} pass, ${fail} fail`);process.exit(fail?1:0);
