// Server: a change proposed in an email is computed exactly on the model's cash flow (the AI is not even asked).
const G=require(__dirname+'/../api/_lib/graph.js');let asked=0;G.aiProviders=()=>['anthropic','openai'];G.ai=async()=>{asked++;return JSON.stringify({impacts:[{message_id:'m2',base_levered_irr:24.65,levered_irr:20,profit_on_cost:15,net_profit:9e7,working:'AI guess'}]})};
const cron=require(__dirname+'/../api/cron.js'),X=require(__dirname+'/fixtures/package/dist/xlsx.full.min.js'),EM=require(__dirname+'/../api/_lib/emcheck.js'),fs=require('fs'),{model}=require(__dirname+'/fixtures/cfref/refmodel.cjs');
const P={land:90e6,cons:420e6,gdv:760e6,consStart:3,consM:28,rate:8,equity:180e6};let pass=0,fail=0;const ok=(c,m)=>{c?pass++:fail++;console.log((c?'PASS':'FAIL')+' | '+m)};
(async()=>{const b=EM.parseWorkbook(X.read(fs.readFileSync(__dirname+'/fixtures/cfref/ref_export.xlsx'),{type:'buffer'}),X,'ref.xlsx');b.name='ref.xlsx';
  const f1={msg:{id:'m1'},assumption:'Construction Cost',previous_value:'SAR 420,000,000',new_value:'SAR 483,000,000'},f2={msg:{id:'m2'},assumption:'Exit cap rate',previous_value:'7%',new_value:'7.5%'};
  await cron.estimateImpacts(b,[f1,f2],18);const t=model(P,{cost:15});
  ok(f1.impact.exact&&Math.abs(f1.impact.levered_irr-t.lirr)<0.01&&Math.abs(f1.impact.profit_on_cost-t.poc)<0.01,`construction cost 420M → 483M (+15%): ${f1.impact.levered_irr.toFixed(3)}% / POC ${f1.impact.profit_on_cost.toFixed(3)}% exact vs truth ${t.lirr.toFixed(3)}% / ${t.poc.toFixed(3)}%`);
  ok(f2.impact&&!f2.impact.exact&&asked===2,'a change the cash flow cannot compute (exit cap on a for-sale model) goes to both AIs, cross-checked ('+asked+' calls); the exact one never did');
  console.log(`t_cfimpact: ${pass} pass, ${fail} fail`)})();
