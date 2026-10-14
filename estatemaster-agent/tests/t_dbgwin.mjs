// Upload → debug window opens on Financial modelling; exact checks, two agents, cross-verification, arbitration; results card only with sensitivity tables.
import {chromium} from 'playwright';import fs from 'fs';
const sp=new URL('./fixtures/',import.meta.url).pathname;
const b=await chromium.launch({executablePath:process.env.PW_CHROMIUM||undefined});const p=await b.newPage({viewport:{width:1500,height:950}});const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.route('https://cdnjs.cloudflare.com/**',r=>r.fulfill({status:200,contentType:'application/javascript',body:fs.readFileSync(sp+'package/dist/xlsx.full.min.js')}));
await p.route('https://fonts.googleapis.com/**',r=>r.fulfill({status:200,contentType:'text/css',body:''}));
await p.goto(process.argv[2]||'http://localhost:4090/?mode=readonly');await p.evaluate(()=>localStorage.clear());await p.reload();await p.waitForTimeout(1500);
const ok=[];const t=(c,m)=>ok.push((c?'PASS':'FAIL')+' | '+m);
const card0=await p.evaluate(()=>{showTab('scen');renderAll();return getComputedStyle($('#emResCard')).display});t(card0==='none','no sensitivity table in any model: the EstateMaster results card is hidden ('+card0+')');
await p.evaluate(async()=>{await loadXLSX();AI.keys.anthropic='sk-a';AI.keys.openai='sk-o';setHurdle(18,'typed');DISPUTES.length=0;
  window.SEEN=[];window.callOne=async(pr,model,sys,msgs)=>{const u=msgs[0].content;SEEN.push([pr,sys===AUDIT_SYS?'review':sys===AUDIT_VERIFY_SYS?'verify':sys===AUDIT_ARB_SYS?'arb':'other']);await new Promise(r=>setTimeout(r,300));
    if(sys===AUDIT_SYS)return{text:JSON.stringify({read_ok:true,read_note:'Read correctly.',items:pr==='anthropic'?[{kind:'bug',severity:'high',title:'Peak debt above total development cost',evidence:'Peak debt 900M vs cost 640M',cell:'Summary!B7',recommendation:'Check the facility'},{kind:'risk',severity:'medium',title:'Thin margin against the hurdle',evidence:'POC 9%',recommendation:'Review pricing'}]:[{kind:'bug',severity:'high',title:'Peak debt exceeds total development cost',evidence:'900M > 640M',cell:'Summary!B7',recommendation:'Check'},{kind:'bug',severity:'medium',title:'Contingency missing from cost plan',evidence:'no contingency line',recommendation:'Add it'}]})};
    if(sys===AUDIT_VERIFY_SYS){const ids=[...u.matchAll(/\n(\d+)\. \[/g)].map(m=>+m[1]);return{text:JSON.stringify({verdicts:ids.map(i=>({i,verdict:/Contingency/.test(u.split('\n'+i+'. [')[1]||'')?'rejected':'confirmed',reason:'checked against the figures'}))})}}
    if(sys===AUDIT_ARB_SYS){const ids=[...u.matchAll(/\n(\d+)\. \[/g)].map(m=>+m[1]);return{text:JSON.stringify({verdicts:ids.map(i=>({i,verdict:'rejected',reason:'contingency sits in the cost line at 5%'}))})}}
    return{text:'{}'}};
  const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([['Project','Al Narjis Mixed-Use']]),'Intro');
  XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([['Equity IRR',0.184],['Project IRR',0.15],['Development Margin',0.09],['Net Profit',57600000],['Total Development Cost',640000000],['Gross Sales Revenue',697600000],['Peak Debt',900000000]]),'Summary');
  XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([['Inputs'],['Land Purchase Price',90000000,'SAR'],['Construction cost',5200,'SAR/sqm'],['Loan 1 interest rate',0.085,'%']]),'Inputs');
  showTab('em');await uploadExport(new File([XLSX.write(wb,{type:'array',bookType:'xlsx'})],'AlNarjis v3.xlsx'))});
