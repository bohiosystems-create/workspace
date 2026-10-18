// The functions the app calls "verified against Excel" (XC_VERIFIED in index.html) must each be used by a test model that the
// perturbation sweep (tools/sweep) recalculates against LibreOffice: a name nobody tests is not verified.
const fs=require('fs'),path=require('path');
const app=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
const m=app.match(/const XC_VERIFIED=new Set\('([^']+)'\.split/);if(!m){console.log('FAIL XC_VERIFIED not found');process.exit(1)}
const verified=m[1].split(' ');const dir=path.join(__dirname,'fixtures','models');const skip=JSON.parse(fs.readFileSync(path.join(__dirname,'..','tools','sweep','skip.json'),'utf8'));
const XLSX=require('../vendor/xlsx-0.18.5.full.min.js');const used=new Set();
for(const f of fs.readdirSync(dir).filter(f=>/\.xlsx$/.test(f)&&typeof skip[f]!=='string')){const wb=XLSX.read(fs.readFileSync(path.join(dir,f)),{cellFormula:true});for(const ws of Object.values(wb.Sheets))for(const [k,c] of Object.entries(ws)){if(k[0]==='!'||!c||!c.f)continue;const t=String(c.f).replace(/"(?:[^"]|"")*"/g,'');for(const n of t.matchAll(/([A-Za-z_][A-Za-z0-9_.]*)\(/g))used.add(n[1].toUpperCase().replace(/^_XLFN\.|^_XLWS\./,''))}}
const missing=verified.filter(v=>!used.has(v)&&!['TRUE','FALSE'].includes(v));
console.log(missing.length?`FAIL verified but used by no swept test model: ${missing.join(', ')}`:`PASS every one of ${verified.length} verified functions is used by a swept test model`);
const unlisted=[...used].filter(u=>!verified.includes(u)&&!/^X?OFF|^TXT$/.test(u)).sort();if(unlisted.length)console.log('note: used by test models but not listed as verified: '+unlisted.join(', '));
process.exit(missing.length?1:0);
