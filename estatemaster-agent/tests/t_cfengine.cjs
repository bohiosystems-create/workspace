// The cash-flow IRR engine against an independent reference model: base proved, every change computed exactly.
const X=require(__dirname+'/fixtures/package/dist/xlsx.full.min.js'),EM=require(__dirname+'/../api/_lib/emcheck.js'),fs=require('fs');
const wb=X.read(fs.readFileSync(__dirname+'/fixtures/cfref/ref_export.xlsx'),{type:'buffer'});const x=EM.parseWorkbook(wb,X,'ref_export.xlsx');const T=JSON.parse(fs.readFileSync(__dirname+'/fixtures/cfref/truth.json'));
let pass=0,fail=0;const ok=(c,m)=>{c?pass++:fail++;console.log((c?'PASS':'FAIL')+' | '+m)};
ok(x.cf&&x.cf.freq===12&&x.cf.n===60,'cash flow sheet read: '+(x.cf?`${x.cf.sheet}, ${x.cf.n} monthly periods, ${x.cf.lines.length} lines`:'none'));
const M=EM.cfModel(x);ok(M.ok&&M.uCheck&&M.uCheck.ok&&M.lCheck&&M.lCheck.ok,`base proved: unlevered ${M.uCheck&&M.uCheck.calc.toFixed(4)}% vs EstateMaster ${x.out.unlevered_irr}%, levered ${M.lCheck&&M.lCheck.calc.toFixed(4)}% vs ${x.out.levered_irr}% (${M.conv})`);
ok(M.levOk,'funding structure reproduced: '+JSON.stringify(M.fundFit&&{mode:M.fundFit.mode,E0:M.fundFit.E0,rAnnual:+(M.fundFit.r*12*100).toFixed(4),err:M.fundFit.err}));
console.log('lines',JSON.stringify(M.lines));
for(const [k,t] of Object.entries(T)){if(k==='base')continue;const r=EM.cfRun(M,t.d);const du=Math.abs(r.uirr-t.uirr),dl=Math.abs(r.lirr-t.lirr);ok(du<0.01&&dl<0.01,`${k} ${JSON.stringify(t.d)}: levered ${r.lirr.toFixed(3)}% vs truth ${t.lirr.toFixed(3)}% · unlevered ${r.uirr.toFixed(3)}% vs ${t.uirr.toFixed(3)}%`)}
console.log(`t_cfengine: ${pass} pass, ${fail} fail`);
