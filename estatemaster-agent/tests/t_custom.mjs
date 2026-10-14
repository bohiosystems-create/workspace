import {chromium} from 'playwright';
const sp=new globalThis.URL('./fixtures/',import.meta.url).pathname;
const b=await chromium.launch({executablePath:process.env.PW_CHROMIUM||undefined});const p=await b.newPage({viewport:{width:1400,height:900}});const errs=[];p.on('pageerror',e=>errs.push(e.message));
for(const u of [process.argv[2]||'http://localhost:4090/?mode=readonly','http://localhost:4091/']){await p.goto(u);await p.waitForTimeout(1400);
await p.evaluate(()=>showTab('report'));await p.waitForTimeout(300);await p.click('#rpPlus');await p.waitForTimeout(400);
const first=await p.evaluate(()=>{const f=document.querySelector('#tplGrid').firstElementChild;return f&&f.id+'|'+f.textContent.slice(0,40)});
await p.locator('#tplModal .tpl-card').screenshot({path:sp+'tpl_custom.png'}).catch(()=>{});
await p.click('#tplCustom');await p.waitForTimeout(400);
const ok=await p.evaluate(()=>document.querySelector('#rbModal').classList.contains('on')&&!document.querySelector('#tplModal').classList.contains('on'));
const lbl=await p.evaluate(()=>$('#rbNew').textContent);
console.log((first.startsWith('tplCustom|+Build custom report')&&ok&&lbl==='+ Build custom report'?'PASS':'FAIL'),u,first,ok,lbl)}
console.log('errs',errs);await b.close();
