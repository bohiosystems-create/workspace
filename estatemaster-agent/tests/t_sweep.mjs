import {chromium} from 'playwright';import fs from 'fs';
const sp=new URL('./fixtures/',import.meta.url).pathname;
const [URL,NAME,W]=[process.argv[2],process.argv[3],+(process.argv[4]||1400)];
const b=await chromium.launch({executablePath:process.env.PW_CHROMIUM||undefined});const p=await b.newPage({viewport:{width:W,height:900}});
const errs=[],cons=[];p.on('pageerror',e=>errs.push(e.message.slice(0,160)));p.on('console',m=>{if(m.type()==='error'&&!/Failed to load resource|net::|404|favicon|api\//.test(m.text()))cons.push(m.text().slice(0,160))});p.on('dialog',d=>d.dismiss());
await p.route('https://cdnjs.cloudflare.com/**',r=>r.fulfill({status:200,contentType:'application/javascript',body:fs.readFileSync(sp+'package/dist/xlsx.full.min.js')}));
await p.goto(URL);await p.waitForTimeout(3000);
const issues=[];const note=(where,what)=>issues.push(`${where}: ${what}`);
// layout probe: horizontal page overflow, and visible text boxes that overlap each other inside the active pane
const probe=async where=>{const r=await p.evaluate(()=>{const out={over:0,clash:[]};const pane=document.querySelector('.pane.on')||document.body;
    out.over=Math.max(0,document.documentElement.scrollWidth-innerWidth);
    const els=[...pane.querySelectorAll('h2,h3,.sub,.pill,.tag,.btn,b,.sb-val,.sb-d,.sb-poc,.cmp-val,.cmp-lab,.fi-kind,.fi-main,.fi-meta,.hm-c,.kpi .v,.kpi .l,td,th')].filter(e=>{const s=getComputedStyle(e);if(s.visibility==='hidden'||s.display==='none'||+s.opacity===0)return false;const r=e.getBoundingClientRect();if(!(r.width>2&&r.height>2&&r.bottom>0&&r.top<innerHeight*3))return false;let x=e.parentElement;while(x&&x!==document.body){const cs=getComputedStyle(x);if(/auto|scroll|hidden/.test(cs.overflowY+cs.overflowX)){const q=x.getBoundingClientRect();if(r.bottom<=q.top+1||r.top>=q.bottom-1||r.right<=q.left+1||r.left>=q.right-1)return false}x=x.parentElement}return true});
    const R=els.map(e=>[e,e.getBoundingClientRect()]);
    for(let i=0;i<R.length;i++)for(let j=i+1;j<R.length&&out.clash.length<6;j++){const [a,ra]=R[i],[c,rc]=R[j];if(a.contains(c)||c.contains(a))continue;const ox=Math.min(ra.right,rc.right)-Math.max(ra.left,rc.left),oy=Math.min(ra.bottom,rc.bottom)-Math.max(ra.top,rc.top);if(ox>6&&oy>6){const ta=(a.textContent||'').trim().slice(0,30),tc=(c.textContent||'').trim().slice(0,30);if(ta&&tc)out.clash.push(`“${ta}” × “${tc}”`)}}
    return out});if(r.over>2)note(where,`page wider than the window by ${r.over}px`);r.clash.forEach(c=>note(where,'overlap '+c))};
const tabs=await p.evaluate(()=>[...document.querySelectorAll('#tabs .tab')].map(t=>t.dataset.t));
for(const t of tabs){await p.evaluate(t=>showTab(t),t);await p.waitForTimeout(700);await probe('tab '+t)}
// financial modelling menu
if(tabs.includes('em')){await p.click('.tab[data-t="em"]');await p.waitForTimeout(200);for(const id of ['upload','checks','assumptions','compare']){if(!(await p.evaluate(()=>document.querySelector('#emMenu').classList.contains('on'))))await p.click('.tab[data-t="em"]');await p.waitForTimeout(200);await p.click(`#emMenu [data-emgo="${id}"]`);await p.waitForTimeout(500)}await probe('Financial modelling menu')}
// settings sections
for(const s of ['ai','outlook','voice','integrations','market','memory','arch']){await p.evaluate(s=>openSettings(s),s);await p.waitForTimeout(400);const bad=await p.evaluate(()=>Math.max(0,document.querySelector('#setModal .card').scrollWidth-document.querySelector('#setModal .card').clientWidth));if(bad>4)note('settings '+s,`content wider than the panel by ${bad}px`)}
await p.evaluate(()=>document.querySelector('#setClose').click());
// daily feed: open every row type
await p.evaluate(()=>showTab('appr'));await p.waitForTimeout(400);for(const sel of ['#apList .feed-item .fi-row','#stressFeed .fi-row','#tkCard .fi-row']){const n=await p.locator(sel).count();if(n)await p.locator(sel).first().click();await p.waitForTimeout(250)}await probe('daily feed (rows open)');
for(const f of ['decide','stress','tasks','decided','all']){if(!(await p.isVisible(`[data-ff="${f}"]`)))continue;/* read-only hides the analyst filters */await p.click(`[data-ff="${f}"]`);await p.waitForTimeout(120)}
// reports: every template, gallery, play every slide of two decks
await p.evaluate(()=>showTab('report'));await p.waitForTimeout(400);
const rp=await p.evaluate(()=>Object.keys(RPTS));for(const k of rp){await p.evaluate(k=>{RSEL=k;renderReportList();renderReport()},k);await p.waitForTimeout(250)}await probe('reports');
await p.click('#rpPlus');await p.waitForTimeout(1500);const gw=await p.evaluate(()=>{const c=document.querySelector('#tplModal .card');return c.scrollWidth-c.clientWidth});if(gw>4)note('template gallery',`wider than its panel by ${gw}px`);await p.click('#tplClose');
for(const k of ['daily','ic']){await p.evaluate(k=>{const d=buildDeck(k);d.noAI=true;openDeck(d);KP.playing=false},k);await p.waitForTimeout(600);const n=await p.evaluate(()=>KP.deck.slides.length);
  for(let i=0;i<n;i++){await p.evaluate(i=>kGo(i),i);await p.waitForTimeout(450);const r=await p.evaluate(()=>{const root=document.querySelector('.kd-root'),st=root.querySelector('.kd-stage').getBoundingClientRect();const sl=[...root.querySelectorAll('.kd-slide')].pop();const r=sl?sl.getBoundingClientRect():st;return{right:r.right-st.right,kind:KP.deck.slides[KP.i].kind,sw:sl?sl.scrollWidth-sl.clientWidth:0}});if(r.right>4||r.sw>4)note(`play ${k} slide ${i+1} (${r.kind})`,`cut on the right by ${Math.max(r.right,r.sw).toFixed(0)}px`)}
  await p.evaluate(()=>closeDeck())}
// model rail: context menu and delete modal (cancel)
await p.evaluate(()=>{renderProjRail();document.querySelector('#projRail').classList.add('open')});await p.locator('#projRail [data-proj]').first().click({button:'right'});await p.waitForTimeout(150);await p.click('#prMenu [data-prm="delete"]');await p.waitForTimeout(200);
if(!(await p.evaluate(()=>document.querySelector('#delModal')&&document.querySelector('#delModal').classList.contains('on')))&&await p.evaluate(()=>Object.keys(PROJECTS).length>1))note('delete','typed-confirmation modal did not open');await p.evaluate(()=>{const m=document.querySelector('#delModal');if(m)m.classList.remove('on')});
// chat
const hello=await p.evaluate(()=>(document.body.textContent.match(/Hello\. I work on EstateMaster’s figures for [^?]+\?/)||[''])[0]);if(!hello)note('chat','welcome line missing');
const self=await p.evaluate(()=>{try{return selfTest?selfTest().filter(x=>!x.ok).map(x=>x.name||x.label):[]}catch(e){return['selfTest threw: '+e.message]}});self.forEach(x=>note('selfTest',x));
console.log(`== ${NAME} @${W}px: ${issues.length} layout/function issues, ${errs.length} page errors, ${cons.length} console errors`);
[...new Set(issues)].slice(0,40).forEach(x=>console.log('  ISSUE',x));[...new Set(errs)].forEach(x=>console.log('  PAGEERROR',x));[...new Set(cons)].slice(0,10).forEach(x=>console.log('  CONSOLE',x));
await b.close();
