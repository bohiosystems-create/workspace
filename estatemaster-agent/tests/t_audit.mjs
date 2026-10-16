import {chromium} from 'playwright';import fs from 'fs';
const sp=new globalThis.URL('./fixtures/',import.meta.url).pathname;
const b=await chromium.launch({executablePath:process.env.PW_CHROMIUM||undefined});const p=await b.newPage({viewport:{width:1300,height:950}});const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.route('https://cdnjs.cloudflare.com/**',r=>r.fulfill({status:200,contentType:'application/javascript',body:fs.readFileSync(sp+'package/dist/xlsx.full.min.js')}));
await p.goto('http://localhost:4090/?mode=readonly');await p.waitForTimeout(2500);
let pass=0,fail=0;const ok=(c,m)=>{c?pass++:fail++;console.log(c?'PASS':'FAIL',m)};
await p.evaluate(()=>{AI.keys.anthropic='sk-test';AI.keys.openai='sk-test';window.calcPair=()=>[{p:'anthropic',model:'claude-opus-5-5'},{p:'openai',model:'gpt-5'}];
  window.callOne=(pr,model)=>new Promise(r=>setTimeout(()=>r({text:JSON.stringify({read_ok:true,read_note:'Summary and Input sheets read; equity multiple is not in the export.',items:[
    {kind:'bug',severity:'high',title:'Peak debt exceeds total development cost',evidence:'Peak debt 600M vs total cost 557M (Summary)',cell:'Summary!D7',recommendation:'Check the loan drawdown schedule and the LTC cap.'},
    {kind:'risk',severity:'medium',title:pr==='anthropic'?'Sale price above the Riyadh range':'Sale price is aggressive for Riyadh',evidence:'13,500 SAR/sqm vs 9,000–16,000',cell:'Input!B2',recommendation:'Run a 10% price downside.'}]}),usage:{}}),3500));
  showTab('em');emSection('upload')});
await p.evaluate(async()=>{await loadXLSX();const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([['Summary'],['Equity IRR',null,'%',26.8],['Development Margin (on cost)',null,'%',23.3],['Net Development Profit',null,'SAR',130e6],['Total Development Cost',null,'SAR',557e6],['Total Revenue',null,'SAR',687e6],['Peak Debt',null,'SAR',600e6]]),'Summary');XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([['MAIN INPUTS'],['Sale price',13500,'SAR/sqm'],['Construction cost',4200,'SAR/sqm'],['Contingency',0.05,'%']]),'Input');
  uploadExport(new File([XLSX.write(wb,{type:'array',bookType:'xlsx'})],'audit.xlsx'))});
await p.waitForTimeout(700);
ok(await p.locator('#exAudit [data-auclock]').count()===1,'timer shown in the upload section while reviewing');
const c1=await p.locator('#exAudit [data-auclock]').textContent();{const st=await p.locator('#exAudit [data-aunow]').textContent();ok(/read|reading|locat|model|review/i.test(st),'step text names the AI stage: '+st.slice(0,80))}
await p.waitForTimeout(1100);const c2=await p.locator('#exAudit [data-auclock]').textContent();ok(c1!==c2,`clock runs (${c1} → ${c2})`);
await p.evaluate(()=>showTab('appr'));await p.waitForTimeout(200);
ok(await p.locator('#auditFeed [data-auclock]').count()>=1,'feed card shows the running clock too');
await p.locator('#auditFeed').screenshot({path:sp+'audit_running.png'});
await p.waitForFunction(()=>{const a=EXPORTS.slice(-1)[0].audit;return a&&a.status==='done'},null,{timeout:180000}).catch(()=>{});
ok(await p.evaluate(()=>EXPORTS.slice(-1)[0].audit.status)==='done','review finished');
await p.evaluate(()=>{FEED_OPEN.add('audit');renderApprovals()});await p.waitForTimeout(200);
const body=await p.locator('#auBody').textContent();
ok(/Read: 2 sheets/.test(body)&&/6 of 8 outputs/.test(body)&&/not found: Unlevered IRR, Equity multiple/.test(body),'what was read is reported, missing outputs named');
ok(/Peak debt SAR 600M is above total development cost/.test(body),'deterministic check listed');
ok(/Found independently by|Flagged by both/.test(body)&&(body.match(/Sale price/g)||[]).length>=1&&!/aggressive for Riyadh/.test(body),'the two models\' findings merged, duplicate collapsed');
ok(/likely bug/.test(body)&&/risk/.test(body)&&/Summary!D7/.test(body),'bug and risk kinds, with the cell');
ok(/reviewed .* in \d:\d\d/.test(body),'elapsed time shown');
ok(/serious/.test(await p.locator('#auRowMeta').textContent()),'row pill counts serious findings');
await p.locator('#auditFeed').screenshot({path:sp+'audit_done.png'});
ok(/Open in the Daily feed/.test(await p.evaluate(()=>{showTab('em');emSection('upload');return $('#exAudit').textContent})),'upload section links to the feed');
await p.reload();await p.waitForTimeout(2000);
ok(await p.evaluate(()=>{const x=EXPORTS.slice(-1)[0];return x.audit&&x.audit.status==='done'&&x.audit.ai.items.length===2}),'review survives a reload');
console.log('errors',errs);console.log(`${pass} pass, ${fail} fail`);await b.close();
