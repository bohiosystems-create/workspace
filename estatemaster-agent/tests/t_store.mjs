// The company store on the page (bohio-demos/_shared/store/PAGE-BRIEF.md): models, their chats and corrections, report edits and settings
// saved in the company's own database per workspace, with sharing and roles; the browser keeps its copy and retries a failed save. The store
// is mocked here with the rules of api/store.js (workspaces from the organisation, private / org / people sharing, viewer / editor / admin,
// saves in parts of 3 MB, write-once versions, the audit log); the server itself is tested by _shared/store/test.js against Postgres.
import {chromium} from 'playwright';import fs from 'fs';import crypto from 'crypto';
const F=new globalThis.URL('./fixtures/models/',import.meta.url).pathname;const base=process.argv[2]||'http://localhost:4090/?mode=readonly';
const b=await chromium.launch({executablePath:process.env.PW_CHROMIUM||undefined});
let pass=0,fail=0;const ok=(c,name,detail)=>{c?pass++:fail++;console.log((c?'PASS':'FAIL')+' | '+name+(detail?' → '+(typeof detail==='string'?detail:JSON.stringify(detail)).slice(0,500):''))};
/* the store, in memory: one per test run, shared by every browser */
const U={ana:{o:'jadwa',r:'editor'},dan:{o:'jadwa',r:'editor'},bob:{o:'jadwa',r:'viewer'},cara:{o:'jadwa',r:'admin'},kim:{o:'kinan',r:'editor'},eve:{o:'jadwa',r:'editor'}};
const DB={items:[],audit:[],up:{},fail:false,configured:true};
const seen=(it,me)=>it.ws===me.ws&&(it.owner===me.user||it.share==='org'||(it.share==='people'&&it.sharedWith.includes(me.user)));
async function store(route){const q=route.request(),u=q.headers()['x-user'],me=U[u]?{user:u,ws:U[u].o,role:U[u].r}:null;const url=new URL(q.url()),P=url.searchParams;
  const send=(st,o)=>route.fulfill({status:st,contentType:'application/json',body:JSON.stringify(o)});if(!me)return send(401,{error:'Sign in'});
  if(q.method()==='GET'&&!P.get('kind')&&!P.get('audit'))return send(200,{ok:true,configured:DB.configured,user:me.user,role:me.role,ws:me.ws});
  if(!DB.configured)return send(501,{error:'No database'});
  if(P.get('audit'))return me.role==='admin'?send(200,{audit:DB.audit.filter(a=>a.ws===me.ws).slice().reverse()}):send(403,{error:'Company admins only.'});
  if(q.method()==='GET'){const k=P.get('kind'),key=P.get('key');if(!key)return send(200,{items:DB.items.filter(it=>it.kind===k&&seen(it,me)).map(it=>({key:it.key,name:it.name,size:it.data.length,owner:it.owner,share:it.share,sharedWith:it.sharedWith,mine:it.owner===me.user,updatedAt:it.at,updatedBy:it.by}))});
    const it=DB.items.find(z=>z.ws===me.ws&&z.kind===k&&z.key===key);if(!it||!seen(it,me))return send(404,{error:'Not found'});if(k==='model')DB.audit.push({ws:me.ws,at:new Date().toISOString(),who:me.user,action:'open',kind:k,key});
    return send(200,{key:it.key,name:it.name,owner:it.owner,share:it.share,sharedWith:it.sharedWith,updatedAt:it.at,updatedBy:it.by,data:it.data.toString('base64')})}
  const j=JSON.parse(q.postData()||'{}');
  if(j.action==='share'){const it=DB.items.find(z=>z.ws===me.ws&&z.kind===j.kind&&z.key===j.key);if(!it)return send(404,{error:'Not found'});if(it.owner!==me.user&&me.role!=='admin')return send(403,{error:'Only its owner or a company admin can change who sees it.'});it.share=j.share;it.sharedWith=j.sharedWith||[];DB.audit.push({ws:me.ws,at:new Date().toISOString(),who:me.user,action:'share',kind:j.kind,key:j.key});return send(200,{ok:true})}
  if(me.role==='viewer')return send(403,{error:'Viewers can open models but not save or change them.'});if(DB.fail)return send(500,{error:'The store could not complete this. Try again.'});
  let data=Buffer.from(j.data||'','base64');if(j.upload){(DB.up[j.upload]=DB.up[j.upload]||[])[j.part]=data;DB.parts=(DB.parts||0)+1;if(j.part<j.parts-1)return send(202,{ok:true,partial:true});data=Buffer.concat(DB.up[j.upload])}
  const it=DB.items.find(z=>z.ws===me.ws&&z.kind===j.kind&&z.key===j.key);
  if(it&&j.kind==='version')return send(409,{error:'A saved version is kept as it was'});if(it&&!seen(it,me))return send(409,{error:'That name is taken in your workspace; choose another.'});if(it&&it.owner!==me.user&&it.share==='private')return send(403,{error:'You can open this but not change it.'});
  const at=new Date(Date.parse('2026-01-01')+(DB.clock=(DB.clock||0)+1)*1000).toISOString();
  if(it){it.data=data;it.name=j.name||it.name;it.at=at;it.by=me.user}else DB.items.push({ws:me.ws,kind:j.kind,key:j.key,name:j.name||j.key,owner:me.user,share:j.share||'private',sharedWith:j.sharedWith||[],data,at,by:me.user});
  if(['model','export','version'].includes(j.kind))DB.audit.push({ws:me.ws,at:new Date().toISOString(),who:me.user,action:it?'save':'create',kind:j.kind,key:j.key});return send(200,{ok:true})}
