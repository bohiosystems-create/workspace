import {chromium} from 'playwright';
const sp=new URL('./fixtures/',import.meta.url).pathname;
const b=await chromium.launch({executablePath:process.env.PW_CHROMIUM||undefined});const p=await b.newPage({viewport:{width:1600,height:900}});const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.goto('http://localhost:4090/?mode=readonly');await p.waitForTimeout(2500);
let pass=0,fail=0;const ok=(c,m)=>{c?pass++:fail++;console.log(c?'PASS':'FAIL',m)};
const series=['ic_summary','tornado_top','cashflow_annual','cost_breakdown','stress_table','kpis','capital_stack','facility'];
await p.evaluate(ss=>{toggleDock(true);for(const k of ss){try{const s=kSeriesSlide(k);if(s)addMsg('agent',chartCard(s,{source:'model data'}))}catch(e){}}},series);await p.waitForTimeout(1500);
const r=await p.evaluate(()=>[...document.querySelectorAll('#msgs .kchart')].map(c=>{const h=c.querySelector('.kd-h2'),hr=h&&h.getBoundingClientRect(),words=h?[...h.querySelectorAll('.kd-mask')].map(m=>m.getBoundingClientRect().height):[];const tracks=[...c.querySelectorAll('.kd-htrack')].map(t=>Math.round(t.getBoundingClientRect().width));const over=c.scrollWidth>c.clientWidth+2;
  return{title:h&&h.textContent.trim().slice(0,40),titleH:hr&&Math.round(hr.height),maxWordH:Math.max(0,...words),tracks,over}}));
for(const c of r){ok(c.titleH<=60&&c.maxWordH<=30,`title “${c.title}” on ≤3 lines, no broken words (h ${c.titleH})`);if(c.tracks.length)ok(Math.min(...c.tracks)>=60,`bars have width (${c.tracks.join(',')})`);ok(!c.over,`no horizontal overflow (${c.title})`)}
const btn=await p.evaluate(()=>getComputedStyle($('#chatFull')).color);ok(/255, 255, 255/.test(btn),'full-screen button visible on the dark header: '+btn);
await p.locator('#msgs .kchart').nth(1).screenshot({path:sp+'dock_tornado_fixed.png'});await p.locator('#msgs .kchart').nth(0).screenshot({path:sp+'dock_bridge_fixed.png'});
await p.click('#chatFull');await p.waitForTimeout(400);ok(await p.evaluate(()=>$('#kdock').classList.contains('full')&&$('#kdock').getBoundingClientRect().width>=1500),'full-screen opens');
await p.screenshot({path:sp+'dock_full_fixed.png'});
await p.click('#chatFull');await p.waitForTimeout(300);ok(await p.evaluate(()=>!$('#kdock').classList.contains('full')),'and closes again');
console.log('errors',errs);console.log(`${pass} pass, ${fail} fail`);await b.close();
