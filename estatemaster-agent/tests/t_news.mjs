import {chromium} from 'playwright';import fs from 'fs';
const sp=new globalThis.URL('./fixtures/',import.meta.url).pathname;
const b=await chromium.launch({executablePath:process.env.PW_CHROMIUM||undefined});const p=await b.newPage({viewport:{width:1280,height:720}});const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.route('https://cdnjs.cloudflare.com/**',r=>r.fulfill({status:200,contentType:'application/javascript',body:fs.readFileSync(sp+'package/dist/xlsx.full.min.js')}));
await p.goto('http://localhost:4090/?mode=readonly');await p.waitForTimeout(2500);
let pass=0,fail=0;const ok=(c,m)=>{c?pass++:fail++;console.log(c?'PASS':'FAIL',m)};
const kinds=await p.evaluate(()=>buildDeck('ic').slides.map(s=>s.kind+':'+(s.kicker||'')).slice(0,5));console.log(kinds.join(' | '));
ok(/Since the last report/.test(kinds[2])||/New risks/.test(kinds[2]),'changes/risks right after headline');
ok(!(await p.evaluate(()=>buildDeck('ic',{doc:true}).slides.some(s=>/Since the last report|New risks/.test(s.kicker||'')))),'report document unchanged');
// risk review routed to the deep chain
const r=await p.evaluate(async()=>{AI.keys={anthropic:'k',openai:'k'};const calls=[];const orig=callOne;window.callOne=async(pv,model,sys,msgs)=>{calls.push(model);return{text:JSON.stringify({risks:[{title:'Margin below hurdle',evidence:'profit on cost 14.2%',severity:'high',recommendation:'Hold approval until costs are re-tendered.'}]})}};
  try{callOne=window.callOne}catch(e){}
  const ev=kRiskEvidence();const res=await kRiskAI();const d=buildDeck('ic');return{ev:ev.length,calls,model:res&&res.model,slide:d.slides.find(s=>/New risks/.test(s.kicker||''))}});
console.log(JSON.stringify({ev:r.ev,calls:r.calls,model:r.model,kicker:r.slide&&r.slide.kicker,items:r.slide&&r.slide.items}));
ok(r.ev===0||(r.calls[0]==='claude-opus-5-5'),'risk review goes to Opus first (deep chain)');
ok(r.ev===0||/AI review/.test(r.slide.kicker),'AI risks on the slide with recommendations');
console.log('errors',errs);console.log(`${pass} pass, ${fail} fail`);await b.close();
