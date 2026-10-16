// The hotel model's ADR: an upload read by the older reader is re-read from the workbook the app keeps (ADR and occupancy become
// assumptions), "ADR" and "average daily rate" both name the line, the user's own words win over an AI reading that names another line,
// and under each axis box the table says what it is built on.
import {chromium} from 'playwright';import fs from 'fs';
const sp=new globalThis.URL('./fixtures/',import.meta.url).pathname;const base=process.argv[2]||'http://localhost:4090/?mode=readonly';
const b=await chromium.launch({executablePath:process.env.PW_CHROMIUM||undefined});const p=await b.newPage({viewport:{width:1500,height:950}});const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.route('https://cdnjs.cloudflare.com/**',r=>r.fulfill({status:200,contentType:'application/javascript',body:fs.readFileSync(sp+'package/dist/xlsx.full.min.js')}));
await p.route('https://fonts.googleapis.com/**',r=>r.fulfill({status:200,contentType:'text/css',body:''}));
let pinSaid='Soft Costs';
await p.route('**/api/llm',r=>{if(r.request().method()==='GET')return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({providers:{anthropic:true,openai:true}})});const j=JSON.parse(r.request().postData());const sys=j.payload.system||'';
  const reply=t=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(j.provider==='openai'?{choices:[{message:{content:t}}]}:{model:j.payload.model,content:[{type:'text',text:t}]})});
  if(/You pin down which single assumption/.test(sys)){const u=JSON.stringify(j.payload.messages);const ax=/X axis/.test(u)?'x':'y';return reply(JSON.stringify(ax==='x'?{assumption:pinSaid,kind:'pct',shifts:[-20,-10,0,10,20],sure:true}:{assumption:'Occupancy',kind:'pts',shifts:[-10,-5,0,5,10],sure:true}))}
  if(/two-way sensitivity table/.test(sys)){const m=/Return a grid of (\d+) rows × (\d+) columns/.exec(JSON.stringify(j.payload.messages));const R=+m[1],C=+m[2];return reply(JSON.stringify({method:'m',grid:Array.from({length:R},(_,i)=>Array.from({length:C},(_,k)=>+(24.05+(k-(C-1)/2)*0.8+(i-(R-1)/2)*0.5).toFixed(2)))}))}
  reply('{}')});
await p.goto(base);await p.evaluate(()=>localStorage.clear());await p.reload();await p.waitForTimeout(1500);
const ok=[];const t=(c,m)=>ok.push((c?'PASS':'FAIL')+' | '+m);const ev=(f,a)=>p.evaluate(f,a);
await ev(()=>openNewProject());await p.setInputFiles('#npFile',sp+'models/hotel_us.xlsx');await p.waitForTimeout(1500);await p.click('#npCreate');await p.waitForTimeout(3000);
// make it look like an upload read by the older reader: Summary inputs only, no version
let s=await ev(async()=>{const x=latestExport();x.inputs=x.inputs.filter(i=>i.sheet==='Summary'&&!/^(ADR|Occupancy)$/.test(i.label));x.pv=1;delete x.rereadTried;const before=x.inputs.length;askReupload.done=null;const n=await rereadStale();return{before,n,after:x.inputs.length,adr:(x.inputs.find(i=>i.label==='ADR')||{}).text,occ:(x.inputs.find(i=>i.label==='Occupancy')||{}).text,pv:x.pv,irr:x.out.levered_irr}});
t(s.n===1&&s.after>s.before&&s.adr==='$125.00'&&/68/.test(s.occ||'')&&s.pv===2,'an older read is re-read from the stored workbook: ADR and occupancy are assumptions again '+JSON.stringify(s));
t(Math.abs(s.irr-24.05)<0.01,'the headline figures survive the re-read from displayed text (levered IRR '+s.irr+')');
s=await ev(()=>({a:asMatchLabel('ADR'),b:asMatchLabel('average daily rate'),c:asMatchLabel('adr'),d:asMatchLabel('occupancy')}));t(s.a==='ADR'&&s.b==='ADR'&&s.c==='ADR'&&s.d==='Occupancy','ADR, adr and “average daily rate” all name the ADR line: '+JSON.stringify(s));
// the AI proposes Soft Costs for "ADR": the user's own words win, and the box says what the table is built on
await ev(()=>{setHurdle(18,'typed');showTab('scen');$('#asX').value='ADR';$('#asY').value='OCCUPANCY';$('#asMetric').value='levered_irr';AS.x=AS.y=null;AS.txt={x:'',y:''}});await p.click('#asGo');await p.waitForFunction(()=>!AS.busy,null,{timeout:240000});
s=await ev(()=>({x:AS.x&&AS.x.assumption,y:AS.y&&AS.y.assumption,xon:$('#asXon').innerText,yon:$('#asYon').innerText,q:$('#asQ').innerText}));
t(s.x==='ADR'&&s.y==='Occupancy','ADR × occupancy pinned to the model’s own lines, not Soft Costs: '+JSON.stringify([s.x,s.y,s.q.slice(0,80)]));
t(/Built on ADR .*= \$125\.00 .*OpCashFlow!H12/.test(s.xon)&&/Built on Occupancy/.test(s.yon),'under each axis box: the line, its value, its cell and the shifts: '+s.xon+' || '+s.yon);
// a reading that shares nothing with the words is asked about, never used silently
await ev(()=>{AS.x=AS.y=null;AS.txt={x:'',y:''};$('#asX').value='room rate premium';$('#asQ').innerHTML=''});await p.click('#asGo');await p.waitForFunction(()=>!AS.busy,null,{timeout:240000});
s=await ev(()=>({x:AS.x,q:$('#asQ').innerText}));t(!s.x&&/could not find/.test(s.q),'a line that does not match the words is asked about: '+s.q.slice(0,140));
t(!errs.length,'no page errors '+errs.join(';'));console.log(ok.join('\n'));await b.close();
