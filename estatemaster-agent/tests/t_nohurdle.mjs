// No hurdle is assumed: with none in the workbook and none given by the user, no report, slide, tab or chat line shows NaN, an 18%/15%
// default hurdle, or a pass/fail against a hurdle. A hurdle the user gives is used and shown.
import {chromium} from 'playwright';import fs from 'fs';
const sp=new globalThis.URL('./fixtures/',import.meta.url).pathname;
const b=await chromium.launch({executablePath:process.env.PW_CHROMIUM||undefined});const ok=[];const t=(c,m)=>ok.push((c?'PASS':'FAIL')+' | '+m);const errs=[];
for(const mode of ['readonly','analyst']){const p=await b.newPage({viewport:{width:1440,height:900}});p.on('pageerror',e=>errs.push(mode+': '+e.message));
  await p.route('https://cdnjs.cloudflare.com/**',r=>r.fulfill({status:200,contentType:'application/javascript',body:fs.readFileSync(sp+'package/dist/xlsx.full.min.js')}));
  await p.route('https://fonts.googleapis.com/**',r=>r.fulfill({status:200,contentType:'text/css',body:''}));
  await p.goto((process.argv[2]||'http://localhost:4090/?mode=readonly').replace('readonly',mode));await p.evaluate(()=>localStorage.clear());await p.reload();await p.waitForTimeout(1500);
  const r=await p.evaluate(async()=>{const bad=[],H=/NaN|(?:\b18|\b15)(?:\.0)?% (?:IRR )?hurdle|hurdle (?:of )?(?:18|15)(?:\.0)?%|hurdle ≥|≥ (?:18|15)%/;
    const check=(where,txt)=>{const m=String(txt).match(H);if(m)bad.push(where+': …'+String(txt).slice(Math.max(0,m.index-60),m.index+40).replace(/\s+/g,' ')+'…')};
    for(const k of Object.keys(RPTS)){try{const d=buildDeck(k);check('deck '+k,JSON.stringify(d.slides));for(const sl of d.slides){try{const sc=kScriptSlide(sl,{});check('spoken '+k,JSON.stringify(sc))}catch(e){}}}catch(e){bad.push('deck '+k+' threw '+e.message)}
      try{RSEL=k;renderReportList();renderReport();await new Promise(r=>setTimeout(r,50));check('report '+k,$('#p-report').innerText)}catch(e){}}
    for(const tab of [...document.querySelectorAll('.tab[data-t]')].map(x=>x.dataset.t)){try{showTab(tab);await new Promise(r=>setTimeout(r,150));const pn=document.querySelector('.pane.on');if(pn)check('tab '+tab,pn.innerText)}catch(e){}}
    check('AI context',calcContext(latestExport()));return{bad,ctx:/No hurdle has been set/.test(calcContext(latestExport()))}});
  t(!r.bad.length,`${mode}: no NaN, no assumed 18%/15% hurdle in any report, slide deck or tab${r.bad.length?': '+r.bad.slice(0,6).join(' | '):''}`);
  t(r.ctx,`${mode}: the AI is told no hurdle is set`);
  const u=await p.evaluate(()=>{setHurdle(17,'typed');const d=JSON.stringify(buildDeck(Object.keys(RPTS)[0]).slides);return{ctx:calcContext(latestExport()),deck:/17%/.test(d)}});
  t(/levered IRR 17% \(given by the user\)/.test(u.ctx),`${mode}: a hurdle the user gives reaches the AI as theirs`);await p.close()}
t(!errs.length,'no page errors '+errs.join(';'));console.log(ok.join('\n'));await b.close();
