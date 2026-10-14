// The daily email: the KINAN logo travels as an inline attachment (cid), the layout has the app's parts, long AI text is cut at a word, raw numbers are readable
const API=__dirname+'/../api/';
process.env.OUTLOOK_MAILBOX='agent@kinan.com.sa';process.env.MS_TENANT_ID='t';process.env.MS_CLIENT_ID='c';process.env.MS_CLIENT_SECRET='s';
const G=require(API+'_lib/graph.js'),UI=require(API+'_lib/mailui.js');let pass=0,fail=0;const ok=(c,m)=>{console.log((c?'PASS':'FAIL')+' | '+m);c?pass++:fail++};
(async()=>{
  let body=null;global.fetch=async(u,o)=>{body=JSON.parse(o.body);return{status:202,ok:true,json:async()=>({})}};
  const html=UI.frame({kicker:'Daily EstateMaster report',title:'3 financial models',sub:'Wed 14 Oct',body:UI.section('To know today',UI.item({tone:'red',tags:[['stress risk','red']],title:'t',detail:'d'})),appUrl:'https://x',summary:[{value:'3',label:'models'}]});
  ok(/<img src="data:image\/png;base64,/.test(html)&&(html.match(/data:image\/png/g)||[]).length===2,'the page embeds the KINAN logo (header and footer)');
  await G.sendMail('tok',{to:['a@kinan.com.sa'],subject:'s',html});const m=body.message,att=m.attachments;
  ok(!/data:image/.test(m.body.content)&&/src="cid:kinan1@bohio"/.test(m.body.content),'sent: the logo is referenced by cid, no data: image left (Outlook and Gmail block those)');
  ok(att.length===1&&att[0].isInline===true&&att[0].contentId==='kinan1@bohio'&&att[0].contentType==='image/png'&&att[0].contentBytes.length>1000,'one inline attachment for both logo uses '+JSON.stringify(att.map(a=>({n:a.name,inline:a.isInline,id:a.contentId,len:a.contentBytes.length}))));
  ok(/❯/.test(html)&&/border-top:3px solid #f15a22/.test(html)&&/@media \(max-width:620px\)/.test(html)&&/Open the agent/.test(html),'app look: chevron title, cards with the orange rule, phone layout, button');
  ok(UI.clip('amounts were entered in percentage fields rather than as rates',40)==='amounts were entered in percentage…','long text is cut at a word with an ellipsis: '+UI.clip('amounts were entered in percentage fields rather than as rates',40));
  ok(UI.tidyNums('Contingency = 4728683.604023% and footprint 2100')==='Contingency = 4,728,684% and footprint 2,100','raw model numbers are made readable: '+UI.tidyNums('Contingency = 4728683.604023% and footprint 2100'));
  console.log(pass+' pass, '+fail+' fail')})();
