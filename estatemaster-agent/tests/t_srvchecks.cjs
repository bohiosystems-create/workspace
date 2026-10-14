// Server: stress figures checked after arbitration (all three metrics compared, adverse cannot improve, severe ≤ mild); feed impacts get a numeric direction.
const G=require(__dirname+'/../api/_lib/graph.js');let reply=null;G.aiProviders=()=>['anthropic','openai'];G.ai=async(sys,user,max,p)=>reply(sys,user,p);
const cron=require(__dirname+'/../api/cron.js');let pass=0,fail=0;const ok=(c,m)=>{c?pass++:fail++;console.log(c?'PASS':'FAIL',m)};
(async()=>{const b={name:'t',out:{levered_irr:20,profit_on_cost:25,net_profit:1e8,total_cost:4e8},inputs:[],sens:[]};
  const sc=(irr,poc,np)=>({levered_irr:irr,profit_on_cost:poc,net_profit:np,working:'w'});
  const names=['Sale price −15%','Construction cost +20%','12-month delay','Interest rate +300 bps','Exit cap rate +150 bps','Retail rent −20%','Combined downside','Severe combined'];
  reply=(sys,user,p)=>{if(/chief risk officer/.test(sys))return JSON.stringify({risks:[]});if(/arbitrate/.test(sys))return JSON.stringify({items:[{id:'Retail rent −20%',levered_irr:21,profit_on_cost:24,net_profit:9e7,why:'x'}]});
    return JSON.stringify({scenarios:names.map(n=>({name:n,...(n==='Sale price −15%'?sc(15,6.25,2.5e7):n==='Retail rent −20%'?sc(p==='anthropic'?18:18.2,p==='anthropic'?22:15,8e7):n==='Combined downside'?sc(10,10,3e7):n==='Severe combined'?sc(12,8,1e7):sc(17,20,8e7))}))})};
  const st=await cron.stressRun(b,18,[]);const S=Object.fromEntries(st.scenarios.map(x=>[x.name,x]));
  ok(S['Retail rent −20%'].agree===false,'models agreeing on IRR but 7 pts apart on profit on cost are NOT "agree"');
  ok(S['Retail rent −20%'].arbitrated&&/above EstateMaster's base/.test(S['Retail rent −20%'].working)&&(S['Retail rent −20%'].flag||S['Retail rent −20%'].corrected&&S['Retail rent −20%'].levered_irr<=20),'an arbitrated figure above the base is checked, then flagged or corrected below the base: '+S['Retail rent −20%'].working.slice(-160));
  ok(S['Severe combined'].flag&&/severe case/.test(S['Severe combined'].working),'severe case above the milder combined case is flagged');
  ok(!S['Sale price −15%'].flag,'a sound scenario is not flagged');
  ok(/check failed/.test(cron.stressHtml({stress:[{name:'M',by:'x',scenarios:st.scenarios}],hurdle:18},false)),'the email marks failed checks');
  // feed impact: "SAR 13,500 → SAR 12,798" carries no words, the numbers say it is a price cut
  reply=()=>JSON.stringify({impacts:[{message_id:'m1',base_levered_irr:20,levered_irr:21.5,profit_on_cost:26,net_profit:1.05e8,working:'w'}]});
  const f={msg:{id:'m1'},assumption:'Sale price',previous_value:'SAR 13,500/sqm',new_value:'SAR 12,798/sqm'};await cron.estimateImpacts(b,[f],18);
  ok(f.impact.flag&&/improves although the change is adverse/.test(f.impact.working),'a price cut that raises the IRR is flagged: '+f.impact.working.slice(0,120));
  reply=()=>JSON.stringify({impacts:[{message_id:'m2',base_levered_irr:24,levered_irr:19,profit_on_cost:24,net_profit:9e7,working:'w'}]});
  const g={msg:{id:'m2'},assumption:'Construction cost',previous_value:'5,200',new_value:'5,616'};await cron.estimateImpacts(b,[g],18);
  ok(g.impact.flag&&/worked from a levered IRR of 24/.test(g.impact.working),'a wrong starting base is flagged');
  // self-correction: the recalculation fixes the severe case and the server keeps the corrected figure
  reply=(sys,user,p)=>{if(/chief risk officer/.test(sys))return JSON.stringify({risks:[]});if(/arbitrate/.test(sys))return JSON.stringify({items:[]});
    if(/failed these exact checks/.test(user))return JSON.stringify({scenarios:[{name:'Severe combined',...sc(6,4,1e6)}]});
    return JSON.stringify({scenarios:names.map(n=>({name:n,...(n==='Combined downside'?sc(10,10,3e7):n==='Severe combined'?sc(12,8,1e7):sc(17,20,8e7))}))})};
  const st2=await cron.stressRun(b,18,[]);const sv=st2.scenarios.find(x=>x.name==='Severe combined');
  ok(sv.corrected&&!sv.flag&&sv.levered_irr===6&&/Corrected after failed checks/.test(sv.working),'a failed scenario is recalculated by both models and the corrected figure kept: '+sv.levered_irr+'%');
  console.log(`${pass} pass, ${fail} fail`)})();
