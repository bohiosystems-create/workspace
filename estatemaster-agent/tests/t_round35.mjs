// Round 35: the model map. The workbook's structure read once (the AI's reading where its proof holds, the rules' otherwise), every entry proved
// on the workbook, two proved readings of one figure put to the user, a correction proved before it is used, all behind the Settings switch.
// Synthetic fixture: fixtures/models/r34_fund_sar.xlsx (fixtures/gen/gen34.py), figures from LibreOffice: fund gross IRR 14.44%, LP net 13.10%.
import {chromium} from 'playwright';
const F=new globalThis.URL('./fixtures/models/',import.meta.url).pathname;const base=process.argv[2]||'http://localhost:4090/?mode=readonly';
const b=await chromium.launch({executablePath:process.env.PW_CHROMIUM||undefined}),p=await (await b.newContext({viewport:{width:1500,height:1000}})).newPage();await p.route(/cdn\.jsdelivr\.net|unpkg\.com|cdnjs\.cloudflare\.com/,r=>r.abort());
let AI=null;   // the AI's map reply for the next upload; null = no AI connected
await p.route('**/api/log',r=>r.fulfill({status:200,body:'{}'}));
await p.route('**/api/llm',async r=>{if(r.request().method()==='GET')return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({providers:AI?{anthropic:true,openai:true}:{}})});if(!AI)return r.fulfill({status:503,body:'{}'});
  const j=JSON.parse(r.request().postData()),pl=j.payload,sys=String(pl.system||(pl.messages[0]&&pl.messages[0].role==='system'?pl.messages[0].content:''));
  const reply=t=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(j.provider==='openai'?{choices:[{message:{content:t},finish_reason:'stop'}]}:{model:pl.model,content:[{type:'text',text:t}],stop_reason:'end_turn'})});
  if(/"headlines":\[/.test(sys))return reply(JSON.stringify(AI));return reply('{}')});
const errs=[];p.on('pageerror',e=>errs.push(e.message));let pass=0,fail=0;const t=(c,m)=>{console.log((c?'PASS':'FAIL')+' | '+m);c?pass++:fail++};
const up=async(on=true)=>{await p.goto(base);await p.evaluate(o=>{localStorage.clear();if(o)localStorage.setItem('em_map2','1')},on);await p.reload();await p.waitForTimeout(1500);
  await p.evaluate(()=>openNewProject());await p.setInputFiles('#npFile',F+'r34_fund_sar.xlsx');await p.waitForTimeout(1800);await p.click('#npCreate');
  for(let i=0;i<40;i++){await p.waitForTimeout(500);if(await p.evaluate(()=>{const x=latestExport();return !!(x&&x.map)}))break}await p.waitForTimeout(500)};
const st=()=>p.evaluate(()=>{const x=latestExport(),m=x.map;return{has:!!m,by:m&&m.by,lev:x.cells.levered_irr,levv:x.out.levered_irr,lp:x.cells.lp_irr,np:x.cells.net_profit,npv:x.out.net_profit,proof:m&&m.proof,ask:m&&m.ask?Object.keys(m.ask):[],hold:m&&m.hold&&m.hold.cell,sw:m&&m.scenario&&m.scenario.switch,
  card:([...document.querySelectorAll('#msgs .mapcard')].pop()||{}).innerText||''}});
const base34={units:[{sheet:'Summary',scale:1000,currency:'SAR',evidence:'Summary!B3'}],scenario:{switch:'Assumptions!C7',names:['Base','Upside','Downside']},timeline:{sheet:'Cash Flow',period:'quarter',first:'Cash Flow!E3',count:24},hold:{cell:'Assumptions!C6',unit:'quarters'}};
const H=(k,cell,label,definition)=>({key:k,cell,label,definition});
// 1. no AI: the rules' reading, each entry proved
await up();{const s=await st();
  t(s.has&&/rules/.test(s.by),'no AI: the map is the rules’ reading: '+s.by);
  t(s.lev==='Summary!F6'&&Math.abs(s.levv-14.44)<0.01&&s.proof['h:levered_irr']==='ok'&&s.proof['cf:levered_irr']==='ok','levered IRR is the fund gross IRR (pre-promote), its cash flow reproduces it: '+s.lev+' '+s.levv);
  t(s.lp==='Summary!F7'&&s.proof['cf:lp_irr']==='ok','the LP net IRR is its own figure, proved on the LP cash flow: '+s.lp);
  t(s.np==='Summary!C8'&&Math.round(s.npv)===600000000,'net profit is the project profit in full SAR (sheet in SAR ’000): '+s.npv);
  t(s.sw&&/C7/.test(s.sw)&&s.proof.scenario==='ok','the scenario switch is found and moves the results: '+s.sw);
  t(s.hold&&/C6/.test(s.hold)&&s.proof.hold==='ok','the fund term is the hold input, proved: '+s.hold);
  t(/How I read r34_fund_sar\.xlsx/.test(s.card)&&/Fund gross IRR/.test(s.card)&&/✓ proved/.test(s.card)&&/This is right/.test(s.card),'the card shows the reading, the proofs and the confirm button');
  await p.click('[data-mapok]');await p.waitForTimeout(300);t(await p.evaluate(()=>latestExport().mapOk===true),'“This is right” saves the confirmation with the model')}
{const r=await p.evaluate(async()=>{const x=latestExport();const ms=mapSummary(x);const o=await execute('run the downside case','web','IM',async()=>{});return{ms,plain:o.out.plain,names:x.map.scenario.names}});
  t(/Summary!F6 “Fund gross IRR/.test(r.ms)&&/thousands of SAR/.test(r.ms)&&/scenario switch is .*C7.*3 = Downside/.test(r.ms),'the AI reading questions is given the map: names, units, the switch and its cases');
  t(/6\.78%/.test(r.plain)&&/C7/.test(r.plain),'“run the downside case” sets the map’s switch to Downside: fund gross IRR 6.78% as LibreOffice: '+r.plain.slice(0,200))}
{const r=await p.evaluate(async()=>{const x=latestExport();await xcCacheMore(x);return{a:xcHeadCheck('Net profit is SAR 600,000 on this scheme.'),b:xcHeadCheck('Net profit is SAR 63.78M.'),c:xcHeadCheck('Net profit is SAR 600M.'),d:xcHeadCheck('After the change net profit moves to SAR 512.3M.')}});
  t(/Units/.test(r.a)&&/600M/.test(r.a),'an answer giving net profit in thousands as SAR is flagged as a units slip: '+r.a.slice(0,120));
  t(/Two figures under one name/.test(r.b)&&/Sponsor/.test(r.b),'an answer giving the sponsor’s profit as net profit is flagged with both cells: '+r.b.slice(0,140));
  t(r.c===''&&r.d==='','the model’s own figure, and a what-if result, are not flagged')}
