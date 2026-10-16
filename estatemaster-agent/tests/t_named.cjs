// The formula engine on a model built like a developer's own: named ranges (global, scoped to a sheet, one with a "?" as Excel allows),
// returns read through OFFSET windows whose width comes from a named month count (XIRR(OFFSET(..),OFFSET(..)), SUM(OFFSET(..)), an
// INDEX anchor, OFFSET's empty arguments). The engine must reproduce the stored results and move the windows when the timeline changes.
// Reference figures: LibreOffice's own recalculation of the same workbook (fixtures/models/named_offset.xlsx).
const fs=require('fs'),path=require('path');const APP=path.join(__dirname,'..');
const html=fs.readFileSync(path.join(APP,'index.html'),'utf8');const i=html.indexOf('function xcWorker(');let d=0,j=html.indexOf('{',i);for(let k=j;k<html.length;k++){if(html[k]==='{')d++;else if(html[k]==='}'){d--;if(!d){j=k+1;break}}}
globalThis.self=globalThis;globalThis.importScripts=u=>{if(/hyperformula/.test(u))globalThis.HyperFormula=require(path.join(APP,'vendor/hyperformula-3.5.0.full.min.js'));else globalThis.XLSX=require(path.join(APP,'vendor/xlsx-0.18.5.full.min.js'))};
let last=null;globalThis.postMessage=m=>{last=m};(0,eval)(html.slice(i,j));xcWorker();
const send=m=>{last=null;self.onmessage({data:{id:1,...m}});if(last&&last.error)throw new Error(last.error);return last&&last.r};
let pass=0,fail=0;const ok=(c,m)=>{console.log((c?'PASS':'FAIL')+' | '+m);c?pass++:fail++};
const near=(a,b,t)=>typeof a==='number'&&Math.abs(a-b)<=t*Math.max(1,Math.abs(b));
const r=send({op:'load',buf:new Uint8Array(fs.readFileSync(path.join(__dirname,'fixtures/models/named_offset.xlsx'))),urls:{hf:['hyperformula'],xlsx:['xlsx']},refs:['Returns!B2','Returns!B3','Returns!B4','Returns!B5']});
ok(r.tot>0&&r.match===r.tot,`the engine reproduces every stored result (${r.match} of ${r.tot})`);
ok(r.names>=9&&!(r.namesSkipped||[]).length,`every named range is loaded, the scoped ones and "Show?" included (${r.names}, skipped: ${(r.namesSkipped||[]).join(', ')||'none'})`);
ok(!(r.outBad||[]).length,'the return cells read as stored: '+JSON.stringify(r.outBad));
const read=['Returns!B1','Returns!B2','Returns!B3','Returns!B4','Returns!B5','Returns!B7'];
const run=sets=>send({op:'run',runs:[sets],read})[0];
let v=run([]);ok(near(v[1],0.394437609243083,1e-9)&&near(v[2],0.394437609243082,1e-9)&&v[3]===2460000&&v[4]===840000&&v[5]===2460000,'base: project and equity IRR 39.44% (XIRR over an OFFSET window), net profit 2,460,000, rent in hold 840,000: '+JSON.stringify(v));
// a longer hold moves the exit month: every window widens to the new exit
v=run([['Inputs!B6',10]]);ok(v[0]===14&&near(v[1],0.356354274214436,1e-9)&&near(v[2],0.356354274214436,1e-9)&&v[3]===2700000&&v[4]===1080000,'hold 8 → 10 months: the windows move with the exit (IRR 35.64%, profit 2,700,000, rent 1,080,000), as LibreOffice computes: '+JSON.stringify(v));
// a longer build moves the INDEX anchor of the rent window and the exit
v=run([['Inputs!B4',6]]);ok(v[0]===14&&near(v[1],0.34202079722415,1e-9)&&v[3]===2460000&&v[4]===840000,'build 4 → 6 months: the INDEX-anchored window starts later (IRR 34.20%, rent still 840,000): '+JSON.stringify(v));
v=run([]);ok(near(v[1],0.394437609243083,1e-9),'back to base after the changes');
// a window past the sheet's used cells reads empty cells, as Excel does; a negative shift is a #REF!, never a wrong figure
v=run([['Inputs!B6',40]]);ok(v[3]===-5720000,'a 40-month hold runs past the 24 months modelled: the window reads the empty cells as nothing, as LibreOffice does (net profit −5,720,000): '+v[3]);
v=run([['Inputs!B4',-5]]);ok(!(typeof v[4]==='number'&&v[4]>0&&v[4]!==840000)||v[4]&&v[4].err,'a negative build period gives an error or a plain figure, never a shifted guess: '+JSON.stringify(v[4]));
console.log(`${pass} pass, ${fail} fail`);process.exit(fail?1:0);
