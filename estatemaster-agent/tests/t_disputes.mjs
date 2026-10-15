import {chromium} from 'playwright';import fs from 'fs';
const sp=new globalThis.URL('./fixtures/',import.meta.url).pathname;
const URL=process.argv[2]||'http://localhost:4090/?mode=readonly';
const b=await chromium.launch({executablePath:process.env.PW_CHROMIUM||undefined});const p=await b.newPage({viewport:{width:1400,height:950}});const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.route('https://cdnjs.cloudflare.com/**',r=>r.fulfill({status:200,contentType:'application/javascript',body:fs.readFileSync(sp+'package/dist/xlsx.full.min.js')}));
await p.goto(URL);await p.waitForTimeout(2500);
let pass=0,fail=0;const ok=(c,m)=>{c?pass++:fail++;console.log(c?'PASS':'FAIL',m)};
const popup=()=>p.evaluate(()=>{const w=$('#dispWin');return{on:!!w&&w.classList.contains('on'),title:w?$('#dispTitle').textContent:'',body:w?$('#dispBody').textContent:'',n:DISPUTES.length}});
const dismiss=()=>p.evaluate(()=>{const w=$('#dispWin');if(w)w.classList.remove('on')});
await p.evaluate(async()=>{await loadXLSX();const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([['Summary'],['Equity IRR',null,'%',0.1375],['Development Margin (on cost)',null,'%',0.2326],['Net Development Profit',null,'SAR',129.5e6],['Total Development Cost',null,'SAR',556.8e6],['Total Revenue',null,'SAR',686.3e6]]),'Summary');
  XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([['MAIN INPUTS'],['Sale price',13500,'SAR/sqm'],['Construction cost',4200,'SAR/sqm']]),'Input');
  await uploadExport(new File([XLSX.write(wb,{type:'array',bookType:'xlsx'})],'m.xlsx'));AI.keys.anthropic='sk-a';AI.keys.openai='sk-o';setHurdle(18,'typed');DISPUTES.length=0;DISP_SEEN.clear();
  window.checkerAgent=async()=>({model:'checker',verdicts:[],summary:''});});
await p.waitForTimeout(300);await dismiss();
// 1-2. a values-only upload is never estimated: the what-if and the table are refused in plain words, no dispute is invented
const nc=await p.evaluate(async()=>{const o={};try{await aiCrossCheck([{label:'Sale price',from:'13,500',to:'−10%'}])}catch(e){o.a=e.message}try{await aiSensGrid({assumption:'Sale price',kind:'pct',unit:'%',shifts:[-10,0,10]},{assumption:'Construction cost',kind:'pct',unit:'%',shifts:[-10,0,10]},'levered_irr')}catch(e){o.b=e.message}o.n=DISPUTES.length;return o});
ok(/^Not computed: the change Sale price −10% \(from 13,500\)/.test(nc.a||'')&&/^Not computed/.test(nc.b||'')&&nc.n===0,'values-only upload: what-if and table refused, no estimate, no dispute: '+(nc.a||'').slice(0,90));
// 3. compare metric: models differ, review round runs, pop-up
await p.evaluate(()=>{let n=0;window.callOne=async(pr,model,sys,msgs)=>{n++;const v=pr==='anthropic'?{a:1000,b:1200}:{a:1500,b:1200};return{text:JSON.stringify({sure:true,label:'Cost per sqm',unit:'SAR',better:'lo',formula:'cost/GFA',a:{value:v.a,working:'w'},b:{value:v.b,working:'w'},difference:'areas differ'})}};window.__n=()=>n;
  PROJECTS.t2={...PROJECTS[PROJ.id],id:'t2',name:'Test Tower',xl:undefined};const x=latestExport();EXPORTS.push({...x,id:'EX-901',proj:'t2',at:new Date().toISOString()});CMPQ.text='cost per sqm';CMPQ.thread=[]});
