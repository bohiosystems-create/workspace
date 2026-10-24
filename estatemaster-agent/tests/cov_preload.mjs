// With COV_OUT set (node --import ./cov_preload.mjs), every browser test records which of the app's own functions it ran (Chromium's
// JS coverage of the page served on 409x) into COV_OUT/<test>.json. touched.py --build folds them into coverage_map.json, which
// `run.sh core` reads to add the tests that run the functions a change touches. Without COV_OUT this does nothing.
import * as pw from 'playwright';import fs from 'fs';
const out=process.env.COV_OUT;
if(out){const name=(process.argv[1]||'').split('/').pop().replace(/\.mjs$/,''),fns=new Set(),pages=[];
  const hook=async pg=>{try{await pg.coverage.startJSCoverage({resetOnNavigation:false});pages.push(pg)}catch(e){}};
  const save=async()=>{for(const pg of pages.splice(0)){try{for(const e of await pg.coverage.stopJSCoverage()){if(!/localhost:409\d/.test(e.url))continue;for(const f of e.functions)if(f.functionName&&f.ranges.some(r=>r.count>0))fns.add(f.functionName)}}catch(e){}}
    try{const f=`${out}/${name}.json`,prev=fs.existsSync(f)?JSON.parse(fs.readFileSync(f,'utf8')):[];fs.writeFileSync(f,JSON.stringify([...new Set([...prev,...fns])].sort()))}catch(e){}};
  const L=pw.chromium.launch.bind(pw.chromium);
  pw.chromium.launch=async(...a)=>{const b=await L(...a);const NC=b.newContext.bind(b),NP0=b.newPage.bind(b),C=b.close.bind(b);
    b.newContext=async(...c)=>{const cx=await NC(...c);const NP=cx.newPage.bind(cx);cx.newPage=async(...q)=>{const pg=await NP(...q);await hook(pg);return pg};return cx};
    b.newPage=async(...q)=>{const pg=await NP0(...q);await hook(pg);return pg};
    b.close=async()=>{await save();return C()};return b}}
