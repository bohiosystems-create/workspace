// The agents' checks added after round 21, with stand-in AIs that check what a real reviewer is asked to check:
// a goal seek audited (a query when the output solved is not the figure asked), the what-if reviewers given the cells with their
// labels and the app's own warnings, the AI map at upload (the fund's own facility balance, results it names, a headline it doubts asked
// in the chat), the function check at upload, and a report pack checked against its audience before it is sent.
import {chromium} from 'playwright';
const F=new globalThis.URL('./fixtures/models/',import.meta.url).pathname;const base=process.argv[2]||'http://localhost:4090/?mode=readonly';
const b=await chromium.launch({executablePath:process.env.PW_CHROMIUM||undefined}),p=await b.newPage();await p.route(/cdn\.jsdelivr\.net|unpkg\.com|cdnjs\.cloudflare\.com/,r=>r.abort());await p.route('https://fonts.googleapis.com/**',r=>r.fulfill({status:200,contentType:'text/css',body:''}));const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.route('**/api/log',r=>r.fulfill({status:200,body:'{}'}));
const SEEN={review:[],map:0,rep:[]};let MAP={};
await p.route('**/api/llm',async r=>{if(r.request().method()==='GET')return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({providers:{anthropic:true,openai:true}})});
  const j=JSON.parse(r.request().postData()),pl=j.payload,sys=String(pl.system||(pl.messages[0]&&pl.messages[0].role==='system'?pl.messages[0].content:'')),msgs=pl.messages||[],user=String((msgs[msgs.length-1]||{}).content||'');
  const reply=t=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(j.provider==='openai'?{choices:[{message:{content:t},finish_reason:'stop'}]}:{model:pl.model,content:[{type:'text',text:t}],stop_reason:'end_turn'})});
  // a goal-seek reviewer: queries when the user asked for an IRR and the output solved is another figure
  if(/You audit an exact goal seek/.test(sys)){const asked=(user.match(/The user asked: (.*)/)||[])[1]||'',solved=(user.match(/Output solved: “([^”]+)”/)||[])[1]||'';const q=/\birr\b/i.test(asked)&&!/irr/i.test(solved);return reply(JSON.stringify({verdict:q?'query':'agree',why:q?`the user asked for an IRR but ${solved} was solved`:'right input, output and units'}))}
  if(/You are the third analyst/.test(sys))return reply(JSON.stringify({right:'flawed',why:'the output solved is not the figure asked'}));
  if(/You audit an exact recalculation/.test(sys)){SEEN.review.push(user);return reply(JSON.stringify({verdict:'agree',why:'ok',results:[]}))}
  if(/You map the structure of a real estate financial model/.test(sys)){SEEN.map++;return reply(JSON.stringify(MAP))}
  if(/You review a report pack/.test(sys)){SEEN.rep.push(user);const miss=/missing from the pack/.test(user);return reply(JSON.stringify({verdict:miss?'query':'agree',why:miss?'the lender will ask for the loan balance profile':'complete'}))}
  if(/You read a sentence/.test(sys)&&/construction/i.test(user))return reply(JSON.stringify({changes:[{label:'Construction (half-years)',cell:'Inputs!B6',kind:'to',value:9,sure:true}]}));
  reply('{}')});
let pass=0,fail=0;const ok=(c,name,detail)=>{c?pass++:fail++;console.log((c?'PASS':'FAIL')+' | '+name+(detail?' → '+String(detail).slice(0,300):''))};
const up=async m=>{await p.evaluate(()=>openNewProject());await p.setInputFiles('#npFile',F+m);await p.waitForTimeout(1800);await p.click('#npCreate');await p.waitForTimeout(3000)};
await p.goto(base);await p.evaluate(()=>localStorage.clear());await p.reload();await p.waitForTimeout(1500);

// 1. goal seeks are audited: a query when the output solved is not the one asked, agreement when it is
await up('desk_condo_usd.xlsx');
for(const [q,want,name] of [['what presales give a 21.2% IRR',/Questioned/,'a goal seek solving another figure than the one asked is questioned'],['what presales give a 21.2% profit on cost',/Reviewed by/,'a goal seek on the figure asked is reviewed and agreed']]){
  const r=await p.evaluate(async q=>{const o=await handle(q,'wa','analyst',{k:'xsolve',assumption:'presales',cell:'Assumptions!B7',metric:'profit_on_cost',target:21.2,text:q});return o.plain},q);ok(want.test(r),name,r.replace(/\n/g,' '))}

