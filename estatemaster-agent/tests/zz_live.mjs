import {chromium} from 'playwright';
const F=process.argv[2];
const b=await chromium.launch(),p=await (await b.newContext({viewport:{width:1500,height:1000}})).newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.route(/cdn\.jsdelivr\.net|unpkg\.com|cdnjs\.cloudflare\.com|fonts\.g/,r=>r.abort());
await p.route('**/api/**',r=>r.fulfill({status:404,body:''}));
await p.goto('http://localhost:4101/');await p.evaluate(()=>localStorage.clear());await p.reload();await p.waitForTimeout(1500);
await p.evaluate(()=>openNewProject());await p.setInputFiles('#npFile',F);await p.waitForSelector('#npCreate:not([disabled])',{timeout:120000}).catch(()=>{});await p.click('#npCreate');await p.waitForTimeout(2500);
await p.evaluate(async()=>{const x=latestExport();await xcEngine(x);await xcCacheMore(x)});
const run=(q,tool,args)=>p.evaluate(async([q,tool,args])=>{window.LASTQ=q;window.ASKED=q;addMsg('user',q);try{const it=tool==='estimate'?{k:'estimate',text:args}:toolIntent0(tool,args);const o=await handle(q,'web','Investment Director',it);return String((o&&o.plain)||'')}catch(e){return 'THROW '+e.message}},[q,tool,args]);
const push=async()=>{const id=await p.evaluate(()=>{const L=Object.values(MVERS).flat().filter(v=>(v.sets||[]).length);return L.length?L[L.length-1].id:null});console.log('push id',id);if(!id)return'NO BUTTON';await p.evaluate(id=>mvPush(id),id);await p.waitForTimeout(6000);return p.evaluate(()=>{const m=[...document.querySelectorAll('.msg')].pop();return m?m.innerText:''})};
const steps=JSON.parse(process.argv[3]);
for(const s of steps){if(s.upload){const n0=await p.evaluate(()=>EXPORTS.length);await p.setInputFiles('#exFile',s.upload);for(let i=0;i<240;i++){await p.waitForTimeout(500);if(await p.evaluate(n=>EXPORTS.length>n&&!!latestExport().cells,n0))break}await p.waitForTimeout(3000);await p.evaluate(async()=>{const x=latestExport();await xcEngine(x);await xcCacheMore(x)});console.log('\n### UPLOADED',await p.evaluate(()=>latestExport().id+' '+latestExport().file));continue}
  if(s.push){console.log('\n### PUSH\n'+(await push()).slice(0,900));continue}
  const a=await run(s.q,s.tool,s.args);console.log('\n### '+s.q+'\n'+a.slice(0,s.n||1500))}
console.log('\nexports',await p.evaluate(()=>EXPORTS.filter(e=>e.src==='file').map(e=>e.id+' '+e.file+' '+(e.out||{}).levered_irr)));
console.log('errors',errs.slice(0,3));await b.close();