async function open(user,o={}){const ctx=await b.newContext({viewport:{width:1500,height:1000},extraHTTPHeaders:{'x-user':user}}),p=await ctx.newPage();await p.addInitScript(()=>{window.BOHIO_BRAND='jadwa'});
  await p.route('**/api/**',r=>r.fulfill({status:404,body:''}));await p.route(/cdn\.jsdelivr\.net|unpkg\.com|cdnjs\.cloudflare\.com/,r=>r.abort());await p.route('**/api/store*',store);
  const errs=[];p.on('pageerror',e=>errs.push(e.message));p.on('dialog',d=>d.dismiss().catch(()=>{}));await p.goto(base);if(!o.keep){await p.evaluate(()=>localStorage.clear());await p.reload()}await p.waitForTimeout(2500);
  const up=async(f,buf)=>{await p.evaluate(()=>openNewProject());await p.setInputFiles('#npFile',buf?{name:f,mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:buf}:F+f);await p.waitForSelector('#npCreate:not([disabled])',{timeout:120000}).catch(()=>{});await p.click('#npCreate');await p.waitForTimeout(4500)};
  return{ctx,p,errs,up}}
const item=(k,key)=>DB.items.find(z=>z.kind===k&&z.key===key);const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
const waha=fs.readFileSync(F+'r33_waha_sar.xlsx');

