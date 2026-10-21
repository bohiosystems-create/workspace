// A stand-in for Office.js for the add-in's tests (no Excel in CI): the workbook is the fixture read by SheetJS and calculated by
// HyperFormula, so a what-if in the pane is a real recalculation. It implements only what the task pane and the app's receiver call.
(function(){
  const M=window.MOCK={selected:null,dialogs:[],toParent:[],childHandler:null,calcs:0,writes:[]};
  const load=src=>new Promise((res,rej)=>{const s=document.createElement('script');s.src=src;s.onload=res;s.onerror=rej;document.head.appendChild(s)});
  const colA=c=>{let s='';c++;while(c>0){const m=(c-1)%26;s=String.fromCharCode(65+m)+s;c=Math.floor((c-1)/26)}return s};
  const qs=n=>/^[A-Za-z_][A-Za-z0-9_.]*$/.test(n)?n:"'"+n.replace(/'/g,"''")+"'";
  const colN=s=>{let n=0;for(const ch of s)n=n*26+ch.charCodeAt(0)-64;return n-1};
  const parse=a=>{const m=String(a).match(/^(?:(?:'((?:[^']|'')+)'|([^!']+))!)?\$?([A-Z]+)\$?(\d+)(?::\$?([A-Z]+)\$?(\d+))?$/);if(!m)throw new Error('mock: bad address '+a);return{sheet:(m[1]||m[2]||'').replace(/''/g,"'")||null,c:colN(m[3]),r:+m[4]-1,c2:m[5]?colN(m[5]):colN(m[3]),r2:m[6]?+m[6]-1:+m[4]-1}};
  let hf=null,NF={},names=[],bytes=null;
  const ready=(async()=>{if(window.MOCK_NOWB)return;await load('/vendor/xlsx-0.18.5.full.min.js');await load('/vendor/hyperformula-3.5.0.full.min.js');
    const buf=await (await fetch(window.MOCK_FIXTURE)).arrayBuffer();bytes=new Uint8Array(buf);const wb=XLSX.read(buf,{cellFormula:true,cellNF:true});const sheets={};
    for(const n of wb.SheetNames){const ws=wb.Sheets[n],rg=XLSX.utils.decode_range(ws['!ref']||'A1');const rows=[];NF[n]={};
      for(let r=0;r<=rg.e.r;r++){const row=[];for(let c=0;c<=rg.e.c;c++){const cell=ws[XLSX.utils.encode_cell({r,c})];if(!cell){row.push(null);continue}row.push(cell.f?'='+cell.f:cell.v);if(cell.z)NF[n][r+','+c]=cell.z}rows.push(row)}sheets[n]=rows}
    names=wb.SheetNames;hf=HyperFormula.buildFromSheets(sheets,{licenseKey:'gpl-v3'})})();
  const val=(sh,r,c)=>{const v=hf.getCellValue({sheet:hf.getSheetId(sh),row:r,col:c});return v==null?'':typeof v==='object'?'#VALUE!':v};
  const fml=(sh,r,c)=>{const a={sheet:hf.getSheetId(sh),row:r,col:c};return hf.doesCellHaveFormula(a)?hf.getCellFormula(a):val(sh,r,c)};
  function Range(sh,a){const R={_sh:sh,_a:a,load(){const rows=[],fs=[],nfs=[];for(let r=a.r;r<=a.r2;r++){const vr=[],fr=[],nr=[];for(let c=a.c;c<=a.c2;c++){vr.push(val(sh,r,c));fr.push(fml(sh,r,c));nr.push(NF[sh][r+','+c]||'General')}rows.push(vr);fs.push(fr);nfs.push(nr)}
      R.address=qs(sh)+'!'+colA(a.c)+(a.r+1)+(a.r2>a.r||a.c2>a.c?':'+colA(a.c2)+(a.r2+1):'');R.rowIndex=a.r;R.columnIndex=a.c;Object.defineProperty(R,'values',{configurable:true,get(){return rows},set(v){write(v)}});Object.defineProperty(R,'formulas',{configurable:true,get(){return fs},set(v){write(v)}});R.numberFormat=nfs;return R},
    select(){M.selected=qs(sh)+'!'+colA(a.c)+(a.r+1)},
    getDirectPrecedents(){const p=hf.getCellPrecedents({sheet:hf.getSheetId(sh),row:a.r,col:a.c});const items=p.map(x=>{const s=x.start?x.start:x,e=x.end||x,n=hf.getSheetName(s.sheet);return{address:qs(n)+'!'+colA(s.col)+(s.row+1)+(e!==s?':'+colA(e.col)+(e.row+1):'')}});return{areas:{items,load(){}}}}};
    const write=v=>{M.writes.push({sheet:sh,r:a.r,c:a.c,v:v[0][0]});hf.setCellContents({sheet:hf.getSheetId(sh),row:a.r,col:a.c},v)};
    Object.defineProperty(R,'values',{configurable:true,get(){return undefined},set(v){write(v)}});Object.defineProperty(R,'formulas',{configurable:true,get(){return undefined},set(v){write(v)}});return R}
  function Sheet(n){return{name:n,activate(){},getUsedRange(){let mr=0,mc=0;const d=hf.getSheetDimensions(hf.getSheetId(n));mr=d.height-1;mc=d.width-1;return Range(n,{r:0,c:0,r2:mr,c2:mc})},getRange(addr){return Range(n,parse(addr))}}}
  const ctx={workbook:{worksheets:{items:[],load(){this.items=names.map(Sheet)},getItem:n=>Sheet(n)},getSelectedRange(){const a=parse(M.selected);return Range(a.sheet,a)},application:{calculate(){M.calcs++}}},sync:async()=>{}};
  window.Excel={run:async cb=>{await ready;return cb(ctx)},CalculationType:{full:'Full'}};
  window.Office={HostType:{Excel:'Excel'},EventType:{DialogMessageReceived:'dialogMessageReceived',DialogParentMessageReceived:'dialogParentMessageReceived'},FileType:{Compressed:'compressed'},AsyncResultStatus:{Succeeded:'succeeded',Failed:'failed'},
    onReady(cb){const p=ready.then(()=>({host:'Excel'}));if(cb)p.then(cb);return p},
    context:{requirements:{isSetSupported:(n,v)=>!(window.MOCK_NOSETS||[]).includes(n+' '+v)},document:{url:'C:\\Models\\'+String(window.MOCK_FIXTURE||'').split('/').pop(),
      getFileAsync(t,o,cb){const sz=o.sliceSize||65536,n=Math.ceil(bytes.length/sz);cb({status:'succeeded',value:{sliceCount:n,getSliceAsync(i,c2){c2({status:'succeeded',value:{data:Array.from(bytes.subarray(i*sz,(i+1)*sz))}})},closeAsync(){}}})}},
      ui:{displayDialogAsync(url,o,cb){const d={h:null,sent:[],addEventHandler(t,h){d.h=h},messageChild(m){d.sent.push(m)},close(){}};M.dialogs.push({url,d});cb({status:'succeeded',value:d})},
        addHandlerAsync(t,h,cb){M.childHandler=h;if(cb)cb({status:'succeeded'})},messageParent(m){M.toParent.push(m)}}}};
})();
