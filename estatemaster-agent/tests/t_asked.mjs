// Nothing the user names is swapped quietly, in any tool. Every AI tool and the analyst toolkit are called with names the workspace does
// not have and values a tool cannot take as given: each answer either asks (with the options) or says under it what was used instead
// (“Not as asked”). The matcher, the clamps and the no-AI request check are tested directly too.
import {chromium} from 'playwright';
const F=new globalThis.URL('./fixtures/models/',import.meta.url).pathname;const base=process.argv[2]||'http://localhost:4090/?mode=readonly';
const b=await chromium.launch({executablePath:process.env.PW_CHROMIUM||undefined}),p=await (await b.newContext({viewport:{width:1500,height:1000}})).newPage();
await p.addInitScript(()=>{window.BOHIO_BRAND='jadwa'});
await p.route('**/api/**',r=>r.fulfill({status:404,body:''}));await p.route(/cdn\.jsdelivr\.net|unpkg\.com|cdnjs\.cloudflare\.com/,r=>r.abort());
const errs=[];p.on('pageerror',e=>errs.push(e.message));
let pass=0,fail=0;const ok=(c,name,detail)=>{c?pass++:fail++;console.log((c?'PASS':'FAIL')+' | '+name+(detail?' → '+(typeof detail==='string'?detail:JSON.stringify(detail)).slice(0,400):''))};
const up=async f=>{await p.evaluate(()=>openNewProject());await p.setInputFiles('#npFile',F+f);await p.waitForSelector('#npCreate:not([disabled])',{timeout:120000}).catch(()=>{});await p.click('#npCreate');await p.waitForTimeout(4000);await p.evaluate(async()=>{await xcEngine(latestExport())})};
await p.goto(base);await p.evaluate(()=>localStorage.clear());await p.reload();await p.waitForTimeout(1500);
await up('r32_hold_usd.xlsx');await up('r33_waha_sar.xlsx');
/* a tool's intent: what it does with the arguments, and what it notes */
const TI=(name,args)=>p.evaluate(([name,args])=>{window.GAPS=[];const it=toolIntent(name,args);return{it:JSON.parse(JSON.stringify(it)),g:(window.GAPS||[]).join(' ')}},[name,args]);
/* a tool run to its answer */
const RUN=(it,asked)=>p.evaluate(async([it,asked])=>{window.ASKED=asked||'';window.GAPS=[];const o=await handle(asked||'','web','Investment Director',it);return{t:String(o.plain||'')+' '+String(o.html||'').replace(/<[^>]+>/g,' '),g:(window.GAPS||[]).join(' ')}},[it,asked]);
const said=r=>(r.it&&r.it.k==='nohit'&&!!r.it.msg)||/\b(no|not)\b[^.]*\b(called|named|is not|are not|one of)|Which one|which one\?|could be more than one/i.test((r.it&&r.it.msg)||r.t||'')||r.g.length>0;

// 1. the matcher: exact, close (said), none and several (asked), never a default
let r=await p.evaluate(()=>{window.GAPS=[];const L=['Investment Committee pack','Lender pack','Investor update','Investor quarterly'];const a=matchNamed('report','lender pack',L),c=matchNamed('report','committee',L),n=matchNamed('report','board deck',L),m=matchNamed('report','investor',L);return{a:a.how,c:[c.how,c.name],n:[n.how,missNamed('report','board deck',n)],m:[m.how,missNamed('report','investor',m)],g:(window.GAPS||[]).join(' ')}});
ok(r.a==='exact'&&r.c[0]==='close'&&r.c[1]==='Investment Committee pack'&&/“committee” is read as the report “Investment Committee pack”/.test(r.g)&&r.n[0]==='none'&&/No report is called “board deck”\. The reports are/.test(r.n[1])&&r.m[0]==='many'&&/could be more than one report: “Investor update”, “Investor quarterly”/.test(r.m[1]),'the matcher: an exact name is used, a close one is used and said, none or several is asked with the options',r);

// 2. every AI tool with a name the workspace does not have, or a value it cannot use: it asks, or it says what it used
const cases=[
  ['send_report',{report:'board pack'}],['schedule_report',{report:'ic',cadence:'fortnightly'}],['schedule_report',{report:'ic',time:'8am'}],
  ['build_report',{kind:'board deck'}],['design_report',{report:'board deck',instruction:'shorter'}],['play_report',{report:'board deck'}],
  ['get_series',{series:'rainfall'}],['get_series',{kind:'radar'}],['create_model',{template:'stadium'}],['create_model',{plot:'P1'}],
  ['solve_for_target',{target:15}],['set_assumptions',{changes:[{assumption:'rainfall',value:5}]}],['explain_change',{assumption:'rainfall'}],
  ['answer_clarification',{item:'zzz'}],['set_model_assumption',{id:'zzz',value:1}],['set_model_line',{id:'zzz',value:1}],
  ['extend_cashflow',{years:2,period:'fortnight'}],['estimate_scenario',{rainfall:5}],['schedule_report',{}],['play_report',{}]];
for(const [n,a] of cases){r=await TI(n,a);ok(said(r),`${n} ${JSON.stringify(a)}: asked or said, not swapped quietly`,{k:r.it.k,msg:r.it.msg,g:r.g})}
r=await p.evaluate(()=>{toolIntent('set_location',{district:'Olaya'});return PROJ.loc});ok(r&&r.district==='Olaya'&&r.city==='','a location given without a city gets no city invented (it was Riyadh)',r);
r=await TI('build_report',{kind:(await p.evaluate(()=>RPTS.ic.name)).split(' ').slice(0,2).join(' ')});ok(r.it.k==='report'&&r.it.kind==='ic'&&/is read as the report/.test(r.g),'a report named in part is used and the answer says how it was read',r);

