// A figure is not one number in one cell, and a rule lives in code: rows that are 0 where a line is off are judged by their values, unit
// words name figures, cells holding errors are said with their code (at upload and after a change); reports go to internal addresses only
// whichever path sends them; a jurisdiction or a hurdle is recorded only when the user says it; a return's move is not held to the model's
// IRRs; technical errors are put in plain words; file names lose any path; an answer's own buttons are never hidden.
import {chromium} from 'playwright';import fs from 'fs';
const F=new globalThis.URL('./fixtures/models/',import.meta.url).pathname;const base=process.argv[2]||'http://localhost:4090/?mode=readonly';
const b=await chromium.launch({executablePath:process.env.PW_CHROMIUM||undefined}),p=await (await b.newContext({viewport:{width:1500,height:1000}})).newPage();
await p.route('**/api/**',r=>r.fulfill({status:404,body:''}));await p.route(/cdn\.jsdelivr\.net|unpkg\.com|cdnjs\.cloudflare\.com/,r=>r.abort());
const errs=[];p.on('pageerror',e=>errs.push(e.message));
let pass=0,fail=0;const ok=(c,name,detail)=>{c?pass++:fail++;console.log((c?'PASS':'FAIL')+' | '+name+(detail?' → '+(typeof detail==='string'?detail:JSON.stringify(detail)).slice(0,400):''))};
const near=(a,e,tol=1e-6)=>Number.isFinite(a)&&Math.abs(a-e)<=tol*Math.max(1,Math.abs(e));
const irrOf=c=>{let lo=-0.99,hi=1;for(let i=0;i<300;i++){const m=(lo+hi)/2,v=c.reduce((s,x,t)=>s+x/(1+m)**t,0);v>0?lo=m:hi=m}return lo};
await p.goto(base);await p.evaluate(()=>localStorage.clear());await p.reload();await p.waitForTimeout(1500);
await p.evaluate(()=>openNewProject());await p.setInputFiles('#npFile',F+'r42_shape_sar.xlsx');await p.waitForSelector('#npCreate:not([disabled])',{timeout:120000});await p.click('#npCreate');await p.waitForTimeout(4000);
await p.evaluate(async()=>{await xcEngine(latestExport())});await p.waitForTimeout(2500);

// 1. unit words name figures; a row that is 0 for 9 periods is read by its first value that is not 0
let r=await p.evaluate(()=>{const x=latestExport(),g=l=>(x.inputs.find(i=>i.label===l)||{});return{gfa:g('GFA').value,nla:g('NLA').value,yrs:g('Years').value,occ:g('Occupancy').value,cell:g('Occupancy').cell,irr:x.out.unlevered_irr}});
const cost=-50000*4000/3,rent=o=>40000*1200*o,cf=[cost,cost,cost,0,0,0,0,0,0,rent(.6),rent(.9),rent(.95)+rent(.95)/0.07];
ok(r.gfa===50000&&r.nla===40000&&r.yrs===10,'unit words first in a row name their figure (GFA, NLA, Years)',r);
ok(near(r.occ,0.6)&&/C2$/.test(r.cell||'')===false&&/B2$/.test(r.cell||''),'a row at 0 for its first 9 periods is judged by its first value that is not 0 (0.6), its address kept',r);
ok(near(r.irr,irrOf(cf)*100,1e-5),'the workbook recalculates as the hand calculation',{app:r.irr,hand:irrOf(cf)*100});
r=await p.evaluate(()=>{const x=latestExport();const a=xcAiPlan(x,{label:'Occupancy',cell:'Cash Flow!B2',kind:'to',value:150,sure:true},'AI'),why=window.XC_WHY;const c=xcAiPlan(x,{label:'Occupancy',cell:'Cash Flow!B2',kind:'to',value:90,sure:true},'AI');window.ASKED='occupancy to 90%';const w=c&&xcShiftVals(c.p.inp,[0,0,0.6,0.95],c.p.kind,c.p.s);return{a,why,c:w}});
ok(r.a===null&&/above 100%/.test(r.why)&&JSON.stringify(r.c)==='[0,0,0.9,0.9]','on that row, 150% is refused and 90% is 0.9 (its first cells are 0)',r);

