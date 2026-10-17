// Perturbation sweep, app side: for each test model, the app's engine recalculates the workbook with each typed input moved
// (+10%, −15%, and several together) and reads every result the app reports (headline figures and the results tables).
// Writes one job per model for lo_ref.py to redo independently in LibreOffice. Usage: node app.mjs <base url> <out dir> [model…]
import fs from 'fs';import path from 'path';import {createRequire} from 'module';
const here=path.dirname(new URL(import.meta.url).pathname),fx=path.resolve(here,'../../tests/fixtures/models');
// playwright is installed with the tests (tests/node_modules)
const {chromium}=createRequire(path.resolve(here,'../../tests/package.json'))('playwright');
const [,,url,outDir,...only]=process.argv;fs.mkdirSync(outDir,{recursive:true});
const skip=JSON.parse(fs.readFileSync(path.join(here,'skip.json'),'utf8'));
const models=(only.length?only:fs.readdirSync(fx).filter(f=>/\.xlsx?m?$/.test(f))).filter(m=>!skip[m]);
const b=await chromium.launch({executablePath:process.env.PW_CHROMIUM||undefined});
for(const model of models){const p=await b.newPage();
  await p.route(/cdn\.jsdelivr|unpkg|cdnjs/,r=>r.abort());   // the engine's libraries come from vendor/
  await p.route('**/api/llm',r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({providers:{anthropic:false,openai:false}})}));
  try{await p.goto(url);await p.evaluate(()=>localStorage.clear());await p.reload();await p.waitForTimeout(1200);
    await p.evaluate(()=>openNewProject());await p.setInputFiles('#npFile',path.join(fx,model));await p.waitForTimeout(1200);await p.click('#npCreate');await p.waitForTimeout(2500);
    const r=await p.evaluate(async()=>{const x=latestExport();const e=await xcEngine(x);if(!e||!e.ok)return{err:'engine not trusted: '+JSON.stringify({pct:e&&e.pct,unsup:e&&e.unsup})};
      await xcCacheMore(x);const C=x.cells||{};const keys=Object.keys(C).filter(k=>C[k]),reads=keys.map(k=>C[k]);
      for(const m of (x.more||[]))if(typeof m.v==='number'&&!reads.includes(m.ref)&&reads.length<60){keys.push('more:'+m.label);reads.push(m.ref)}
      // typed inputs, spread over the model's sheets: every k-th one, at most 10
      const ins=(x.inputs||[]).filter(i=>i.cell&&Number.isFinite(i.value)&&i.value!==0&&!i.isDate);const typed=[];
      for(const i of ins){const [t]=await xcQ(()=>xcCall({op:'typed',refs:[i.cell]}));if(!t)continue;const [v]=await xcQ(()=>xcCall({op:'get',refs:[i.cell]}));if(typeof v==='number'&&v!==0)typed.push({label:i.label,cell:i.cell,v})}
      const st=Math.max(1,Math.floor(typed.length/10)),pick=typed.filter((_,j)=>j%st===0).slice(0,10);
      const sc=[{name:'base',sets:[]}];for(const q of pick){sc.push({name:q.label+' +10%',sets:[[q.cell,q.v*1.1]]});sc.push({name:q.label+' −15%',sets:[[q.cell,q.v*0.85]]})}
      if(pick.length>=3)sc.push({name:'several together',sets:pick.filter((_,j)=>j%2===0).map(q=>[q.cell,q.v*1.07])});
      const app=[];for(const s of sc){const [v]=await xcQ(()=>xcCall({op:'run',runs:[s.sets],read:reads}));app.push(v.map(z=>typeof z==='number'&&Number.isFinite(z)?z:null))}
      return{keys,reads,scenarios:sc,app,circ:(e.iter||0)>0}});
    fs.writeFileSync(path.join(outDir,model+'.json'),JSON.stringify({file:path.join(fx,model),...r}));console.log(model,r.err||`${r.scenarios.length} scenarios × ${r.keys.length} results`)}
  catch(e){console.log(model,'ERROR',e.message.slice(0,200));fs.writeFileSync(path.join(outDir,model+'.json'),JSON.stringify({file:path.join(fx,model),err:e.message.slice(0,300)}))}
  await p.close()}
await b.close();
