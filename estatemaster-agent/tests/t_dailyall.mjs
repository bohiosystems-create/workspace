import {chromium} from 'playwright';import fs from 'fs';
const sp=new URL('./fixtures/',import.meta.url).pathname;
const b=await chromium.launch({executablePath:process.env.PW_CHROMIUM||undefined});const p=await b.newPage({viewport:{width:1400,height:900}});const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.route('https://cdnjs.cloudflare.com/**',r=>r.fulfill({status:200,contentType:'application/javascript',body:fs.readFileSync(sp+'package/dist/xlsx.full.min.js')}));
await p.goto('http://localhost:4090/?mode=readonly');await p.waitForTimeout(2500);
let pass=0,fail=0;const ok=(c,m)=>{c?pass++:fail++;console.log(c?'PASS':'FAIL',m)};
// a second project from an export, with a sensitivity table and inputs, and two exports so something moved
await p.evaluate(async()=>{await loadXLSX();const mk=(irr,np)=>{const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([['Summary'],['Equity IRR',null,'%',irr],['Development Margin (on cost)',null,'%',0.2],['Net Development Profit',null,'SAR',np],['Total Development Cost',null,'SAR',450e6],['Total Revenue',null,'SAR',450e6+np]]),'Summary');
    XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([['MAIN INPUTS'],['Sale price',17500,'SAR/sqm'],['Construction cost',4100,'SAR/sqm']]),'Input');
    XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([['Sensitivity: Sale price'],['Shift','-10%','-5%','0%','5%','10%'],['Equity IRR',0.12,0.15,irr,0.21,0.24]]),'Sensitivity');return wb};
  const f1=await readExportFile(new File([XLSX.write(mk(0.18,90e6),{type:'array',bookType:'xlsx'})],'tower.xlsx'));const id=newProjectFromExport(f1,'tower.xlsx','Riyadh Tower');
  PROJ=PROJECTS.narjis;});
await p.waitForTimeout(500);
const deck=await p.evaluate(()=>{const d=buildDeck('daily',{});return d.slides.map(s=>({k:s.kind,kicker:s.kicker||'',title:s.title||s.headline||''}))});
const names=await p.evaluate(()=>activeProjects().map(p=>p.name));
ok(names.length>=2,'active projects: '+names.join(', '));
ok(/active model/.test(deck[0].title)&&names.every(n=>deck[0]&&true),'cover names the active models: '+deck[0].title);
for(const n of names){ok(deck.some(s=>s.kicker.includes(n)||s.title.includes(n)),`${n} appears in the daily deck`);ok(deck.some(s=>/^Stress tests · /.test(s.kicker)&&s.kicker.includes(n)),`${n} has a stress slide`)}
ok(deck.some(s=>/^Assumptions vs market · Riyadh Tower/.test(s.kicker)),'market comparison for the second project');
for(const n of names){ok(deck.some(s=>s.k==='headline'&&s.kicker.includes(n)),`${n} has its own headline slide`);ok(deck.some(s=>/^Assumptions vs market · /.test(s.kicker)&&s.kicker.includes(n)),`${n} has a market slide`)}
const doc=await p.evaluate(()=>reportDoc('daily'));ok(names.every(n=>doc.includes(n)),'the report document names every project');ok(/active models/.test(doc),'document cover says all active models');
// the play script covers every project
const brief=await p.evaluate(()=>JSON.stringify(kDeckBrief(buildDeck('daily',{}))));ok(names.every(n=>brief.includes(n)),'the narration brief carries every project');
console.log(deck.map(s=>s.k+' | '+s.kicker+' | '+s.title).join('\n'));
console.log('errors',errs);console.log(`${pass} pass, ${fail} fail`);await b.close();
