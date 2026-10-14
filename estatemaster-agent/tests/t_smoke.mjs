// Customer-readiness sweep: every page of a build at three widths; errors, leaked raw values, overflow, empty panels.
import {chromium} from 'playwright';import fs from 'fs';
const sp=new URL('./fixtures/',import.meta.url).pathname;const URL=process.argv[2]||'http://localhost:4090/?mode=readonly',tag=process.argv[3]||'ro';
const b=await chromium.launch({executablePath:process.env.PW_CHROMIUM||undefined});const issues=[];
for(const [w,h] of [[1440,900],[1100,800],[390,844]]){const p=await b.newPage({viewport:{width:w,height:h}});const errs=[],cons=[];p.on('pageerror',e=>errs.push(e.message));p.on('console',m=>{if(m.type()==='error'&&!/favicon|net::ERR|Failed to load resource|ERR_CONNECTION/.test(m.text()))cons.push(m.text().slice(0,160))});
  await p.route('https://cdnjs.cloudflare.com/**',r=>r.fulfill({status:200,contentType:'application/javascript',body:fs.readFileSync(sp+'package/dist/xlsx.full.min.js')}));await p.route('https://fonts.googleapis.com/**',r=>r.fulfill({status:200,contentType:'text/css',body:''}));
  await p.goto(URL);await p.evaluate(()=>localStorage.clear());await p.reload();await p.waitForTimeout(1800);
  const tabs=await p.evaluate(()=>[...GTABS,...MTABS].map(t=>t[0]));
  for(const t of tabs){await p.evaluate(t=>{try{showTab(t)}catch(e){}},t);await p.waitForTimeout(700);
    const r=await p.evaluate(()=>{const pane=[...document.querySelectorAll('.pane.on')][0]||document.body,vis=e=>{const s=getComputedStyle(e);return s.display!=='none'&&s.visibility!=='hidden'&&e.offsetParent!==null};
      const txt=pane.innerText||'';const raw=(txt.match(/\b(undefined|NaN|\[object Object\]|Infinity|null%|NaN%)\b/g)||[]);
      const over=[...pane.querySelectorAll('.card,.sf-model,.feed-item,table,.kchart')].filter(vis).filter(e=>e.scrollWidth>e.clientWidth+4&&getComputedStyle(e).overflowX!=='auto'&&getComputedStyle(e).overflowX!=='scroll'&&!e.closest('[style*="overflow-x:auto"],[style*="overflow:auto"],.ma-full,.xl-pg')).map(e=>(e.id||e.className||e.tagName).toString().slice(0,40)+':'+e.scrollWidth+'>'+e.clientWidth).slice(0,4);
      const pageX=document.documentElement.scrollWidth>window.innerWidth+2;const empty=[...pane.querySelectorAll('.card')].filter(vis).filter(c=>!c.closest('.rp-win:not(.on),.modal:not(.on),details:not([open])')).filter(c=>(c.innerText||'').trim().length<8).map(c=>c.id||c.className).slice(0,3);
      const clipped=[...pane.querySelectorAll('h2,h3,.btn,button,.pill,.tag,td,th')].filter(vis).filter(e=>e.scrollWidth>e.clientWidth+6&&getComputedStyle(e).overflow==='hidden'&&getComputedStyle(e).textOverflow!=='ellipsis').map(e=>(e.textContent||'').trim().slice(0,30)).slice(0,4);
      return{raw:[...new Set(raw)],over,pageX,empty,clipped,len:txt.length}});
    const where=`${tag} ${w}px ${t}`;if(r.raw.length)issues.push(`${where}: raw values on screen: ${r.raw.join(', ')}`);if(r.over.length)issues.push(`${where}: content wider than its box: ${r.over.join(' · ')}`);if(r.pageX)issues.push(`${where}: the page scrolls sideways`);if(r.empty.length)issues.push(`${where}: empty card: ${r.empty.join(', ')}`);if(r.clipped.length)issues.push(`${where}: text cut off: ${r.clipped.join(' · ')}`);if(r.len<80)issues.push(`${where}: page nearly empty (${r.len} chars)`)}
  if(errs.length)issues.push(`${tag} ${w}px: page errors: ${[...new Set(errs)].join(' | ').slice(0,300)}`);if(cons.length)issues.push(`${tag} ${w}px: console errors: ${[...new Set(cons)].slice(0,4).join(' | ')}`);await p.close()}
console.log(issues.length?issues.join('\n'):'NO ISSUES');console.log(`t_smoke ${tag}: ${issues.length} issue(s)`);await b.close();
