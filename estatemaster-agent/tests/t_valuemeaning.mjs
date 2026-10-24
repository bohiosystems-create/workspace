// The value-meaning family against its truth: every cell of the generated workbooks (gen/gen_valuemeaning.py: every kind of value a
// row can hold, under every way a unit is stated, and the headings that only look like a unit) read by the app, then every reader of
// meaning run on it: the meaning itself, each display (the feasibility money, the output formatter) and each conversion of a typed
// number. A display shows the amount the cell means or the cell's own number, never another; the static scan keeps every reader of a
// sheet's unit behind the one classifier.
import {chromium} from 'playwright';import fs from 'fs';
const sp=new globalThis.URL('./fixtures/',import.meta.url).pathname;
const VD=process.env.VM_OUT?process.env.VM_OUT.replace(/\/?$/,'/'):null;   /* a held-out set (gen_valuemeaning.py with VM_HOLDOUT=1 VM_SEED=… VM_OUT=…) */
const T=JSON.parse(fs.readFileSync(VD?VD+'valuemeaning.json':sp+'golden/valuemeaning.json','utf8'));
const src=fs.readFileSync(new globalThis.URL('../index.html',import.meta.url).pathname,'utf8');
const b=await chromium.launch({executablePath:process.env.PW_CHROMIUM||undefined});const cx=await b.newContext({viewport:{width:1400,height:900}});const p=await cx.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));
await cx.route('https://cdnjs.cloudflare.com/**',r=>r.fulfill({status:200,contentType:'application/javascript',body:fs.readFileSync(sp+'package/dist/xlsx.full.min.js')}));
await cx.route(/hyperformula/,r=>r.fulfill({status:200,contentType:'application/javascript',body:fs.readFileSync(sp+'package/hyperformula.full.min.js')}));
await p.route('**/api/**',r=>r.fulfill({status:404,body:''}));
await p.goto(process.argv[2]||'http://localhost:4090/?mode=readonly');await p.evaluate(()=>localStorage.clear());await p.reload();await p.waitForTimeout(1500);
const ok=[];const t=(c,m)=>ok.push((c?'PASS':'FAIL')+' | '+m);
// a shown figure read back as a number: "USD 12.00M" → 12e6, "7.00%" → 7, "1,200" → 1200
const back=s=>{s=String(s||'').replace(/−/g,'-');const m=s.match(/-?[\d,]*\.?\d+/);if(!m)return NaN;let n=parseFloat(m[0].replace(/,/g,''));const after=s.slice(m.index+m[0].length).trim();if(/^bn\b/i.test(after))n*=1e9;else if(/^M\b/.test(after))n*=1e6;else if(/^k\b/i.test(after))n*=1e3;return n};
const near=(a,b)=>Number.isFinite(a)&&Number.isFinite(b)&&Math.abs(a-b)<=Math.max(1e-6,Math.abs(b)*0.006);
const bad={sheet:[],kind:[],show:[],fmt:[],conv:[]},unsure=[];let n=0;
for(const [file,W] of Object.entries(T)){
  await p.evaluate(()=>openNewProject());await p.setInputFiles('#npFile',(VD||sp+'models/')+file);await p.waitForTimeout(1200);await p.click('#npCreate');await p.waitForTimeout(3500);
  const R=await p.evaluate(({W})=>{const x=latestExport();const out={sheets:{},cells:{}};
    for(const sn of Object.keys(W.sheets))out.sheets[sn]=typeof xcSheetUnit==='function'?xcSheetUnit(x,`'${sn}'!A1`):xcScaleAt(x,`'${sn}'!A1`);
    for(const [ref,c] of Object.entries(W.cells)){const pct=c.kind==='pct';
      const m=typeof xcMean==='function'?xcMean(x,ref):{kind:'(no classifier)',scale:0};
      const fs=fsMoney(c.v,ref);
      const fx=xcFmtX({ref,label:c.label,head:c.col?(ref.endsWith('C'+ref.match(/\d+$/)[0])?'Area (sqm)':"Amount (SAR '000)"):'',fmt:pct&&!c.whole_pct?'0.00%':''},c.v);
      const lv=qtyLever({cell:ref,label:c.label,value:c.v,pct});
      out.cells[ref]={m,fs,fx,conv:lv.scale}}
    return out},{W});
  for(const [sn,s] of Object.entries(W.sheets)){if(R.sheets[sn]!==s.unit)bad.sheet.push(`${file} ${sn} “${''}”: read ${R.sheets[sn]}, is ${s.unit}`)}
  for(const [ref,c] of Object.entries(W.cells)){n++;const g=R.cells[ref],tag=`${file} ${ref} “${c.label}” ${c.v}`;
    if(g.m&&(g.m.kind!==c.kind||(c.kind==='money'&&g.m.scale!==c.show_scale)))bad.kind.push(`${tag}: ${g.m.kind}×${g.m.scale}, is ${c.kind}×${c.show_scale}`);
    // the feasibility display: the amount meant, or the cell's own number
    // a number of no readable kind may be shown as the cell holds it only with the sheet's unit said (true, if less useful): counted apart
    const said=s=>/as the sheet holds it/.test(String(s));if(said(g.fs)||said(g.fx))unsure.push(`${tag}`);
    const want=c.kind==='money'?c.v*c.show_scale:c.v,got=back(g.fs);if(!(near(got,want)||(c.kind!=='money'&&near(got,c.v))||(said(g.fs)&&near(got,c.v))))bad.show.push(`${tag}: shows “${g.fs}”, means ${want}`);
    // the output formatter: the same, a percentage as its percent
    const wantF=c.kind==='pct'&&!c.whole_pct?c.v*100:want,gotF=back(g.fx);if(!near(gotF,wantF)&&!(said(g.fx)&&near(gotF,c.v)))bad.fmt.push(`${tag}: formats “${g.fx}”, means ${wantF}`);
    // a typed number: matched in the unit the cell can be in
    if(g.conv!==c.conv_scale&&!(c.kind==='pct'))bad.conv.push(`${tag}: converts with ×${g.conv}, should be ×${c.conv_scale}`)}}
