// The page reports its own errors to /api/log (once per message, at most 8 a visit) and Settings shows the build id
import {chromium} from 'playwright';import fs from 'fs';
const sp=new globalThis.URL('./fixtures/',import.meta.url).pathname;
const b=await chromium.launch({executablePath:process.env.PW_CHROMIUM||undefined});const p=await b.newPage({viewport:{width:1440,height:900}});
await p.route('https://cdnjs.cloudflare.com/**',r=>r.fulfill({status:200,contentType:'application/javascript',body:fs.readFileSync(sp+'package/dist/xlsx.full.min.js')}));
const got=[];await p.route('**/api/log',r=>{got.push(JSON.parse(r.request().postData()||'{}'));r.fulfill({status:200,contentType:'application/json',body:'{"ok":true}'})});
await p.goto(process.argv[2]||'http://localhost:4090/dist/option2-readonly/index.html');await p.evaluate(()=>localStorage.clear());await p.reload();await p.waitForTimeout(1200);
const ok=[];const t=(c,m)=>ok.push((c?'PASS':'FAIL')+' | '+m);
await p.evaluate(()=>{for(let i=0;i<3;i++)setTimeout(()=>{throw new Error('probe failure A')},0);setTimeout(()=>{throw new Error('probe failure B')},0);Promise.reject(new Error('probe rejection'))});await p.waitForTimeout(1500);
const msgs=got.map(g=>g.msg);t(msgs.filter(m=>/probe failure A/.test(m)).length===1&&msgs.some(m=>/probe failure B/.test(m))&&msgs.some(m=>/probe rejection/.test(m)),'errors reach /api/log once per message: '+JSON.stringify(msgs));
t(got.length&&got.every(g=>g.build&&g.mode&&g.app==='kinan-estatemaster'),'each report carries the app, mode and build: '+JSON.stringify(got[0]||{}).slice(0,120));
await p.evaluate(()=>{for(let i=0;i<20;i++)setTimeout(()=>{throw new Error('flood '+i)},0)});await p.waitForTimeout(1200);t(got.length<=8,'at most 8 reports a visit ('+got.length+')');
const bs=await p.evaluate(()=>{openSettings('ai');return $('#setBuild').textContent});t(/^Build ([0-9a-f]{8}|dev) · /.test(bs),'Settings shows the build: '+bs);
console.log(ok.join('\n'));await b.close();
