// The Model debug window is never empty: missing export, export replaced by a server sync, export with no debug yet; the Model debug button reopens it.
import {chromium} from 'playwright';import fs from 'fs';
const sp=new globalThis.URL('./fixtures/',import.meta.url).pathname;
const b=await chromium.launch({executablePath:process.env.PW_CHROMIUM||undefined});const p=await b.newPage({viewport:{width:1500,height:950}});const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.route('https://cdnjs.cloudflare.com/**',r=>r.fulfill({status:200,contentType:'application/javascript',body:fs.readFileSync(sp+'package/dist/xlsx.full.min.js')}));
await p.route('https://fonts.googleapis.com/**',r=>r.fulfill({status:200,contentType:'text/css',body:''}));
await p.goto(process.argv[2]||'http://localhost:4090/?mode=readonly');await p.evaluate(()=>localStorage.clear());await p.reload();await p.waitForTimeout(1500);
const ok=[];const t=(c,m)=>ok.push((c?'PASS':'FAIL')+' | '+m);
const txt=()=>p.evaluate(()=>($('#dbgWBody')||{}).innerText||'');
// 1. no uploaded model: button opens window with guidance
await p.evaluate(()=>{showTab(RO?'em':'model')});const vis=await p.evaluate(()=>!!$('#exDbg')&&$('#exDbg').offsetParent!==null);t(vis,'Model debug button visible on the exports card');
await p.evaluate(()=>{const mine=EXPORTS.filter(z=>z.proj===PROJ.id&&z.src==='file');mine.forEach(z=>EXPORTS.splice(EXPORTS.indexOf(z),1));$('#exDbg').click()});
let s=await txt();t(/No model uploaded|not been debugged/.test(s)&&s.length>30,'no upload: window explains ('+s.slice(0,70)+')');
// 2. export with no audit: offers to debug
await p.evaluate(()=>{const x={id:'EX-T1',proj:PROJ.id,src:'file',file:'Model A.xlsx',out:{},inputs:[]};EXPORTS.push(x);$('#exDbg').click()});
s=await txt();t(/not been debugged yet/.test(s)&&/debug this model/i.test(s),'export without debug: offers "Debug this model": '+s.slice(-160));
// 3. export replaced by a sync (same file, new object/id): the audit follows
await p.evaluate(()=>{const x=EXPORTS.find(z=>z.id==='EX-T1');x.audit={status:'done',t0:Date.now()-5000,took:5,log:[{text:'Exact checks',t:1}],checks:[{level:'warn',text:'Check X'}],ai:{items:[],dismissed:[],by:'Claude and OpenAI'}};openDbgWin('EX-T1');
  EXPORTS.splice(EXPORTS.indexOf(x),1);EXPORTS.push({id:'EX-T2',proj:PROJ.id,src:'file',file:'Model A.xlsx',out:{},inputs:[]});renderAuditUI()});
s=await txt();t(/EX-T2/.test(s)&&/Done in/.test(s),'export replaced by sync: window shows its debug on the new copy ('+s.slice(0,60)+')');
// 4. close then reopen via button
await p.evaluate(()=>{$('#dbgDone').click()});const off=await p.evaluate(()=>!$('#dbgWin').classList.contains('on'));
await p.evaluate(()=>$('#exDbg').click());s=await txt();t(off&&/EX-T2/.test(s),'close and reopen with the button');
// 5. leaving Financial modelling makes the window a small bar (it never covers another page); one click opens it again
await p.evaluate(()=>{showTab(RO?'em':'model');$('#exDbg').click()});await p.waitForTimeout(200);
await p.evaluate(()=>showTab('scen'));await p.waitForTimeout(300);
const mn=await p.evaluate(()=>{const w=$('#dbgWin'),r=w.getBoundingClientRect(),g=$('#asGo').getBoundingClientRect();const hit=document.elementFromPoint(g.x+g.width/2,g.y+g.height/2);return{min:w.classList.contains('min'),h:Math.round(r.height),goFree:!!(hit&&hit.closest('#asGo')),state:$('#dbgWState').textContent}});
t(mn.min&&mn.h<90&&mn.goFree,'on another page the debug window is a small bar and leaves the page usable '+JSON.stringify(mn));
const blocker=await p.evaluate(()=>{const r=$('#dbgWMin').getBoundingClientRect(),e=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return e&&!e.closest('#dbgWin')?(e.id||e.className||e.tagName):''});if(blocker)console.log('note: the expand button is covered by',blocker);
await p.click('#dbgWMin',{timeout:8000});await p.waitForTimeout(200);const ex=await p.evaluate(()=>!$('#dbgWin').classList.contains('min')&&$('#dbgWin').getBoundingClientRect().height>150);t(ex,'one click on the bar opens it again');
t(!errs.length,'no page errors '+errs.join('; '));
console.log(ok.join('\n'));await b.close();
