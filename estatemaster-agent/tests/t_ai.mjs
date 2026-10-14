import {chromium} from 'playwright';
const sp=new URL('./fixtures/',import.meta.url).pathname;
const base=process.argv[2]||'http://localhost:4090/?mode=readonly';
const b=await chromium.launch({executablePath:process.env.PW_CHROMIUM||undefined});const p=await b.newPage({viewport:{width:1500,height:950}});const errs=[];p.on('pageerror',e=>errs.push(e.message));
const ok=(c,n)=>console.log((c?'PASS ':'FAIL ')+n);let llm=[];
await p.route('**/api/llm',r=>{if(r.request().method()==='GET')return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({providers:{anthropic:true,openai:true}})});
  const j=JSON.parse(r.request().postData());llm.push(j);const P=j.payload,sys=P.system||((P.messages[0]||{}).role==='system'?P.messages[0].content:''),msgs=JSON.stringify(P.messages);
  const reply=text=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(j.provider==='openai'?{choices:[{message:{content:text}}]}:{model:P.model,content:[{type:'text',text}]})});
  if(/independent checker/.test(sys)){if(P.model==='o3')return r.fulfill({status:400,contentType:'application/json',body:JSON.stringify({error:{message:'model not available'}})});
    return reply(JSON.stringify({verdicts:[{metric:'levered_irr',ok:P.model!=='gpt-5',issue:P.model==='gpt-5'?'the gearing multiplier is asserted, not derived':'',severity:'warn'}],summary:P.model+' audited'}))}
  if(/finance analyst/.test(sys))return reply(JSON.stringify({method:'m',results:[{metric:'levered_irr',base:26.83,value:j.provider==='openai'?20.1:20.0,working:'Sale price new = 13,500 × (1 − 15%) = 11,475\nRevenue = 11,475 × 62,000 = 711.45M\nIRR = 26.83% − 6.8 pts = 20.0%'}]}));
  if(/explicit formulas used/.test(sys))return reply(JSON.stringify({steps:[{role:'base',label:'Levered IRR now',formula:'EstateMaster export EX-001, Summary!D3',result:'26.83%'},{role:'change',label:'New sale price',formula:'13,500 × (1 − 15%)',result:'SAR 11,475/sqm'},{role:'result',label:'Levered IRR',formula:'26.83% − 6.8 pts',result:'20.0%'}]}));
  if(/explain the working behind/.test(sys))return reply('{"n":[{"i":0,"meaning":"EstateMaster base IRR"},{"i":1,"meaning":"the price cut"},{"i":2,"mea');
  return reply('Done.')});
await p.goto(base);await p.evaluate(()=>localStorage.clear());await p.reload();await p.waitForTimeout(1300);
// checker panel
const res=await p.evaluate(async()=>{const r=await aiCrossCheck([{text:'sale price −15%'}],async()=>{});return{model:r.checker&&r.checker.model,panel:r.checker&&r.checker.panel&&r.checker.panel.length,failed:r.checker&&r.checker.failed,issue:(r.checker.verdicts.find(v=>v.metric==='levered_irr')||{}).issue}});
ok(res.panel===2&&/Claude Opus 5\.5/.test(res.model)&&/gpt-5/i.test(res.model)&&/o3/.test(res.failed.join(' '))&&/gpt-5.*gearing/i.test(res.issue||''),'checker panel: Claude Opus 5.5 and GPT-5 audit together, o3 reported as unavailable, the issue names who raised it: '+JSON.stringify(res));
{const ms=[...new Set(llm.filter(j=>/independent checker/.test(j.payload.system||(j.payload.messages[0]||{}).content||'')).map(j=>j.payload.model))].sort().join(',');ok(ms==='claude-opus-5-5,gpt-5,o3','three checker models asked in parallel: '+ms)}
// formulas on click
await p.evaluate(()=>{const w='Change tested: sale price −15%.\nEstateMaster now: 26.83% (export EX-001).\n\nClaude Fable 5.1: 20.0%\nThe price cut flows into revenue and then the IRR.';const b=document.createElement('b');b.className='fig fig-calc';b.dataset.k='calc';b.dataset.w=w;b.textContent='20.0%';document.body.appendChild(b);openFigWin(b)});
await p.waitForTimeout(600);
await p.click('#fwBody .fw-tile[data-fx="change"]');await p.waitForTimeout(800);
const fx1=await p.evaluate(()=>$('#fwFx').innerText);console.log('FX1',JSON.stringify(fx1));ok(/How the change is applied/i.test(fx1)&&/13,500 × \(1 − 15%\)/.test(fx1)&&/11,475/.test(fx1),'Change box → the formula with numbers: '+fx1.replace(/\n/g,' | ').slice(0,120));
await p.click('#fwBody .fw-tile[data-fx="result"]');await p.waitForTimeout(500);
const fx2=await p.evaluate(()=>$('#fwFx').innerText);console.log('FX2',JSON.stringify(fx2));ok(/Every step to the result/i.test(fx2)&&(fx2.match(/=/g)||[]).length>=3,'Result box → every step');
await p.locator('#figWin .fw-card').screenshot({path:sp+'fw_formulas.png'});
const hint=await p.evaluate(()=>($('#fwBody .fw-hint')||{}).textContent||'');ok(!/Unexpected end of JSON/.test(hint),'number explanations survive a cut-off AI answer: '+hint.slice(0,90));
await p.click('#fwClose');
// sensitivity link from the full-screen chat
await p.evaluate(()=>{toggleDock(true);DOCK.full=true;renderDock();addMsg('agent','<a class="go" data-tab="scen" id="tLink">Open the sensitivity table →</a>')});await p.waitForTimeout(200);
await p.click('#tLink');await p.waitForTimeout(700);
ok(await p.evaluate(()=>!DOCK.full&&$('#p-scen').classList.contains('on')&&(()=>{const r=$('#aiSensCard').getBoundingClientRect();return r.top<innerHeight&&r.bottom>0})()),'the link leaves full-screen chat and shows the sensitivity table');
ok(await p.evaluate(()=>/say "below", never "above"/.test(sysPrompt('web','Investment Director'))),'the agent is told the result is below its answer');
console.log('errs',errs);await b.close();
