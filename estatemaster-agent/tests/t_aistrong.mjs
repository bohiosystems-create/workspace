// AI first, without falling back on rules: a reading that fails a check goes back to the AI with the reason and is corrected; a reply
// that is not JSON is asked again; a model that declines hands over to another; readers ask for JSON by schema and the top models carry
// the server-side fallback; the AI's saved reading of a sentence answers when no AI does; with no AI at all the rules decide nothing:
// their reading is put to the user, who confirms it; a chat turn broken half-way is finished by another model; the proxy retries an
// overloaded provider itself.
import {chromium} from 'playwright';import {createRequire} from 'module';
const F=new globalThis.URL('./fixtures/models/',import.meta.url).pathname;const base=process.argv[2]||'http://localhost:4090/?mode=readonly';
let pass=0,fail=0;const ok=(c,name,detail)=>{c?pass++:fail++;console.log((c?'PASS':'FAIL')+' | '+name+(detail?' → '+String(detail).slice(0,300):''))};
{const require=createRequire(import.meta.url);process.env.ANTHROPIC_API_KEY='k';const llm=require('../api/llm.js');let n=0;const real=global.fetch;
  global.fetch=async()=>{n++;return n===1?{status:529,headers:{get:()=>'1'},text:async()=>'{"type":"error","error":{"type":"overloaded_error"}}'}:{status:200,headers:{get:()=>null},text:async()=>'{"ok":1}'}};
  const req={method:'POST',headers:{'x-forwarded-for':'9.9.9.9'},body:{provider:'anthropic',payload:{model:'claude-opus-5-5',messages:[{role:'user',content:'x'}]}}};const res={setHeader(){},end(t){this.out=t}};
  await llm(req,res);global.fetch=real;ok(res.statusCode===200&&n===2,'the proxy asks an overloaded provider again before the page sees an error',`${res.statusCode} after ${n} calls`)}
const b=await chromium.launch({executablePath:process.env.PW_CHROMIUM||undefined}),p=await b.newPage();await p.route(/cdn\.jsdelivr\.net|unpkg\.com|cdnjs\.cloudflare\.com/,r=>r.abort());await p.route('https://fonts.googleapis.com/**',r=>r.fulfill({status:200,contentType:'text/css',body:''}));const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.route('**/api/log',r=>r.fulfill({status:200,body:'{}'}));
let MODE='ok',N=0,READ=null;const REQS=[];const good=v=>({changes:[{label:'Exit yield',cell:'Inputs!B6',kind:'to',value:v,sure:true}]});
await p.route('**/api/llm',async r=>{if(r.request().method()==='GET')return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({providers:{anthropic:true,openai:true}})});
  const j=JSON.parse(r.request().postData()),pl=j.payload,sys=String(pl.system||(pl.messages[0]&&pl.messages[0].role==='system'?pl.messages[0].content:''));REQS.push(j);
  const reply=(t,stop)=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(j.provider==='openai'?{choices:[{message:{content:t},finish_reason:'stop'}]}:{model:pl.model,content:t==null?[]:[{type:'text',text:t}],stop_reason:stop||'end_turn'})});
  const err=(s,m)=>r.fulfill({status:s,contentType:'application/json',body:JSON.stringify({type:'error',error:{type:'invalid_request_error',message:m}})});
  const user=JSON.stringify(pl.messages);
  if(/You read a sentence/.test(sys)){N++;
    if(MODE==='down')return err(400,'model: not found');
    if(MODE==='fix')return reply(JSON.stringify(/failed the model's checks/.test(user)?READ:{changes:[{label:'Exit yield',cell:'Inputs!B7',kind:'to',value:READ.changes[0].value,sure:true}]}));
    if(MODE==='prose')return reply(/not the JSON object/.test(user)?JSON.stringify(READ):'The exit yield moves to the new level.');
    if(MODE==='refuse'&&j.provider==='anthropic')return reply(null,'refusal');
    return reply(JSON.stringify(READ))}
  if(/You audit an exact/.test(sys))return MODE==='down'?err(400,'model: not found'):reply('{"verdict":"agree","why":"ok","results":[]}');
  if(pl.tools){if(j.provider==='anthropic'&&!/tool_result/.test(user))return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({model:pl.model,content:[{type:'tool_use',id:'t1',name:'estatemaster_results',input:{}}],stop_reason:'tool_use'})});return err(400,'messages: invalid')}
  if(/Tool results already gathered/.test(user))return reply('Written from the tool results by '+pl.model+'.');
  reply('{}')});
