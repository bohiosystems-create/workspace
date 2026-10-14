import {chromium} from 'playwright';
const base=process.argv[2]||'http://localhost:4090/?mode=readonly';
const b=await chromium.launch({executablePath:process.env.PW_CHROMIUM||undefined});const p=await b.newPage({viewport:{width:1500,height:1000}});const errs=[];p.on('pageerror',e=>errs.push(e.message));
const ok=(c,n)=>console.log((c?'PASS ':'FAIL ')+n);
let llm=[];
await p.route('**/api/llm',r=>{if(r.request().method()==='GET')return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({providers:{anthropic:true,openai:true}})});
  const j=JSON.parse(r.request().postData());llm.push(j);const sys=j.payload.system||(j.payload.messages[0]&&j.payload.messages[0].role==='system'?j.payload.messages[0].content:'');
  const reply=text=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(j.provider==='openai'?{choices:[{message:{content:text}}]}:{model:j.payload.model,content:[{type:'text',text}]})});
  if(/senior real estate development finance analyst/.test(sys)){const d=j.provider==='openai'?0.1:0;return reply(JSON.stringify({method:'Revenue down 15% on every sale line of the export; costs and funding unchanged.',results:[{metric:'levered_irr',base:26.83,value:14.2+d,working:'IRR = 26.83% − 12.6 pts = 14.2%'},{metric:'profit_on_cost',base:23.26,value:9.1+d,working:'margin down'},{metric:'net_profit',base:130000000,value:51000000,working:'profit down'}]}))}
  return reply('ok')});
await p.goto(base);await p.evaluate(()=>localStorage.clear());await p.reload();await p.waitForTimeout(1200);
// 1. the what-if in free words goes to the cross-checked AI calculation
const it=await p.evaluate(()=>intent('what happens if in this model we drop revenue by 15%. how does that affect IRR'));
ok(it.k==='aitest'&&/revenue by 15%/.test(it.changes[0]),'free-word what-if → AI calculation: '+JSON.stringify(it));
ok(['estimate','aitest'].includes((await p.evaluate(()=>intent('what if sale price drops 10%?'))).k),'known-variable what-if keeps its estimate path');
ok((await p.evaluate(()=>intent('where are we on IRR'))).k==='status','plain status question stays a lookup');
const rt=await p.evaluate(()=>route('what happens if in this model we drop revenue by 15%. how does that affect IRR'));
ok(rt.lane==='api'&&rt.tier==='deep','every chat question goes through the AI agent (deep tier for a what-if): '+JSON.stringify({lane:rt.lane,tier:rt.tier}));
ok((await p.evaluate(()=>route('monthly report').lane))==='api'&&(await p.evaluate(()=>route('approve CR-101').lane))==='calc','reports too; approvals stay a fixed rule');
ok(await p.evaluate(()=>TOOLS.some(t=>t.name==='set_hurdle')&&/Hurdle:/.test(sysPrompt('web','Investment Director'))),'the agent knows the hurdle state and can record a confirmed one');
await p.evaluate(()=>{toggleDock(true);webAsk('what happens if in this model we drop revenue by 15%. how does that affect IRR')});await p.waitForTimeout(2500);
// 2. one chat per project
await p.evaluate(()=>{PROJECTS.t2={...PROJECTS[PROJ.id],id:'t2',name:'Test Tower',xl:undefined}});const ids=await p.evaluate(()=>[PROJ.id,'t2']);
const n1=await p.evaluate(()=>document.querySelectorAll('#msgs .msg').length);
await p.evaluate(id=>switchProject(id),ids[1]);await p.waitForTimeout(400);
const n2=await p.evaluate(()=>document.querySelectorAll('#msgs .msg:not(.divider)').length),w2=await p.evaluate(()=>document.querySelector('#msgs .msg:not(.divider)').textContent);
ok(n2===1&&new RegExp(await p.evaluate(id=>PROJECTS[id].name,ids[1])).test(w2),'switching project opens a fresh chat with that project’s welcome: '+w2.slice(0,80));
await p.evaluate(()=>addMsg('user','note for project two'));
await p.evaluate(id=>switchProject(id),ids[0]);await p.waitForTimeout(400);
const n3=await p.evaluate(()=>document.querySelectorAll('#msgs .msg').length),t3=await p.evaluate(()=>document.querySelector('#msgs').textContent);
ok(n3===n1&&/revenue by 15%/.test(t3)&&!/note for project two/.test(t3),'switching back restores the first project’s chat intact ('+n3+' messages)');
await p.reload();await p.waitForTimeout(1200);
ok(await p.evaluate(()=>/revenue by 15%/.test(document.querySelector('#msgs').textContent)),'the chat survives a reload');
console.log('errs',errs);await b.close();