// 1. an editor's upload is saved to the company store, private, byte for byte; the chat follows the model
const A=await open('ana');await A.up('r33_waha_sar.xlsx');await A.p.waitForTimeout(1500);
let it=item('model','r33_waha_sar');ok(it&&it.owner==='ana'&&it.share==='private'&&sha(it.data)===sha(waha),'an upload is saved to the company store as the user’s private model, byte for byte',it&&{key:it.key,owner:it.owner,share:it.share});
await A.p.evaluate(()=>csSyncAux());ok(item('chat','r33_waha_sar (ana)')&&item('settings','settings (ana)'),'the model’s chat is saved under its key (per user), and the user’s settings under theirs',DB.items.map(z=>z.kind+':'+z.key));
// 2. shared with the organisation from the rail
await A.p.evaluate(()=>{const r=document.querySelector('#projRail');r&&r.classList.add('open')});await A.p.waitForTimeout(300);
await A.p.selectOption('#prList select[data-csshare]',{value:'org'});await A.p.waitForTimeout(800);ok(item('model','r33_waha_sar').share==='org','its owner shares it with everyone in the organisation from the model list');
// 3. a private model stays private
await A.up('r30_office_usd.xlsx');await A.p.waitForTimeout(1500);ok(item('model','r30_office_usd')&&item('model','r30_office_usd').share==='private','a second upload is private');
// 4. a colleague sees the shared one (not the private one) and opens it, identical
const D=await open('dan');await D.p.evaluate(()=>{const r=document.querySelector('#projRail');r&&r.classList.add('open')});await D.p.waitForTimeout(500);
const dl=await D.p.evaluate(()=>[...document.querySelectorAll('#prList [data-csopen]')].map(e=>e.dataset.csopen));
ok(dl.includes('r33_waha_sar')&&!dl.includes('r30_office_usd'),'a colleague in the organisation sees the shared model in the company workspace, and not the private one',dl);
await D.p.click('#prList [data-csopen="r33_waha_sar"]');await D.p.waitForTimeout(5000);
const dx=await D.p.evaluate(async()=>{const x=latestExport();const b=new Uint8Array(await xcRaw(x));let h=0;for(const v of b)h=(h*31+v)>>>0;return{name:PROJ.name,irr:x.out.levered_irr,len:b.length,h,key:PROJECTS[PROJ.id].csKey,msg:[...document.querySelectorAll('#msgs .msg.agent')].map(m=>m.innerText).join('\n')}});
let hw=0;for(const v of waha)hw=(hw*31+v)>>>0;
ok(dx.key==='r33_waha_sar'&&dx.len===waha.length&&dx.h===hw&&Math.abs(dx.irr-15.343)<0.01&&/ana’s, shared with you/.test(dx.msg),'they open it on their own device: the same workbook, the same figures, marked as ana’s',dx);
ok(DB.audit.some(a=>a.action==='open'&&a.who==='dan'),'the opening is in the audit log');
// 5. another organisation sees nothing
const K=await open('kim');const kl=await K.p.evaluate(async()=>{await csLoadList();return CS.list.length});ok(kl===0,'an account of another organisation sees none of the company’s models',kl);
// 6. a viewer opens and asks, never saves, imports or deletes
const V=await open('bob');const vw=await V.p.evaluate(async()=>{await new Promise(r=>setTimeout(r,500));const add=document.querySelector('#prAdd');const t=toolIntent('set_hurdle',{hurdle:15});return{dis:add&&add.disabled,title:add&&add.title,tool:t.k==='nohit'&&t.msg}});
ok(vw.dis&&/Viewers can open models but not change them/.test(vw.title)&&/Viewers can open/.test(vw.tool||''),'a viewer cannot upload (the button says why) and the agent will not change anything for them',vw);
// 7. a 10 MB workbook saves in parts and opens identical on another device
const big=await A.p.evaluate(async()=>{await loadXLSX();const wb=XLSX.utils.book_new();const ws=XLSX.utils.aoa_to_sheet([['Returns'],['Levered IRR',0.12]]);XLSX.utils.book_append_sheet(wb,ws,'Returns');
  const rows=[['Month',...Array.from({length:30},(_,i)=>'Unit '+(i+1))]];let s=7;const rnd=()=>{s=(s*16807)%2147483647;return s/2147483647};for(let m=1;m<=26000;m++)rows.push([m,...Array.from({length:30},()=>Math.round(rnd()*1e8)/100)]);
  XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(rows),'History');const out=XLSX.write(wb,{type:'base64',bookType:'xlsx'});return out});