// 2. the what-if reviewers see each cell with its label and sheet, and the app's own warnings
await up('r21_ppp_gbp.xlsx');
await p.evaluate(async()=>{try{await aiCrossCheck([{text:'construction 9 half-years'}],async()=>{},undefined,{quiet:true})}catch(e){}});await p.waitForTimeout(500);
const rv=SEEN.review.pop()||'';ok(/Each cell set, with the label and sheet the model gives it: Inputs!B6 \(“Construction \(half-years\)”/.test(rv),'the reviewers get each cell set with its label and sheet',rv.match(/Each cell set[^\n]*/)?.[0]);
ok(/The app's own warnings on this result: /.test(rv)&&/Result cells read: /.test(rv),'the reviewers get the result cells and the app’s own warnings, and are asked to query a missing one',rv.match(/The app's own warnings[^\n]*/)?.[0]);

// 3. the AI map at upload: the fund's own facility balance, a result it names, a headline it doubts asked in the chat
MAP={results_sheet:'Returns',headline_check:[{key:'levered_irr',ok:true},{key:'peak_debt',ok:false,why:'Peak facility is the fund line; check it is not one deal’s',cell:''}],debt_balance_row:"'Cash Flow'!A13",key_results:[{label:'Peak facility (fund)',cell:'Returns!B11'},{label:'Deal B loan balance at exit',cell:"'Deal B Resi Dev'!B26"}]};
await up('r21_fundc_usd.xlsx');await p.waitForTimeout(6000);
const m=await p.evaluate(()=>{const x=latestExport();return{map:x.aimap,debt:x.debtRow&&{sheet:x.debtRow.sheet,label:x.debtRow.label,by:x.debtRow.by},more:(x.more||[]).filter(r=>r.ai).map(r=>r.label),q:(layoutQuestions(x)||[]).map(q=>q.id)}});
ok(SEEN.map>=1&&m.map&&m.map.results==='Returns','the AI map runs at upload',JSON.stringify(m.map));
ok(m.debt&&m.debt.sheet==='Cash Flow'&&/Facility balance/.test(m.debt.label),'the loan balance row is the fund’s own facility (the AI’s row, read by the engine)',JSON.stringify(m.debt));
ok(m.q.includes('head:peak_debt'),'a headline the AI doubts is asked in the chat',m.q.join(','));
// the rule fallback alone (no AI) takes the consolidated cash flow, not a deal's loan
const rule=await p.evaluate(async()=>{const dr=await xcQ(()=>xcCall({op:'findrow',re:'^(senior |perm |total |net )?(loan|debt|facility|murabaha|ijara|mezz\\w*|bridge|sub line|mortgage)\\s*(balance|outstanding|closing)'}));return dr&&dr.sheet+' · '+dr.label});
ok(/^Cash Flow · Facility balance/.test(rule||''),'without the AI the rules take the consolidated cash flow’s balance, not one deal’s loan',rule);

// 4. the function check at upload: unverified functions named with their cell; none on a model of verified functions
await up('fn_unverified.xlsx');await p.waitForTimeout(1500);
const fc=await p.evaluate(()=>{const x=latestExport();return{note:xcFnNote(x),chat:[...document.querySelectorAll('#msgs .msg.agent')].map(e=>e.textContent).filter(t=>/Not yet verified/.test(t)).slice(-1)[0]||''}});
ok(/GCD \(Returns!B5\)/.test(fc.note)&&/FISHER \(Returns!B6\)/.test(fc.note),'functions not yet verified are named with their cell',fc.note);ok(/Not yet verified/.test(fc.chat),'and said in the chat once the model is loaded',fc.chat.slice(0,200));
await up('r21_ppp_gbp.xlsx');await p.waitForTimeout(800);const fc2=await p.evaluate(()=>xcFnNote(latestExport()));ok(fc2==='','a model of verified functions gets no note',fc2);

// 5. a lender pack checked against its audience, and reviewed before it is sent
const ck=await p.evaluate(()=>{const c=rpCheck('lender');return c&&{aud:c.aud,items:c.items.map(i=>i.l+':'+i.st)}});
ok(ck&&ck.aud==='a lender'&&ck.items.some(i=>/^DSCR/.test(i))&&ck.items.some(i=>/^LLCR/.test(i)),'the lender pack is checked for what a lender looks for',JSON.stringify(ck));
await p.evaluate(()=>{showView('report');selectReport&&selectReport('lender')}).catch(()=>{});await p.evaluate(()=>{RSEL='lender';renderReport()});await p.waitForTimeout(800);
const box=await p.evaluate(()=>($('#rpCheckBox')||{}).textContent||'');ok(/Checklist for a lender/.test(box),'the checklist shows above the pack, not in it',box.slice(0,240));
const sent=await p.evaluate(async()=>{const o=await handle('send the lender report to finance@kinan.com.sa','web','analyst',{k:'sendreport',o:{k:'lender',to:'finance@kinan.com.sa'}});return o.plain});
ok(/Checklist for a lender/.test(sent)||/everything they look for/.test(box),'sending says what the lender will miss',sent.replace(/\n/g,' '));
if(errs.length){fail++;console.log('FAIL | page errors: '+errs.join(' | ').slice(0,300))}console.log('\n'+pass+' pass, '+fail+' fail');await b.close();
