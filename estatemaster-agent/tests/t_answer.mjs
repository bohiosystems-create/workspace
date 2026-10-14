import {chromium} from 'playwright';import fs from 'fs';
const sp=new URL('./fixtures/',import.meta.url).pathname;
const b=await chromium.launch({executablePath:process.env.PW_CHROMIUM||undefined});const p=await b.newPage({viewport:{width:1300,height:900}});const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.route('https://cdnjs.cloudflare.com/**',r=>r.fulfill({status:200,contentType:'application/javascript',body:fs.readFileSync(sp+'package/dist/xlsx.full.min.js')}));
await p.goto('http://localhost:4090/?mode=readonly');await p.waitForTimeout(2500);
let pass=0,fail=0;const ok=(c,m)=>{c?pass++:fail++;console.log(c?'PASS':'FAIL',m)};
// a project created from an export has no location: the prompt says so and the welcome asks for it
await p.evaluate(async()=>{await loadXLSX();const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([['Summary'],['Equity IRR',null,'%',22.1],['Net Development Profit',null,'SAR',90e6],['Total Development Cost',null,'SAR',400e6]]),'Summary');
  const f=new File([XLSX.write(wb,{type:'array',bookType:'xlsx'})],'tower.xlsx');const pr=await readExportFile(f);const id=newProjectFromExport(pr,'tower.xlsx','Test Tower');switchProject?switchProject(id):(PROJ=PROJECTS[id]);});
await p.waitForTimeout(600);
const sys=await p.evaluate(()=>sysPrompt('web','Investment Director'));
ok(/Location: NOT KNOWN/.test(sys)&&/set_location/.test(sys),'system prompt: location unknown, ask and record with set_location');
ok(/Answer format/.test(sys)&&/\*\*Checked against\*\*/.test(sys)&&/extra cost, the extra revenue/.test(sys),'system prompt: textual answer, bold titles + bullets, estimates of extra cost and revenue, market + regulation check');
await p.evaluate(()=>{toggleDock(true);askAboutExport(PROJ,latestExport())});await p.waitForTimeout(200);
ok(/Where exactly is the project\?/.test(await p.locator('#msgs .msg.agent').last().textContent()),'welcome after upload asks for the location');
// set_location through the tool handler
const note=await p.evaluate(async()=>{const o=await handle('','web','Investment Director',toolIntent('set_location',{district:'Al Narjis',city:'Riyadh',plot:'NRJ-0417'}));return o.plain});
ok(/Location recorded/.test(note)&&(await p.evaluate(()=>PROJ.loc&&PROJ.loc.district))==='Al Narjis','set_location records it on the project');
ok(/Al Narjis, Riyadh \(plot NRJ-0417\), confirmed by the user/.test(await p.evaluate(()=>sysPrompt('web','Investment Director'))),'prompt then carries the location and the standing check rule');
// the loop never ends on a tool call: a closing call with no tools writes the answer
const fin=await p.evaluate(async()=>{let calls=0;window.callOne=async(pr,model,sys,msgs,withTools)=>{calls++;if(withTools)return{calls:[{name:'estatemaster_results',args:{}}],raw:{role:'assistant',content:'x'},text:''};return{calls:[],text:'**Answer**\nAdding a floor adds about SAR 9M of cost.\n- Extra revenue: SAR 14M ⟦calc: 1,200 sqm × 11,700⟧\n**Checked against**\n- FAR 3.1 vs 3.0 max: not compliant',raw:null}};AI.keys.anthropic='sk-test';AI.keys.openai='';const r=await llmTurn('add a floor','web','Investment Director',async()=>{},'deep');return{final:r.final,calls}});
ok(/Adding a floor adds/.test(fin.final)&&fin.calls===(chainLen=>chainLen)(fin.calls)&&fin.calls>=11,'after the tool rounds run out, a no-tools call writes the textual answer ('+fin.calls+' calls)');
await p.evaluate(()=>addMsg('agent',mdLite('**Answer**\nAdding a floor adds about SAR 9M of cost.\n**Estimates**\n- Extra revenue: SAR 14M\n- Extra cost: SAR 9M\n**Checked against**\n- FAR 3.1 vs 3.0 max: not compliant')));
const last=p.locator('#msgs .msg.agent').last();ok(await last.locator('.ttl').count()===3&&await last.locator('.bul').count()===3,'bold titles and boxed bullets rendered');
await last.screenshot({path:sp+'answer_fmt.png'});
console.log('errors',errs);console.log(`${pass} pass, ${fail} fail`);await b.close();
