// The agents' exchange shows live (each one's figures, its review of the other, the third model's reason), the third model runs only when
// the two are still more than 5 bps apart, a failed agent is replaced by the next model on the route with the reason said, and the
// disagreement box reads "X gives a, Y gives b, difference, why" with the full exchange underneath.
import {chromium} from 'playwright';import fs from 'fs';
const sp=new globalThis.URL('./fixtures/',import.meta.url).pathname;const base=process.argv[2]||'http://localhost:4090/?mode=readonly';
const b=await chromium.launch({executablePath:process.env.PW_CHROMIUM||undefined});const p=await b.newPage({viewport:{width:1500,height:950}});const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.route('https://cdnjs.cloudflare.com/**',r=>r.fulfill({status:200,contentType:'application/javascript',body:fs.readFileSync(sp+'package/dist/xlsx.full.min.js')}));
await p.route('https://fonts.googleapis.com/**',r=>r.fulfill({status:200,contentType:'text/css',body:''}));
let MODE='apart',calls=[],SLOW=false;
await p.route('**/api/llm',async r=>{if(r.request().method()==='GET')return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({providers:{anthropic:true,openai:true}})});
  if(SLOW)await new Promise(z=>setTimeout(z,400));   // models take time: the bubbles must show as each answer lands, not all at the end
  const j=JSON.parse(r.request().postData());const sys=j.payload.system||(j.payload.messages[0]&&j.payload.messages[0].role==='system'?j.payload.messages[0].content:'');const user=JSON.stringify(j.payload.messages);calls.push({m:j.payload.model,p:j.provider,sys:sys.slice(0,60)});
  const reply=text=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(j.provider==='openai'?{choices:[{message:{content:text}}]}:{model:j.payload.model,content:[{type:'text',text}]})});
  if(MODE==='openai-down'&&j.provider==='openai')return r.fulfill({status:400,contentType:'application/json',body:JSON.stringify({error:{message:'You exceeded your current quota, please check your plan and billing details'}})});
  if(j.payload.tools&&j.payload.tools.length){const used=j.payload.messages.some(m=>Array.isArray(m.content)&&m.content.some(b=>b.type==='tool_result'));if(used)return reply('Done: with the price cut the levered IRR is about 15.3%, below the hurdle.');
    return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({model:j.payload.model,content:[{type:'tool_use',id:'t1',name:'test_assumptions',input:{changes:['sale price −10%']}}]})})}
  if(/third analyst/.test(sys))return reply(JSON.stringify({root_cause:'Analyst 2 applied the price cut to revenue net of selling costs, Analyst 1 to gross revenue: a different base figure.',results:[{metric:'levered_irr',value:15.3,why:'the cut applies to gross revenue, as in the export',who:'1'}]}));
  if(/independent checker of a financial calculation/.test(sys))return reply(JSON.stringify({verdicts:[{metric:'levered_irr',ok:true,issue:'',severity:'warn'}],summary:'ok'}));
  if(MODE==='units'&&/senior real estate development finance analyst/.test(sys)&&j.provider==='openai')return reply(JSON.stringify({method:'openai method in other units',results:[{metric:'levered_irr',base:0.2683,value:0.153,working:'w'},{metric:'profit_on_cost',base:23.26,value:17.9,working:'w'},{metric:'net_profit',base:129.5,value:100,working:'w'}]}));
  if(MODE==='wrongbase'&&/senior real estate development finance analyst/.test(sys)&&j.provider==='openai')return reply(JSON.stringify({method:'openai method from a wrong base',results:[{metric:'levered_irr',base:24.83,value:13.3,working:'w'},{metric:'profit_on_cost',base:23.26,value:17.9,working:'w'},{metric:'net_profit',base:129500000,value:100000000,working:'w'}]}));
  if(MODE==='concede'&&/senior real estate development finance analyst/.test(sys)){const rev=/Another analyst/.test(user);const d=j.provider==='openai'&&!rev?0.4:0;
    return reply(JSON.stringify({method:`${j.provider} method`,difference:rev?(j.provider==='openai'?{diverge_at:'exit cap rate: I used 5.5%, Claude 5%',right:'other',why:'the model’s exit cap is 5%, as in Summary!C25'}:{diverge_at:'exit cap rate: I used 5%, OpenAI 5.5%',right:'me',why:'the model’s exit cap is 5%'}):undefined,results:[{metric:'levered_irr',value:+(15.3+d).toFixed(2),working:'w'},{metric:'profit_on_cost',value:17.9,working:'w'},{metric:'net_profit',value:100000000,working:'w'}]}))}
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
const box=await ev(()=>{const w=document.querySelector('#dispWin');if(w)w.querySelectorAll('details.disp-raw').forEach(d=>d.open=true);return w&&w.classList.contains('on')?w.innerText:''});
t(/gives/.test(box)&&/gap of|difference of/.test(box)&&/bps/.test(box)&&/Why they disagree/.test(box)&&/What each AI said/.test(box),'disagreement box: X gives a, Y gives b, difference in bps, why, exchange: '+box.replace(/\n/g,' | ').slice(0,400));
t(!/\[object Object\]/.test(box),'no raw objects in the box');
const tb=await ev(()=>{const b=document.querySelector('#msgs .msg.talkbox');return b?{n:b.querySelectorAll('.st.talk').length,sum:(b.querySelector('.tb-sum')||{}).textContent||'',open:DOCK.open,lines:b.querySelectorAll('.st').length}:null});
t(tb&&tb.open&&tb.n>=4&&/Why they disagreed/.test(tb.sum),'a box opened in the chat with the agents’ conversation and the why, although the test was started outside the chat: '+JSON.stringify(tb));
// 2. within 5 bps: no review, no third model
await p.waitForTimeout(400);calls=[];MODE='close';r=await ev(async()=>{const steps=[];const res=await aiCrossCheck([{text:'sale price −10%'}],async s=>steps.push(typeof s==='string'?s:'TALK'));return{steps,st:res.metrics.find(m=>m.k==='levered_irr').status}});
t(!r.steps.some(s=>/third model/.test(s))&&r.st==='agree','3 bps apart: agree, no third model ('+r.st+')');
t(!calls.some(c=>/third analyst/.test(c.sys)),'no third call made: '+JSON.stringify(calls.map(c=>c.m+' '+c.sys.slice(0,30)))+' steps '+JSON.stringify(r.steps));
// 2b. units: a fraction and millions from one agent are read as the other's units, so there is nothing to disagree on
await p.waitForTimeout(400);MODE='units';r=await ev(async()=>{const steps=[];const res=await aiCrossCheck([{text:'sale price −10%'}],async s=>steps.push(typeof s==='string'?s:'TALK'));return{steps,st:res.metrics.find(m=>m.k==='levered_irr').status,np:res.metrics.find(m=>m.k==='net_profit')}});
t(r.st==='agree'&&r.np.status==='agree'&&Math.abs(r.np.b-1e8)<1,'0.153 and 100 (millions) read as 15.3% and 100,000,000: both agree '+JSON.stringify({st:r.st,b:r.np.b}));t(r.steps.some(s=>/given as a fraction/.test(s))&&r.steps.some(s=>/given in millions/.test(s)),'the unit corrections are said: '+r.steps.filter(s=>/given/.test(s)).join(' | ').slice(0,200));
// 2c. a calculation that started from a wrong base is shifted onto the trusted one before the comparison
await p.waitForTimeout(400);MODE='wrongbase';r=await ev(async()=>{const steps=[];const res=await aiCrossCheck([{text:'sale price −10%'}],async s=>steps.push(typeof s==='string'?s:'TALK'));const m=res.metrics.find(m=>m.k==='levered_irr');return{steps,st:m.status,b:m.b,base:latestExport().out.levered_irr}});
t(Math.abs(r.b-(13.3+r.base-24.83))<1e-6&&r.st==='agree','started from 24.83 instead of '+r.base+': shifted and then agrees ('+r.b+')');t(r.steps.some(s=>/started from 24\.83% instead of the trusted/.test(s)),'the shift is said');
// 2d. the confrontation: OpenAI concedes the exit cap step and moves to Claude's figure → verdict: Claude was right, said in the box
await p.waitForTimeout(400);MODE='concede';r=await ev(async()=>{const steps=[];const res=await aiCrossCheck([{text:'sale price −10%'}],async s=>steps.push(s));const m=res.metrics.find(m=>m.k==='levered_irr');return{st:m.status,verdict:m.verdict,v:res.verdict.levered_irr,talk:steps.filter(s=>s&&s.who).map(s=>s.who+': '+s.text.slice(0,90)),heads:steps.filter(s=>s&&s.who).map(s=>s.who+' | '+s.result)}});
t(r.st==='reconciled'&&r.v&&r.v.who==='A'&&/Claude Fable 5\.1 was right/.test(r.verdict)&&/exit cap/.test(r.verdict),'who was right is worked out from who moved: '+r.verdict);
t(r.talk.some(s=>/^OpenAI gpt-5: Claude Fable 5\.1 was right: the model’s exit cap is 5%/.test(s))&&r.talk.some(s=>/^Verdict: the model’s exit cap/.test(s)),'who was right leads each line, then the verdict: '+JSON.stringify(r.talk.slice(-3)));
const heads=r.heads;r=await ev(()=>{const w=document.querySelector('#dispWin');if(w)w.querySelectorAll('details.disp-raw').forEach(d=>d.open=true);return w&&w.classList.contains('on')?w.innerText:''});
t(/Claude Fable 5\.1 was right/.test(r),'the disagreement box names who was right');t(heads.some(h=>/^Verdict \| Levered IRR: Claude Fable 5\.1 was right$/.test(h))&&heads.some(h=>/^OpenAI gpt-5 \| Levered IRR 15\.30%/.test(h)),'final results are the bold line of each bubble: '+JSON.stringify(heads.slice(-3)));
// in the 'apart' case both keep their figure, so the third model rules and the verdict comes from it
await p.waitForTimeout(400);MODE='apart';r=await ev(async()=>{const res=await aiCrossCheck([{text:'sale price −10%'}],async()=>{});return{v:res.verdict.levered_irr,verdict:res.metrics.find(m=>m.k==='levered_irr').verdict}});
t(r.v&&r.v.who==='A'&&/decided by Claude Opus 5\.5/.test(r.v.how)&&/was right/.test(r.verdict),'when both hold their ground the third model names who was right: '+r.verdict);
// 3. OpenAI out of credit: the reason is said and the next model takes its place
await p.waitForTimeout(400);calls=[];MODE='openai-down';r=await ev(async()=>{const steps=[];const res=await aiCrossCheck([{text:'sale price −10%'}],async s=>steps.push(typeof s==='string'?s:'TALK'));return{steps,names:res.names,mode:res.mode,note:res.failNote}});
t(r.steps.some(s=>/OpenAI.*could not answer: OpenAI is out of API credit.*takes its place/.test(s)),'reason said and a replacement named: '+r.steps.filter(s=>/could not/.test(s)).join(' | '));
t(r.mode==='cross'&&r.names.length===2&&!/gpt-5$/.test(r.names[1]),'still cross-checked by two models: '+JSON.stringify(r.names));
// 4. in the chat the exchange streams as bubbles (not after the fact) and folds behind the arrow
MODE='apart';SLOW=true;await ev(()=>{toggleDock(true)});const seen=[];const poll=setInterval(async()=>{try{seen.push(await ev(()=>document.querySelectorAll('#msgs .talkbox .st.talk').length))}catch(e){}},150);
await ev(()=>webAsk('what if sale price drops 10%'));await p.waitForFunction(()=>!document.querySelector('#msgs .kthink'),null,{timeout:60000}).catch(()=>{});clearInterval(poll);SLOW=false;
const chat=await ev(()=>{const bx=[...document.querySelectorAll('#msgs .talkbox')].pop();return{talk:bx?bx.querySelectorAll('.st.talk').length:0,boxes:document.querySelectorAll('#msgs .talkbox').length,done:!!(bx&&bx.querySelector('.tb-sum'))}});
t(chat.talk>=3&&chat.done,'the chat holds one box per test with the agents’ bubbles and the closing line: '+JSON.stringify(chat));const u=seen.filter((v,i,a)=>a.indexOf(v)===i);t(u.length>=3,'they appeared one by one while the agent worked: '+JSON.stringify(u));
await ev(()=>{const w=document.querySelector('#dispWin');if(w)w.classList.remove('on');const t=[...document.querySelectorAll('#msgs .kt-tog')].pop();if(t)t.click();document.querySelector('#msgs').scrollTop=1e9});await p.waitForTimeout(300);await p.screenshot({path:sp+'../talk.png'});
// several discrepancies: the flag opens a list saying what each refers to (the question or the table); a click opens that one
r=await ev(()=>{$('#dispWin')&&$('#dispWin').classList.remove('on');window.LASTQ='what if sale price drops 10%';flagDispute({where:'Sensitivity table',what:'Levered IRR over ADR × Occupancy',kind:'disagree',items:[{label:'-10% × +5 pts',a:'19.6%',b:'18.6%',an:'Claude Fable 5.1',bn:'OpenAI gpt-5'}],key:'k-test-1'});$('#dispWin').classList.remove('on');$('#dispBadge').click();return{n:DISPUTES.length,title:$('#dispTitle').textContent,rows:[...document.querySelectorAll('#dispBody .disp-row b')].map(e=>e.textContent)}});
t(r.n>1&&/discrepancies/.test(r.title)&&r.rows.some(x=>/^Sensitivity table · Levered IRR over ADR × Occupancy$/.test(x))&&r.rows.some(x=>/^Question: “|^Test: /.test(x)),'the flag lists every discrepancy with what it refers to: '+JSON.stringify(r.rows.slice(0,3)));
r=await ev(()=>{document.querySelector('#dispBody .disp-row').click();return{body:$('#dispBody').innerText,back:!!$('#dispBack')}});t(/About: Sensitivity table/.test(r.body)&&r.back,'a click opens that one, with a way back to the list');
t(!errs.length,'no page errors '+errs.join(';'));console.log(ok.join('\n'));await b.close();