const bigB=Buffer.from(big,'base64');const parts0=DB.parts||0;await A.up('palm_history.xlsx',bigB);await A.p.waitForTimeout(6000);
it=DB.items.find(z=>z.kind==='model'&&/palm_history/.test(z.key));ok(bigB.length>9e6&&it&&sha(it.data)===sha(bigB)&&(DB.parts||0)-parts0>=4,'a 10 MB workbook is saved in parts of 3 MB and arrives whole',{mb:(bigB.length/1e6).toFixed(1),parts:(DB.parts||0)-parts0,key:it&&it.key});
if(it){it.share='people';it.sharedWith=['dan']}
const D2=await open('dan');const got=await D2.p.evaluate(async k=>{await csLoadList();const p=await csOpen(k);const x=latestExport();return x?new Uint8Array(await xcRaw(x)).length:0},it&&it.key);ok(got===bigB.length,'shared with dan by name, it opens on his device identical in size',got);
// 8. a failed save stays on the device, says so, and is retried
DB.fail=true;await A.up('r32_hold_usd.xlsx');await A.p.waitForTimeout(1500);const fl=await A.p.evaluate(()=>{renderProjRail();return{q:JSON.parse(localStorage.getItem('em_csq')||'[]').length,txt:document.querySelector('#prList').innerText}});
ok(fl.q===1&&/Saved on this device only — will retry/.test(fl.txt)&&!item('model','r32_hold_usd'),'a save that fails stays on the device, says “Saved on this device only — will retry” and is queued',fl);
DB.fail=false;await A.p.evaluate(()=>csRetry());await A.p.waitForTimeout(800);ok(item('model','r32_hold_usd')&&(await A.p.evaluate(()=>JSON.parse(localStorage.getItem('em_csq')||'[]').length))===0,'the retry saves it and empties the queue');
// 9. models already on a device are offered once to move, and move only with the click
DB.configured=false;const E=await open('eve');await E.up('r30_office_usd.xlsx');await E.up('r32_hold_usd.xlsx');ok(!DB.items.some(z=>z.owner==='eve'),'with no database connected nothing is sent');
DB.configured=true;await E.p.reload();await E.p.waitForTimeout(3500);const mv=await E.p.evaluate(()=>[...document.querySelectorAll('#msgs .msg.agent')].map(m=>m.innerText).find(t=>/Move my \d+ models? to your company workspace/.test(t))||'');
ok(/Move my 2 models to your company workspace/.test(mv)&&!DB.items.some(z=>z.owner==='eve'),'the next load offers once to move the 2 models, and nothing moves before the click',mv.slice(0,160));
await E.p.click('[data-csmove="yes"]');await E.p.waitForTimeout(3000);const ev=DB.items.filter(z=>z.owner==='eve'&&z.kind==='model');ok(ev.length===2&&ev.every(z=>z.share==='private'),'moved with the click, as private',ev.map(z=>z.key));
await E.p.reload();await E.p.waitForTimeout(3500);ok(!(await E.p.evaluate(()=>[...document.querySelectorAll('[data-csmove]')].length)),'and the offer is not made again');
// 10. a company admin reads the activity
const C=await open('cara');await C.p.evaluate(()=>{const r=document.querySelector('#projRail');r&&r.classList.add('open')});await C.p.waitForTimeout(600);await C.p.click('[data-csact]');await C.p.waitForTimeout(800);
const ac=await C.p.evaluate(()=>[...document.querySelectorAll('#msgs .msg.agent')].pop().innerText);ok(/Activity in the company workspace/.test(ac)&&/ana/.test(ac)&&/create/.test(ac)&&/dan/.test(ac),'a company admin reads the activity: who created, shared and opened what',ac.slice(0,300));
// 11. two people change the same shared model: the later save never overwrites the earlier one, it is kept beside it and said
const save=(P,k)=>P.p.evaluate(async k=>{const pid=Object.keys(PROJECTS).find(i=>PROJECTS[i].csKey===k);const x=latestExport(pid);x.csDirty=true;const n0=document.querySelectorAll('#msgs .msg.agent').length;await csSaveProject(pid,true);return{key:PROJECTS[pid].csKey,msg:[...document.querySelectorAll('#msgs .msg.agent')].slice(n0).map(m=>m.innerText).join(' ')}},k);
const before=item('model','r33_waha_sar').by;const sa=await save(A,'r33_waha_sar');const ana2=item('model','r33_waha_sar');const sd=await save(D,'r33_waha_sar');
ok(before==='ana'&&sa.key==='r33_waha_sar'&&!sa.msg&&ana2.by==='ana'&&item('model','r33_waha_sar').by==='ana'&&sd.key==='r33_waha_sar (dan)'&&item('model','r33_waha_sar (dan)')&&/ana saved a newer copy of r33_waha_sar while you worked on it.*saved beside it as r33_waha_sar \(dan\)/.test(sd.msg),'two people save the same shared model: the second save is kept beside the first under their name and they are told, nothing is overwritten',{sa,sd});
const all=[A,D,K,V,D2,E,C].flatMap(z=>z.errs);ok(all.length===0,'no page errors',all.join(' | '));
console.log(`\n${pass} pass, ${fail} fail`);await b.close();process.exit(fail?1:0);
