import {chromium} from 'playwright';
const base=process.argv[2]||'http://localhost:4090/?mode=readonly';
const b=await chromium.launch({executablePath:process.env.PW_CHROMIUM||undefined});const p=await b.newPage({viewport:{width:1500,height:950}});const errs=[];p.on('pageerror',e=>errs.push(e.message));
const ok=(c,n)=>console.log((c?'PASS ':'FAIL ')+n);let voice=0;
const wav=(()=>{const sr=8000,n=sr*12,buf=Buffer.alloc(44+n);buf.write('RIFF',0);buf.writeUInt32LE(36+n,4);buf.write('WAVEfmt ',8);buf.writeUInt32LE(16,16);buf.writeUInt16LE(1,20);buf.writeUInt16LE(1,22);buf.writeUInt32LE(sr,24);buf.writeUInt32LE(sr,28);buf.writeUInt16LE(1,32);buf.writeUInt16LE(8,34);buf.write('data',36);buf.writeUInt32LE(n,40);buf.fill(128,44);return buf})();
await p.route('**/api/voice*',r=>{if(r.request().method()==='GET')return r.fulfill({status:200,contentType:'application/json',body:'{"enabled":true,"model":"eleven_v3","voice":"v1"}'});voice++;return r.fulfill({status:200,contentType:'audio/wav',body:wav})});
await p.route('**/api/llm',async r=>{if(r.request().method()==='GET')return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({providers:{anthropic:true,openai:true}})});
  const j=JSON.parse(r.request().postData());const P=j.payload,sys=P.system||'';
  if(P.tools&&P.tools[0]&&/narration/.test(P.tools[0].name||'')){await new Promise(x=>setTimeout(x,1500));const n=(sys.match(/(\d+) slides/)||[])[1]||12;const slides=Array.from({length:+n},(_,i)=>({i,say:'Slide number '+(i+1)+' shows the key figures of the project in a clear and short way, with the change since the last export first.'}));return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({content:[{type:'tool_use',id:'t1',name:P.tools[0].name,input:{slides}}]})})}
  return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(j.provider==='openai'?{choices:[{message:{content:'ok'}}]}:{content:[{type:'text',text:'ok'}]})})});
await p.goto(base);await p.evaluate(()=>{localStorage.clear();localStorage.setItem('bohioVoiceLang','en')});await p.reload();await p.waitForTimeout(1200);
// press ▶ straight away: the built-in script speaks first, the AI script arrives 1.5 s later and the slide restarts with it
await p.evaluate(()=>{showTab('report');RSEL='ic';renderReportList();renderReport()});await p.waitForTimeout(300);await p.click('#rplay');
const t0=Date.now();const samples=[];
for(let k=0;k<11;k++){await p.waitForTimeout(1000);samples.push(await p.evaluate(()=>({i:KP?KP.i:-1,playing:[...KALL].filter(a=>!a.paused&&!a.ended).length,t:KAUDIO?+KAUDIO.currentTime.toFixed(1):null})))}
const early=samples.slice(0,10).find(s=>s.i>0);
ok(!early,'the slide does not turn while its clip is still playing (12 s clip, checked for 10 s): '+JSON.stringify(samples.map(s=>s.i)));
ok(samples.every(s=>s.playing<=1),'never two clips at once: '+JSON.stringify(samples.map(s=>s.playing)));
ok(samples.slice(3).every(s=>s.playing===1),'one clip keeps playing through the slide (the restart with the AI script did not silence it)');
await p.waitForTimeout(6000);
ok(await p.evaluate(()=>KP&&KP.i>=1),'the slide turns once the clip has ended');
console.log('voice calls',voice,'errs',errs);await p.evaluate(()=>closeDeck());await b.close();
