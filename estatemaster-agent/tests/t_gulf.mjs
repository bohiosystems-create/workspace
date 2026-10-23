// Which regime a project or a contract falls under: Saudi Arabia (CMA), UAE onshore (the CMA, formerly SCA), DIFC (DFSA) or ADGM (FSRA),
// with the Gulf fund pack (fundpack/). The AI reads it from the workbook with the cells that show it, each proved; the pack's signals give
// a second reading; when they disagree, when the AI is unsure or its cells do not say, or when nothing says, the user is asked, and the
// agent is told to ask before any answer that depends on regulation or tax. A contract carries its own regime; a contract under another
// regime than the project's is flagged and asked; the regulator's limits follow the regime (UAE limits from secondary sources: "check
// against the current rule"). Fixtures: gen/gen_gulf.py (uae_dubai.xlsx, gulf_neutral.xlsx, difc_fund.docx) and ar_dev.xlsx. AI mocked.
import {chromium} from 'playwright';
const F=new globalThis.URL('./fixtures/models/',import.meta.url).pathname,D=new globalThis.URL('./fixtures/docs/',import.meta.url).pathname;
const base=process.argv[2]||'http://localhost:4090/?mode=readonly';
const b=await chromium.launch({executablePath:process.env.PW_CHROMIUM||undefined});
let pass=0,fail=0;const ok=(c,name,detail)=>{c?pass++:fail++;console.log((c?'PASS':'FAIL')+' | '+name+(detail?' → '+(typeof detail==='string'?detail:JSON.stringify(detail)).slice(0,600):''))};
const HEAD=[{key:'unlevered_irr',cell:'Returns!B3',label:'Unlevered IRR',definition:'the project’s IRR'},{key:'net_profit',cell:'Returns!B4',label:'Net profit',definition:'the project’s profit'}];
const AR_HEAD=[{key:'levered_irr',cell:"'العوائد'!B3",label:'معدل العائد الداخلي بعد التمويل',definition:'equity IRR'}];
const SEEN={agent:''};
async function open(jadwa){const ctx=await b.newContext({viewport:{width:1500,height:1000}}),p=await ctx.newPage();if(jadwa)await p.addInitScript(()=>{window.BOHIO_BRAND='jadwa'});
  await p.route(/cdn\.jsdelivr\.net|unpkg\.com|cdnjs\.cloudflare\.com/,r=>r.abort());await p.route('**/api/log*',r=>r.fulfill({status:200,body:'{}'}));
  await p.route(/api\.anthropic\.com|api\.openai\.com|\/api\/llm/,async r=>{if(r.request().method()==='GET')return r.fulfill({status:200,contentType:'application/json',body:'{"providers":{"anthropic":true,"openai":true}}'});
    let body={};try{body=JSON.parse(r.request().postData())}catch(e){}const pl=body.payload||body,sys=String(pl.system||(pl.messages&&pl.messages[0]&&pl.messages[0].role==='system'?pl.messages[0].content:''));const u=String(((pl.messages||[]).filter(m=>m.role==='user').pop()||{}).content||'');
    const oa=/openai/.test(r.request().url())||body.provider==='openai';let t='{}';const reply=x=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(oa?{choices:[{message:{content:x},finish_reason:'stop'}]}:{model:pl.model,content:[{type:'text',text:x}],stop_reason:'end_turn'})});
    if(pl.tools&&pl.tools.length){SEEN.agent=sys;return reply('Noted.')}
    if(/You map the structure of a real estate financial model laid out as a grid of cells\. Each line/.test(sys)){
      if(/Business Bay/.test(u))t=JSON.stringify({headlines:HEAD,jurisdiction:{value:'UAE_ONSHORE',confidence:'high',evidence:[{cell:'Inputs!B2',text:'Business Bay, Dubai'},{cell:'Inputs!A4',text:'Dubai Land Department transfer fee'}]}});
      else if(/OFFICE ACQUISITION \(USD\)/.test(u))t=JSON.stringify({headlines:HEAD,jurisdiction:{value:'unknown',confidence:'low',evidence:[]}});
      else if(/العوائد/.test(u))t=JSON.stringify({headlines:AR_HEAD,jurisdiction:{value:'UAE_ONSHORE',confidence:'high',evidence:[{cell:"'المدخلات'!A1",text:'مشروع حي النرجس'}]}})}
    else if(/You classify a document/.test(sys))t=JSON.stringify({contract:true,category:'fund',doc_type:'prospectus',language:'en'});
    else if(/You read a contract that governs/.test(sys)){const sec=q=>{const m=[...u.matchAll(/\[page (\d+)(?: · §([^\]]+))?\]\n([\s\S]*?)(?=\n\n\[page |\s*$)/g)].find(z=>z[3].includes(q.slice(0,30)));return m?+m[1]:1};
      const Qj='regulated by the Dubai Financial Services Authority under the Collective Investment Rules',Qb='The Fund may borrow up to sixty per cent (60%) of its gross asset value',Qs='The Fund is a closed-ended fund and its units will be listed';
      t=JSON.stringify({doc_type:'prospectus',fund:'Gulf Horizon Property Fund',terms:[],definitions:[],fund_kind:'property_fund_public',jurisdiction:{value:'DIFC',quote:Qj,page:sec(Qj)},
        cma:[{field:'financing.max_borrowing_pct',value:60,quote:Qb,page:sec(Qb)},{field:'fund.structure',value:'closed',quote:Qs,page:sec(Qs)}],provisions:[]})}
    reply(t)});
  await p.route('**/api/**',r=>r.fulfill({status:404,body:''}));const errs=[];p.on('pageerror',e=>errs.push(e.message));
  await p.goto(base);await p.evaluate(()=>localStorage.clear());await p.reload();await p.waitForTimeout(1500);await p.evaluate(()=>{AI.keys.anthropic='sk-a';AI.keys.openai='sk-o'});return{p,errs}}
