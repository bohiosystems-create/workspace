// AI first: the reader names the cells it means and the app uses them; only certain checks overrule it (a percentage above 100%, a case
// column the model does not run on). A rule-based reading that differs is noted, never turned into a question.
import {chromium} from 'playwright';
const F=new globalThis.URL('./fixtures/models/',import.meta.url).pathname;const base=process.argv[2]||'http://localhost:4090/?mode=readonly';
let READ=null;
const CASES=[['desk_condo_usd','presales only 35%',{changes:[{label:'Presold before construction',cell:'Assumptions!B7',kind:'to',value:35,sure:true}]},'Presold before construction: Assumptions!B7 55% → 35%'],
 ['desk_condo_usd','price the 2BRs at $1,000 a foot',{changes:[{label:'2B · Price Psf',cell:"'Price List'!B4",kind:'to',value:1000,sure:true}]},"→ 1,000"],
 ['desk_tower_options_sar','murabaha at 7%',{changes:[{label:'Profit rate · Option A',cell:'Options!C17',kind:'to',value:7,sure:true}]},'Profit rate · Option A: Options!C17 6.5% → 7%'],
 ['desk_office_refurb_gbp',"Arden doesn't renew",{changes:[{label:'Arden Legal · Renewal Probability',cell:"'Rent Roll'!E4",kind:'to',value:0,sure:true}]},"Rent Roll'!E4 60% → 0%"],
 ['desk_office_refurb_gbp','ERVs 5% lower',{changes:[{label:'ERV',cell:"'Rent Roll'!F4",cells:["'Rent Roll'!F4","'Rent Roll'!F5","'Rent Roll'!F6","'Rent Roll'!F7","'Rent Roll'!F8"],kind:'pct',value:-5,sure:true}]},'(5 cells) 72 → 68.4'],
 ['desk_btr_usd','rents to 2000',{changes:[{label:'Rent growth',cell:'Inputs!B16',kind:'to',value:2000,sure:true}]},'ASK'],   // a wrong AI reading caught by a hard check
 ['desk_fund_eur','2 and 20',{changes:[{label:'Management fee (% of committed p.a.)',cell:'Fund!B14',kind:'to',value:2,sure:true},{label:'Carried interest',cell:'Fund!B15',kind:'to',value:20,sure:true}]},'Carried interest: Fund!B15 20% → 20%'],
 ['desk_student_gbp','occupancy 94%',{changes:[{label:'Occupancy · Downside',cell:'Assumptions!D5',kind:'to',value:94,sure:true}]},'Occupancy · Base: Assumptions!C5 97% → 94%'],   // the AI picked a case column the model does not run on
 ['desk_tower_options_sar','switch to option B',{changes:[{label:'Selected option (A or B)',cell:'Options!C3',kind:'text',value:'B',sure:true}]},'Options!C3 A → B'],
 ['desk_refi_chf','margin 50 bps wider',{changes:[{label:'Credit margin (bps)',cell:'Assumptions!B7',kind:'abs',value:50,sure:true}]},'165 → 215'],
 ['desk_refi_chf','margin 50 bps tighter',{changes:[{label:'Credit margin (bps)',cell:'Assumptions!B7',kind:'abs',value:50,sure:true}]},'ASK']];   // the sentence says which way and the AI moves the line the other way: a certain check, the user decides
const b=await chromium.launch({executablePath:process.env.PW_CHROMIUM||undefined}),p=await b.newPage();await p.route(/cdn\.jsdelivr\.net|unpkg\.com|cdnjs\.cloudflare\.com/,r=>r.abort());await p.route('https://fonts.googleapis.com/**',r=>r.fulfill({status:200,contentType:'text/css',body:''}));const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.route('**/api/log',r=>r.fulfill({status:200,body:'{}'}));
await p.route('**/api/llm',async r=>{if(r.request().method()==='GET')return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({providers:{anthropic:true,openai:true}})});
  const j=JSON.parse(r.request().postData()),pl=j.payload,sys=String(pl.system||(pl.messages[0]&&pl.messages[0].role==='system'?pl.messages[0].content:''));
  const reply=t=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(j.provider==='openai'?{choices:[{message:{content:t},finish_reason:'stop'}]}:{model:pl.model,content:[{type:'text',text:t}],stop_reason:'end_turn'})});
  if(/You read a sentence/.test(sys))return reply(JSON.stringify(READ));if(/You audit an exact recalculation/.test(sys))return reply(JSON.stringify({verdict:'agree',why:'ok',results:[]}));
  if(/You decide which typed input cells/.test(sys))return reply('{}');reply('{}')});
await p.goto(base);await p.evaluate(()=>localStorage.clear());await p.reload();await p.waitForTimeout(1500);
let cur='';let pass=0,fail=0;
for(const [m,q,read,want] of CASES){if(m!==cur){await p.evaluate(()=>openNewProject());await p.setInputFiles('#npFile',F+m+'.xlsx');await p.waitForTimeout(1800);await p.click('#npCreate');await p.waitForTimeout(3000);cur=m}
  READ=read;const r=await p.evaluate(async q=>{const st=[];try{const res=await aiCrossCheck([{text:q}],async s=>st.push(String(s&&s.text||s).slice(0,160)),undefined,{quiet:true});return res.desc.join(' ; ')+'  [steps: '+st.filter(s=>/reads it|not the case|rule-based/.test(s)).join(' | ')+']'}catch(e){return 'ASK: '+String(e.message).slice(0,160)}},q);
  const good=want==='ASK'?r.startsWith('ASK'):r.includes(want);good?pass++:fail++;console.log((good?'PASS':'FAIL')+' | '+m+' · '+q+' → '+r.slice(0,330))}
// goal seek takes the AI's cell first: “presales” names no line by the rules, the cell does; a cell that is not an input falls back to the name
await p.evaluate(()=>openNewProject());await p.setInputFiles('#npFile',F+'desk_condo_usd.xlsx');await p.waitForTimeout(1800);await p.click('#npCreate');await p.waitForTimeout(3000);
for(const [cell,want,name] of [['Assumptions!B7',/Presold before construction/,'goal seek uses the AI’s cell'],['Assumptions!Z99',/not a typed input/,'a cell that is not an input is said, and the name is used instead']]){
  const r=await p.evaluate(async cell=>{const st=[];const o=await xcSolve('presales','profit_on_cost',20,async s=>st.push(String(s)),cell);return JSON.stringify(o).slice(0,300)+' [steps: '+st.join(' | ').slice(0,300)+']'},cell);
  const good=want.test(r);good?pass++:fail++;console.log((good?'PASS':'FAIL')+' | '+name+' → '+r.slice(0,330))}
if(errs.length){fail++;console.log('FAIL | page errors: '+errs.join(' | ').slice(0,200))}console.log('\n'+pass+' pass, '+fail+' fail');await b.close();
