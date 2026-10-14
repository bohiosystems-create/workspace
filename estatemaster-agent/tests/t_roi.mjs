import {chromium} from 'playwright';import fs from 'fs';
const sp=new URL('./fixtures/',import.meta.url).pathname;
const URL=process.argv[2]||'http://localhost:4090/?mode=readonly';
const b=await chromium.launch({executablePath:process.env.PW_CHROMIUM||undefined});const p=await b.newPage({viewport:{width:1400,height:950}});const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.route('https://cdnjs.cloudflare.com/**',r=>r.fulfill({status:200,contentType:'application/javascript',body:fs.readFileSync(sp+'package/dist/xlsx.full.min.js')}));
await p.goto(URL);await p.waitForTimeout(2500);
let pass=0,fail=0;const ok=(c,m)=>{c?pass++:fail++;console.log(c?'PASS':'FAIL',m)};
const dismiss=()=>p.evaluate(()=>{const w=$('#dispWin');if(w)w.classList.remove('on')});
await p.evaluate(async()=>{await loadXLSX();const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([['Summary'],['Equity IRR',null,'%',0.1232],['Development Margin (on cost)',null,'%',0.10],['Net Development Profit',null,'SAR',50e6],['Total Development Cost',null,'SAR',500e6],['Total Revenue',null,'SAR',550e6],['Peak Debt',null,'SAR',200e6]]),'Summary');
  XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([['MAIN INPUTS'],['Land Purchase Price',90000000,'SAR'],['Construction Costs',95000000,'SAR'],['Interest Rate',0.065,'%'],['Capitalized Sales (refer to Tenants)',120,'SAR/sqm']]),'Input');
  const pr=await readExportFile(new File([XLSX.write(wb,{type:'array',bookType:'xlsx'})],'industrial.xlsx'));const id=newProjectFromExport(pr,'industrial.xlsx','Build to Hold Industrial');switchProject?switchProject(id):(PROJ=PROJECTS[id]);
  AI.keys.anthropic='sk-a';AI.keys.openai='sk-o';setHurdle(18,'typed');DISPUTES.length=0;DISP_SEEN.clear();window.__defs=0;window.__grids=[];
  window.callOne=async(pr,model,sys,msgs)=>{const u=msgs[msgs.length-1].content;
    if(sys===DEF_SYS){__defs++;if(window.__defMode==='split')return{text:JSON.stringify(pr==='anthropic'?{sure:true,label:'ROI',unit:'%',better:'hi',formula:'net_profit / total_cost * 100',definition:'Net profit over total development cost'}:{sure:true,label:'ROI',unit:'%',better:'hi',formula:'net_profit / gross_revenue * 100',definition:'Net profit over revenue'})};
      return{text:JSON.stringify({sure:true,label:'ROI',unit:'%',better:'hi',formula:'net_profit / total_cost * 100',definition:'Net profit over total development cost',note:'equals profit on cost'})}}
    if(sys===AS_PIN){const t=(u.match(/axis: "([^"]+)"/)||[])[1]||'';return{text:JSON.stringify({assumption:/interest/i.test(t)?'Interest Rate':'Construction Costs',kind:/interest/i.test(t)?'pts':'pct',unit:'%',shifts:[-20,-10,0,10,20],sure:true})}}
    if(/two-way sensitivity table/.test(sys)){__grids.push(u);const m=/Return a grid of (\d+) rows × (\d+) columns/.exec(u),R=+m[1],C=+m[2];const off=pr==='openai'&&window.__offBase?1.5:0;
      return{text:JSON.stringify({method:'m',grid:Array.from({length:R},(_,i)=>Array.from({length:C},(_,k)=>+(10-(k-(C-1)/2)*0.8-(i-(R-1)/2)*0.5+off).toFixed(2))),cells:''})}}
    return{text:'{}'}};
  window.checkerAgent=async()=>({model:'c',verdicts:[],summary:''});showTab('scen')});
