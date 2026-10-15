// On the Reports page the chat at the bottom right is the report designer: its own thread (one for all models), and it
// changes reports through the agent's report tools; with no AI connected the rules engine still edits the report.
import {chromium} from 'playwright';
const b=await chromium.launch({executablePath:process.env.PW_CHROMIUM||undefined});const p=await b.newPage({viewport:{width:1500,height:950}});const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.goto(process.argv[2]||'http://localhost:4090/?mode=readonly');await p.evaluate(()=>localStorage.clear());await p.reload();await p.waitForTimeout(1500);
const ok=[];const t=(c,m)=>ok.push((c?'PASS':'FAIL')+' | '+m);
// no AI: the rules engine edits the open report
let r=await p.evaluate(async()=>{showTab('report');RSEL='lender';renderReport();toggleDock(true);const n0=(specOf('lender').blocks||[]).length;await webAsk('for the board, max 6 slides');await new Promise(r=>setTimeout(r,800));return{last:$('#msgs .msg.agent:last-child').innerText.slice(0,300),hist:RHIST.lender&&RHIST.lender.length}});
t(/Lender report/.test(r.last)&&/updated/.test(r.last)&&r.hist>0,'no AI: the designer in the chat changes the open report: '+r.last.replace(/\n/g,' | ').slice(0,200));
// with AI: the agent calls design_report, and the system prompt knows it is the report designer
r=await p.evaluate(async()=>{AI.keys.anthropic='sk-a';AI.keys.openai='sk-o';let sysSeen='',n=0;
  window.callOne=async(pr,model,sys,msgs,withTools)=>{if(withTools){sysSeen=sys;n++;if(n===1)return{calls:[{id:'c1',name:'design_report',args:{report:'monthly',instruction:'add the cash flow as a line chart'}}],text:'',raw:{role:'assistant',content:[]}};return{calls:[],text:'Done: the monthly report now shows the cash flow as a line chart. Want me to play it?',raw:null}}
    return{text:JSON.stringify({summary:'Cash flow added as a line chart',changes:['Cash flow shown as a line chart'],spec:{...specOf('monthly'),blocks:[...new Set([...(specOf('monthly').blocks||[]),'cashflow_annual'])]}})}};
  window.toolResults=window.toolResults||((p,c,o)=>[]);
  await webAsk('add the cash flow to the monthly report as a line chart');await new Promise(r=>setTimeout(r,1500));return{sys:/Report designer: the user is on the Reports page/.test(sysSeen),open:/Monthly/.test(sysSeen),last:$('#msgs .msg.agent:last-child').innerText.slice(0,300)}});
t(r.sys&&r.open,'the agent is told it is the report designer, and which report is open');
t(/monthly report now shows/i.test(r.last),'the agent answers in the designer thread: '+r.last.replace(/\n/g,' | ').slice(0,160));
// threads stay apart
r=await p.evaluate(()=>{showTab('em');const a=$('#msgs').innerText;showTab('report');const b=$('#msgs').innerText;return{a:/monthly report/i.test(a),b:/monthly report/i.test(b)}});
t(!r.a&&r.b,'the model chat does not show the designer conversation, and coming back restores it');
t(!errs.length,'no page errors '+errs.join(';'));console.log(ok.join('\n'));await b.close();
