const SCHED=require(__dirname+'/../api/_lib/sched.js');const G=require(__dirname+'/../api/_lib/graph.js');
process.env.EXPORTS_FOLDER='/drives/x/root:/exports';process.env.MAIL_ALLOWED_DOMAINS='jeddahsicon.com';
let disk={schedule:{enabled:true,time:'07:00',timezone:'Asia/Riyadh',days:[0,1,2,3,4],recipients:'mb@jeddahsicon.com',languages:['en']},log:[]};
// SharePoint read-after-write lag: the first read after a write still returns the old copy
let stale=null;SCHED.load=async()=>{const src=stale||disk;stale=null;return{...JSON.parse(JSON.stringify(src)),stored:true,path:'p',err:''}};
SCHED.save=async(t,st)=>{stale=JSON.parse(JSON.stringify(disk));disk={schedule:st.schedule,log:st.log||[]}};
G.graphConfigured=()=>true;G.readBody=async r=>r.body;G.graphToken=async()=>'tok';G.graph=async()=>({value:[]});
const handler=require(__dirname+'/../api/schedule.js');
const call=b=>new Promise(ok=>{const req={method:'POST',headers:{host:'x','content-type':'application/json'},body:b,on(){}};const res={statusCode:0,headers:{},setHeader(k,v){this.headers[k]=v},end(t){ok({status:this.statusCode,j:JSON.parse(t||'{}')})},status(c){this.statusCode=c;return this},json(o){ok({status:this.statusCode,j:o})}};handler(req,res)});
(async()=>{const r=await call({action:'save',schedule:{enabled:true,time:'08:45',timezone:'Asia/Riyadh',days:[0,1,2,3,4,5,6],recipients:'mb@jeddahsicon.com',languages:['en']},by:'t'});
 const j=r.j;console.log(j.error||'',j.schedule&&j.schedule.time,j.next&&j.next.label);
 console.log(j.schedule&&j.schedule.time==='08:45'&&j.next&&/08:45/.test(j.next.label)?'PASS one save shows the new time':'FAIL');})();
