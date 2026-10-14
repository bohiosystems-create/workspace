// Failsafes: a Summary IRR that the cash flow does not reproduce, a funding structure the engine cannot reproduce, a cash flow with no funding lines.
const X=require(__dirname+'/fixtures/package/dist/xlsx.full.min.js'),EM=require(__dirname+'/../api/_lib/emcheck.js'),fs=require('fs');let pass=0,fail=0;const ok=(c,m)=>{c?pass++:fail++;console.log((c?'PASS':'FAIL')+' | '+m)};
const load=f=>EM.parseWorkbook(X.read(fs.readFileSync(__dirname+'/fixtures/cfref/'+f),{type:'buffer'}),X,f);
// 1. the Summary's levered IRR typed over (26% instead of 24.65%)
{const x=load('ref_export.xlsx');x.out.levered_irr=26;const M=EM.cfModel(x);ok(M.ok&&M.uCheck.ok&&M.lCheck&&!M.lCheck.ok&&!M.levOk&&EM.cfRun(M,{price:-10}).lirr===undefined,'a Summary IRR the cash flow does not reproduce: unlevered still exact, levered refused ('+(M.need||[]).join('; ')+')')}
// 2. both IRRs typed over: nothing is computed
{const x=load('ref_export.xlsx');x.out.levered_irr=26;x.out.unlevered_irr=21;const M=EM.cfModel(x);ok(!M.ok&&M.need.length,'neither IRR reproduced: the engine refuses entirely ('+M.need.join('; ')+')')}
// 3. interest paid in cash by the equity (not capitalised): a structure the engine does not reproduce → levered refused, not guessed
{const wb=X.read(fs.readFileSync(__dirname+'/fixtures/cfref/ref_export.xlsx'),{type:'buffer'});const ws=wb.Sheets['Cash Flow'],rows=X.utils.sheet_to_json(ws,{header:1,raw:true});const ri=rows.findIndex(r=>r&&r[0]==='Net Cash Flow to Equity'),ii=rows.findIndex(r=>r&&/Interest/.test(r[0]||''));
  for(let c=2;c<rows[ri].length;c++){const a=X.utils.encode_cell({r:ri,c});const ia=X.utils.encode_cell({r:ii,c});ws[a]={t:'n',v:(ws[a]?ws[a].v:0)-(ws[ia]?ws[ia].v*0.5:0)}}
  const x=EM.parseWorkbook(wb,X,'odd.xlsx');const M=EM.cfModel(x);ok(M.ok&&!M.levOk,'equity flows no simple structure reproduces: unlevered exact, levered not computed ('+(M.need||[]).join('; ')+')')}
// 4. no funding lines at all: unlevered exact, levered asked for
{const wb=X.read(fs.readFileSync(__dirname+'/fixtures/cfref/ref_export.xlsx'),{type:'buffer'});const ws=wb.Sheets['Cash Flow'],rows=X.utils.sheet_to_json(ws,{header:1,raw:true});rows.forEach((r,ri)=>{if(r&&/Equity|Loan|FUNDING/.test(r[0]||''))for(let c=0;c<r.length;c++)delete ws[X.utils.encode_cell({r:ri,c})]});
  const x=EM.parseWorkbook(wb,X,'nofund.xlsx');const M=EM.cfModel(x);ok(M.ok&&!M.levOk&&M.need.some(n=>/equity cash flow/.test(n)),'no funding lines: unlevered exact, levered asked for ('+(M.need||[]).join('; ')+')')}
console.log(`t_cffailsafe: ${pass} pass, ${fail} fail`);
