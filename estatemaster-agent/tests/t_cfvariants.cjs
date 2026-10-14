const X=require(__dirname+'/fixtures/package/dist/xlsx.full.min.js'),EM=require(__dirname+'/../api/_lib/emcheck.js'),fs=require('fs');const T=JSON.parse(fs.readFileSync(__dirname+'/fixtures/cfref/var_truth.json'));let pass=0,fail=0;
for(const [n,tr] of Object.entries(T)){const x=EM.parseWorkbook(X.read(fs.readFileSync(__dirname+`/fixtures/cfref/var_${n}.xlsx`),{type:'buffer'}),X,n+'.xlsx'),M=EM.cfModel(x);
  if(!M.ok||!M.levOk){fail++;console.log(`FAIL | ${n}: not proved · need ${JSON.stringify(M.need)} · ${JSON.stringify(M.notes)} · fit ${JSON.stringify(M.fundFit&&{mode:M.fundFit.mode,err:M.fundFit.err,irr:M.fundFit.irr})} · cf ${x.cf&&x.cf.freq+'/'+x.cf.n}`);continue}
  let worst=0;for(const [k,t] of Object.entries(tr)){const r=EM.cfRun(M,t.d);worst=Math.max(worst,Math.abs(r.lirr-t.lirr),Math.abs(r.uirr-t.uirr))}
  const good=worst<0.01;good?pass++:fail++;console.log(`${good?'PASS':'FAIL'} | ${n}: base proved (${M.conv}, ${M.fundFit.mode}), every change within ${worst.toFixed(5)} pts of the truth`)}
console.log(`t_cfvariants: ${pass} pass, ${fail} fail`);