// 3. tools run to their answer
r=await RUN({k:'dsquery',ds:'weather',q:''},'show the weather dataset');ok(/No dataset is called “weather”/.test(r.g),'an unknown dataset is said, its contents listed',r.g);
r=await RUN({k:'chart',spec:{type:'radar',title:'T',labels:['a','b'],values:[1,2]}},'a radar chart');ok(/A “radar” chart is not one I draw/.test(r.g),'a chart type it does not draw is said, and what it drew',r.g);
r=await RUN({k:'sendreport',o:{to:'finance@kinan.com.sa'}},'Send the board pack to finance@kinan.com.sa');ok(/no report called “board report”|There is no report called “board/i.test(r.t),'without an AI, “the board pack” that does not exist is asked about, not sent as the IC pack',r.t.slice(0,200));
r=await RUN({k:'sendreport',o:{k:'ic',to:'finance@kinan.com.sa'}},'Email the IC pack to finance@kinan.com.sa');ok(/Sending Investment Committee pack to finance@kinan\.com\.sa/.test(r.t)&&!r.g,'the IC pack named is sent as before, nothing noted',r.t.slice(0,160));

// 4. the analyst toolkit on the workbook: a return the model does not have, none named, values out of range, lines not found
const A=(tool,args,asked)=>RUN({k:'a33',tool,args},asked||'');
r=await A('tornado',{metric:'lp_irr',seconds:20,top:3});ok(/The model has no LP IRR, so Levered IRR/.test(r.g),'a return the model does not have: the one used is said',r.g);
r=await A('tornado',{seconds:20,top:3});ok(/No result was named, so Levered IRR is used; the model also reports Unlevered IRR/.test(r.g),'no return named on a model with two: the one used is said, with the other',r.g);
r=await A('tornado',{metric:'levered_irr',seconds:5,top:50});ok(/Inputs ranked: 50 was asked, 30 is used/.test(r.g)&&/Time for the ranking: 5s was asked, 20s is used/.test(r.g),'a top-50 and 5 seconds the ranking cannot do: what is used is said',r.g);
r=await A('sensitivity_grid',{x:'Exit cap rate',y:{label:'Stabilised rent',cell:'Inputs!B4'},steps:40,metric:'levered_irr'});ok(/Points per axis: 40 was asked, 11 is used/.test(r.g),'a grid with more points than it holds: what is used is said',r.g);
r=await A('monte_carlo',{variables:[{label:'Exit cap rate',pct_range:5}],runs:5,metric:'levered_irr'});ok(/Simulation runs: 5 was asked, 20 is used/.test(r.g),'a simulation with too few runs: what is used is said',r.g);
r=await A('line_over_time',{lines:['DSCR','LTV','Net operating income','Rent']});ok(/4 lines were asked; the first 3 are shown/.test(r.g),'more lines than the view shows: the ones left out are said',r.g);
r=await A('line_over_time',{line:'cost'});ok(/No line is called exactly “cost”; \d+ lines contain it/.test(r.g),'a line name several lines contain: the one used is said, with the others',r.g);
r=await A('shift_timing',{lines:['Construction cost'],periods:1});ok(/No unit was given for the move, so it is 1 months/.test(r.g),'a move with no unit: the unit used is said',r.g);
r=await A('fund_combine',{projects:['Riverside Towers']});ok(/No project is called “Riverside Towers”/.test(r.t),'a fund of a project that is not there is asked about',r.t.slice(0,200));
r=await A('fund_combine',{projects:['AL WAHA BUSINESS PARK (SAR)','Riverside Towers'],currency:'SAR'});ok(/“Riverside Towers” is not a project in this workspace, so the fund is combined without it/.test(r.g),'a fund with one project that is not there: combined without it, and said',r.g);
r=await A('fund_combine',{projects:['AL WAHA BUSINESS PARK (SAR)','HARBOR POINT OFFICE – DEVELOPMENT (USD)']});ok(/No currency was named for the fund, so the projects are combined in/.test(r.g),'a fund with no currency named: the currency used is said',r.g);

// 5. without an AI the request is checked against the answer by rule: a name, a day, a year asked and absent
r=await p.evaluate(()=>[gapRules('What is the IRR of Riverside Towers?','Levered IRR 15.34% for AL WAHA'),gapRules('What if Construction Cost Up 10%','Construction cost: 200 → 220'),gapRules('Send it on the 31st','Monthly · day 28'),gapRules('IRR if we sell in year 9?','Year 9: 14.2%'),gapRules('Compare with “Harbor Point”','HARBOR POINT OFFICE: 9%')]);
ok(r[0].some(z=>/“Riverside Towers” was asked/.test(z))&&!r[1].length&&r[2].some(z=>/the 31st was asked/.test(z))&&!r[3].length&&!r[4].length,'without an AI, a name, a day or a year asked and missing from the answer is flagged; what is there is not',r);
ok(errs.length===0,'no page errors',errs.join(' | '));
console.log(`\n${pass} pass, ${fail} fail`);await b.close();process.exit(fail?1:0);