const cres=await p.evaluate(async()=>{const a=latestExport(),b=EXPORTS.find(z=>z.id==='EX-901');const r=await cmpPin(a,b);return{mode:r.mode,calls:__n()}});
let r=await popup();ok(cres.mode==='apart'&&cres.calls>=4&&r.on&&/Compare/.test(r.body)&&/1,000|1000/.test(r.body)&&/1,500|1500/.test(r.body),'compare: review round ran and the disagreement popped up: '+JSON.stringify(cres));
await dismiss();
// 4. hurdle: the two models differ
await p.evaluate(()=>{window.callOne=async(pr)=>({text:JSON.stringify({hurdle:pr==='anthropic'?16:19,reasoning:'r'})})});
const h=await p.evaluate(async()=>(await aiHurdle()).apart);r=await popup();ok(h&&r.on&&/Hurdle/.test(r.body)&&/16%/.test(r.body)&&/19%/.test(r.body),'hurdle: disagreement popped up');
await dismiss();
// 5. model review on upload: a finding raised by one model only is a doubt
await p.evaluate(()=>{window.callOne=async(pr,model,sys)=>{if(/senior financial-modelling reviewer/.test(sys)){const items=[{kind:'bug',severity:'high',title:'Peak debt above cost',evidence:'e',cell:'',recommendation:'r'}];if(pr==='openai')items.push({kind:'risk',severity:'medium',title:'Exit yield too tight',evidence:'e',cell:'',recommendation:'r'});return{text:JSON.stringify({read_ok:true,read_note:'',items})}}return{text:'{}'}}});
await p.evaluate(async()=>{const x=latestExport();x.audit=null;await auditExport(x,true)});r=await popup();ok(r.on&&/Discrepanc/.test(r.title)&&/Exit yield too tight/.test(r.body)&&/Raised by OpenAI gpt-5/.test(r.body)&&!/Peak debt above cost/.test(r.body),'model review: the one-model finding is a doubt, the shared one is not');
await dismiss();
// 6. chat answer: a second model checks the figures the first worked out
await p.evaluate(()=>{window.callOne=async(pr,model,sys,msgs,withTools)=>{if(/audit the arithmetic/i.test(sys))return{text:JSON.stringify({items:[{i:1,ok:false,value:'SAR 116M',issue:'10% of 686M is 68.6M, not 50M'}]})};return{calls:[],text:'Net profit would fall to SAR 100M ⟦calc: 129.5M − 10% × 686.3M⟧.',raw:null}};toggleDock(true)});
await p.evaluate(()=>webAsk('what if sale price drops 10%'));await p.waitForTimeout(2500);
const note=await p.locator('#msgs .msg.agent').last().locator('.calc-audit').textContent().catch(()=>'');r=await popup();
ok(/disagrees on 1 of 1/.test(note)&&/SAR 116M/.test(note)&&r.on&&/Chat/.test(r.body),'chat: the second model’s disagreement is shown under the answer and popped up');
await p.locator('#msgs .msg.agent').last().screenshot({path:sp+'calc_audit.png'});
await dismiss();
// 7. server stress tests with a disagreement reach the pop-up once
await p.evaluate(()=>{DAILYSRV={stress:{at:'2026-10-12T04:00:00Z',models:[{name:PROJ.name,by:'Claude and OpenAI',base_irr:13.75,scenarios:[{name:'Sale price −10%',levered_irr:11,pass:false,agree:false},{name:'Cost +10%',levered_irr:12,pass:false,agree:true}]}]}};showTab('appr');renderStressFeed();renderStressFeed()});
r=await popup();ok(r.on&&/stress scenarios run by the server/.test(r.body)&&/Sale price −10%/.test(r.body)&&!/Cost \+10%/.test(r.body),'server stress: only the disagreeing scenario, popped up once');
const wh=await p.evaluate(()=>DISPUTES.map(d=>d.where+' | '+d.what.slice(0,50)));console.log('DISPUTES',JSON.stringify(wh,null,1));ok(['Compare','Hurdle','Model review','Chat','Daily feed · stress tests'].every(w=>wh.some(x=>x.startsWith(w))),'every path logged a dispute: '+wh.length);
ok(await p.locator('#dispBadge').count()===1&&new RegExp(String(wh.length)).test(await p.locator('#dispBadge').textContent()),'badge counts them');
await p.screenshot({path:sp+'dispute_popup.png'});
await dismiss();ok(!(await popup()).on,'dismiss closes the pop-up');
console.log('errors',errs);console.log(`${pass} pass, ${fail} fail`);await b.close();