await p.waitForTimeout(400);
const s1=await p.evaluate(()=>({open:$('#dbgWin')&&$('#dbgWin').classList.contains('on'),tab:$('.pane.on')&&$('.pane.on').id,running:/\d:\d\d/.test($('#dbgWBody').textContent)}));
t(s1.open,'uploading a model opens the debug window by itself');t(s1.tab==='p-em','on the Financial modelling page, where the upload was made ('+s1.tab+')');t(s1.running,'with a running clock while the agents work');
for(let i=0;i<40;i++){await p.waitForTimeout(250);if(await p.evaluate(()=>/Done in/.test($('#dbgWBody').textContent)))break}
const r=await p.evaluate(()=>{const x=latestExport(),a=x.audit,T=$('#dbgWBody').textContent;return{T,log:a.log.map(l=>l.text),items:a.ai.items.map(z=>[z.title,z.status]),dis:a.ai.dismissed.map(z=>z.title),seen:SEEN,ex:a.checks.map(c=>c.code)}});
t(r.log.some(l=>/Deterministic checks/.test(l))&&r.log.some(l=>/read the whole model independently/.test(l))&&r.log.some(l=>/Cross-check/.test(l))&&r.log.some(l=>/Arbitration/.test(l)),'every stage is shown: read, exact checks, two independent agents, cross-check, arbitration');
t(r.items.some(([n,s])=>/Peak debt/.test(n)&&s==='corroborated'),'a bug both agents found independently is marked as found by both');
t(r.items.some(([n,s])=>/Thin margin/.test(n)&&s==='confirmed'),'a finding raised by one agent and confirmed by the other is marked confirmed');
t(r.dis.some(n=>/Contingency/.test(n))&&!r.items.some(([n])=>/Contingency/.test(n)),'a finding rejected by the other agent and by the arbiter is dismissed (kept under “dismissed”)');
t(r.seen.filter(s=>s[1]==='review').length===2&&r.seen.filter(s=>s[1]==='verify').length===2&&r.seen.filter(s=>s[1]==='arb').length===1,'2 independent reviews, 2 cross-verifications, 1 arbitration: '+JSON.stringify(r.seen.map(s=>s.join(':'))));
t(r.ex.includes('debt'),'the exact checks catch peak debt above cost too');t(/Found by the agents/.test(r.T)&&/dismissed after cross-checking/.test(r.T),'the window shows the agents’ findings and the dismissed ones');
console.log(JSON.stringify({log:r.log,items:r.items,dis:r.dis,seen:r.seen,vis:await p.evaluate(()=>{const w=$('#dbgWin');return [w.className,getComputedStyle(w).display,!!$('#dbgDone')]})}).slice(0,1500));await p.evaluate(()=>$('#dbgDone')&&$('#dbgDone').click());t(await p.evaluate(()=>!$('#dbgWin').classList.contains('on')),'the window closes');
// with a sensitivity table the results card appears
const card1=await p.evaluate(async()=>{const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([['Project','Al Narjis Mixed-Use']]),'Intro');XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([['Equity IRR',0.184],['Development Margin',0.09],['Net Profit',57600000],['Total Development Cost',640000000]]),'Summary');
  XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([['Sensitivity Analysis'],[],['One-Way Sensitivity: Sale Revenue'],['',-20,-10,0,10,20],['Equity IRR',0.084,0.136,0.184,0.228,0.269]]),'Sensitivity');
  await uploadExport(new File([XLSX.write(wb,{type:'array',bookType:'xlsx'})],'AlNarjis v4.xlsx'));$('#dbgWin').classList.remove('on');showTab('scen');renderAll();return getComputedStyle($('#emResCard')).display});
t(card1!=='none','a model with a sensitivity table: the EstateMaster results card appears');
t(!errs.length,'no page errors '+errs.join('; '));console.log(ok.join('\n'));console.log('t_dbgwin:',ok.filter(x=>x.startsWith('PASS')).length+'/'+ok.length);await b.close();