// 2. a headline that gives an error is said at upload with its cell and code, not read as missing
r=await p.evaluate(()=>[...document.querySelectorAll('#msgs .msg.agent')].map(m=>m.innerText).join('\n'));
ok(/Levered IRR \(Returns!B2\) gives #NUM! in the workbook: the cash flow it reads \('Cash Flow'!B7:M7\) is never positive, so there is no IRR to find/.test(r),'the levered IRR that gives #NUM! is said at upload, with its cell',r.slice(-400));
// after a change that leaves the unlevered IRR with no root, the answer names the error (no AI: the rules' reading is confirmed by sending it again)
const ask=async q=>{const n0=await p.evaluate(()=>document.querySelectorAll('#msgs .msg.agent').length);await p.evaluate(t=>{toggleDock(true);webAsk(t)},q);await p.waitForTimeout(500);await p.waitForFunction(()=>!busy,null,{timeout:200000}).catch(()=>{});await p.waitForTimeout(1200);return p.evaluate(n0=>[...document.querySelectorAll('#msgs .msg.agent')].slice(n0).map(m=>m.innerText).join('\n'),n0)};
await ask('Rent per sqm to 0');const t=await ask('Rent per sqm to 0');
ok(/Unlevered IRR\s+[\d.]+%\s+#NUM!/.test(t),'after a change, an output that becomes an error is named with its code',t.slice(0,400));

// 3. reports and alerts go to internal addresses only, whichever path sends them
r=await p.evaluate(async()=>{MAILCFG.domains=['kinan.com.sa'];const a=persMail('cfo@kinan.com.sa, x@other.com, y@gmail.com');const run=await runReport('ic','now','x@other.com');const run2=await runReport('ic','now','board@kinan.com.sa');
  openSched('ic');$('#schCh').value='Email (Outlook)';$('#schOn').checked=true;$('#schTo').value='me@gmail.com';saveSched();const msg=$('#schMsg').innerText;return{a,run:run&&run.status,err:run&&run.error,run2:run2&&run2.status,msg}});
ok(JSON.stringify(r.a)==='["x@other.com","y@gmail.com"]'&&r.run==='failed'&&/not on the company's domains \(kinan\.com\.sa\)/.test(r.err)&&r.run2!=='failed'&&/Not saved\. .*me@gmail\.com is a personal mailbox/.test(r.msg),'one check at the place that sends and where recipients are saved: another domain and a personal mailbox are refused, a company address goes',r);

// 4. a jurisdiction or a hurdle is recorded only when the user says it (or confirms it)
r=await p.evaluate(()=>{const T=(q,n,a)=>{window.ASKED=q;return toolIntent(n,a).k};return[T('What is the IRR?','set_jurisdiction',{jurisdiction:'KSA_CMA'}),T('It is in Riyadh','set_jurisdiction',{jurisdiction:'KSA_CMA'}),T('What is the IRR?','set_hurdle',{hurdle:15}),T('Use a 15% hurdle','set_hurdle',{hurdle:15}),T('yes','set_hurdle',{hurdle:15})]});
ok(JSON.stringify(r)==='["nohit","jurset","nohit","note","note"]','a jurisdiction or a hurdle the user did not say is asked, not recorded; said or confirmed, it is',r);

// 5. a return's move is a change, not an IRR the model must have; a level that is not the model's still is flagged
r=await p.evaluate(()=>[xcComputedCheck('A 1% move of Cost moves the Levered IRR by -43%.'),xcComputedCheck('The levered IRR is 33.33%.')]);
ok(r[0]===''&&/Not computed/.test(r[1]),'“moves the IRR by −43%” is not held to the model’s figures; an IRR level that is not the model’s is',r);

// 6. technical errors in plain words; file names without paths; an answer's buttons are never hidden
r=await p.evaluate(()=>{toast('Could not open it: Failed to fetch');const a=document.querySelector('#toast').textContent;const b2=plainErr('Bad compressed size: 0 != 149');const c=plainErr('The hurdle must be a number.');return{a,b:b2,c}});
ok(/connection failed/.test(r.a)&&!/Failed to fetch/.test(r.a)&&/damaged or incomplete/.test(r.b)&&r.c==='The hurdle must be a number.','technical errors are put in plain words in toasts and answers; a plain message is left as written',r);
r=await p.evaluate(async b64=>{const u=Uint8Array.from(atob(b64),c=>c.charCodeAt(0));await addWorkbook('C:\\\\Users\\\\x\\\\..\\\\deal.xlsx',u.buffer,{quiet:true});return FILES.map(f=>f.name)},fs.readFileSync(F+'r42_shape_sar.xlsx').toString('base64')).catch(e=>({e:e.message}));
ok(JSON.stringify(r).includes('deal.xlsx')&&!JSON.stringify(r).includes('Users'),'a workbook added with a path in its name keeps only the name',r);
r=await p.evaluate(()=>{document.body.classList.add('chat-asked');const m1=addMsg('agent','<div class="chips"><span class="qchip" role="button" data-jurset="KSA_CMA">Saudi Arabia</span><span class="qchip" role="button" data-jurset="other">Neither</span></div>');const m2=addMsg('agent','<div class="chips"><span class="qchip" data-q="Old suggestion">Old suggestion</span></div>');
  const vis=e=>getComputedStyle(e).display!=='none'&&!!e.offsetParent;return{ans:[...m1.querySelectorAll('.qchip')].every(vis),sug:[...m2.querySelectorAll('.qchip')].some(vis)}});
ok(r.ans&&!r.sug,'once the user has asked, an answer’s own buttons stay visible and only old suggestions are hidden',r);
ok(errs.length===0,'no page errors',errs.join(' | '));
console.log(`\n${pass} pass, ${fail} fail`);await b.close();process.exit(fail?1:0);
