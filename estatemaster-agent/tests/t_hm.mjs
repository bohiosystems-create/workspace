import {chromium} from 'playwright';import fs from 'fs';
const sp=new globalThis.URL('./fixtures/',import.meta.url).pathname;
const b=await chromium.launch({executablePath:process.env.PW_CHROMIUM||undefined});const p=await b.newPage({viewport:{width:1300,height:900}});const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.route('https://cdnjs.cloudflare.com/**',r=>r.fulfill({status:200,contentType:'application/javascript',body:fs.readFileSync(sp+'package/dist/xlsx.full.min.js')}));
await p.goto('http://localhost:4090/?mode=readonly');await p.waitForTimeout(2500);
let pass=0,fail=0;const ok=(c,m)=>{c?pass++:fail++;console.log(c?'PASS':'FAIL',m)};
// 1. parser drops the tenant-sheet junk, keeps real tables
const pr=await p.evaluate(()=>[parseSens([['Code',0,0.01,0.02,0.03],['100',0,0,0.02,0.02]],'Tenant').length,parseSens([['Sale price: Levered IRR',-10,-5,0,5,10],['Levered IRR',14.1,16.2,18.4,20.1,22.0]],'Sensitivity').length]);
ok(pr[0]===0&&pr[1]===1,'parser: junk 0, real 1 → '+pr.join('/'));
// 2. heat maps on Scenarios & stress with a 1-way and a 2-way table
await p.evaluate(()=>{const x=latestExport();x.sens=[{kind:'1way',v:'Sale price',metric:'Levered IRR',mk:'irr',shifts:[-15,-10,-5,0,5,10,15],values:[11.2,15.1,22.3,26.8,30.1,33.9,37.2],sheet:'Sensitivity'},{kind:'2way',x:'Sale price',y:'Construction cost',metric:'Levered IRR',mk:'irr',xs:[-10,-5,0,5,10],ys:[-10,0,10],grid:[[18.2,22.5,29.9,33.1,36.2],[15.1,19.8,26.8,30.3,33.5],[12.0,16.4,23.6,27.2,30.1]],sheet:'Sensitivity'}];showTab('scen');renderStress()});
await p.waitForTimeout(600);
ok(await p.locator('#emRes .hm-t').count()===2,'two heat maps rendered');
const cols=await p.evaluate(()=>[...document.querySelectorAll('#emRes .hm-t')[0].querySelectorAll('.hm-c')].map(c=>c.style.background));
ok(new Set(cols).size>=6&&/rgb\(163, 29, 29\)|rgb\((1[6-9]\d|2[0-2]\d), ([2-9]\d|10\d), [2-9]\d\)/.test(cols[0])&&/rgb\((1\d|2\d|3\d|4\d), 1\d\d, \d\d\)/.test(cols[6]),'many shades, red → green: '+cols[0]+' … '+cols[6]);
ok(await p.locator('#emRes .hm-c.base').count()===2,'base cells outlined');
ok(await p.locator('#emRes .hm-c .tag').count()===0,'no provenance pill per cell: '+await p.locator('#emRes .hm-c .tag').count());
await p.locator('#emRes .hm-c').first().hover();await p.waitForTimeout(200);
const tip=await p.evaluate(()=>{const t=document.querySelector('.hm-tip');return t&&t.style.display!=='none'?t.textContent:''});
ok(/Sale price [-−]15%/.test(tip)&&/vs the hurdle/.test(tip)&&/Click/.test(tip),'hover card: '+tip.replace(/\n/g,' | ').slice(0,120));
ok(/Figures from EstateMaster/.test(await p.locator('#emRes .calcby i').first().textContent()),'italic source line');
await p.locator('#emRes .hm-c .fig').first().click();await p.waitForTimeout(300);ok(await p.evaluate(()=>document.querySelector('#figWin').classList.contains('on')),'cell click opens the working');await p.click('#fwClose');
// 3. stress scenarios as bars
ok(await p.locator('#stressT .sb-row:not(.sb-axisrow)').count()===10,'stress bars: base + 9 scenarios');
await p.locator('#stressT .sb-row').nth(2).hover();await p.waitForTimeout(200);
ok(/Levered IRR/.test(await p.evaluate(()=>document.querySelector('.hm-tip').textContent)),'bar hover card');
await p.locator('#stressT').screenshot({path:sp+'stress_bars.png'});
await p.locator('#emRes').screenshot({path:sp+'heatmaps.png'});
// 4. AI sensitivity grid: hover + italic model line
const asr=await p.evaluate(()=>{const X={assumption:'Construction cost',kind:'pct',shifts:[-20,-10,0,10,20]},Y={assumption:'Sale price',kind:'pct',shifts:[-10,0,10]};const grid=[[14,12,9.5,7,5],[22,20,18,16,14],[30,28,26.8,24,22]];const st=grid.map(r=>r.map(()=>'agree'));st[1][2]='em';const r={X,Y,mk:'levered_irr',grid,status:st,names:['Claude Fable 5.1','OpenAI gpt-5'],mode:'cross',base:26.8,a:{grid},b:{grid},rec:null,method:'m',xid:'EX-001',checker:{model:'Claude Opus 5.5'}};const el=document.querySelector('#asGrid')||document.querySelector('.as-grid');const d=document.createElement('div');d.className='as-grid';d.id='tHm';d.innerHTML=asHTML(r);document.querySelector('#p-scen, #p-model, body').appendChild(d);return document.querySelectorAll('#tHm .hm .c').length});
ok(asr===15,'AI grid 15 cells');
const bg=await p.evaluate(()=>[...document.querySelectorAll('#tHm .hm .c')].map(c=>c.style.background));ok(new Set(bg).size>=10,'AI grid: '+new Set(bg).size+' distinct shades');
await p.locator('#tHm .hm .c').nth(4).scrollIntoViewIfNeeded();await p.locator('#tHm .hm .c').nth(4).hover();await p.waitForTimeout(200);
const t2=await p.evaluate(()=>document.querySelector('.hm-tip').textContent);ok(/Construction cost:? ?\+20%/.test(t2)&&/below it/.test(t2)&&/agree/.test(t2),'AI cell hover: '+t2.replace(/\n/g,' | ').slice(0,140));
ok(/Worked out by Claude Fable 5.1 and OpenAI gpt-5, cross-checked/.test(await p.locator('#tHm .calcby i').textContent()),'model line at the bottom, italic');
await p.locator('#tHm').screenshot({path:sp+'as_grid.png'});
// 5. daily feed card with a server stress run
await p.evaluate(()=>{DAILYSRV={configured:true,stress:{at:new Date().toISOString(),models:[{name:'Al Narjis',file:'DF.xlsx',base_irr:26.83,base_poc:23.26,by:'Claude and OpenAI',reviewer:'claude-opus-5-5',scenarios:[{name:'Sale price −15%',levered_irr:14.5,profit_on_cost:12,pass:false,agree:true,working:'w'},{name:'12-month delay',levered_irr:19.2,profit_on_cost:22,pass:true,agree:false,working:'w'}],risks:[{title:'Price risk breaks the hurdle',evidence:'Sale price −15% → 14.5%',severity:'high',recommendation:'Hold the launch price.'}]}]}};showTab('appr');renderApprovals()});
await p.waitForTimeout(500);
ok(await p.locator('#sfBody .sb-row:not(.sb-axisrow)').count()===3&&await p.locator('#sfBody .sf-risk.high').count()===1,'daily feed shows the server stress run and its risk');
ok(/Run by the server/.test(await p.locator('#sfSub').textContent()),'feed sub line');
await p.locator('#stressFeed').screenshot({path:sp+'feed_stress.png'});
console.log('errors',errs);console.log(`${pass} pass, ${fail} fail`);await b.close();
