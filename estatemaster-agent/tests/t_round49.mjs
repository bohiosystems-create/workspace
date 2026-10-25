// Round 49 (200 reporting prompts, AI on): a project named by its own phrase is not lost to a word another project's name happens to
// hold (“the Al Manar JV … the main risk”); scenarios side by side on a workbook show its what-ifs; a report built on a tested version
// shows the workbook as uploaded against that version; a report named again is the one on screen or the latest made.
import {chromium} from 'playwright';import fs from 'fs';
const sp=new globalThis.URL('./fixtures/',import.meta.url).pathname;
const b=await chromium.launch({executablePath:process.env.PW_CHROMIUM||undefined});const cx=await b.newContext({viewport:{width:1400,height:900}});const p=await cx.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));
await cx.route('https://cdnjs.cloudflare.com/**',r=>r.fulfill({status:200,contentType:'application/javascript',body:fs.readFileSync(sp+'package/dist/xlsx.full.min.js')}));
await cx.route(/hyperformula/,r=>r.fulfill({status:200,contentType:'application/javascript',body:fs.readFileSync(sp+'package/hyperformula.full.min.js')}));
await p.route('**/api/**',r=>r.fulfill({status:404,body:''}));
await p.goto(process.argv[2]||'http://localhost:4090/?mode=readonly');await p.evaluate(()=>localStorage.clear());await p.reload();await p.waitForTimeout(1500);
const ok=[];const t=(c,m)=>ok.push((c?'PASS':'FAIL')+' | '+m);
for(const f of ['c43_jv_circ_sar.xlsx','office_k.xlsx']){await p.evaluate(()=>openNewProject());await p.setInputFiles('#npFile',sp+'models/'+f);await p.waitForTimeout(1200);await p.click('#npCreate');await p.waitForTimeout(3500)}

// 1. naming a project
const N=await p.evaluate(()=>{const nm=q=>ctxProjectNamed(q).map(id=>PROJECTS[id].name.split(' ')[0]+' '+PROJECTS[id].name.split(' ')[1]);
  window.ASKED='Create a one-page update on the Al Manar JV for the CEO: returns, cost and the main risk.';window.GAPS=[];const c=ctxResolve({k:'newreport'});const moved=PROJ.name;
  const back=Object.values(PROJECTS).find(P=>/MAIN STREET/i.test(P.name));switchProject(back.id,true,true);
  return{ceo:nm('Create a one-page update on the Al Manar JV for the CEO: returns, cost and the main risk.'),main:nm('Build the IC pack for Main Street Office.'),both:nm('Compare Al Manar and Main Street.'),moved,applied:!!c.applied.project}});
t(N.ceo.length===1&&/MANAR/i.test(N.ceo[0])&&N.applied&&/MANAR/i.test(N.moved),'a project named by its own phrase wins over a word another name holds (“the main risk”), and the answer moves to it: '+JSON.stringify(N));
t(N.main.length===1&&/MAIN/i.test(N.main[0])&&N.both.length===2,'a project named on its own, and two projects named, still read as such: '+JSON.stringify({main:N.main,both:N.both}));
const amb=await p.evaluate(()=>{const al=Object.values(PROJECTS).find(P=>/narjis/i.test(P.name));if(al)switchProject(al.id,true,true);window.ASKED='The levered IRR of Al Manar and Main Street.';window.GAPS=[];const c=ctxResolve({k:'figure'});return{notes:c.notes,open:PROJ.name}});
t(amb.notes.some(n=>/are named: this answer is about/.test(n)),'two projects named while a third is open: the answer says which project it is about: '+JSON.stringify(amb));

// 2. scenarios side by side on an uploaded workbook: the what-ifs, not an empty report
const P=await p.evaluate(()=>{const ms=Object.values(PROJECTS).find(P=>/MAIN STREET/i.test(P.name));switchProject(ms.id,true,true);const pl=rpPlan(RPTS.compare.blocks);return{shown:pl.shown,left:pl.left}});
t(P.shown.includes('wb_whatifs')&&!P.left.includes('scenario_compare'),'the scenario comparison on an uploaded workbook shows the what-ifs recalculated on it: '+JSON.stringify(P));

