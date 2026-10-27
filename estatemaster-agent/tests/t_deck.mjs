import {chromium} from 'playwright';
import fs from 'fs';
const sp=new globalThis.URL('./fixtures/',import.meta.url).pathname;
const base=process.argv[2]||'http://localhost:4090/?mode=full',tag=process.argv[3]||'full';
const b=await chromium.launch({executablePath:process.env.PW_CHROMIUM||undefined});const ctx=await b.newContext({viewport:{width:1440,height:1000},acceptDownloads:true});const p=await ctx.newPage();
const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.route('https://cdnjs.cloudflare.com/**',r=>{const u=r.request().url();r.fulfill({status:200,contentType:'application/javascript',body:fs.readFileSync(/pptxgen/.test(u)?sp+'pptx/package/dist/pptxgen.bundle.js':sp+'package/dist/xlsx.full.min.js')})});
await p.route('https://fonts.googleapis.com/**',r=>r.fulfill({status:200,contentType:'text/css',body:''}));
const ev=(f,a)=>p.evaluate(f,a);const R=[];const ck=(n,ok,d)=>R.push([ok?'PASS':'FAIL',n,String(d??'').slice(0,220)]);
await p.goto(base);await ev(()=>localStorage.clear());await p.reload();await p.waitForTimeout(900);await p.evaluate(()=>toggleDock(true));
await p.evaluate(()=>showTab('report'));await p.waitForTimeout(600);
const doc=await ev(()=>({cover:!!document.querySelector('#report .k-cover'),logo:!!document.querySelector('#report .k-head svg'),svg:document.querySelectorAll('#report .k-chart svg').length,secs:document.querySelectorAll('#report .k-sec').length,close:!!document.querySelector('#report .k-close'),h1:document.querySelector('#report h1').textContent,stats:document.querySelectorAll('#report .k-stat').length}));
ck('report document: cover, logo, charts, closing',doc.cover&&doc.logo&&doc.svg>=3&&doc.secs>=5&&doc.close&&doc.stats===4,JSON.stringify(doc));
await p.screenshot({path:`${sp}rep_${tag}_doc.png`});await ev(()=>window.scrollTo(0,700));await p.waitForTimeout(400);await p.screenshot({path:`${sp}rep_${tag}_doc2.png`});await ev(()=>window.scrollTo(0,0));
// every report renders as the document and builds a deck
const all=await ev(()=>Object.keys(RPTS).map(k=>{const h=RPTS[k].fn(),d=buildDeck(k);return[k,/k-cover/.test(h),d.slides.length,d.slides.map(s=>s.kind).join(',')]}));
ck('every report: document + deck',all.every(x=>x[1]&&x[2]>=5),all.map(x=>`${x[0]}:${x[2]}`).join(' '));
// ▶ Play
await p.click('#rplay');await p.waitForTimeout(1500);
let st=await ev(()=>({root:!!KP,segs:document.querySelectorAll('.kd-seg').length,n:KP&&KP.deck.slides.length,cls:document.querySelector('.kd-root').className,title:document.querySelector('.kd-cover-title')&&document.querySelector('.kd-cover-title').getAttribute('aria-label'),cc:kSegText(KP.segs)}));
ck('play opens on the orange cover',st.root&&st.segs===st.n&&/kd-on-orange/.test(st.cls)&&st.title===(await ev(()=>PROJ.name))&&st.cc.length>5,JSON.stringify(st));
await p.screenshot({path:`${sp}play_${tag}_1.png`});
await p.keyboard.press('ArrowRight');await p.waitForTimeout(2200);await p.screenshot({path:`${sp}play_${tag}_2.png`});
st=await ev(()=>({i:KP.i,foot:document.querySelector('.kd-footline b').textContent,counts:[...document.querySelectorAll('.kd-enter [data-count]')].map(e=>e.textContent),ring:document.querySelectorAll('.kd-enter .kd-ring').length}));
ck('headline slide: counted-up stats, rings',st.i===1&&st.foot==='2'&&st.counts.length===4&&st.counts.every(t=>/\d/.test(t))&&st.ring>=2,JSON.stringify(st));
const kinds=await ev(()=>KP.deck.slides.map(s=>s.kind));
const want=['divider','gauges','donut','hbars','list','columns','line','table','closing'];const shots={};
for(const k of want){const i=kinds.indexOf(k);if(i<0)continue;await ev(i=>kGo(i),i);await p.waitForTimeout(k==='closing'?4300:2300);await p.screenshot({path:`${sp}play_${tag}_${k}.png`});
  shots[k]=await ev(()=>({band:!!document.querySelector('.kd-fb-band'),svg:document.querySelectorAll('.kd-enter svg').length,txt:document.querySelector('.kd-enter').textContent.replace(/\s+/g,' ').trim().slice(0,80),bg:document.querySelector('.kd-root').className}))}