async function upload(p,file){await p.evaluate(()=>openNewProject());await p.setInputFiles('#npFile',F+file);await p.waitForSelector('#npCreate:not([disabled])',{timeout:40000});await p.click('#npCreate');
  await p.waitForFunction(()=>{const x=latestExport();return x&&x.map&&x.jur},null,{timeout:60000}).catch(()=>{});await p.waitForTimeout(500);
  return p.evaluate(()=>{const x=latestExport();const card=[...document.querySelectorAll('#msgs .msg.agent .body')].map(z=>z.innerHTML).find(h=>/Regime/.test(h))||'';return{id:x.id,j:x.jurisdiction,by:x.jurBy||'',jur:x.jur,ask:x.jurAsk,card:card.replace(/<[^>]+>/g,' ').replace(/\s+/g,' '),chips:(card.match(/data-jurset="[^"]+"/g)||[]).length}})}
const agentAsk=p=>p.evaluate(()=>{toggleDock(true);webAsk('What taxes apply when we buy the asset?')}).then(()=>p.waitForTimeout(2500));
// ---- the Kinan edition: the project's regime ----
{const {p,errs}=await open(false);
  const u=await p.evaluate(()=>({cma:fpJurisdiction('This prospectus has not been approved by the CMA.').j,uae:fpJurisdiction('مرخص من هيئة سوق المال').j,ksa:fpJurisdiction('مرخص من هيئة السوق المالية في المملكة العربية السعودية'),difc:fpJurisdiction('The fund is regulated by the DFSA in the DIFC.').j,n:Object.keys(FP.juris).length,uaeChecks:FP.uae.length,uaeTerms:FP.terms.filter(t=>t[8]==='UAE').length}));
  ok(u.cma===null&&u.uae==='UAE_ONSHORE'&&u.ksa.j==='KSA_CMA'&&u.ksa.confidence==='high'&&u.difc==='DIFC'&&u.n===4&&u.uaeChecks>=20&&u.uaeTerms>=50,'the pack’s signals: a bare “CMA” says nothing; هيئة سوق المال is the UAE authority, هيئة السوق المالية the Saudi one; DFSA and DIFC are the free zone',u);
  let r=await upload(p,'uae_dubai.xlsx');
  ok(r.j==='UAE_ONSHORE'&&/Inputs!B2 “Business Bay, Dubai”/.test(r.by)&&!r.ask&&/Regime UAE onshore/.test(r.card)&&r.chips===0,'a Dubai model in AED: the AI reads UAE onshore from the cells it cites (proved), the signals agree: settled, shown on the map card, nothing asked',{j:r.j,by:r.by,card:r.card.slice(r.card.indexOf('Regime'),r.card.indexOf('Regime')+120)});
  await agentAsk(p);
  ok(/Regime of this project: UAE onshore/.test(SEEN.agent)&&/VAT 5%/.test(SEEN.agent)&&/Land Department transfer fee of 4%/.test(SEEN.agent)&&/Never apply the other country's/.test(SEEN.agent)&&!/RETT|zakat 2\.5%/.test(SEEN.agent.slice(SEEN.agent.indexOf('Regime of this project'),SEEN.agent.indexOf('Regime of this project')+700)),'the agent is told the regime and its conventions (VAT 5%, Dubai Land Department 4%), and never to apply Saudi ones',SEEN.agent.slice(SEEN.agent.indexOf('Regime of this project'),SEEN.agent.indexOf('Regime of this project')+400));
  r=await upload(p,'gulf_neutral.xlsx');
  ok(r.j===null&&r.ask&&/Nothing in the workbook settles it/.test(r.ask.why)&&/Which regulation and tax regime/.test(r.card)&&r.chips===5,'a model in USD with no location, tax or regulator: nothing settles it, so the user is asked on the map card, with the four regimes and “neither”',{ask:r.ask,chips:r.chips});
  await agentAsk(p);
  ok(/Regime of this project: not settled/.test(SEEN.agent)&&/ask the user which applies/.test(SEEN.agent),'until then the agent is told to ask before any answer that depends on regulation or tax',SEEN.agent.slice(SEEN.agent.indexOf('Regime of this project'),SEEN.agent.indexOf('Regime of this project')+300));
  await p.evaluate(()=>{const c=[...document.querySelectorAll('[data-jurset]')].filter(z=>/DIFC/.test(z.textContent)).pop();c.click()});await p.waitForTimeout(300);
  const s=await p.evaluate(()=>{const x=latestExport();return{j:x.jurisdiction,c:x.jurConfirmed,m:[...document.querySelectorAll('#msgs .msg.agent .body')].pop().textContent}});
  ok(s.j==='DIFC'&&s.c&&/Recorded: .* falls under DIFC \(DFSA\)/.test(s.m),'the user’s click settles it: DIFC, recorded and confirmed',s);
  r=await upload(p,'ar_dev.xlsx');
  ok(r.j===null&&r.ask&&r.ask.ai==='UAE_ONSHORE'&&r.ask.rules==='KSA_CMA'&&/The AI reads UAE onshore .* the workbook's own signals point to Saudi Arabia \(CMA\) \(.*ريال سعودي/.test(r.ask.why),'the AI reads UAE onshore, but the workbook’s own words (ريال سعودي, …) point to Saudi Arabia: the two readings are put to the user',r.ask);
  const t=await p.evaluate(async()=>{const o=await handle('','web','Investment Director',{k:'jurset',j:'KSA_CMA'});const x=latestExport();return{plain:o.plain,j:x.jurisdiction,c:x.jurConfirmed}});
  ok(t.j==='KSA_CMA'&&t.c&&/Recorded/.test(t.plain),'when the user says it in the chat, the agent records it (set_jurisdiction)',t);
  await agentAsk(p);
  ok(/Regime of this project: Saudi Arabia \(CMA\) \(confirmed by the user\)/.test(SEEN.agent)&&/Real Estate Transaction Tax 5%/.test(SEEN.agent)&&/VAT 15%/.test(SEEN.agent),'the Saudi conventions follow (RETT 5%, zakat, VAT 15%)',SEEN.agent.slice(SEEN.agent.indexOf('Regime of this project'),SEEN.agent.indexOf('Regime of this project')+300));
  ok(errs.length===0,'no page errors (Kinan edition)',errs.join(' | '));await p.close()}
// ---- the Jadwa edition: a DIFC fund prospectus against a UAE onshore project ----
{const {p,errs}=await open(true);
  const r=await upload(p,'uae_dubai.xlsx');await p.evaluate(()=>showTab('em'));await p.waitForTimeout(400);
  await p.setInputFiles('#docFile',[D+'difc_fund.docx']);await p.waitForFunction(()=>(DOCS[PROJ.id]||[]).length===1&&(DOCS[PROJ.id][0].reg||[]),null,{timeout:120000}).catch(()=>{});await p.waitForTimeout(300);
  const doc=await p.evaluate(()=>JSON.parse(JSON.stringify(DOCS[PROJ.id][0])));
  ok(r.j==='UAE_ONSHORE'&&doc.jurisdiction==='DIFC'&&doc.jur.rules.j==='DIFC'&&/Dubai Financial Services Authority/.test(doc.jur.ai.quote),'the prospectus is under DIFC: the AI’s quote proved, its own words agree (DFSA, DIFC, Collective Investment Rules); its mention of “the CMA” counts for nothing',doc.jur);
  const C=Object.fromEntries((doc.cmaChecks||[]).map(c=>[c.id,c]));
  ok(C.difc_public_property_borrowing_50&&C.difc_public_property_borrowing_50.ok===false&&C.difc_public_property_borrowing_50.confidence==='low'&&C.difc_public_property_closed_ended&&C.difc_public_property_closed_ended.ok===true&&!(doc.cmaChecks||[]).some(c=>c.jur==='KSA_CMA'||/^borrowing_cap/.test(c.id)),'the DFSA limits for a public property fund apply, the Saudi ones do not: 60% of gross asset value above the reported 50% (a low-confidence source: to check), closed-ended as required',doc.cmaChecks&&doc.cmaChecks.map(c=>c.id+':'+c.ok));
  const html=await p.evaluate(()=>document.querySelector('#docList').innerHTML.replace(/<[^>]+>/g,' ').replace(/\s+/g,' '));
  ok(/Against the regulations · DIFC \(DFSA\)/.test(html)&&/above the reported limit: check against the current rule/.test(html)&&/The agreement is under DIFC \(DFSA\); the project is set to UAE onshore/.test(html),'the card: the regulator’s limits as checks against the current rule (secondary sources), and the agreement’s regime against the project’s, asked',html.slice(html.indexOf('Regime:'),html.indexOf('Regime:')+300));
  await p.evaluate(()=>{const c=[...document.querySelectorAll('#docList [data-jurset]')].find(z=>/DIFC/.test(z.textContent));c.click()});await p.waitForTimeout(300);
  const j=await p.evaluate(()=>latestExport().jurisdiction);
  ok(j==='DIFC','the user picks the agreement’s regime for the project',j);
  const md=await p.evaluate(()=>fundAnswer('').plain);
  ok(/Regime of the agreement: DIFC \(DFSA\)/.test(md)&&/above the reported limit: check against the current rule: Public property funds in DIFC are capped at 50%/.test(md),'the chat answers with the regime and the limits',md.slice(md.indexOf('Regime'),md.indexOf('Regime')+300));
  ok(errs.length===0,'no page errors (Jadwa edition)',errs.join(' | '));await p.close()}
console.log(`\n${pass} pass, ${fail} fail`);await b.close();process.exit(fail?1:0);