// 3. a report on a tested version: the workbook as uploaded against that version
const K=await p.evaluate(async()=>{const x=latestExport();const base=x.out0.levered_irr;window.ASKED='Hard cost ($/sf) to 368';const o=await handle('Hard cost ($/sf) to 368','web','analyst').catch(e=>null);if(o&&o.fx)try{o.fx()}catch(e){}await new Promise(r=>setTimeout(r,3000));
  const L=wbVers();const v=L[L.length-1];if(!v)return{err:'no version'};xvSet(x,v);const h=BLOCKS.kpis.fn().replace(/<[^>]+>/g,' ').replace(/\s+/g,' ');xvSet(x,null);return{h:h.slice(0,400),base,ver:v.id}});
t(K.h&&K.h.includes(K.ver+' (tested)')&&!/\(first\)|\(latest\)/.test(K.h)&&!K.h.includes((K.base).toFixed(2)+'%')&&/4\.99%/.test(K.h),'the headline table on a tested version: that version’s figures under its own name, never under “first” and “latest”: '+JSON.stringify(K).slice(0,420));

// 4. a report name made twice: the one on screen, else the latest
const R=await p.evaluate(()=>{RPTS.zzold={name:'Board one-pager',blocks:['wb_figures']};RPTS.zznew={name:'Board one-pager',blocks:['wb_figures']};RSEL='ic';const latest=rptByName('Board one-pager');RSEL='zzold';const onScreen=rptByName('board one-pager');delete RPTS.zzold;delete RPTS.zznew;RSEL='ic';return{latest,onScreen}});
t(R.latest==='zznew'&&R.onScreen==='zzold','a report name held by two reports: the one on screen, else the latest made: '+JSON.stringify(R));
// 5. “every input ±10%”: a hold of 8 years moves in whole years; ramp lines are scaled, not asked about
const TJ=await p.evaluate(async()=>{const jv=Object.values(PROJECTS).find(P=>/MANAR/i.test(P.name));switchProject(jv.id,true,true);window.GAPS=[];window.ASKED='the Al Manar JV: tornado on the levered IRR, every input by ±10%.';
  const o=await handle('','web','analyst',{k:'a33',tool:'tornado',args:{metric:'levered_irr',uniform:{by:10,unit:'pct'}}});return{t:o.plain||'',gaps:window.GAPS.slice()}});
const hold=(TJ.t.match(/Hold period \(years\)[^\n]*?[|\t]\s*([\d.]+) to ([\d.]+)/)||[]);
t(hold[1]==='7'&&hold[2]==='9'&&TJ.gaps.some(g=>/whole number of periods/.test(g)),'±10% on every input: a hold of 8 years is tested at 7 and 9 years, said: '+JSON.stringify({hold:hold.slice(1),gaps:TJ.gaps}).slice(0,300));
await p.evaluate(()=>openNewProject());await p.setInputFiles('#npFile',sp+'models/r41_hotel_aed.xlsx');await p.waitForTimeout(1200);await p.click('#npCreate');await p.waitForTimeout(4000);
const TH=await p.evaluate(async()=>{window.GAPS=[];window.ASKED='Marina Bay: tornado on the levered IRR, every input by ±10%.';const o=await handle('','web','analyst',{k:'a33',tool:'tornado',args:{metric:'levered_irr',uniform:{by:10,unit:'pct'}}});return{t:(o.plain||'').slice(0,300),gaps:window.GAPS.slice()}});
t(!/how should they move/.test(TH.t)&&/What moves/.test(TH.t)&&TH.gaps.some(g=>/scaled by the same ±10%/.test(g)),'±10% on every input: the ramp lines are scaled by it and said, not asked about: '+JSON.stringify(TH).slice(0,300));
t(!errs.length,'no page errors '+errs.slice(0,3).join(' | '));
console.log(ok.join('\n'));await b.close();process.exit(ok.some(z=>z.startsWith('FAIL'))?1:0);
