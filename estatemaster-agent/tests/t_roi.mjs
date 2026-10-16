import {chromium} from 'playwright';import fs from 'fs';
const sp=new globalThis.URL('./fixtures/',import.meta.url).pathname;
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
// a values-only export is never estimated: the ROI table is refused in plain words, with what to upload
st=await p.evaluate(()=>({res:!!AS.res,msg:($('#asStat').textContent+' '+$('#asQ').textContent+' '+$('#asGrid').textContent)}));
ok(!st.res&&/Not computed/i.test(st.msg)&&/values only|formulas/.test(st.msg),'on a values-only export the ROI table is not computed, never estimated: '+st.msg.replace(/\s+/g,' ').slice(0,160));
console.log(`${pass} pass, ${fail} fail`);await b.close();