await p.goto(base);await p.evaluate(()=>{localStorage.clear();window.AI_PASS_WAIT_MS=50;window.AI_BACKOFF=0.01});await p.reload();await p.waitForTimeout(1500);
await p.evaluate(()=>openNewProject());await p.setInputFiles('#npFile',F+'r25_logi_eur.xlsx');await p.waitForTimeout(1800);await p.click('#npCreate');await p.waitForTimeout(3000);
const test=async(q,mode,read)=>{MODE=mode;N=0;READ=read;return p.evaluate(async q=>{window.AI_PASS_WAIT_MS=50;window.AI_BACKOFF=0.01;window.RULEHITS=[];const st=[];try{const r=await aiCrossCheck([{text:q}],async s=>{st.push(String(s))},undefined,{quiet:true});return{a:testPlain(r).replace(/\*+/g,''),hits:window.RULEHITS.map(h=>h.where),st:st.join(' | ')}}catch(e){return{a:'ERR '+e.message,hits:window.RULEHITS.map(h=>h.where),st:st.join(' | ')}}},q)};
let r=await test('exit yield 5.75%','fix',good(5.75));
ok(/Inputs!B6 5\.25% → 5\.75%/.test(r.a)&&N===2&&!r.hits.includes('xcTest'),'a reading naming the wrong cell goes back to the AI with the reason, and its corrected reading is used',`${N} reads; ${r.st.slice(0,200)}`);
ok(REQS.some(q=>/is labelled “Non-recoverable costs share”/.test(JSON.stringify(q.payload.messages))),'the AI is told what was wrong (the cell it named carries another label)');
r=await test('exit yield 5.5%','prose',good(5.5));ok(/Inputs!B6 5\.25% → 5\.5%/.test(r.a)&&!r.hits.includes('xcTest'),'a reply that is not JSON is asked again, not handed to the rules',r.a.slice(0,140));
r=await test('exit yield 6%','refuse',good(6));ok(/Inputs!B6 5\.25% → 6%/.test(r.a)&&!r.hits.includes('xcTest'),'a model that declines hands over to another model',r.a.slice(0,140));
const rd=REQS.find(q=>q.provider==='anthropic'&&/You read a sentence/.test(String(q.payload.system)));ok(rd&&rd.payload.output_config&&rd.payload.output_config.format&&rd.payload.output_config.format.type==='json_schema','the reader asks Claude for its JSON by schema',JSON.stringify(rd&&rd.payload.output_config).slice(0,120));
r=await test('exit yield 6%','down',good(6));ok(/Inputs!B6 5\.25% → 6%/.test(r.a)&&/its reading of the same sentence/.test(r.st),'no AI answers: the AI’s own saved reading of the same sentence is used',r.st.slice(0,200));
r=await test('exit yield 6.25%','down',good(6.25));ok(/^ERR No AI could read this/.test(r.a)&&/Exit yield 5\.25% → 6\.25% at Inputs!B6/.test(r.a)&&!/Exact recalculation/.test(r.a),'no AI answers and nothing saved: the rules decide nothing, their reading is put to the user',r.a.slice(0,260));
r=await test('exit yield 6.25%','down',good(6.25));ok(/Inputs!B6 5\.25% → 6\.25%/.test(r.a)&&/as you confirmed/.test(r.st),'the user sends it again: the confirmed reading runs (the AI tried first)',r.st.slice(0,200));
r=await test('exit yield 6.5%','ok',good(6.5));ok(/Inputs!B6 5\.25% → 6\.5%/.test(r.a)&&!/No AI/.test(r.st),'the AI back: its reading is used again at once',r.a.slice(0,120));
const ag=await p.evaluate(async()=>{window.AI_PASS_WAIT_MS=50;window.AI_BACKOFF=0.01;try{const r=await llmTurn('what are the results?','wa','Investment Director',async()=>{},'smart');return{f:r.final,notes:r.notes.join(' | '),tools:r.tools}}catch(e){return{f:'ERR '+e.message}}});
ok(/Written from the tool results/.test(ag.f)&&/stopped half-way/.test(ag.notes),'a chat turn broken half-way is finished by another model from the tool results',JSON.stringify(ag).slice(0,240));
const fb=REQS.find(q=>q.provider==='anthropic'&&/fable/.test(q.payload.model));ok(fb&&fb.payload.fallbacks==='default'&&(fb.betas||[]).includes('server-side-fallback-2026-07-01'),'the top Claude models carry the server-side fallback for a declined request',JSON.stringify({f:fb&&fb.payload.fallbacks,b:fb&&fb.betas}));
const ord=await p.evaluate(()=>{window.AIH={'anthropic|claude-sonnet-5-5':Date.now()};return aiOrder([{p:'anthropic',model:'claude-sonnet-5-5'},{p:'openai',model:'gpt-5'}]).map(q=>q.model)});ok(ord[0]==='gpt-5','a model that failed in the last 90 seconds is tried last',ord.join(', '));
ok(!errs.length,'no page errors',errs.join(' | '));
console.log(`\n${pass} pass, ${fail} fail`);await b.close();process.exit(fail?1:0);
