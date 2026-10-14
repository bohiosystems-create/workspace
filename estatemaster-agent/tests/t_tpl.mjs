import {chromium} from 'playwright';import fs from 'fs';
const sp=new globalThis.URL('./fixtures/',import.meta.url).pathname;
const b=await chromium.launch({executablePath:process.env.PW_CHROMIUM||undefined});const p=await b.newPage({viewport:{width:1300,height:900}});const errs=[];p.on('pageerror',e=>errs.push(e.stack.split('\n').slice(0,3).join(' | ')));
await p.route('https://cdnjs.cloudflare.com/**',r=>r.fulfill({status:200,contentType:'application/javascript',body:fs.readFileSync(sp+'package/dist/xlsx.full.min.js')}));
await p.goto('http://localhost:4090/?mode=readonly');await p.waitForTimeout(2500);
let pass=0,fail=0;const ok=(c,m)=>{c?pass++:fail++;console.log(c?'PASS':'FAIL',m)};
const d=await p.evaluate(()=>buildDeck('daily').slides.map(s=>s.kind+':'+String(s.kicker||s.title||'').slice(0,28)));console.log(d.join(' | '));
const ki=d.map(x=>x.split(':')[1]);const order=['To know today','All financial models','Headline figures','Most recent model','Checks on the exports','Stress tests','From the emails','Market'];
let last=-1,inOrder=true;for(const o of order){const i=ki.findIndex(k=>k.startsWith(o));if(i<0)continue;if(i<last)inOrder=false;last=i}
ok(inOrder&&ki.some(k=>k.startsWith('Stress tests'))&&!d.some(x=>x.startsWith('divider')),'daily deck follows the email order, no dividers');
ok(d[1].startsWith('list:To know today')||d[1].startsWith('hbars:All financial'),'deck opens with To know today / models, like the email');
await p.evaluate(()=>showTab('report'));await p.waitForTimeout(300);await p.click('#rpPlus');await p.waitForTimeout(1500);
const n=await p.locator('#tplGrid .tpl:not(.tpl-new)').count();ok(n>=8&&await p.locator('#tplGrid .tpl svg').count()===n,'gallery with '+n+' templates and previews');
await p.locator('#tplGrid .tpl').first().screenshot({path:sp+'tpl_card.png'});await p.locator('#tplModal .tpl-card').screenshot({path:sp+'tpl.png'});
await p.locator('#tplGrid [data-act="open"]').nth(1).click();await p.waitForTimeout(400);ok(await p.evaluate(()=>!document.querySelector('#tplModal').classList.contains('on')&&RSEL)!=null,'Open selects the template');
console.log('errors',errs);console.log(`${pass} pass, ${fail} fail`);await b.close();
