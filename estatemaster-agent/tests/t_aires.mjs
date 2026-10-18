// AI resilience: the AI's reading survives a provider overload (retried), a model that fails (the next one answers), JSON in a code
// fence with prose around it, an answer cut off at its token cap (asked again with more room), and a retired model saved in the
// browser; each failure is counted and sent to the server log as "ai-fail".
import {chromium} from 'playwright';
const F=new globalThis.URL('./fixtures/models/',import.meta.url).pathname;const base=process.argv[2]||'http://localhost:4090/?mode=readonly';
const b=await chromium.launch({executablePath:process.env.PW_CHROMIUM||undefined}),p=await b.newPage();await p.route(/cdn\.jsdelivr\.net|unpkg\.com|cdnjs\.cloudflare\.com/,r=>r.abort());await p.route('https://fonts.googleapis.com/**',r=>r.fulfill({status:200,contentType:'text/css',body:''}));const errs=[];p.on('pageerror',e=>errs.push(e.message));
const LOGS=[];await p.route('**/api/log',r=>{try{LOGS.push(JSON.parse(r.request().postData()||'{}').msg||'')}catch(e){}r.fulfill({status:200,body:'{}'})});
let MODE='ok',N=0;const READ={changes:[{label:'Exit yield',cell:'Inputs!B6',kind:'to',value:5.75,sure:true}]};
await p.route('**/api/llm',async r=>{if(r.request().method()==='GET')return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({providers:{anthropic:true,openai:true}})});
  const j=JSON.parse(r.request().postData()),pl=j.payload,sys=String(pl.system||(pl.messages[0]&&pl.messages[0].role==='system'?pl.messages[0].content:''));
  const reply=t=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(j.provider==='openai'?{choices:[{message:{content:t},finish_reason:'stop'}]}:{model:pl.model,content:[{type:'text',text:t}],stop_reason:'end_turn'})});
  if(/You read a sentence/.test(sys)){N++;
    if(MODE==='overload'&&N===1)return r.fulfill({status:529,contentType:'application/json',body:JSON.stringify({type:'error',error:{type:'overloaded_error',message:'Overloaded'}})});
    if(MODE==='dead'&&j.provider==='anthropic')return r.fulfill({status:400,contentType:'application/json',body:JSON.stringify({type:'error',error:{type:'invalid_request_error',message:'model: not found'}})});
    if(MODE==='fence')return reply('Here is my reading:\n```json\n'+JSON.stringify(READ,null,1).replace(/\n}$/,',\n}')+'\n```\nNote {this} is the exit yield.');
    if(MODE==='cut'&&N===1)return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({model:pl.model,content:[{type:'text',text:JSON.stringify(READ).slice(0,40)}],stop_reason:'max_tokens'})});
    return reply(JSON.stringify(READ))}
  if(/You audit an exact/.test(sys))return reply('{"verdict":"agree","why":"ok","results":[]}');reply('{}')});
let pass=0,fail=0;const ok=(c,name,detail)=>{c?pass++:fail++;console.log((c?'PASS':'FAIL')+' | '+name+(detail?' → '+String(detail).slice(0,260):''))};
await p.goto(base);await p.evaluate(()=>{localStorage.clear();localStorage.setItem('bohioAI2',JSON.stringify({models:{fast:[['anthropic','claude-3-opus-20240229']]}}))});await p.reload();await p.waitForTimeout(1500);
ok(await p.evaluate(()=>!AI.models.fast),'a retired model saved in this browser is dropped',await p.evaluate(()=>JSON.stringify(AI.models)));
await p.evaluate(()=>openNewProject());await p.setInputFiles('#npFile',F+'r25_logi_eur.xlsx');await p.waitForTimeout(1800);await p.click('#npCreate');await p.waitForTimeout(3000);
const test=async(q,mode)=>{MODE=mode;N=0;return p.evaluate(async q=>{window.RULEHITS=[];window.POST_LIMIT_MS=60000;window.AIH={};   /* each case starts with every model healthy */try{const r=await aiCrossCheck([{text:q}],async()=>{},undefined,{quiet:true});return{a:testPlain(r).replace(/\*+/g,''),hits:window.RULEHITS.length}}catch(e){return{a:'ERR '+e.message,hits:-1}}},q)};
for(const [mode,name] of [['overload','a provider overload (529) is retried and the AI reading is used'],['dead','a model that fails outright: the other provider reads the sentence'],['fence','JSON in a code fence, a trailing comma and prose with braces is read'],['cut','an answer cut off at its token cap is asked again with more room']]){
  const t0=Date.now();const r=await test('exit yield 5.75%',mode);ok(/Inputs!B6 5\.25% → 5\.75%/.test(r.a)&&r.hits===0,name,`${((Date.now()-t0)/1000).toFixed(1)}s ${r.a.slice(0,140)}`)}
const fails=await p.evaluate(()=>window.AIFAILS);ok(Object.keys(fails).some(k=>/retried/.test(k))&&Object.keys(fails).some(k=>/failover/.test(k))&&Object.keys(fails).some(k=>/max_tokens/.test(k)),'each failure is counted by its reason',JSON.stringify(fails));
ok(LOGS.some(m=>/^ai-fail: /.test(m)),'and reported to the server log',LOGS.slice(0,4).join(' | '));
ok(!errs.length,'no page errors',errs.join(' | '));
console.log(`\n${pass} pass, ${fail} fail`);await b.close();process.exit(fail?1:0);
