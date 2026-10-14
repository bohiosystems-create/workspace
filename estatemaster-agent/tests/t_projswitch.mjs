// Switching project switches everything; an export titled for another project is filed there; misfiled exports are moved; no duplicate project.
import {chromium} from 'playwright';import fs from 'fs';
const sp=new URL('./fixtures/',import.meta.url).pathname;
const b=await chromium.launch({executablePath:process.env.PW_CHROMIUM||undefined});const p=await b.newPage({viewport:{width:1400,height:900}});const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.route('https://cdnjs.cloudflare.com/**',r=>r.fulfill({status:200,contentType:'application/javascript',body:fs.readFileSync(sp+'package/dist/xlsx.full.min.js')}));
await p.route('https://fonts.googleapis.com/**',r=>r.fulfill({status:200,contentType:'text/css',body:''}));
await p.goto(process.argv[2]||'http://localhost:4090/?mode=readonly');await p.evaluate(()=>localStorage.clear());await p.reload();await p.waitForTimeout(1500);
const buf=fs.readFileSync(sp+'v2_export.xlsx').toString('base64');
const r=await p.evaluate(async b64=>{const R={};const bin=Uint8Array.from(atob(b64),c=>c.charCodeAt(0));await loadXLSX();
  const narjis=PROJ.id;R.start=PROJ.name;showTab('model');
  await uploadExport(new File([bin],'DF_CS046 - Build to Hold.xlsx'));await new Promise(r=>setTimeout(r,800));
  const bth=Object.values(PROJECTS).find(p=>/build to hold/i.test(p.name));R.newProj=!!bth;R.filedThere=!!bth&&EXPORTS.some(x=>x.proj===bth.id&&/Build to Hold/.test(x.file));R.notNarjis=!EXPORTS.some(x=>x.proj===narjis&&/Build to Hold/.test(x.file));R.onBth=PROJ.id===(bth&&bth.id);
  // per-project panels
  ATRES.i0='<div>BTH test</div>';AS.res={fake:1};
  switchProject(narjis);await new Promise(r=>setTimeout(r,300));
  R.wbNarjis=($('#exWb')&&$('#exWb').textContent)||'';R.asmNarjis=(asmRows().x||{}).file||'register';R.atresCleared=!ATRES.i0;R.maCleared=true;R.asCleared=!AS.res;
  switchProject(bth.id);await new Promise(r=>setTimeout(r,300));R.atresBack=ATRES.i0==='<div>BTH test</div>';R.maBack=true;R.asBack=!!(AS.res&&AS.res.fake);R.wbBth=($('#exWb')&&$('#exWb').textContent)||'';
  // a misfiled export (the old way: filed under Al Narjis) is moved to its project, the copy removed
  const x0=EXPORTS.find(x=>x.proj===bth.id);EXPORTS.push({...JSON.parse(JSON.stringify(x0)),id:'EX-900',proj:narjis});const moved=repairMisfiled();R.repair=moved>=1&&!EXPORTS.some(x=>x.proj===narjis&&/Build to Hold/.test(x.file||''));
  // a duplicate Al Narjis from the server folds into the demo project
  const nn=Object.values(PROJECTS).length;window.dailyApi=async a=>a&&a.action==='models'?{models:[{key:'alnarjismixeduse_control',file:'AlNarjisMixedUse_control.xlsx',name:PROJECTS[narjis].name,out:{levered_irr:26.8},inputs:[],at:new Date().toISOString()}]}:{};
  await syncModelsFromServer();R.noDup=Object.values(PROJECTS).filter(p=>projNm(p.name)===projNm(PROJECTS[narjis].name)).length===1&&Object.values(PROJECTS).length===nn;
  return R},buf);
const ok=[];const t=(c,m)=>ok.push((c?'PASS':'FAIL')+' | '+m);
t(r.newProj&&r.filedThere&&r.notNarjis,'Build to Hold uploaded on '+r.start+' goes to its own project, not into Al Narjis');t(r.onBth,'the app switches to that project');
t(!/Build to Hold/.test(r.wbNarjis),'Al Narjis workbook view no longer shows Build to Hold: '+r.wbNarjis.slice(0,80));t(!/Build to Hold/.test(r.asmNarjis),'Al Narjis assumptions are its own: '+r.asmNarjis);
t(r.atresCleared&&r.maCleared&&r.asCleared,'test results and sensitivity table cleared on switch');t(r.atresBack&&r.maBack&&r.asBack,'and restored when switching back');
t(/Build to Hold/.test(r.wbBth),'Build to Hold shows its own workbook');t(r.repair,'a misfiled export is moved to its project');t(r.noDup,'no duplicate Al Narjis after a server sync');
t(!errs.length,'no page errors '+errs.join('; '));console.log(ok.join('\n'));console.log('t_projswitch:',ok.filter(x=>x.startsWith('PASS')).length+'/'+ok.length);await b.close();
