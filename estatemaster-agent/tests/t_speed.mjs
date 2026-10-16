// Speed without changing a figure: the chat's answer streams (the words show as written, the finished answer is identical), the
// exact recalculation is shown before its two-model audit returns and the verdict then takes the "auditing" note's place (a
// questioned one in red, in Disputes), the libraries load from the app's own site when the public CDNs are blocked, and with
// no formula engine an uploaded model's what-if is "not computed", never estimated.
import {chromium} from 'playwright';import fs from 'fs';
const sp=new globalThis.URL('./fixtures/',import.meta.url).pathname;const base=process.argv[2]||'http://localhost:4090/?mode=readonly';
const b=await chromium.launch({executablePath:process.env.PW_CHROMIUM||undefined});
let pass=0,fail=0;const ok=(c,m)=>{c?pass++:fail++;console.log((c?'PASS':'FAIL')+' | '+m)};
const SSE=msg=>{const ev=(t,d)=>`event: ${t}\ndata: ${JSON.stringify(d)}\n\n`;let o=ev('message_start',{type:'message_start',message:{id:'m1',role:'assistant',model:'claude-fable-5-1',content:[],stop_reason:null}});
  msg.content.forEach((bl,i)=>{if(bl.type==='text'){o+=ev('content_block_start',{type:'content_block_start',index:i,content_block:{type:'text',text:''}});for(const part of bl.text.match(/.{1,7}/gs))o+=ev('content_block_delta',{type:'content_block_delta',index:i,delta:{type:'text_delta',text:part}})}
    else if(bl.type==='thinking'){o+=ev('content_block_start',{type:'content_block_start',index:i,content_block:{type:'thinking',thinking:''}});o+=ev('content_block_delta',{type:'content_block_delta',index:i,delta:{type:'thinking_delta',thinking:bl.thinking}});o+=ev('content_block_delta',{type:'content_block_delta',index:i,delta:{type:'signature_delta',signature:bl.signature}})}
    else if(bl.type==='tool_use'){o+=ev('content_block_start',{type:'content_block_start',index:i,content_block:{type:'tool_use',id:bl.id,name:bl.name,input:{}}});const j=JSON.stringify(bl.input);for(let k=0;k<j.length;k+=5)o+=ev('content_block_delta',{type:'content_block_delta',index:i,delta:{type:'input_json_delta',partial_json:j.slice(k,k+5)}})}
    o+=ev('content_block_stop',{type:'content_block_stop',index:i})});
  return o+ev('message_delta',{type:'message_delta',delta:{stop_reason:msg.stop_reason||'end_turn'},usage:{output_tokens:5}})+ev('message_stop',{type:'message_stop'})};
