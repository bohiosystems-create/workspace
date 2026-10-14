// Every serverless handler answers a bare request with JSON and a sane status, with no keys configured and with junk bodies
const path=__dirname+'/../api/';for(const k of Object.keys(process.env))if(/KEY|SECRET|PASSWORD|URL|TOKEN/.test(k))delete process.env[k];
const mk=(method,url,body,headers={})=>{const req={method,url,headers:{host:'x.test','content-type':'application/json',...headers},body,on(ev,fn){if(ev==='data'&&body!=null)fn(Buffer.from(typeof body==='string'?body:JSON.stringify(body)));if(ev==='end')fn()}};
  const res={code:200,hdr:{},out:'',status(c){this.code=c;return this},setHeader(k,v){this.hdr[k.toLowerCase()]=v;return this},getHeader(k){return this.hdr[k.toLowerCase()]},end(s){this.out=String(s||'');this.done=true},json(o){this.setHeader('content-type','application/json');this.end(JSON.stringify(o))},send(s){this.end(s)},write(s){this.out+=String(s)},writeHead(c,h){this.code=c;Object.assign(this.hdr,h||{})}};return[req,res]};
let pass=0,fail=0;const ok=(c,m)=>{console.log((c?'PASS':'FAIL')+' | '+m);c?pass++:fail++};
(async()=>{
  for(const [f,cases] of Object.entries({
    'llm.js':[['GET','/api/llm'],['POST','/api/llm',{provider:'anthropic',payload:{}}],['POST','/api/llm','{not json']],
    'voice.js':[['GET','/api/voice'],['GET','/api/voice?list=1'],['POST','/api/voice',{text:'hi'}]],
    'mail.js':[['GET','/api/mail'],['POST','/api/mail',{to:'x'}]],
    'scan.js':[['GET','/api/scan'],['POST','/api/scan',{}]],
    'schedule.js':[['GET','/api/schedule'],['POST','/api/schedule',{action:'nonsense'}],['POST','/api/schedule','{bad']],
    'cron.js':[['GET','/api/cron'],['GET','/api/cron?list=1'],['POST','/api/cron',{action:'models'}]],
    'runner.js':[['GET','/api/runner'],['POST','/api/runner',{}]]})){
    let h;try{h=require(path+f)}catch(e){ok(false,f+' loads: '+e.message);continue}
    for(const [m,u,b] of cases){const [req,res]=mk(m,u,b);let threw=null;const t0=Date.now();try{await Promise.race([h(req,res),new Promise(r=>setTimeout(()=>r('timeout'),8000))])}catch(e){threw=e}
      const ct=String(res.getHeader('content-type')||'');let j=null;try{j=JSON.parse(res.out)}catch(e){}
      const good=!threw&&res.done&&res.code<500&&(j!==null||/text\/html|audio|text\/plain/.test(ct)||res.code===204||res.code===401||res.code===403||res.code===404||res.code===405);
      ok(good,`${f} ${m} ${u}${b!==undefined?' body':''} → ${threw?'THREW '+String(threw.message||threw).slice(0,80):res.code+' '+(ct.split(';')[0]||'no type')+' '+(res.out||'').slice(0,70).replace(/\s+/g,' ')} (${Date.now()-t0}ms)`)}}
  console.log(pass+' pass, '+fail+' fail');process.exit(0)})();
