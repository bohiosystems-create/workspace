// Every change sentence is read twice: by the rules and by the AI against the model's own assumption list. They must agree;
// a disagreement or an unsure AI reading asks the user with both readings spelled out; a sentence the rules cannot read but the
// AI reads for sure goes ahead with the AI's reading said aloud; an AI failure falls back to the rules.
import {chromium} from 'playwright';import fs from 'fs';
const sp=new globalThis.URL('./fixtures/',import.meta.url).pathname;
const b=await chromium.launch({executablePath:process.env.PW_CHROMIUM||undefined});const cx=await b.newContext({viewport:{width:1500,height:950}});const p=await cx.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));
await cx.route('https://cdnjs.cloudflare.com/**',r=>r.fulfill({status:200,contentType:'application/javascript',body:fs.readFileSync(sp+'package/dist/xlsx.full.min.js')}));
await cx.route(/hyperformula/,r=>r.fulfill({status:200,contentType:'application/javascript',body:fs.readFileSync(sp+'package/hyperformula.full.min.js')}));
await cx.route('https://fonts.googleapis.com/**',r=>r.fulfill({status:200,contentType:'text/css',body:''}));
let MODE='agree',seen=[];
await p.route('**/api/llm',r=>{if(r.request().method()==='GET')return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({providers:{anthropic:true,openai:true}})});
  const j=JSON.parse(r.request().postData());const sys=j.payload.system||(j.payload.messages[0]&&j.payload.messages[0].role==='system'?j.payload.messages[0].content:'');const user=JSON.stringify(j.payload.messages);
  const reply=text=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(j.provider==='openai'?{choices:[{message:{content:text}}]}:{model:j.payload.model,content:[{type:'text',text}]})});
  if(/read a sentence describing changes/.test(sys)){seen.push(user.slice(-120));if(MODE==='down')return r.fulfill({status:500,contentType:'application/json',body:'{"error":"boom"}'});
    const sent=(user.match(/Sentence: ([^"\\]*)/)||[])[1]||'';
    if(MODE==='unsure')return reply(JSON.stringify({changes:[{label:'ADR',kind:'pct',value:10,sure:false,note:'direction unclear'}],question:'Should ADR go up or down by 10%?'}));
    if(MODE==='disagree')return reply(JSON.stringify({changes:[{label:'ADR',kind:'pct',value:10,sure:true}]}));
    if(/room rate/.test(sent))return reply(JSON.stringify({changes:[{label:'ADR',kind:'pct',value:-10,sure:true,note:'room rate = ADR, a tenth = 10%'}]}));
    if(/occupancy/.test(sent))return reply(JSON.stringify({changes:[{label:'Occupancy',kind:'pts',value:-5,sure:true}]}));
    return reply(JSON.stringify({changes:[{label:'ADR',kind:'pct',value:-10,sure:true}]}))}
  if(/audit an exact recalculation/.test(sys))return reply(JSON.stringify({verdict:'agree',why:'right cell',results:[{metric:'levered_irr',value:18.9}]}));
  reply('{}')});
await p.goto(process.argv[2]||'http://localhost:4090/?mode=readonly');await p.evaluate(()=>localStorage.clear());await p.reload();await p.waitForTimeout(1500);
const ok=[];const t=(c,m)=>ok.push((c?'PASS':'FAIL')+' | '+m);const ev=(f,a)=>p.evaluate(f,a);
await ev(()=>openNewProject());await p.setInputFiles('#npFile',sp+'models/hotel_us.xlsx');await p.waitForTimeout(1200);await p.click('#npCreate');await p.waitForTimeout(2500);await ev(()=>xcEngine(latestExport()));
const run=text=>ev(async text=>{const steps=[];const r=await xcTest([{text}],async s=>steps.push(typeof s==='string'?s:JSON.stringify(s)));return r?(r.ask?{ask:r.ask,steps}:{desc:r.desc,steps}):{none:true,steps}},text);
let r=await run('ADR drops 10%');t(r.desc&&/125 → 112\.5/.test(r.desc[0]),'rules and AI agree: goes ahead, 125 → 112.5');
t(seen.length===1&&/ADR/.test(seen[0]),'the AI was given the sentence and the model’s assumptions');
r=await run('occupancy -5 pts');t(r.desc&&/68% → 63%/.test(r.desc[0]),'points on a percentage: both agree (pts)');
MODE='disagree';r=await run('ADR drops 10%');t(r.ask&&/Two readings/.test(r.ask.question)&&r.ask.options.length===2&&/−10%.*112\.5/.test(r.ask.options[0])&&/\+10%.*137\.5/.test(r.ask.options[1]),'rules say −10%, AI says +10%: the user is asked with both readings spelled out: '+(r.ask&&r.ask.question));
MODE='agree';r=await run(r.ask.options[0]);t(r.desc&&/125 → 112\.5/.test(r.desc[0]),'picking a reading goes ahead with it: '+(r.desc&&r.desc[0]));
MODE='unsure';r=await run('ADR 10%');t(r.ask&&/up or down/.test(r.ask.question)&&/Claude|OpenAI|gpt/i.test(r.ask.question),'the AI is unsure: its question is put to the user, signed: '+(r.ask&&r.ask.question));
MODE='agree';r=await run('bring the room rate down by a tenth');t(r.desc&&/125 → 112\.5/.test(r.desc[0])&&r.steps.some(s=>/reads it as ADR −10%/.test(s)),'the rules cannot read it, the AI can: goes ahead and says so: '+JSON.stringify(r.steps.filter(s=>/reads it/.test(s))));
MODE='down';r=await run('ADR drops 10%');t(r.desc&&/125 → 112\.5/.test(r.desc[0])&&r.steps.some(s=>/could not read the sentence/.test(s)),'AI down: the rule-based reading is used and the fallback is said');
MODE='agree';const cr=await ev(async()=>{const r=await aiCrossCheck([{text:'ADR drops 10%'}],async()=>{});return{v:+r.metrics.find(m=>m.k==='levered_irr').value.toFixed(2),xc:r.xc}});t(cr.xc&&cr.v===18.84,'end to end through the cross-check: exact 18.84%');
t(!errs.length,'no page errors '+errs.join(';'));console.log(ok.join('\n'));await b.close();
