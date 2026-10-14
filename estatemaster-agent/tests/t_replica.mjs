// Deterministic third check: the agent's cash-flow replica benchmarks every AI estimate on projects with a calibrated replica.
import {chromium} from 'playwright';
const b=await chromium.launch({executablePath:process.env.PW_CHROMIUM||undefined});const p=await b.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.goto(process.argv[2]||'http://localhost:4090/?mode=readonly');await p.evaluate(()=>localStorage.clear());await p.reload();await p.waitForTimeout(1500);
const r=await p.evaluate(()=>{const x=latestExport(),o=x.out,R={base:o.levered_irr,proj:PROJ.name};
  const probe=(chg,v)=>{const c=calcChecks({x,changes:[chg],metrics:[{k:'levered_irr',value:v}],rounds:[]});return{bench:c.bench.find(z=>z.replica),warn:c.findings.some(f=>f.code==='replica')}};
  const a=probe({text:'sale price −10%'},o.levered_irr);R.est=a.bench&&+a.bench.value.toFixed(2);
  R.okNear=!probe({text:'sale price −10%'},R.est+0.5).warn;R.farFlag=probe({text:'sale price −10%'},R.est+6).warn;
  const l=probe({label:'Sale price',from:'SAR 13,500/sqm',to:'SAR 12,150/sqm'},R.est);R.line=l.bench&&+l.bench.value.toFixed(2);
  R.cost=(probe({text:'construction cost +10%'},o.levered_irr).bench||{}).value;
  PROJ.fromExport=true;{const bb=probe({text:'sale price −10%'},R.est+6).bench;R.offForExport=!bb||/built from export|APPROXIMATE|own cash flow/.test(bb.table)}PROJ.fromExport=false;return R});
const ok=[];const t=(c,m)=>ok.push((c?'PASS':'FAIL')+' | '+m);
t(Number.isFinite(r.est)&&r.est<r.base,'replica benchmark for sale price −10%: '+r.base+'% → '+r.est+'%');t(r.okNear,'an AI figure close to the replica passes');t(r.farFlag,'an AI figure 6 pts off the replica is flagged for checking');
t(Number.isFinite(r.line)&&Math.abs(r.line-r.est)<0.3,'a per-line test (13,500 → 12,150 SAR/sqm) gets the same benchmark ('+r.line+'%)');t(Number.isFinite(r.cost)&&r.cost<r.base,'construction cost +10% lowers the IRR in the replica ('+(r.cost||0).toFixed(2)+'%)');
t(r.offForExport,'a project created from an export never gets the demo replica: its benchmark comes from its own calibrated cash flow');t(!errs.length,'no page errors '+errs.join('; '));
console.log(ok.join('\n'));console.log('t_replica:',ok.filter(x=>x.startsWith('PASS')).length+'/'+ok.length);await b.close();
