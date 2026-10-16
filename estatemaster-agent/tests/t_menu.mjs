import {chromium} from 'playwright';import fs from 'fs';
const sp=new globalThis.URL('./fixtures/',import.meta.url).pathname;
const b=await chromium.launch({executablePath:process.env.PW_CHROMIUM||undefined});const p=await b.newPage({viewport:{width:1300,height:900}});const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.route('https://cdnjs.cloudflare.com/**',r=>r.fulfill({status:200,contentType:'application/javascript',body:fs.readFileSync(sp+'package/dist/xlsx.full.min.js')}));
await p.goto('http://localhost:4090/?mode=readonly');await p.waitForTimeout(2500);
let pass=0,fail=0;const ok=(c,m)=>{c?pass++:fail++;console.log(c?'PASS':'FAIL',m)};
const tabs=await p.evaluate(()=>[...document.querySelectorAll('#tabs .tab:not(.gtab-hidden)')].map(t=>t.textContent.trim()));
ok(tabs[tabs.length-1]==='Market data','market data last: '+tabs.join(' | '));
await p.click('.tab[data-t="em"]');await p.waitForTimeout(300);
ok(await p.evaluate(()=>document.querySelector('#emMenu').classList.contains('on')&&[...document.querySelectorAll('#emMenu .emm-it b')].map(e=>e.textContent).join('|')==='Upload|Live drivers|Feasibility|Assumptions|Compare'),'menu: Upload, Live drivers, Feasibility, Assumptions, Compare (Feasibility replaces Checks)');
await p.evaluate(()=>{document.querySelector('#emMenu').classList.remove('on')});
ok(await p.evaluate(()=>{try{localStorage.setItem('bohioEmSec','checks')}catch(e){}return emSection()==='upload'&&!document.querySelector('#emMenu [data-emgo="checks"]')}),'an old link to the Checks page lands on Upload');
// checks with cells: upload a workbook with a reconcile error and a zero input
await p.evaluate(async()=>{await loadXLSX();const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([['Summary'],['Equity IRR',null,'%',12.32],['Development Margin (on cost)',null,'%',1.09],['Net Development Profit',null,'SAR',138e6],['Total Development Cost',null,'SAR',95.1e6]]),'Summary');XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([['MAIN INPUTS'],['Construction Contingency',0,'%']]),'Input');const buf=XLSX.write(wb,{type:'array',bookType:'xlsx'});await uploadExport(new File([buf],'cells test.xlsx'))});
await p.waitForTimeout(800);
const cells=await p.evaluate(()=>{const d=document.createElement('div');d.innerHTML=checksHTML(exportChecks(latestExport()),'');return[...d.querySelectorAll('.chk-cell')].map(e=>e.textContent)});
ok(cells.includes('Summary!D3, Summary!D4, Summary!D5')&&cells.includes('Input!B2'),'checks show the Excel cells in bold: '+cells.join(' ; '));

// stress bars: no overlap between value and bar
await p.evaluate(()=>showTab('scen'));await p.waitForTimeout(500);
const ov=await p.evaluate(()=>{const rows=[...document.querySelectorAll('#stressT .sb-row:not(.sb-axisrow)')];return rows.map(r=>{const t=r.querySelector('.sb-track').getBoundingClientRect(),v=r.querySelector('.sb-val').getBoundingClientRect(),pc=r.querySelector('.sb-poc').getBoundingClientRect();return v.left>=t.right-1&&pc.height<40})});
ok(ov.every(Boolean),'no overlap in stress rows ('+ov.length+' rows)');
await p.locator('#stressT').screenshot({path:sp+'stress_bars2.png'});
await p.evaluate(()=>{DAILYSRV={configured:true,stress:{at:new Date().toISOString(),models:[{name:'Al Narjis',file:'DF.xlsx',base_irr:26.83,base_poc:23.26,by:'Claude and OpenAI',reviewer:'Claude Opus 5.5',scenarios:[{name:'Sale price −15%',levered_irr:14.5,profit_on_cost:12,pass:false,agree:true,working:'w'},{name:'12-month delay',levered_irr:19.2,profit_on_cost:22,pass:true,agree:false,working:'w'}],risks:[{title:'Price risk breaks the hurdle',evidence:'Sale price −15% → 14.5%',severity:'high',recommendation:'Hold the launch price.'}]}]}};showTab('appr');renderApprovals()});
await p.waitForTimeout(500);
const ov2=await p.evaluate(()=>[...document.querySelectorAll('#sfBody .sb-row:not(.sb-axisrow)')].map(r=>{const t=r.querySelector('.sb-track').getBoundingClientRect(),v=r.querySelector('.sb-val').getBoundingClientRect(),pc=r.querySelector('.sb-poc').getBoundingClientRect();return v.left>=t.right-1&&pc.height<40}));
ok(ov2.length===3&&ov2.every(Boolean),'no overlap in the narrow feed card');
await p.locator('#stressFeed').screenshot({path:sp+'feed_stress2.png'});
console.log('errors',errs);console.log(`${pass} pass, ${fail} fail`);await b.close();