async function page(o={}){const p=await b.newPage({viewport:{width:1400,height:900}});const errs=[];p.on('pageerror',e=>errs.push(e.message));
  const reqs=[],logs=[];
  // the public CDNs blocked (a corporate network): the app's own vendor/ copies must carry it
  await p.route(/cdn\.jsdelivr\.net|unpkg\.com|cdnjs\.cloudflare\.com/,r=>o.cdn?r.fulfill({status:200,contentType:'application/javascript',body:fs.readFileSync(/hyperformula/.test(r.request().url())?sp+'package/hyperformula.full.min.js':sp+'package/dist/xlsx.full.min.js')}):r.abort());
  if(o.noEngine)await p.route(/hyperformula/,r=>r.abort());
  await p.route('https://fonts.googleapis.com/**',r=>r.fulfill({status:200,contentType:'text/css',body:''}));
  await p.route('**/api/log',r=>{logs.push(r.request().postData()||'');r.fulfill({status:200,body:'{}'})});
  let agentN=0;
  await p.route('**/api/llm',async r=>{if(r.request().method()==='GET')return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({providers:{anthropic:true,openai:true}})});
    const j=JSON.parse(r.request().postData()),pl=j.payload,sys=String(pl.system||(pl.messages[0]&&pl.messages[0].role==='system'?pl.messages[0].content:''));reqs.push({task:j.task,model:pl.model,stream:!!pl.stream,sys:sys.slice(0,60),msgs:pl.messages,at:Date.now()});
    const reply=t=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(j.provider==='openai'?{choices:[{message:{content:t},finish_reason:'stop'}]}:{model:pl.model,content:[{type:'text',text:t}],stop_reason:'end_turn'})});
    if(j.task==='agent'&&j.provider==='anthropic'){agentN++;const msg=agentN===1?{content:[{type:'thinking',thinking:'plan it',signature:'SIG-abc'},{type:'tool_use',id:'tu1',name:'test_assumptions',input:{changes:['ADR +10%']}}],stop_reason:'tool_use'}:{content:[{type:'text',text:o.answer||'With ADR up 10% the **levered IRR** rises: the workbook was recalculated exactly.'}]};
      return pl.stream?r.fulfill({status:200,contentType:'text/event-stream',body:SSE(msg)}):r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({model:pl.model,...msg})})}
    if(/You read a sentence/.test(sys))return reply(JSON.stringify({changes:[{label:'ADR',kind:'pct',value:10,sure:true}]}));
    if(/You audit an exact recalculation/.test(sys)){await new Promise(z=>setTimeout(z,o.auditMs||2500));return reply(JSON.stringify(o.query&&j.provider==='openai'?{verdict:'query',why:'H12 is the wrong cell',results:[]}:{verdict:'agree',why:'right cell, units and direction',results:[]}))}
    if(/You are the third analyst/.test(sys))return reply(JSON.stringify({right:'flawed',why:'OpCashFlow!H12 is a label row',who:'2'}));
    reply('{}')});
  await p.goto(base);await p.evaluate(()=>localStorage.clear());await p.reload();await p.waitForTimeout(1500);
  await p.evaluate(()=>openNewProject());await p.setInputFiles('#npFile',sp+'models/hotel_us.xlsx');await p.waitForTimeout(1500);await p.click('#npCreate');await p.waitForTimeout(3000);
  return{p,errs,reqs,logs}}
const lastBody=p=>p.evaluate(()=>{const m=[...document.querySelectorAll('#msgs .msg.agent:not(.talkbox)')].pop();return m?m.querySelector('.body').innerHTML:''});

// 1. the CDNs blocked: the engine and the Excel reader come from vendor/, the result is exact; the answer streams; the audit comes after
{const {p,errs,reqs}=await page({auditMs:4000});
  const eng=await p.evaluate(async()=>{const r=await xcEngine(latestExport());return r&&{ok:r.ok,pct:r.pct}});
  ok(eng&&eng.ok&&eng.pct===100,'with every public CDN blocked the formula engine loads from the app’s own site: '+JSON.stringify(eng));
  await p.evaluate(()=>{toggleDock(true);let f=null,n=0,longest='';Object.defineProperty(window,'LIVE_TEXT',{configurable:true,get(){return f},set(v){f=typeof v==='function'?(t=>{n++;if(t.length>longest.length)longest=t;window.__live={n,longest};return v(t)}):v}})});
  const t0=Date.now();await p.evaluate(()=>webAsk('What if ADR goes up 10%?'));const ms=Date.now()-t0;
  const live=await p.evaluate(()=>window.__live||{n:0});
  ok(live.n>3&&/levered IRR/.test(live.longest),'the answer streamed: the page saw the text grow '+live.n+' times');
  const st=reqs.filter(r=>r.task==='agent');ok(st.length===2&&st.every(r=>r.stream),'both agent calls asked for a stream');
  ok(JSON.stringify(st[1].msgs).includes('SIG-abc')&&JSON.stringify(st[1].msgs).includes('"name":"test_assumptions"')&&JSON.stringify(st[1].msgs).includes('"ADR +10%"'),'the streamed tool call and the thinking signature went back to the model unchanged');
  let h=await lastBody(p);
  ok(/levered IRR/.test(h)&&/OpCashFlow!H12/.test(h)&&/= exact/.test(h),'the answer and the exact recalculation are shown');
  ok(/are auditing the recalculation/.test(h)&&/class="spin"/.test(h),'the audit was still running when the answer appeared (answer in '+ms+' ms)');
  const aud=reqs.filter(r=>/You audit an exact recalculation/.test(r.sys));ok(aud.length===2&&aud.every(r=>!r.stream),'two models audit it, with no stream (calculations never stream)');
  ok(await p.evaluate(()=>!document.querySelector('.k-live')),'no half-written answer is left on the page');
  await p.waitForFunction(()=>{const m=[...document.querySelectorAll('#msgs .msg.agent:not(.talkbox)')].pop();return m&&/Reviewed:/.test(m.innerHTML)},null,{timeout:30000}).catch(()=>{});
  h=await lastBody(p);if(/are auditing/.test(h))console.log('STILL:',(h.match(/.{0,300}are auditing.{0,200}/s)||[''])[0]);ok(/Reviewed:<\/b> .* agree/.test(h)&&!/are auditing/.test(h),'then the verdict takes the note’s place: '+(h.match(/Reviewed:.{0,90}/)||[''])[0].replace(/<[^>]+>/g,''));
  const work=await p.evaluate(()=>WORK.filter(w=>/Review:/.test(w.text)).map(w=>w.text.match(/Review: [^\n]+/)[0]).pop());ok(/agree/.test(work||'')&&!/auditing/.test(work||''),'the working behind each figure says the verdict too: '+work);
  // the same question answered without a stream gives the same answer
  await p.evaluate(()=>{window.LIVE_TEXT=null;Object.defineProperty(window,'LIVE_TEXT',{configurable:true,writable:true,value:null})});
  ok(!errs.length,'no page errors '+errs.join('; '));await p.close()}

