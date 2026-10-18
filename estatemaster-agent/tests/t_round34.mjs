// Round 34: one name, one figure; the chat follows its project. Synthetic fixtures only (fixtures/models/r18_jv_usd.xlsx, r32_hold_usd.xlsx).
import {chromium} from 'playwright';
const F=new globalThis.URL('./fixtures/models/',import.meta.url).pathname;const base=process.argv[2]||'http://localhost:4090/?mode=readonly';
const b=await chromium.launch({executablePath:process.env.PW_CHROMIUM||undefined}),p=await (await b.newContext({viewport:{width:1500,height:1000}})).newPage();await p.route(/cdn\.jsdelivr\.net|unpkg\.com|cdnjs\.cloudflare\.com/,r=>r.abort());
await p.route('**/api/log',r=>r.fulfill({status:200,body:'{}'}));await p.route('**/api/llm',r=>r.request().method()==='GET'?r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({providers:{}})}):r.fulfill({status:503,body:'{}'}));
const errs=[];p.on('pageerror',e=>errs.push(e.message));let pass=0,fail=0;const t=(c,m)=>{console.log((c?'PASS':'FAIL')+' | '+m);c?pass++:fail++};
await p.goto(base);await p.evaluate(()=>localStorage.clear());await p.reload();await p.waitForTimeout(1500);
const up=async m=>{await p.evaluate(()=>openNewProject());await p.setInputFiles('#npFile',F+m+'.xlsx');await p.waitForTimeout(1800);await p.click('#npCreate');await p.waitForTimeout(3500)};
await up('r18_jv_usd');
{const r=await p.evaluate(async()=>{const x=latestExport();await xcCacheMore(x);const gp=(x.more||[]).find(z=>/^GP IRR/.test(z.label));const v=gp?(gp.v*100).toFixed(2):'';
  return{lev:x.out.levered_irr,gpv:v,flag:xcHeadCheck(`The levered IRR is ${v}% on this deal.`),same:xcHeadCheck(`The levered IRR is ${x.out.levered_irr.toFixed(2)}%.`),moved:xcHeadCheck('After the change the levered IRR moves to 19.40%.'),rows:(wbRows(WB_INV)||[]).map(z=>z.label)}});
  t(r.gpv&&/Two figures under one name/.test(r.flag)&&/GP IRR/.test(r.flag)&&r.flag.includes(r.lev.toFixed(2)),'an answer giving the levered IRR the GP IRR’s value is flagged with both cells: '+r.flag.slice(0,160));
  t(r.same==='','the headline value itself is not flagged');t(r.moved==='','a what-if result that is no other cell’s value is not flagged');
  t(r.rows.includes('LP IRR')&&r.rows.some(l=>/GP promote/.test(l)),'the investor table holds the partner figures and the promote: '+r.rows.join(', '))}
// the chat header is the project's name now, even for a chat that began under another name
{const r=await p.evaluate(async()=>{const id=PROJ.id;chatSave(id);const old=PROJECTS[id].name;PROJECTS[id].name='Renamed scheme';chatOpen(id);const h=(document.querySelector('#msgs .msg.divider')||{}).textContent||'';PROJECTS[id].name=old;chatOpen(id);return h});
  t(r==='Chat · Renamed scheme','the chat header follows the project’s current name: '+r)}
// the reader notice is about the model in use only, and is given once per file
{const r=await p.evaluate(async()=>{const cnt=()=>[...document.querySelectorAll('#msgs .msg.agent')].filter(m=>/older version of the reader/.test(m.textContent)).length;const xs=EXPORTS.filter(z=>z.proj===PROJ.id);
  const old={...xs[xs.length-1],id:'EX-OLD',pv:1,at:new Date(Date.now()-864e5).toISOString()};EXPORTS.unshift(old);askReupload.done=null;askReupload0();const a=cnt();
  latestExport().pv=1;askReupload.done=null;askReupload0();const b2=cnt();askReupload.done=null;askReupload0();const c=cnt();latestExport().pv=READER_V;EXPORTS.splice(EXPORTS.indexOf(old),1);return{a,b:b2,c}});
  t(r.a===0,'an older file of the project does not raise the reader notice: '+r.a);t(r.b===1&&r.c===1,'the model in use raises it once, never twice: '+r.b+' then '+r.c)}
t(!errs.length,'no page errors: '+errs.join(' | '));console.log(`${pass} pass, ${fail} fail`);await b.close();process.exit(fail?1:0);