// 2. the AI reads the LP net IRR as the levered IRR, on the LP cash flow: both readings prove, so the user is asked; their choice is applied
AI={...base34,headlines:[H('levered_irr','Summary!F7','LP net IRR (after all fees & promote)','equity'),H('unlevered_irr','Summary!C10','Project unlevered IRR','project'),H('net_profit','Summary!C8','Project profit (unlevered)','project')],cashflows:[{irr:'levered_irr',row:'Cash Flow!E18:AB18'},{irr:'unlevered_irr',row:'Cash Flow!E9:AB9'}]};
await up();{const s=await st();t(s.lev==='Summary!F6'&&!s.ask.length&&/house definition/.test(s.card),'two proved readings, settled by the house definition (levered IRR = the fund’s gross IRR): '+s.lev)}
await p.evaluate(()=>localStorage.setItem('em_house',JSON.stringify({levered_irr:'lp'})));await p.evaluate(async()=>{const x=latestExport();delete x.map;await mapStart(x)});{const s=await st();t(s.lev==='Summary!F7','with the house definition set to the LPs’ net IRR, the same two readings settle the other way: '+s.lev)}
const up2=async()=>{await p.goto(base);await p.evaluate(()=>{localStorage.clear();localStorage.setItem('em_map2','1');localStorage.setItem('em_house',JSON.stringify({levered_irr:'unset'}))});await p.reload();await p.waitForTimeout(1500);
  await p.evaluate(()=>openNewProject());await p.setInputFiles('#npFile',F+'r34_fund_sar.xlsx');await p.waitForTimeout(1800);await p.click('#npCreate');for(let i=0;i<40;i++){await p.waitForTimeout(500);if(await p.evaluate(()=>{const x=latestExport();return !!(x&&x.map)}))break}await p.waitForTimeout(500)};
await up2();{const s=await st();
  t(s.ask.includes('levered_irr')&&s.proof['h:levered_irr']==='ask','two proved readings of the levered IRR: the user is asked, nothing silently picked');
  t(s.lev==='Summary!F6','until the user answers, the figure stays as read: '+s.lev);t(/two cells both hold up/.test(s.card)&&/Summary!F7/.test(s.card)&&/Summary!F6/.test(s.card),'the card shows both cells with their values');
  await p.click('[data-mapask$="|levered_irr|Summary!F6"]');await p.waitForTimeout(800);const s2=await st();t(s2.lev==='Summary!F6'&&!s2.ask.includes('levered_irr')&&s2.proof['h:levered_irr']==='ok','the user’s choice is applied and proved: '+s2.lev)}
// 3. the AI names a cell its cash flow does not reproduce: not proved, so the rules' proved reading is used
AI={...base34,headlines:[H('levered_irr','Summary!F7','LP net IRR','equity')],cashflows:[{irr:'levered_irr',row:'Cash Flow!E16:AB16'}]};
await up();{const s=await st();t(s.lev==='Summary!F6'&&!s.ask.length,'an AI reading its own cash flow does not reproduce is not used: '+s.lev)}
// 4. a correction in the chat is proved before it is used
{const r=await p.evaluate(async()=>{const o=await execute('levered IRR is Summary!F7','web','IM',async()=>{});const x=latestExport();return{plain:o.out.plain,lev:x.cells.levered_irr,ok:x.mapOk}});
  t(/Proved and applied/.test(r.plain)&&r.lev==='Summary!F7'&&r.ok===false,'“levered IRR is Summary!F7” is proved, applied, and the reading is to be confirmed again: '+r.plain.slice(0,60))}
{const r=await p.evaluate(async()=>{const o=await execute('show how you read the model','web','IM',async()=>{});return o.out.html});t(/How I read/.test(r),'“show how you read the model” shows the card')}
// 5. switched off, nothing changes
AI=null;await up(false);{const s=await st();t(!s.has&&!s.card,'with the switch off, no map is built and no card is shown')}
t(!errs.length,'no page errors: '+errs.join(' | '));console.log(`${pass} pass, ${fail} fail`);await b.close();process.exit(fail?1:0);