t(!bad.sheet.length,`every sheet's amounts unit read as its heading states it (a trap heading is no unit): ${bad.sheet.length} wrong `+bad.sheet.slice(0,8).join(' | '));
t(!bad.kind.length,`every cell's meaning (kind and amounts unit) as constructed, ${n} cells: ${bad.kind.length} wrong `+bad.kind.slice(0,10).join(' | '));
t(!bad.show.length,`the feasibility display shows the amount meant or the cell's own number: ${bad.show.length} wrong `+bad.show.slice(0,10).join(' | '));
t(!bad.fmt.length,`the output formatter shows the amount meant: ${bad.fmt.length} wrong `+bad.fmt.slice(0,10).join(' | '));
t(unsure.length<=Math.ceil(n*0.03),`few numbers of no readable kind (shown as the cell holds them, with the sheet's unit said): ${unsure.length} of ${n} `+unsure.slice(0,6).join(' | '));
t(!bad.conv.length,`a typed number is matched in the unit the cell can be in: ${bad.conv.length} wrong `+bad.conv.slice(0,10).join(' | '));
// static: a sheet's unit is read only by the classifier; every display and conversion asks the classifier
const direct=src.split('\n').map((l,i)=>[i+1,l]).filter(([,l])=>/xcSheetUnit\(/.test(l)&&!/function xcSheetUnit\(|function xcMean\(/.test(l)).map(([i])=>i);
t(!direct.length,`no reader of a sheet's unit outside the classifier: ${direct.length?'lines '+direct.join(', '):'none'}`);
t(!errs.length,'no page errors '+errs.slice(0,3).join(' | '));
console.log(ok.join('\n'));await b.close();process.exit(ok.some(z=>z.startsWith('FAIL'))?1:0);
