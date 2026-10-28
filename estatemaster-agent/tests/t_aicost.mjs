// AI cost: the app asks the AI only for work someone looks at. A page that loads with an AI connected makes no AI call by itself (the
// change requests of the demo inbox are worked out when the Daily feed is on screen, for the open model only, or when a card is opened);
// the server runs Opus at medium effort unless a call asks for more. A live run (round 50) measured $2-3 a question: 24 Opus calls on
// every page load for the inbox, and high effort forced on every call.
import {chromium} from 'playwright';import {createRequire} from 'module';
const base=process.argv[2]||'http://localhost:4090/?mode=readonly';
let pass=0,fail=0;const ok=(c,m,d)=>{if(c){pass++;console.log('PASS | '+m)}else{fail++;console.log('FAIL | '+m+(d!==undefined?' → '+JSON.stringify(d).slice(0,300):''))}};
const b=await chromium.launch({executablePath:process.env.PW_CHROMIUM||undefined});
const ctx=await b.newContext(),p=await ctx.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));const calls=[];
await p.route(/cdn\.jsdelivr\.net|unpkg\.com|cdnjs\.cloudflare\.com/,r=>r.abort());await p.route('**/api/log*',r=>r.fulfill({status:200,body:'{}'}));
await p.route(/api\.anthropic\.com|api\.openai\.com|\/api\/llm/,async r=>{if(r.request().method()==='GET')return r.fulfill({status:200,contentType:'application/json',body:'{"providers":{"anthropic":true,"openai":true}}'});
  let j={};try{j=JSON.parse(r.request().postData()||'{}')}catch(e){}calls.push({task:j.task||'',t:Date.now()});
  r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({model:'claude-opus-5-5',content:[{type:'text',text:'{}'}],stop_reason:'end_turn'})})});
await p.goto(base);await p.evaluate(()=>localStorage.clear());await p.reload();await p.waitForTimeout(6000);
const st=await p.evaluate(()=>({pending:pendingCRs().length,open:pendingCRs().filter(c=>c.proj===PROJ.id).length,need:pendingCRs().filter(c=>crNeedsAI(c)||CRBUSY.has(c.id)||c.ai).length,proxy:apiOn()}));
ok(st.proxy&&st.pending>0,'the page has an AI connected and change requests waiting in the Daily feed',st);
ok(calls.length===0,'a page that loads asks the AI nothing by itself (no change request is worked out in the background)',{calls:calls.length,st});
// the Daily feed (the landing page) shown again: still nothing; opening a card works out that change only
await p.evaluate(()=>{showTab('em');showTab('appr')});await p.waitForTimeout(3000);
ok(calls.length===0,'showing the Daily feed works nothing out by itself',{calls:calls.length});
const id=await p.evaluate(()=>{const c=pendingCRs().find(c=>crNeedsAI(c));return c&&c.id});
await p.evaluate(id=>{const it=document.querySelector(`.feed-item[data-fi="${id}"] .fi-row`);if(it)it.click()},id);await p.waitForTimeout(4000);
const after=await p.evaluate(id=>pendingCRs().map(c=>({id:c.id,on:!!(c.ai||c.aiErr||CRBUSY.has(c.id))})),id);
ok(calls.length>0&&after.find(z=>z.id===id).on,'opening a change request’s card works out its impact',{id,calls:calls.length});
ok(after.filter(z=>z.id!==id).every(z=>!z.on),'the other change requests wait until their own card is opened',after);
// who answers: a figure looked up is Sonnet's, a what-if Opus's, writing Fable's; picking from a list the app checks is Sonnet's first
{const r=await p.evaluate(async()=>{const used=[];const f0=window.callOne;window.callOne=async(pv,model)=>{used.push(model);return{text:'{"groups":{}}'}};
  const t=['What is the peak debt?','How much is the total development cost?','Construction cost +10%: what happens to the IRR?','What is the IRR if SAIBOR rises 100 bps?','What sale price gives a 12% levered IRR?','Draft an IC memo on the project','What are the main risks?'].map(q=>aiTier(q.toLowerCase()));
  const j=await a33Ai('Reply with JSON only.','x',100);window.callOne=f0;return{t,used,j:!!j,fast:chain('fast')[0].model}});
  ok(r.t.join()==='fast,fast,smart,smart,smart,deep,deep','lookups to Sonnet, what-ifs and goal seeks to Opus, memos and risks to Fable',r.t);
  ok(r.j&&r.used[0]===r.fast,'a pick from a list (a33Ai) asks Sonnet first',r.used)}
ok(!errs.length,'no page errors',errs);await b.close();
// the server: Opus at medium effort by default, the effort a call asks for kept
{const llm=createRequire(import.meta.url)('../api/llm.js');process.env.ANTHROPIC_API_KEY='k';let sent=null;const f0=globalThis.fetch;
  globalThis.fetch=async(u,o)=>{sent=JSON.parse(o.body);return new Response(JSON.stringify({model:'claude-opus-5-5',content:[{type:'text',text:'ok'}],usage:{}}),{status:200,headers:{'content-type':'application/json'}})};
  const run=async payload=>{sent=null;const res={statusCode:200,h:{},setHeader(k,v){this.h[k]=v},getHeader(k){return this.h[k]},writeHead(s){this.statusCode=s},write(){},end(){},flushHeaders(){}};
    await llm({method:'POST',headers:{'content-type':'application/json','x-forwarded-for':'127.0.0.'+Math.floor(Math.random()*250)},body:{provider:'anthropic',task:payload.task,payload:payload.p},query:{}},res);return sent};
  const s1=await run({task:'calc',p:{model:'claude-opus-5-5',max_tokens:100,messages:[{role:'user',content:'x'}]}});
  const s2=await run({task:'agent',p:{model:'claude-opus-5-5',max_tokens:100,messages:[{role:'user',content:'x'}],output_config:{effort:'high'}}});
  globalThis.fetch=f0;
  ok(s1&&s1.output_config&&s1.output_config.effort==='medium','the server runs Opus checks at medium effort by default',s1&&s1.output_config);
  ok(s2&&s2.output_config&&s2.output_config.effort==='high','a call that asks for high effort keeps it',s2&&s2.output_config)}
console.log(`${pass} pass, ${fail} fail`);process.exit(fail?1:0);
