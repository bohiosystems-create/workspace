// Feasibility study page (replaces Checks): the model's figures; the drivers picked by the AI; each driver's break-even and
// the residual land value solved exactly on the workbook; the study written by Claude and checked by a second model.
// The Feasibility study report template carries it, in the document and in Play mode.
import {chromium} from 'playwright';import fs from 'fs';
const sp=new globalThis.URL('./fixtures/',import.meta.url).pathname;
const b=await chromium.launch({executablePath:process.env.PW_CHROMIUM||undefined});const cx=await b.newContext({viewport:{width:1500,height:950}});const p=await cx.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));
await cx.route('https://cdnjs.cloudflare.com/**',r=>r.fulfill({status:200,contentType:'application/javascript',body:fs.readFileSync(sp+'package/dist/xlsx.full.min.js')}));
await cx.route(/hyperformula/,r=>r.fulfill({status:200,contentType:'application/javascript',body:fs.readFileSync(sp+'package/hyperformula.full.min.js')}));
await p.goto(process.argv[2]||'http://localhost:4090/?mode=readonly');await p.evaluate(()=>localStorage.clear());await p.reload();await p.waitForTimeout(1500);
const ok=[];const t=(c,m)=>ok.push((c?'PASS':'FAIL')+' | '+m);
await p.evaluate(()=>openNewProject());await p.setInputFiles('#npFile',sp+'models/resi_uk.xlsx');await p.waitForTimeout(1200);await p.click('#npCreate');await p.waitForTimeout(3000);
const menu=await p.evaluate(()=>[...document.querySelectorAll('#emMenu .emm-it b')].map(e=>e.textContent).join('|'));t(menu==='Upload|Live drivers|Feasibility|Assumptions|Compare','Financial modelling menu: Feasibility replaces Checks: '+menu);
// simulated AI: the drivers, the study, the check
await p.evaluate(()=>{AI.keys.anthropic='sk-a';AI.keys.openai='sk-o';window.__calls=[];window.callOne=async(pr,model,sys,msgs)=>{__calls.push([pr,model,sys.slice(0,40)]);const u=msgs[0].content;
  if(/most drive its feasibility/.test(sys))return{text:JSON.stringify({drivers:['Sales price (£/sqm)','Build cost (£/sqm GIA)','Land cost','Interest rate'],land:'Land cost'})};
  if(/writing a feasibility study/.test(sys))return{text:'**Costs**\n- Total development cost GBP 68.00M, of which land GBP 25.00M and the build at GBP 2,800 per sqm across 12,000 sqm.\n'+(msgs.length>1?'**The scheme**\n- Riverside Gardens, 10,200 sqm for sale.\n**Returns**\n- Levered IRR 25.13%, net profit GBP 18.70M.\n**Break-even and headroom**\n- The sales price can fall 21.56% before a loss.\n**Recommendation**\n- No hurdle is set, so no pass or fail; set one to decide.':'**The scheme**\n- Riverside Gardens.\n**Returns**\n- Levered IRR 30%.\n**Recommendation**\n- Proceed.')};
  if(/You check a feasibility study/.test(sys))return{text:JSON.stringify({ok:false,issues:[{text:'Levered IRR 30%',problem:'the model gives 25.13%'}]})};return{text:'{}'}};
  toggleDock(false);showTab('em');emSection('feas')});
await p.click('#fsRun');await p.waitForFunction(()=>!(FEAS[PROJ.id]||{}).busy&&(FEAS[PROJ.id]||{}).at,null,{timeout:120000});await p.waitForTimeout(300);
const F=await p.evaluate(()=>{const F=FEAS[PROJ.id];return{be:F.be.map(z=>({l:z.lab||z.label,ok:z.ok,from:z.from,to:z.to,shift:z.shift,got:z.got})),land:F.land,res:F.res,study:F.study&&{by:F.study.by,checked:F.study.checked,n:F.study.issues.length,text:F.study.text},writer:__calls.filter(c=>/writing/.test(c[2])).map(c=>c[0])}});
t(F.be.length===4&&F.be.filter(z=>z.ok).length>=3&&F.be.every(z=>!z.ok||Math.abs(z.got)<1),'each driver solved for a zero net profit on the workbook: '+JSON.stringify(F.be).slice(0,400));
const sp0=F.be.find(z=>/Sales price/.test(z.l));t(sp0&&/^−/.test(sp0.shift),'the sales price can fall before a loss: '+JSON.stringify(sp0));
t(F.res===null||F.res===undefined,'no residual land value without a target: never assumed');
t(F.study&&F.study.n===1&&!/30%/.test(F.study.text)&&/25\.13%/.test(F.study.text)&&F.writer.every(w=>w==='anthropic'),'Claude writes the study; the second model finds the wrong figure and Claude corrects it: '+JSON.stringify(F.study).slice(0,250));
// residual land value with a target the user gives
await p.fill('#fsTgt','20');await p.click('.fs-res button');await p.waitForFunction(()=>(FEAS[PROJ.id]||{}).res&&!(FEAS[PROJ.id]||{}).busy,null,{timeout:60000});
const R=await p.evaluate(()=>FEAS[PROJ.id].res);t(R.ok&&Math.abs(R.got-20)<0.05&&/Land/.test(R.lab)&&await p.evaluate(()=>/the land can cost GBP 28\.75M/.test($('#fsBody').textContent)),'residual land value for a 20% profit on cost, solved exactly: '+JSON.stringify({to:R.to,from:R.from,got:R.got}));
const page=await p.evaluate(()=>$('#fsBody').textContent);t(/Break-even/.test(page)&&/Residual land value/.test(page)&&/What AI adds to feasibility studies/.test(page)&&/checked by/.test(page),'the page shows the break-even, the residual, the study and the AI proposal');
await p.locator('#p-em .emsec.on').screenshot({path:sp+'feas.png'});
// the report template
const rp=await p.evaluate(()=>{showTab('report');RSEL='feasibility';renderReport();const d=$('#report').textContent;const deck=buildDeck('feasibility');return{has:!!RPTS.feasibility,doc:/Break-even of each driver/.test(d)&&/Residual land value/.test(d)&&/Feasibility study/.test(d)&&/21\.\d+%|−2\d\.\d+%/.test(d),narjis:/687|SAR/.test(d),kinds:deck.slides.map(s=>s.kind+':'+(s.kicker||'')).join(' | ')}});
t(rp.has&&rp.doc&&!rp.narjis,'the Feasibility study report carries the break-even, the residual and the study, with this model’s figures only');
t(/Feasibility · break-even/.test(rp.kinds)&&/Feasibility · residual/.test(rp.kinds)&&/Feasibility study/.test(rp.kinds),'Play mode has the feasibility slides: '+rp.kinds.slice(0,300));
const tpl=await p.evaluate(()=>{openRpWin('rtModal');return !!document.querySelector('#rtModal [data-rp="feasibility"]')});t(tpl,'the template is in Report templates');
t(!errs.length,'no page errors '+errs.join(';'));console.log(ok.join('\n'));await b.close();
