// Uploaded models never borrow the demo replica: chat what-if estimates and local stress tests use their own calibrated cash flow.
import {chromium} from 'playwright';import fs from 'fs';
const sp=new globalThis.URL('./fixtures/',import.meta.url).pathname;
const b=await chromium.launch({executablePath:process.env.PW_CHROMIUM||undefined});const p=await b.newPage({viewport:{width:1500,height:950}});const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.route('https://cdnjs.cloudflare.com/**',r=>r.fulfill({status:200,contentType:'application/javascript',body:fs.readFileSync(sp+'package/dist/xlsx.full.min.js')}));
await p.route('https://fonts.googleapis.com/**',r=>r.fulfill({status:200,contentType:'text/css',body:''}));
await p.goto(process.argv[2]||'http://localhost:4090/?mode=readonly');await p.evaluate(()=>localStorage.clear());await p.reload();await p.waitForTimeout(1500);
const ok=[];const t=(c,m)=>ok.push((c?'PASS':'FAIL')+' | '+m);
await p.evaluate(async()=>{await loadXLSX();const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([['Cash Flow Title','Rabwa Towers'],['Land Purchase Price',90000000],['Loan 1 interest rate',0.07]]),'Input');
  XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([['Equity IRR (geared)',0.18],['Project IRR (ungeared)',0.14],['Development Margin',0.20],['Net Development Profit',100000000],['Total Development Cost',500000000],['Gross Sales Revenue',600000000],['Peak Debt',300000000]]),'Summary');
  await uploadExport(new File([XLSX.write(wb,{type:'array',bookType:'xlsx'})],'Rabwa Towers.xlsx'));await new Promise(r=>setTimeout(r,500));try{$('#dbgWin').classList.remove('on')}catch(e){}});
const est=await p.evaluate(async()=>{CLARIFY=null;const r=await handle('what if sale price drops 10%','web','director');return (r.html||r.text||'').replace(/<[^>]+>/g,' ')});
t(/not computed/i.test(est)&&/Rabwa Towers/.test(est)&&!/26\.8/.test(est),'chat what-if on a values-only upload: not computed, says what to upload, nothing from the demo model: '+est.replace(/\s+/g,' ').slice(0,260));
const st=await p.evaluate(()=>{const s=stressToday();return{note:s.note,rows:s.rows.map(r=>[r.name,r.irr,r.poc])}});
t(/calibrated/.test(st.note)&&st.rows.length>0&&st.rows.every(r=>!Number.isFinite(r[1])||r[1]<18.01),'local stress tests use the model’s own calibrated cash flow, every scenario at or below the 18% base: '+JSON.stringify(st.rows.slice(0,4)));
t(!st.rows.some(r=>/^Exit cap/i.test(r[0])&&!/without/.test(r[0])),'scenarios the cash flow cannot model are left out, never shown as unchanged');
t(!errs.length,'no page errors '+errs.join('; '));console.log(ok.join('\n'));console.log('t_genuse:',ok.filter(x=>x.startsWith('PASS')).length+'/'+ok.length);await b.close();
