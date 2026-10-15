// The agents' exchange shows live (each one's figures, its review of the other, the third model's reason), the third model runs only when
// the two are still more than 5 bps apart, a failed agent is replaced by the next model on the route with the reason said, and the
// disagreement box reads "X gives a, Y gives b, difference, why" with the full exchange underneath.
import {chromium} from 'playwright';import fs from 'fs';
const sp=new globalThis.URL('./fixtures/',import.meta.url).pathname;const base=process.argv[2]||'http://localhost:4090/?mode=readonly';
const b=await chromium.launch({executablePath:process.env.PW_CHROMIUM||undefined});const p=await b.newPage({viewport:{width:1500,height:950}});const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.route('https://cdnjs.cloudflare.com/**',r=>r.fulfill({status:200,contentType:'application/javascript',body:fs.readFileSync(sp+'package/dist/xlsx.full.min.js')}));
await p.route('https://fonts.googleapis.com/**',r=>r.fulfill({status:200,contentType:'text/css',body:''}));
let MODE='apart',calls=[];
await p.route('**/api/llm',r=>{if(r.request().method()==='GET')return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({providers:{anthropic:true,openai:true}})});
  const j=JSON.parse(r.request().postData());const sys=j.payload.system||(j.payload.messages[0]&&j.payload.messages[0].role==='system'?j.payload.messages[0].content:'');const user=JSON.stringify(j.payload.messages);calls.push({m:j.payload.model,p:j.provider,sys:sys.slice(0,60)});
  const reply=text=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(j.provider==='openai'?{choices:[{message:{content:text}}]}:{model:j.payload.model,content:[{type:'text',text}]})});
  if(MODE==='openai-down'&&j.provider==='openai')return r.fulfill({status:400,contentType:'application/json',body:JSON.stringify({error:{message:'You exceeded your current quota, please check your plan and billing details'}})});
  if(j.payload.tools&&j.payload.tools.length){const used=j.payload.messages.some(m=>Array.isArray(m.content)&&m.content.some(b=>b.type==='tool_result'));if(used)return reply('Done: with the price cut the levered IRR is about 15.3%, below the hurdle.');
    return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({model:j.payload.model,content:[{type:'tool_use',id:'t1',name:'test_assumptions',input:{changes:['sale price −10%']}}]})})}
  if(/third analyst/.test(sys))return reply(JSON.stringify({root_cause:'Analyst 2 applied the price cut to revenue net of selling costs, Analyst 1 to gross revenue: a different base figure.',results:[{metric:'levered_irr',value:15.3,why:'the cut applies to gross revenue, as in the export',who:'1'}]}));
  if(/independent checker of a financial calculation/.test(sys))return reply(JSON.stringify({verdicts:[{metric:'levered_irr',ok:true,issue:'',severity:'warn'}],summary:'ok'}));
  if(/senior real estate development finance analyst/.test(sys)){const d=j.provider==='openai'?(MODE==='close'?0.03:0.4):0;const rev=/Another analyst/.test(user);
    return reply(JSON.stringify({method:`${j.provider} method: price cut on the sales line, costs unchanged.`,difference:rev?`I keep ${(15.3+d).toFixed(2)}: my base is right.`:undefined,results:[{metric:'levered_irr',value:+(15.3+d).toFixed(2),working:'w'},{metric:'profit_on_cost',value:17.9,working:'w'},{metric:'net_profit',value:100000000,working:'w'}]}))}
  reply('ok')});
