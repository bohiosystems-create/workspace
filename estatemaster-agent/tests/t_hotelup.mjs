// Uploading a third-party (non-EstateMaster) Excel model: the chat states what was read with its cells, the currency from the cells' own formats,
// says it is not an EstateMaster export, invents no figure; the Model debug shows no false error and, once done, only its results.
import {chromium} from 'playwright';import fs from 'fs';
const sp=new globalThis.URL('./fixtures/',import.meta.url).pathname;
const b=await chromium.launch({executablePath:process.env.PW_CHROMIUM||undefined});const p=await b.newPage({viewport:{width:1500,height:950}});const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.route('https://cdnjs.cloudflare.com/**',r=>r.fulfill({status:200,contentType:'application/javascript',body:fs.readFileSync(sp+'package/dist/xlsx.full.min.js')}));
await p.route('https://fonts.googleapis.com/**',r=>r.fulfill({status:200,contentType:'text/css',body:''}));
await p.goto(process.argv[2]||'http://localhost:4090/?mode=readonly');await p.evaluate(()=>localStorage.clear());await p.reload();await p.waitForTimeout(1500);
const ok=[];const t=(c,m)=>ok.push((c?'PASS':'FAIL')+' | '+m);const ev=f=>p.evaluate(f);
await ev(()=>openNewProject());await p.setInputFiles('#npFile',sp+'models/hotel_us.xlsx');await p.waitForTimeout(1200);await p.click('#npCreate');await p.waitForTimeout(2500);
const msg=await ev(()=>{const m=[...document.querySelectorAll('#msgs .msg')].map(e=>e.innerText).filter(s=>/is loaded from/.test(s)).pop();return m||''});
t(/Levered IRR 24\.05%/.test(msg)&&/Unlevered IRR 15\.78%/.test(msg),'chat gives the IRRs read from the Summary: '+msg.slice(0,220).replace(/\n/g,' '));
t(/USD/.test(msg)&&!/SAR/.test(msg),'currency USD, never SAR');t(/developer’s own Excel model/.test(msg)&&!/EstateMaster/.test(msg),'says it is the developer’s own Excel model, and never names EstateMaster on screen');t(!/Gross revenue/.test(msg),'no gross revenue invented from year 1');
t(/Orlando/.test(msg),'uses the location the workbook states');
await p.waitForFunction(()=>{const x=EXPORTS[EXPORTS.length-1];return x&&x.audit&&x.audit.status!=='running'},null,{timeout:20000}).catch(()=>{});
const dbg=await ev(()=>($('#dbgWBody')||{}).innerText||'');
t(!/3500000%|NaN|LIKELY ERROR|appears [0-9] times/.test(dbg),'debug: no false contingency %, no NaN, no false likely error: '+dbg.slice(0,600).replace(/\n/g,' | '));
t(!(await ev(()=>!!document.querySelector('#dbgWBody .steps'))),'debug done: the step log is gone, only results stay');
// the dock: its orange rule sits inside the rounded corners (no border-top tapering into the radius)
const dk=await ev(()=>{toggleDock(true);const d=$('#kdock'),cs=getComputedStyle(d),hd=getComputedStyle($('#kdock .chat-head')),cd=getComputedStyle($('#kdock .card'));return{bt:cs.borderTopWidth,bg:cs.backgroundColor,hb:hd.borderTopWidth,cr:cd.borderTopLeftRadius}});
t(dk.bt==='0px'&&dk.hb==='3px'&&dk.cr==='0px'&&dk.bg==='rgb(46, 46, 47)','chat dock: one curve at the corner (dark dock, square inner card, the orange rule on the header) '+JSON.stringify(dk));
// a model with no currency: the chat asks, and the answer sets it
await ev(()=>{const x=EXPORTS[EXPORTS.length-1];x.meta.currency='';PROJ.currency='';askAboutExport(PROJ,x)});const ask=await ev(()=>!!document.querySelector('#msgs [data-ccy="EUR"]'));t(ask,'no currency in the workbook: the chat asks which one');
await p.click('#msgs [data-ccy="EUR"] >> nth=-1');await p.waitForTimeout(300);t(await ev(()=>PROJ.currency==='EUR'&&EXPORTS[EXPORTS.length-1].meta.currency==='EUR'),'answer sets the project currency');
await p.screenshot({path:sp+'../hotelup.png'});
t(!errs.length,'no page errors '+errs.join(';'));console.log(ok.join('\n'));await b.close();
