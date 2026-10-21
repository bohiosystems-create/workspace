// The Excel add-in, on a stand-in for Office.js whose workbook is the fixture calculated by HyperFormula (tests/addin_officemock.js):
// the pane reads the headline figures from their cells, runs a what-if that Excel recalculates and puts back (checked against the
// LibreOffice golden answers), explains a cell through its precedents, reads a question with the AI (mocked) and refuses a formula
// cell, keeps a change when asked, and hands the workbook to the workspace, which makes it a project. Synthetic fixtures only.
import {chromium} from 'playwright';import fs from 'fs';
const ROOT=process.argv[2]||'http://localhost:4090/';const base=ROOT.replace(/\?.*$/,'').replace(/\/$/,'');
const MOCK=fs.readFileSync(new globalThis.URL('./addin_officemock.js',import.meta.url),'utf8');
const b=await chromium.launch({executablePath:process.env.PW_CHROMIUM||undefined});
let pass=0,fail=0;const ok=(c,name,detail)=>{c?pass++:fail++;console.log((c?'PASS':'FAIL')+' | '+name+(detail?' → '+String(detail).slice(0,320):''))};
async function page(fixture,extra){const ctx=await b.newContext({viewport:{width:360,height:900}}),p=await ctx.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));p.errs=errs;
  await p.addInitScript(([f,x])=>{window.MOCK_FIXTURE=f;Object.assign(window,x||{})},[fixture,extra||{}]);
  await p.route('https://appsforoffice.microsoft.com/**',r=>r.fulfill({status:200,contentType:'application/javascript',body:MOCK}));
  await p.route(/fonts\.googleapis|fonts\.gstatic|cdn\.jsdelivr\.net|unpkg\.com|cdnjs\.cloudflare\.com/,r=>r.abort());
  await p.route('**/api/**',r=>r.fulfill({status:404,body:''}));
  p.AI=[];await p.route('**/api/llm',async r=>{if(r.request().method()==='GET')return r.fulfill({status:200,contentType:'application/json',body:'{"providers":{"anthropic":true}}'});const j=JSON.parse(r.request().postData());const u=j.payload.messages[0].content;p.AI.push(u);
    const q=(u.match(/Question: (.*)$/m)||[])[1]||'';const t=/interest/i.test(q)?{intent:'whatif',changes:[{label:'Interest rate',cell:'Inputs!B10',kind:'to',value:7}]}:/levered irr/i.test(q)&&/where/i.test(q)?{intent:'explain',cell:'Returns!B3'}:/profit on cost to/i.test(q)?{intent:'whatif',changes:[{label:'Profit on cost',cell:'Returns!B11',kind:'to',value:30}]}:{intent:'other'};
    r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({content:[{type:'text',text:JSON.stringify(t)}]})})});
  return p}
