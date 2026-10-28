// A printed report (Download PDF) holds every figure at its final value: the report counts its figures up from 0 when it is drawn, and
// the button draws it and prints at once, so a PDF used to catch the tiles at 0.0% or on their way up. A figure counting up keeps its
// sign (a negative NPV ended its count as a positive one). A workbook's cover title in capitals becomes a readable project name.
import {chromium} from 'playwright';
const base=process.argv[2]||'http://localhost:4090/?mode=readonly';
let pass=0,fail=0;const ok=(c,m,d)=>{if(c){pass++;console.log('PASS | '+m)}else{fail++;console.log('FAIL | '+m+(d!==undefined?' → '+JSON.stringify(d).slice(0,400):''))}};
const b=await chromium.launch({executablePath:process.env.PW_CHROMIUM||undefined});const p=await b.newPage({viewport:{width:1440,height:900}});const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.route(/cdn\.jsdelivr\.net|unpkg\.com|cdnjs\.cloudflare\.com/,r=>r.abort());await p.route('**/api/**',r=>r.fulfill({status:404,body:''}));
await p.goto(base);await p.evaluate(()=>localStorage.clear());await p.reload();await p.waitForTimeout(1500);
await p.evaluate(()=>{showTab('report');window.print=()=>{const r=document.querySelector('.report');window.__printed=[...r.querySelectorAll('[data-count]')].map(e=>({t:e.textContent,v:+e.dataset.count,d:+e.dataset.dec||0}))}});
await p.click('#rprint');await p.waitForTimeout(200);
const pr=await p.evaluate(()=>window.__printed||[]);
const fmt=(v,d)=>(v<0?'−':'')+Math.abs(v).toLocaleString('en-GB',{minimumFractionDigits:d,maximumFractionDigits:d});
ok(pr.length>3&&pr.every(z=>z.t.includes(fmt(z.v,z.d))),'the PDF prints every counted figure at its final value',pr.filter(z=>!z.t.includes(fmt(z.v,z.d))).slice(0,4));
// a figure counting down to a negative value ends with its minus sign
const neg=await p.evaluate(async()=>{const d=document.createElement('div');d.innerHTML=kCount(-265.29,2,'SAR ','M');document.body.appendChild(d);kAnimate(d);await new Promise(r=>setTimeout(r,1900));const t=d.textContent;d.remove();return t});
ok(neg==='SAR −265.29M','a negative figure keeps its sign once it has counted',neg);
// a cover title in capitals as the project's name
const nm=await p.evaluate(()=>[npNice('AL NAKHEEL GATE – MIXED-USE DEVELOPMENT, RIYADH (SAR)'),npNice('Waha Hotel Model'),npNice('TOWER OF THE SUN')]);
ok(nm[0]==='Al Nakheel Gate – Mixed-Use Development, Riyadh'&&nm[1]==='Waha Hotel Model'&&nm[2]==='Tower of the Sun','a title in capitals becomes a readable name; a title with small letters is kept',nm);
ok(!errs.length,'no page errors',errs.slice(0,3));
console.log(`${pass} pass, ${fail} fail`);await b.close();process.exit(fail?1:0);