await p.goto(base);await p.evaluate(()=>localStorage.clear());await p.reload();await p.waitForTimeout(1500);
const ok=[];const t=(c,m)=>ok.push((c?'PASS':'FAIL')+' | '+m);const ev=(f,a)=>p.evaluate(f,a);
// 1. apart by 40 bps: review, then a third model that is neither of the two, with the root cause
let r=await ev(async()=>{const steps=[];const res=await aiCrossCheck([{text:'sale price −10%'}],async s=>steps.push(s));return{steps,names:res.names,arbBy:res.arbBy,root:res.rootCause,m:res.metrics.find(m=>m.k==='levered_irr'),mode:res.mode,exch:(res.exchange||[]).map(e=>e.who)}});
t(r.steps.some(s=>s&&s.who&&/method/.test(s.text)),'each agent speaks its figures and method live: '+JSON.stringify(r.steps.filter(s=>s.who).map(s=>s.who+': '+s.text.slice(0,50))));
t(r.steps.some(s=>typeof s==='string'&&/more than 5 bps.*third model/.test(s)),'third model called only beyond 5 bps: '+r.steps.filter(s=>typeof s==='string').join(' | ').slice(0,300));
t(r.arbBy&&!r.names.includes(r.arbBy),`the third model is neither of the two (${r.arbBy} vs ${r.names})`);
t(/different base figure/.test(r.root)&&r.m.status==='arbitrated'&&Math.abs(r.m.value-15.3)<1e-9,'root cause recorded and the decided figure shown: '+r.root);
t(r.steps.every(s=>typeof s==='string'||(s.who&&s.text)),'every step is a line or an agent speaking');
const box=await ev(()=>{const w=document.querySelector('#dispWin');return w&&w.classList.contains('on')?w.innerText:''});
t(/gives/.test(box)&&/difference of/.test(box)&&/bps/.test(box)&&/Why they disagree/.test(box)&&/What each AI said/.test(box),'disagreement box: X gives a, Y gives b, difference in bps, why, exchange: '+box.replace(/\n/g,' | ').slice(0,400));
t(!/\[object Object\]/.test(box),'no raw objects in the box');
const tb=await ev(()=>{const b=document.querySelector('#msgs .msg.talkbox');return b?{n:b.querySelectorAll('.st.talk').length,sum:(b.querySelector('.tb-sum')||{}).textContent||'',open:DOCK.open,lines:b.querySelectorAll('.st').length}:null});
t(tb&&tb.open&&tb.n>=4&&/Why they disagreed/.test(tb.sum),'a box opened in the chat with the agents’ conversation and the why, although the test was started outside the chat: '+JSON.stringify(tb));
// 2. within 5 bps: no review, no third model
await p.waitForTimeout(400);calls=[];MODE='close';r=await ev(async()=>{const steps=[];const res=await aiCrossCheck([{text:'sale price −10%'}],async s=>steps.push(typeof s==='string'?s:'TALK'));return{steps,st:res.metrics.find(m=>m.k==='levered_irr').status}});
t(!r.steps.some(s=>/third model/.test(s))&&r.st==='agree','3 bps apart: agree, no third model ('+r.st+')');
t(!calls.some(c=>/third analyst/.test(c.sys)),'no third call made: '+JSON.stringify(calls.map(c=>c.m+' '+c.sys.slice(0,30)))+' steps '+JSON.stringify(r.steps));
// 3. OpenAI out of credit: the reason is said and the next model takes its place
await p.waitForTimeout(400);calls=[];MODE='openai-down';r=await ev(async()=>{const steps=[];const res=await aiCrossCheck([{text:'sale price −10%'}],async s=>steps.push(typeof s==='string'?s:'TALK'));return{steps,names:res.names,mode:res.mode,note:res.failNote}});
t(r.steps.some(s=>/OpenAI.*could not answer: OpenAI is out of API credit.*takes its place/.test(s)),'reason said and a replacement named: '+r.steps.filter(s=>/could not/.test(s)).join(' | '));
t(r.mode==='cross'&&r.names.length===2&&!/gpt-5$/.test(r.names[1]),'still cross-checked by two models: '+JSON.stringify(r.names));
// 4. in the chat the exchange streams as bubbles (not after the fact) and folds behind the arrow
MODE='apart';await ev(()=>{toggleDock(true)});const seen=[];const poll=setInterval(async()=>{try{seen.push(await ev(()=>document.querySelectorAll('#msgs .talkbox .st.talk').length))}catch(e){}},150);
await ev(()=>webAsk('what if sale price drops 10%'));await p.waitForFunction(()=>!document.querySelector('#msgs .kthink'),null,{timeout:60000}).catch(()=>{});clearInterval(poll);
const chat=await ev(()=>{const bx=[...document.querySelectorAll('#msgs .talkbox')].pop();return{talk:bx?bx.querySelectorAll('.st.talk').length:0,boxes:document.querySelectorAll('#msgs .talkbox').length,done:!!(bx&&bx.querySelector('.tb-sum'))}});
t(chat.talk>=3&&chat.done,'the chat holds one box per test with the agents’ bubbles and the closing line: '+JSON.stringify(chat));const u=seen.filter((v,i,a)=>a.indexOf(v)===i);t(u.length>=3,'they appeared one by one while the agent worked: '+JSON.stringify(u));
await ev(()=>{const w=document.querySelector('#dispWin');if(w)w.classList.remove('on');const t=[...document.querySelectorAll('#msgs .kt-tog')].pop();if(t)t.click();document.querySelector('#msgs').scrollTop=1e9});await p.waitForTimeout(300);await p.screenshot({path:sp+'../talk.png'});
t(!errs.length,'no page errors '+errs.join(';'));console.log(ok.join('\n'));await b.close();
