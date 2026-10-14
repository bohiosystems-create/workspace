import {chromium} from 'playwright';import fs from 'fs';
const sp=new URL('./fixtures/',import.meta.url).pathname;
const b=await chromium.launch({executablePath:process.env.PW_CHROMIUM||undefined});const p=await b.newPage({viewport:{width:1400,height:950}});const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.route('https://cdnjs.cloudflare.com/**',r=>r.fulfill({status:200,contentType:'application/javascript',body:fs.readFileSync(sp+'package/dist/xlsx.full.min.js')}));
await p.goto('http://localhost:4090/?mode=readonly');await p.waitForTimeout(2500);
let pass=0,fail=0;const ok=(c,m)=>{c?pass++:fail++;console.log(c?'PASS':'FAIL',m)};
// a project from an export, no target IRR (so the hurdle is asked), inputs incl. land cost
await p.evaluate(async()=>{await loadXLSX();const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([['Summary'],['Equity IRR',null,'%',0.1375],['Project IRR',null,'%',0.1297],['Net Development Profit',null,'SAR',129.5e6],['Total Development Cost',null,'SAR',556.8e6]]),'Summary');
  XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([['MAIN INPUTS'],['Land Cost',38500000,'SAR'],['Hard Cost (sr-sqm, GFA)',3500,'SAR/sqm'],['Sale price',13500,'SAR/sqm']]),'Input');
  const pr=await readExportFile(new File([XLSX.write(wb,{type:'array',bookType:'xlsx'})],'awj.xlsx'));const id=newProjectFromExport(pr,'awj.xlsx','AWJ Test');switchProject?switchProject(id):(PROJ=PROJECTS[id]);
  AI.keys.anthropic='sk-test';AI.keys.openai='sk-test';window.__pins=[];
  // a careless model: takes "project IRR" as if it were an assumption
  window.callOne=async(pr,model,sys,msgs)=>{const u=msgs[msgs.length-1].content;if(sys===AS_PIN){const t=(u.match(/axis: "([^"]+)"/)||[])[1]||'';__pins.push(t);if(/land/i.test(t))return{text:JSON.stringify({assumption:'Land Cost',kind:'pct',unit:'%',shifts:[-20,-10,0,10,20],sure:true}),calls:[]};
      if(/irr|ebitda/i.test(t)&&!/answers to your questions/i.test(u))return{text:JSON.stringify({assumption:'Project IRR',kind:'pts',unit:'pts',shifts:[-2,-1,0,1,2],sure:true}),calls:[]};
      if(/land price/i.test(t))return{text:JSON.stringify({assumption:'Land Cost',kind:'pct',unit:'%',shifts:[-20,-10,0,10,20],sure:true}),calls:[]};return{text:JSON.stringify({assumption:'Sale price',kind:'pct',unit:'%',shifts:[-20,-10,0,10,20],sure:true}),calls:[]}}
    return{text:'{}',calls:[]}};
  window.aiSensGrid=async(X,Y,mk,step)=>{await step('stub grid');return{x:X,y:Y,mk,grid:[[1]],stub:true}};window.renderAiSens=()=>{};
  showTab('scen')});
await p.waitForTimeout(400);
await p.fill('#asX','land cost');await p.fill('#asY','project IRR');await p.click('#asGo');await p.waitForTimeout(400);
ok(await p.locator('#asQ #hurAsk').count()===1,'hurdle asked first');
await p.fill('#hurIn','18');await p.locator('#hurAsk form button[type=submit]').click();await p.waitForTimeout(1500);
const st=await p.evaluate(()=>({q:$('#asQ').textContent,stat:$('#asStat').textContent,y:AS.y,res:!!AS.res,busy:AS.busy,pins:__pins}));
console.log(JSON.stringify(st).slice(0,600));
ok(!st.busy,'the generator is not left running');
ok(!(st.y&&/irr/i.test(st.y.assumption)),'an output (project IRR) is never accepted as the Y-axis assumption');
ok(/output|result|assumption/i.test(st.q)&&/Y axis/i.test(st.q),'the user is asked which assumption to stress instead');
// answering the question finishes the table
await p.locator('[data-asax="y"] .chip').first().click().catch(()=>{});await p.waitForTimeout(1500);
const st2=await p.evaluate(()=>({y:AS.y&&AS.y.assumption,res:!!AS.res,stat:$('#asStat').textContent}));ok(st2.res&&st2.y&&!/irr/i.test(st2.y),'after the answer the table is generated: '+JSON.stringify(st2));

// the AI's own mistake on wording the shortcut does not catch
await p.evaluate(()=>{AS.x=null;AS.y=null;AS.res=null;AS.pendQ={};$('#asQ').innerHTML=''});
await p.fill('#asX','land cost');await p.fill('#asY','how the scheme irr reacts');await p.click('#asGo');await p.waitForTimeout(1500);
const st3=await p.evaluate(()=>({q:$('#asQ').textContent,y:AS.y,metric:$('#asMetric').value}));
ok(!st3.y&&/result of the model/.test(st3.q),'an output returned by the AI itself is turned into a question: '+st3.q.slice(0,90));
// both axes on the same assumption
await p.evaluate(()=>{AS.x=null;AS.y=null;AS.res=null;AS.pendQ={};$('#asQ').innerHTML='';$('#asMetric').value='levered_irr'});
await p.fill('#asX','land cost');await p.fill('#asY','land price');await p.click('#asGo');await p.waitForTimeout(1500);
ok(/Both axes stress/.test(await p.locator('#asQ').textContent()),'the same assumption on both axes is caught');
// every AI calculation is told the hurdle
const ctx=await p.evaluate(()=>calcContext(latestExport()));ok(/levered IRR 18% \(confirmed by the user\)/.test(ctx)&&/never say that no hurdle is stated/.test(ctx),'the AI context carries the confirmed hurdle');
// the hover card keeps long lines inside
await p.evaluate(()=>{const d=document.createElement('div');d.className='hm-tip';d.style.display='block';d.style.left='20px';d.style.top='20px';d.innerHTML=tipHTML('Land Cost: +6.67%\nStabilizing Yield (%): 0 pts\n\nLevered IRR: 13.52%\n-4.48 pts vs the hurdle 18.00% · below it (KINAN policy)\n-0.23 pts vs EstateMaster’s base\n\nClaude Fable 5.1 only: not cross-checked\nClick for the full working');d.id='tipT';document.body.appendChild(d)});
const fit=await p.evaluate(()=>{const t=$('#tipT'),r=t.getBoundingClientRect();return[...t.querySelectorAll('b,span')].every(e=>{const q=e.getBoundingClientRect();return q.right<=r.right+0.5})});ok(fit,'every line of the hover card stays inside it');
await p.locator('#tipT').screenshot({path:sp+'tip_fixed.png'});
console.log('errors',errs);console.log(`${pass} pass, ${fail} fail`);await b.close();
