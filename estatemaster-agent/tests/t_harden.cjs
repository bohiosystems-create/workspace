// Production hardening: client error reports, health check, and the AI proxy's guards (model allowlist, no Haiku, rate limit, upstream time-out)
const path=__dirname+'/../api/';
const mk=(method,url,body,headers={})=>{const req={method,url,headers:{host:'x.test','content-type':'application/json','x-forwarded-for':'10.0.0.'+(headers.ip||1),'user-agent':'test',...headers},body,socket:{},[Symbol.asyncIterator]:async function*(){if(body!=null)yield Buffer.from(typeof body==='string'?body:JSON.stringify(body))}};
  const res={code:200,hdr:{},out:'',status(c){this.code=c;return this},setHeader(k,v){this.hdr[k.toLowerCase()]=v},getHeader(k){return this.hdr[k.toLowerCase()]},end(s){this.out=String(s||'');this.done=true}};Object.defineProperty(res,'statusCode',{get(){return this.code},set(v){this.code=v}});return[req,res]};
let pass=0,fail=0;const ok=(c,m)=>{console.log((c?'PASS':'FAIL')+' | '+m);c?pass++:fail++};
(async()=>{
  const logs=[];const ce=console.error;console.error=(...a)=>logs.push(a.join(' '));
  const log=require(path+'log.js');let [q,r]=mk('POST','/api/log',{app:'kinan',msg:'boom\nline2',stack:'at x',build:'abc'});await log(q,r);console.error=ce;
  const e=logs[0]&&JSON.parse(logs[0]);ok(r.code===200&&e&&e.kind==='client-error'&&e.msg==='boom ⏎ line2'&&e.build==='abc','client error report lands in the server log as one JSON line '+(logs[0]||'').slice(0,90));
  [q,r]=mk('POST','/api/log','x'.repeat(9000));await log(q,r);ok(r.code===400,'an oversized report is refused ('+r.code+')');
  [q,r]=mk('GET','/api/log');await log(q,r);ok(r.code===405,'GET on the report endpoint is refused');
  process.env.ANTHROPIC_API_KEY='k';process.env.VERCEL_GIT_COMMIT_SHA='abcdef1234';
  const health=require(path+'health.js');[q,r]=mk('GET','/api/health');await health(q,r);const h=JSON.parse(r.out);
  ok(r.code===200&&h.ok&&h.commit==='abcdef1'&&h.services.claude===true&&h.services.openai===false&&!/"k"/.test(r.out),'health check: services and commit, never a secret '+r.out.slice(0,120));
  const llm=require(path+'llm.js');const realFetch=global.fetch;let calls=0;global.fetch=async(u,o)=>{calls++;return{status:200,text:async()=>'{"ok":1}'}};
  [q,r]=mk('POST','/api/llm',{provider:'anthropic',payload:{model:'claude-haiku-4-5',messages:[{role:'user',content:'x'}]}});await llm(q,r);ok(r.code===400&&/not allowed/.test(r.out)&&calls===0,'a Haiku model is refused before any call');
  [q,r]=mk('POST','/api/llm',{provider:'anthropic',payload:{model:'some-other-model',messages:[]}});await llm(q,r);ok(r.code===400&&calls===0,'an unknown model is refused');
  [q,r]=mk('POST','/api/llm',{provider:'anthropic',payload:{model:'claude-opus-5-5',messages:[{role:'user',content:'x'}]}});await llm(q,r);ok(r.code===200&&calls===1,'a current Claude model goes through');
  let last=0;for(let i=0;i<410;i++){[q,r]=mk('POST','/api/llm',{provider:'anthropic',payload:{model:'claude-opus-5-5',messages:[{role:'user',content:'x'}]}},{ip:7});await llm(q,r);last=r.code}ok(last===429&&/rate limit/.test(r.out),'more than 400 requests in 10 minutes from one caller: 429 with a clear message');
  [q,r]=mk('POST','/api/llm',{provider:'anthropic',payload:{model:'claude-opus-5-5',messages:[{role:'user',content:'x'}]}},{ip:8});await llm(q,r);ok(r.code===200,'another caller is not affected');
  global.fetch=async()=>{const e=new Error('t');e.name='TimeoutError';throw e};[q,r]=mk('POST','/api/llm',{provider:'anthropic',payload:{model:'claude-opus-5-5',messages:[{role:'user',content:'x'}]}},{ip:9});await llm(q,r);ok(r.code===504&&/in time/.test(r.out),'provider time-out: 504 with a clear message');
  global.fetch=realFetch;console.log(pass+' pass, '+fail+' fail');process.exit(0)})();