// 2. a questioned recalculation: red, in Disputes, even though the answer was already shown
{const {p,errs}=await page({query:true,auditMs:1500});
  await p.evaluate(()=>toggleDock(true));await p.evaluate(()=>webAsk('What if ADR goes up 10%?'));
  await p.waitForFunction(()=>!!document.querySelector('#msgs .xc-rev-q'),null,{timeout:30000}).catch(()=>{});
  const s=await p.evaluate(()=>({q:!!document.querySelector('#msgs .xc-rev-q'),txt:(document.querySelector('#msgs .xc-rev-q')||{}).innerText||'',d:(typeof DISPUTES!=='undefined'?DISPUTES:[]).filter(d=>d.where==='Exact recalculation').length}));
  ok(s.q&&/Questioned/.test(s.txt)&&/label row/.test(s.txt),'a flawed verdict replaces the note, in red: '+s.txt.slice(0,120));
  ok(s.d>=1,'and goes to Disputes');ok(!errs.length,'no page errors '+errs.join('; '));await p.close()}

// 3. no formula engine at all: the uploaded model's what-if is not computed; no AI estimate is asked for; the failure is reported
{const {p,errs,reqs,logs}=await page({noEngine:true});
  await p.evaluate(()=>{toggleDock(true)});const q0=reqs.length;await p.evaluate(()=>webAsk('What if ADR goes up 10%?'));
  const h=await lastBody(p);const est=reqs.slice(q0).filter(r=>/senior real estate development finance analyst/.test(r.sys));
  const tool=reqs.filter(r=>r.task==='agent')[1];const toolTxt=tool?JSON.stringify(tool.msgs).slice(-900):'';
  ok(/Not computed/.test(toolTxt)&&/formula engine failed|could not be loaded|not in this browser/i.test(toolTxt),'the tool answers “not computed” with the reason: '+(toolTxt.match(/Not computed[^"]{0,140}/)||[''])[0]);
  ok(!est.length,'no AI estimate is asked for on an uploaded model ('+est.length+' estimate calls)');
  ok(logs.some(l=>/formula engine/.test(l)),'the engine failure is reported to the server log');
  ok(!errs.length,'no page errors '+errs.join('; '));await p.close()}
// 4. the agent may pick the estimate tool instead: on an uploaded model it is the same exact recalculation with the same audit
{const {p,errs,reqs}=await page({auditMs:1500});
  await p.evaluate(()=>toggleDock(true));const q0=reqs.length;
  const h=await p.evaluate(async()=>{const o=await handle('','web','Investment Director',{k:'estimate',text:'ADR +10%',mods:{}});return o.html});
  ok(/OpCashFlow!H12/.test(h)&&/= exact/.test(h)&&/are auditing the recalculation/.test(h),'the estimate tool recalculates exactly and the audit is under way');
  await p.waitForFunction(()=>Object.values(REVS).some(x=>x.review&&x.review.status==='agree'),null,{timeout:30000}).catch(()=>{});
  const aud=reqs.slice(q0).filter(r=>/You audit an exact recalculation/.test(r.sys));ok(aud.length===2,'two models audited it ('+aud.length+')');
  ok(!errs.length,'no page errors '+errs.join('; '));await p.close()}
console.log(`${pass} pass, ${fail} fail`);await b.close();