await p.waitForTimeout(400);await dismiss();
// 1. ROI on the Y axis: defined by both models, cross-checked, base computed exactly, then the axis question
await p.evaluate(()=>{$('#asN').value='5'});await p.fill('#asX','construction costs');await p.fill('#asY','ROI');await p.click('#asGo');await p.waitForTimeout(1500);
let st=await p.evaluate(()=>({q:$('#asQ').textContent,mk:$('#asMetric').value,c:CUSTOMM.cm_roi,defs:__defs,opts:[...document.querySelectorAll('#asQ [data-asopt]')].map(o=>o.dataset.asopt)}));
ok(st.defs===2&&st.c&&st.c.formula==='net_profit / total_cost * 100'&&Math.abs(st.c.base-10)<1e-9,'ROI defined by both models; base computed exactly from EstateMaster outputs: '+(st.c&&st.c.base));
ok(st.mk==='cm_roi','the table metric becomes ROI');
ok(/table will show ROI/.test(st.q)&&/Y axis/i.test(st.q),'then the agent asks which assumption the Y axis stresses');
ok(!st.opts.some(o=>/construction/i.test(o))&&st.opts.length>=2,'proposals never repeat the X-axis assumption: '+st.opts.join(' | '));
await p.locator('[data-asopt="Interest Rate"]').click();await p.waitForTimeout(2000);
st=await p.evaluate(()=>({res:!!AS.res,mk:AS.res&&AS.res.mk,base:AS.res&&AS.res.base,bi:AS.res&&AS.res.grid[2][2],g:__grids.slice(-1)[0]||'',hdr:$('#asGrid').textContent.slice(0,80)}));
ok(st.res&&st.mk==='cm_roi'&&Math.abs(st.base-10)<1e-9&&Math.abs(st.bi-10)<1e-9,'table built for ROI with the exact base in the centre cell');
ok(/Formula over EstateMaster's outputs: net_profit \/ total_cost \* 100/.test(st.g)&&/equals exactly 10/.test(st.g),'both models were given the definition, the formula and the exact base');
ok(/ROI/.test(st.hdr),'the table is labelled ROI: '+st.hdr.slice(0,40));
await p.locator('#aiSensCard').screenshot({path:sp+'roi_table.png'}).catch(()=>{});
// 2. a model whose base cell is off is caught and popped up
await dismiss();await p.evaluate(()=>{window.__offBase=true;AS.res=null;DISPUTES.length=0;DISP_SEEN.clear()});
const r2=await p.evaluate(async()=>{const r=await aiSensGrid(AS.x,AS.y,'cm_roi');return{off:r.baseOff,n:DISPUTES.filter(d=>/base cell/.test(d.what)).length}});
ok(r2.off&&r2.off.length===1&&r2.n===1,'a model whose base cell misses the exact value is caught: '+JSON.stringify(r2.off));
// 3. the two models define ROI differently: the user chooses, pop-up shown
await dismiss();await p.evaluate(()=>{window.__offBase=false;window.__defMode='split';delete CUSTOMM.cm_roi;AS.x=null;AS.y=null;AS.res=null;AS.pendQ={};DISPUTES.length=0;DISP_SEEN.clear();$('#asQ').innerHTML=''});
await p.fill('#asX','construction costs');await p.fill('#asY','ROI');await p.click('#asGo');await p.waitForTimeout(1500);
st=await p.evaluate(()=>({q:$('#asQ').textContent,opts:[...document.querySelectorAll('#asQ [data-asopt]')].map(o=>o.dataset.asopt),disp:DISPUTES.map(d=>d.what)}));
ok(/define .*ROI.* differently/.test(st.q)&&st.opts.length===2&&st.disp.some(d=>/definition of “ROI”/.test(d)),'different definitions: the user is asked to choose and the pop-up opens');
await dismiss();await p.locator('#asQ [data-asopt]').first().click();await p.waitForTimeout(800);
st=await p.evaluate(()=>({c:CUSTOMM.cm_roi,q:$('#asQ').textContent}));ok(st.c&&st.c.formula==='net_profit / total_cost * 100'&&/Which assumption should the Y axis stress/.test(st.q),'choosing a definition adopts it and moves on to the axis question');
// 4. the formula evaluator refuses anything but the output keys
const ev=await p.evaluate(()=>[evalMetric('net_profit/total_cost*100',{net_profit:50,total_cost:500}),evalMetric('alert(1)',{}),evalMetric('net_profit/equity',{net_profit:5}),evalMetric('constructor',{})]);
ok(ev[0]===10&&ev.slice(1).every(v=>Number.isNaN(v)),'formula evaluator: only arithmetic over EstateMaster output keys: '+JSON.stringify(ev));
console.log('errors',errs);console.log(`${pass} pass, ${fail} fail`);await b.close();