ck('divider is charcoal with chevron band',shots.divider&&/kd-on-dark/.test(shots.divider.bg)&&shots.divider.band,JSON.stringify(shots.divider));
ck('gauges / donut / bars / line / columns drawn',['gauges','donut','hbars','line','columns'].filter(k=>kinds.includes(k)).every(k=>shots[k].svg>=1||k==='hbars'),JSON.stringify(Object.fromEntries(Object.entries(shots).map(([k,v])=>[k,v.svg]))));
ck('closing page is charcoal with the logo',shots.closing&&/kd-on-dark/.test(shots.closing.bg)&&(await ev(()=>document.querySelectorAll('.kd-enter svg').length>=1)),JSON.stringify(shots.closing));
// tooltip on a chart mark
const ci=kinds.indexOf('columns');if(ci>=0){await ev(i=>kGo(i),ci);await p.waitForTimeout(2400);const g=await p.$('.kd-enter [data-tip]');if(g){await g.hover();await p.waitForTimeout(200);ck('hover tooltip',await ev(()=>!!document.querySelector('.kd-tip')&&/\d/.test(document.querySelector('.kd-tip').textContent)),await ev(()=>(document.querySelector('.kd-tip')||{}).textContent))}}
// timeline click, pause, captions, keyboard
await p.click('.kd-seg[data-go="2"]');await p.waitForTimeout(600);ck('timeline click',(await ev(()=>KP.i))===2,'');
await p.keyboard.press(' ');ck('space pauses',(await ev(()=>!KP.playing&&document.querySelector('[data-act=pause]').dataset.st))==='play','');
await p.keyboard.press('c');ck('captions toggle (on by default; C hides them)',(await ev(()=>document.querySelector('.kd-cc').style.visibility))==='hidden','');await p.keyboard.press('c');
// PowerPoint from the player
const [dl]=await Promise.all([p.waitForEvent('download',{timeout:240000}),p.click('[data-act=pptx]')]);const f=sp+'dl_'+tag+'_'+dl.suggestedFilename();await dl.saveAs(f);
ck('PowerPoint download (every slide as shown)',/\.pptx$/.test(dl.suggestedFilename())&&fs.statSync(f).size>20000,`${dl.suggestedFilename()} ${Math.round(fs.statSync(f).size/1024)} KB`);
await p.keyboard.press('Escape');await p.waitForTimeout(300);ck('escape closes',!(await ev(()=>!!KP||!!document.querySelector('.kd-root'))),'');
// ▶ on a report row
await p.evaluate(()=>openRpWin('rtModal'));await p.click('[data-play="monthly"]');await p.waitForTimeout(1200);ck('row ▶ plays that report',(await ev(()=>KP&&KP.deck.title)).startsWith('Monthly project report'),await ev(()=>KP&&KP.deck.title));await p.keyboard.press('Escape');await p.waitForTimeout(200);
// HTML download is the KINAN document
const [d2]=await Promise.all([p.waitForEvent('download'),p.click('#rhtml')]);const f2=sp+'dl_'+tag+'_'+d2.suggestedFilename();await d2.saveAs(f2);const html=fs.readFileSync(f2,'utf8');
ck('HTML download: standalone KINAN document',/k-cover/.test(html)&&/<svg/.test(html)&&/--ktex:url\(data:image/.test(html)&&/k-close/.test(html),`${Math.round(html.length/1024)} KB`);
// custom report through the builder gets the document and a deck too
const cust=await ev(()=>{const id=createReport({name:'Treasury view',aud:'Finance',blocks:['cashflow_annual','facility','capital_stack']},'test');RSEL=id;renderReportList();renderReport();const d=buildDeck(id);return{h:/k-cover/.test($('#report').innerHTML),n:d.slides.length,k:d.slides.map(s=>s.kind).join(',')}});
ck('custom report: document + deck',cust.h&&cust.n>=6&&/columns/.test(cust.k)&&/line/.test(cust.k)&&/donut/.test(cust.k),JSON.stringify(cust));
// chat
await p.evaluate(()=>showTab('report'));await p.fill('#ask','build the IC report');await p.click('#send');await p.waitForTimeout(2500);
ck('chat: IC pack points at ▶ Play',/▶ Play/.test(await p.textContent('#msgs .msg.agent:last-child .body')),'');
const stt=await ev(()=>selfTest().filter(r=>!r.info).map(r=>[r.ok,r.name,r.detail]));ck('selfTest',stt.every(r=>r[0])&&stt.length===24,JSON.stringify(stt.filter(r=>!r[0])));
ck('no page errors',!errs.length,errs.join(' | '));
for(const r of R)console.log(r.join('  '));await b.close();