const p=await page('/tests/fixtures/models/r33_waha_sar.xlsx');
await p.goto(base+'/addin/taskpane.html?brand=jadwa');await p.waitForFunction(()=>window.ADDIN&&ADDIN.M.heads.length>0,null,{timeout:30000}).catch(()=>{});
const heads=await p.evaluate(()=>ADDIN.M.heads.map(h=>[h.label,h.sh+'!'+h.r+','+h.c,h.v]));
const lev=heads.find(h=>/levered irr/i.test(h[0])&&!/unlevered/i.test(h[0]));
ok(lev&&lev[1]==='Returns!2,1'&&Math.abs(lev[2]-0.153431)<1e-5,'the levered IRR is read from Returns!B3 (15.34%, as LibreOffice)',JSON.stringify(heads.slice(0,6)));
ok(await p.evaluate(()=>/15\.34%/.test(document.querySelector('#heads').innerText)&&/92\.46%/.test(document.querySelector('#heads').innerText)),'the headline table shows the figures in their units (a share left in General format shown as a percentage)',await p.evaluate(()=>document.querySelector('#heads').innerText.slice(0,300)));
ok(await p.evaluate(()=>ADDIN.M.inputs.some(i=>i.sh==='Inputs'&&i.r===3&&i.c===1&&i.label==='Stabilised rent')&&!ADDIN.M.inputs.some(i=>i.sh==='Returns')),'typed inputs are found with their labels; formula cells are not inputs');
// what-if: rent to 33m (LibreOffice: levered 17.7027%), recalculated and put back
let r=await p.evaluate(async()=>{const inp=ADDIN.M.inputs.find(i=>i.sh==='Inputs'&&i.r===3);const o=await ADDIN.whatIf([{inp,to:33000000}]);return{h:o.heads.map(h=>h.label),b:o.before,a:o.after,back:o.back,restored:o.restored,writes:MOCK.writes.length}});
const li=r.h.findIndex(l=>/^levered irr/i.test(l));
ok(Math.abs(r.a[li]-0.177027)<1e-5&&Math.abs(r.b[li]-0.153431)<1e-5,'rent to SAR 33m: Excel gives a levered IRR of 17.70%, as LibreOffice does',JSON.stringify({before:r.b[li],after:r.a[li]}));
ok(r.restored&&r.back.every((v,i)=>v===r.b[i]),'the input is put back and every output reads its original value again',JSON.stringify(r.back.slice(0,3)));
ok(await p.evaluate(()=>MOCK.writes.slice(-1)[0].v===30000000),'the original value is written back into the input cell');
// explain the levered IRR: its formula and the cells it reads
const ex=await p.evaluate(async()=>ADDIN.explain('Returns!B3'));
ok(/IRR\('Cash Flow'!C18:L18\)/.test(ex)&&/Cash Flow'!C18:L18|Cash Flow'!C18/.test(ex)&&/Levered IRR/.test(ex),'explain: the formula and the range it reads are shown',ex.replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').slice(0,240));
await p.evaluate(()=>{MOCK.selected='Inputs!B7'});await p.click('#explain');await p.waitForTimeout(500);
ok(await p.evaluate(()=>/Exit cap rate/.test(document.querySelector('#out').innerText)&&/7%/.test(document.querySelector('#out').innerText)&&/typed input/i.test(document.querySelector('#out').innerText)),'explain the selected cell: a typed input is said to be one',await p.evaluate(()=>document.querySelector('#out').innerText.slice(0,200)));
// the AI reads the words; Excel computes (interest rate to 7%: LibreOffice levered 14.5368%)
await p.fill('#q','What if the interest rate is 7%?');await p.click('#send');await p.waitForFunction(()=>/recalculated by Excel/.test(document.querySelector('#out').innerText),null,{timeout:30000}).catch(()=>{});
const o1=await p.evaluate(()=>document.querySelector('#out').innerText);
ok(/Interest rate/.test(o1)&&/6% → 7%/.test(o1)&&/14\.54%/.test(o1)&&/back exactly as it was/.test(o1),'asked in words: interest rate 6% → 7%, levered IRR 14.54% (LibreOffice 14.5368%), workbook restored',o1.replace(/\s+/g,' ').slice(0,300));
ok(p.AI.length===1&&/Interest rate \| Inputs!B10 \| 6%/.test(p.AI[0])&&/Levered IRR \| Returns!B3/.test(p.AI[0]),'the AI is given the inputs with their cells and values, and the headline cells',p.AI[0].slice(0,200));
await p.fill('#q','Set the profit on cost to 30%');await p.click('#send');await p.waitForTimeout(800);
const o2=await p.evaluate(()=>document.querySelector('#out').innerText);
ok(/Not computed/.test(o2)&&/formula, not a typed input/.test(o2),'a formula cell named as the lever is refused (certain fact: not a typed input)',o2.slice(0,200));
await p.fill('#q','Where does the levered IRR come from?');await p.click('#send');await p.waitForTimeout(800);
ok(await p.evaluate(()=>/IRR\('Cash Flow'!C18:L18\)/.test(document.querySelector('#out').innerText))&&await p.evaluate(()=>MOCK.selected==='Returns!B3'),'a “where does it come from” question shows the formula and goes to the cell');
// keep a change
await p.fill('#q','What if the interest rate is 7%?');await p.click('#send');await p.waitForFunction(()=>document.querySelector('[data-keep]'),null,{timeout:30000}).catch(()=>{});
await p.click('[data-keep]');await p.waitForTimeout(800);
ok(await p.evaluate(()=>{const i=ADDIN.M.inputs.find(z=>z.sh==='Inputs'&&z.r===9);return i&&Math.abs(i.v-0.07)<1e-12}),'“Keep” leaves the change in the workbook (and the pane reads it again)');
// open in the workspace: the file goes to the app in a dialog, in slices, and becomes a project there
await p.evaluate(()=>ADDIN.M.name='r33_waha_sar.xlsx');await p.click('#open');await p.waitForFunction(()=>MOCK.dialogs.length===1,null,{timeout:20000}).catch(()=>{});
const dlg=await p.evaluate(()=>{const d=MOCK.dialogs[0];d.d.h({message:'ready'});return{url:d.url,n:d.d.sent.length,sent:d.d.sent}});
ok(/\/\?addin=1$/.test(dlg.url)&&dlg.n>=1,'the workspace opens in an Office dialog and the workbook is sent in slices',dlg.url+' · '+dlg.n+' slices');
const a=await page('/tests/fixtures/models/r33_waha_sar.xlsx',{MOCK_NOWB:true});await a.addInitScript(()=>{try{localStorage.clear()}catch(e){}});
await a.goto(base+'/?addin=1&mode=readonly');await a.waitForFunction(()=>window.MOCK&&MOCK.childHandler&&MOCK.toParent.includes('ready'),null,{timeout:30000}).catch(()=>{});
ok(await a.evaluate(()=>MOCK.toParent.includes('ready')),'the app, opened from the add-in, tells Excel it is ready');
await a.evaluate(sent=>{for(const m of sent)MOCK.childHandler({message:m})},dlg.sent);
await a.waitForFunction(()=>{try{const x=latestExport();return x&&x.src==='file'&&/r33_waha_sar/.test(x.file||'')&&x.out&&Number.isFinite(x.out.levered_irr)}catch(e){return false}},null,{timeout:60000}).catch(()=>{});
const x=await a.evaluate(()=>{const x=latestExport();return{file:x.file,irr:x.out&&x.out.levered_irr,proj:PROJ.name}});
ok(/r33_waha_sar/.test(x.file||'')&&Math.abs((x.irr||0)-15.343)<0.01,'the workbook from Excel becomes a project in the workspace, read as an upload is (levered IRR 15.34%)',JSON.stringify(x));
ok(!p.errs.length&&!a.errs.length,'no page errors',p.errs.concat(a.errs).join(' | '));
console.log(`\n${pass} pass, ${fail} fail`);await b.close();process.exit(fail?1:0);
