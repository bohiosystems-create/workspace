import {chromium} from 'playwright';
const b=await chromium.launch({executablePath:process.env.PW_CHROMIUM||undefined});const p=await b.newPage({viewport:{width:1400,height:900}});const errs=[];p.on('pageerror',e=>errs.push(e.message));
for(const u of [process.argv[2]||'http://localhost:4090/?mode=readonly','http://localhost:4091/']){await p.goto(u);await p.evaluate(()=>localStorage.clear());await p.reload();await p.waitForTimeout(1500);
const r=await p.evaluate(()=>({on:[...document.querySelectorAll('.pane.on')].map(x=>x.id),title:(document.querySelector('#kTitle span')||{}).textContent,rows:document.querySelectorAll('#apList .feed-item').length}));
console.log((r.on.length===1&&r.on[0]==='p-appr'&&r.rows>0?'PASS':'FAIL')+' lands on the Daily feed '+u+' '+JSON.stringify(r))}
console.log('errs',errs);await b.close();
