const crypto=require('node:crypto');
const {appendUpdate,storeMedia}=require('./_store');
const {syncToMonday,configured:mondayConfigured}=require('./_monday');
const {getState,applyChange,listChanges}=require('./_state');
const match=require('./_match');
const {likelyDelays,fallingBehind,purchasingRisk,contractorLoad,PROCUREMENT}=require('./_delays');
const {regulation,detail}=require('./_knowledge');
const queries=require('./_queries');

function formBody(req){
  if(req.body&&typeof req.body==='object')return req.body;
  return Object.fromEntries(new URLSearchParams(String(req.body||'')));
}

function validTwilio(req,params){
  const token=process.env.TWILIO_AUTH_TOKEN,signature=req.headers['x-twilio-signature'];
  if(!token||!signature)return false;
  const publicUrl=(process.env.PUBLIC_BASE_URL||`https://${req.headers.host}`).replace(/\/$/,'')+req.url.split('?')[0];
  const data=publicUrl+Object.keys(params).sort().map(key=>key+params[key]).join('');
  const expected=crypto.createHmac('sha1',token).update(data).digest('base64');
  const a=Buffer.from(expected),b=Buffer.from(signature);
  return a.length===b.length&&crypto.timingSafeEqual(a,b);
}

function contractorFor(from,body){
  let map={};try{map=JSON.parse(process.env.CONTRACTOR_PHONE_MAP||'{}');}catch{}
  const phone=String(from||'').replace('whatsapp:','');
  const named=String(body||'').match(/^\s*(voltaic|meridian|delta|aqua|verdant|robopave|gridbot|terra)\s*:/i)?.[1]?.toLowerCase();
  return named||map[phone]||process.env.DEFAULT_CONTRACTOR||'voltaic';
}

const TASKS={
  voltaic:[
    {id:'duct',name:'Electrical Ductbank & Substation',deliverables:[
      ['duct-01','Ductbank trench and formation — Grids A–C',640,'m','Surveyed formation and trench inspection'],
      ['duct-02','Ductbank installed — Grids A–C',640,'m','Mandrel test and concrete pour records'],
      ['duct-03','Pull pits and manholes complete',18,'units','Inspection checklist for all structures'],
      ['duct-04','Ductbank installed — Grids D–E',820,'m','Mandrel test, pour records and as-built survey'],
      ['duct-05','Substation energized and accepted',1,'substation','Protection test pack and energization certificate']]},
    {id:'tele',name:'Telecoms & Fibre Ducting',deliverables:[
      ['tele-01','Telecom chambers complete',14,'units','Chamber inspection records'],['tele-02','Fibre ducts proven',1120,'m','Mandrel and draw-rope test sheets'],['tele-03','Backbone fibre pulled',24,'cores','Cable drum and pulling records'],['tele-04','Fibre tested end-to-end',24,'cores','OTDR results for every core'],['tele-05','Telecom network handed over',1,'system','Approved test dossier and as-builts']]}
  ],
  meridian:[{id:'sub',name:'Road Sub-base & Kerbing',deliverables:[['sub-01','South-loop formation accepted',18500,'m²','Proof-roll and level survey'],['sub-02','Geotextile and capping complete',18500,'m²','Lot inspection and material records'],['sub-03','Sub-base compacted and accepted',12800,'m²','Density tests and level survey'],['sub-04','Kerbs installed and accepted',3600,'m','Line/level survey and inspection'],['sub-05','Road-base handover complete',1,'area','Joint inspection and signed release']]}],
  delta:[
    {id:'mob',name:'Mobilization & Site Setup',deliverables:[['mob-01','Survey control established',6,'benchmarks','Signed survey-control sheet'],['mob-02','Site boundary secured',2.4,'km','Inspection record and geotagged perimeter photos'],['mob-03','Temporary access commissioned',1,'route','Load test and access permit'],['mob-04','Welfare and emergency facilities operational',1,'compound','HSE readiness inspection'],['mob-05','Mobilisation handover accepted',1,'pack','Owner acceptance signature']]},
    {id:'earth',name:'Earthworks & Bulk Excavation',deliverables:[['earth-01','Topsoil stripped and stockpiled',48000,'m²','Drone surface and stockpile survey'],['earth-02','North basin cut complete',82000,'m³','Approved cut-volume survey'],['earth-03','Central platform filled',96000,'m³','Compaction tests and level survey'],['earth-04','South corridor formation complete',31000,'m²','Formation level and proof-roll record'],['earth-05','Earthworks close-out accepted',1,'pack','As-built model and engineer acceptance']]}
  ],
  aqua:[
    {id:'drain',name:'Stormwater & Drainage Network',deliverables:[['drain-01','Primary storm line installed',1240,'m','Surveyed invert levels and inspection photos'],['drain-02','Secondary storm branches installed',860,'m','Surveyed invert levels and joint records'],['drain-03','Catchpits and manholes complete',34,'units','Inspection checklist for every structure'],['drain-04','Outfall and headwall commissioned',2,'outfalls','Structural inspection and flow test'],['drain-05','Drainage network accepted',1,'network','CCTV survey and signed handover']]},
    {id:'water',name:'Sewerage & Water Mains',deliverables:[['water-01','Potable-water main installed',1480,'m','Weld/joint log and surveyed alignment'],['water-02','Sewer pressure main installed',960,'m','Joint log and surveyed alignment'],['water-03','Valve chambers complete',18,'units','Chamber inspection records'],['water-04','Pressure and leakage tests passed',6,'sections','Signed test certificates'],['water-05','Water and sewer system accepted',1,'pack','As-builts and authority acceptance']]}
  ],
  verdant:[{id:'land',name:'Landscaping & Handover',deliverables:[['land-01','Topsoil placement accepted',22000,'m²','Depth checks and survey'],['land-02','Irrigation network commissioned',1,'system','Pressure test and zone demonstration'],['land-03','Trees and shrubs planted',1480,'units','Geotagged planting register'],['land-04','Hard landscape complete',6400,'m²','Finish inspection and snag close-out'],['land-05','Landscape establishment accepted',1,'area','30-day establishment inspection']]}],
  robopave:[{id:'asph',name:'Asphalt & Surfacing',deliverables:[['asph-01','Asphalt mix design approved',1,'design','Laboratory approval and trial panel'],['asph-02','Binder course — north spine accepted',9600,'m²','Core density and level survey'],['asph-03','Binder course — south loop accepted',8900,'m²','Core density and level survey'],['asph-04','Wearing course complete',18500,'m²','Thickness, density and ride-quality tests'],['asph-05','Road markings and opening certificate',1,'network','Safety inspection and opening certificate']]}],
  gridbot:[{id:'light',name:'Street Lighting & ITS',deliverables:[['light-01','Lighting foundations accepted',64,'units','Foundation inspection records'],['light-02','Poles installed and aligned',64,'units','Surveyed alignment and torque records'],['light-03','Luminaries and feeder cabling complete',64,'units','Cable test and installation records'],['light-04','ITS field devices commissioned',18,'devices','Functional test sheets'],['light-05','Lighting and ITS system accepted',1,'system','Night test and handover certificate']]}],
  terra:[{id:'sub',name:'Road Sub-base & Kerbing survey support',deliverables:[['sub-03','Sub-base compacted and accepted',12800,'m²','Density tests and level survey']]}]
};
const PROJECT_SCHEDULE=[
  ['mob','Mobilization & Site Setup','delta','2026-01-06','2026-01-30',5],['earth','Earthworks & Bulk Excavation','delta','2026-02-02','2026-04-10',5],['drain','Stormwater & Drainage Network','aqua','2026-03-16','2026-05-29',5],['water','Sewerage & Water Mains','aqua','2026-04-13','2026-06-26',5],['duct','Electrical Ductbank & Substation','voltaic','2026-05-04','2026-07-31',3],['tele','Telecoms & Fibre Ducting','voltaic','2026-06-01','2026-07-24',4],['sub','Road Sub-base & Kerbing','meridian','2026-06-15','2026-08-21',3],['asph','Asphalt & Surfacing','robopave','2026-08-24','2026-10-16',0],['light','Street Lighting & ITS','gridbot','2026-09-07','2026-10-30',0],['land','Landscaping & Handover','verdant','2026-10-19','2026-12-11',0]
];
const CONTRACTOR_NAMES={delta:'Delta Civil',aqua:'AquaFlow Infrastructure',voltaic:'Voltaic Power Systems',meridian:'Meridian Roads',robopave:'RoboPave Autonomous Fleet',gridbot:'Gridline Robotics',verdant:'Verdant Landscapes',terra:'Terra Survey Drones'};
function everyDeliverable(){return Object.values(TASKS).flat().flatMap(task=>(task.deliverables||[]).map(([id,name,target,unit,acceptance])=>({id,name,target,unit,acceptance,taskId:task.id,taskName:task.name})));}
function allDeliverables(tasks){return (tasks||[]).flatMap(task=>(task.deliverables||[]).map(([id,name,target,unit,acceptance])=>({id,name,target,unit,acceptance,taskId:task.id,taskName:task.name})));}
function normalize(value){return String(value||'').toLowerCase().replace(/[^a-z0-9²³]+/g,' ');}
function taskById(id){return Object.values(TASKS).flat().find(task=>task.id===id);}
async function liveState(){ try{ return await getState(); }catch{ return {}; } }
function stateLine(st){
  if(!st) return '';
  const bits=[];
  if(st.status) bits.push(st.status);
  if(st.plannedFinish) bits.push('finish '+st.plannedFinish);
  if(!bits.length) return '';
  return `\n   Live: ${bits.join(' · ')}${st.origin?` (last changed on ${st.origin==='monday'?'Monday':'Bohio'})`:''}`;
}
function scheduleReplies(state){
  state=state||{};
  const replies=[];
  for(let start=0;start<PROJECT_SCHEDULE.length;start+=2){
    const rows=PROJECT_SCHEDULE.slice(start,start+2).map(([id,name,contractor,plannedStart,plannedFinish,verified],offset)=>{
      const task=taskById(id),deliverables=(task?.deliverables||[]).map((d,index)=>`${index<verified?'✅':'⬜'} ${d[1]} — ${Number(d[2]).toLocaleString()} ${d[3]}`).join('\n');
      const live=stateLine(state[id]);
      return `${start+offset+1}. ${name}\n${plannedStart} → ${plannedFinish}\n${CONTRACTOR_NAMES[contractor]||'Unassigned'} · ${verified}/5 deliverables verified${live}\n${deliverables}`;
    }).join('\n\n');
    replies.push(`${start===0?'BOHIO FULL PROJECT SCHEDULE\nData date: 28 Aug 2026\n\n':''}${rows}${start+2>=PROJECT_SCHEDULE.length?'\n\nOnly complete, measured and verified deliverables earn progress. Date changes require planner approval before Primavera is updated.':''}`);
  }
  return replies;
}
function inspectionReplies(contractor){
  const general=`BOHIO SITE INSPECTION CHECKLIST — 1/2\n\nPRE-START\n⬜ Confirm approved drawing and method statement\n⬜ Verify permit, RAMS and toolbox talk\n⬜ Confirm survey control and workfront limits\n⬜ Check access, lighting and emergency route\n⬜ Record weather, crew and plant on site\n\nSAFETY & QUALITY\n⬜ Inspect barriers, signage and housekeeping\n⬜ Check excavation support and safe access\n⬜ Verify lifting plan, exclusion zone and certificates\n⬜ Confirm materials match approved submittals\n⬜ Photograph hold points and concealed work`;
  const tasks=TASKS[contractor]||[],packageChecks=tasks.flatMap(task=>task.deliverables.filter((_,i)=>i>=Math.max(0,task.deliverables.length-2)).map(d=>`⬜ ${d[1]}: ${d[4]}`)).slice(0,5).join('\n');
  const specific=`BOHIO SITE INSPECTION CHECKLIST — 2/2\n\nMEASUREMENT & EVIDENCE\n⬜ Measure the complete deliverable against its stated target\n⬜ Capture geotagged overview and close-up photos\n⬜ Record test, survey and certificate references\n⬜ List defects, owner and close-out date\n⬜ Obtain inspector name, time and acceptance\n⬜ Upload the evidence before claiming completion\n\n${CONTRACTOR_NAMES[contractor]} CHECKS\n${packageChecks||'⬜ Confirm the assigned work package and acceptance evidence'}\n\nReply with: INSPECTION · item number · PASS/FAIL · observation. Attach photos or a voice note. Failed or partial items earn zero progress.`;
  return [general,specific];
}
/* On-site retrieval runs off one intent table (_queries.js), fuzzily matched,
 * so a typo or a different wording still lands and adding a question means
 * adding a row there rather than another branch here. */
async function agentAnalysisReplies(text,state){
  const C={
    schedule:PROJECT_SCHEDULE, state:state||{}, contractorNames:CONTRACTOR_NAMES,
    taskById, everyDeliverable, changes:async n=>{try{return await listChanges(n);}catch{return [];}}
  };
  const hit=await queries.answer(text,C);
  return hit?[hit.body]:[];
}

function agentCommandRepliesSync(text,contractor,state){
  const value=normalize(text),wantsSchedule=/\b(full|project|send|show|give|get)\b.*\b(schedule|programme)\b|\b(schedule|programme)\b.*\b(full|project|send|show|give|get)\b/.test(value),wantsChecklist=/\b(site inspection|inspection)\b.*\bchecklist\b|\bchecklist\b.*\b(site|inspection)\b/.test(value),replies=[];
  if(wantsSchedule)replies.push(...scheduleReplies(state||{}));
  if(wantsChecklist)replies.push(...inspectionReplies(contractor));
  return replies.slice(0,10);
}
function fallbackInterpret(text,type,tasks){
  const source=String(text||''),normalized=normalize(source),candidates=everyDeliverable(),ownIds=new Set(allDeliverables(tasks).map(d=>d.id)),ranked=candidates.map(d=>{const tokens=normalize(d.name).split(' ').filter(x=>x.length>2&&!['and','the','complete','installed','accepted'].includes(x));const hits=tokens.filter(x=>normalized.includes(x)).length;
    const taskHit=normalize(d.taskName).split(' ').filter(x=>x.length>3).some(x=>normalized.includes(x))?1:0;
    return {d,score:hits+taskHit+(ownIds.has(d.id)?0.5:0)};}).sort((a,b)=>b.score-a.score),
    top=ranked[0],deliverable=top&&top.score>=2?top.d:null;
  const unit=deliverable?.unit?.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),quantity=unit?source.match(new RegExp(`(\\d[\\d,]*(?:\\.\\d+)?)\\s*${unit}(?![A-Za-z0-9])`,'i')):null,actualValue=quantity?Number(quantity[1].replace(/,/g,'')):null,complete=/\b(complete|completed|accepted|passed|signed[ -]?off|commissioned|installed)\b/i.test(source),finish=source.match(/(?:finish|completion|complete).*?(20\d{2}-\d{2}-\d{2})/i)?.[1],legacyPercent=source.match(/\b(\d{1,3})\s*%/)?.[1],evidence=source.match(/evidence\s*:\s*(.+)$/i)?.[1]||'';
  return {taskId:deliverable?.taskId||tasks[0].id,deliverableId:deliverable?.id||'',deliverableName:deliverable?.name||'',actualValue,actualQuantity:deliverable&&actualValue!==null?`${actualValue.toLocaleString()} ${deliverable.unit}`:'',targetMet:!!deliverable&&complete&&actualValue!==null&&actualValue>=deliverable.target,verificationEvidence:evidence,legacyPercent:legacyPercent?Number(legacyPercent):null,proposedFinish:finish||'',summary:deliverable?`${deliverable.name}: ${actualValue===null?'measured quantity missing':`${actualValue.toLocaleString()} ${deliverable.unit} reported against target ${deliverable.target.toLocaleString()} ${deliverable.unit}`}.`:`Project evidence received; no measurable deliverable was identified.`,confidence:deliverable?.id?.length?0.82:0.55};
}

async function downloadMedia(url){
  if(!url)return null;
  const auth=Buffer.from(`${process.env.TWILIO_ACCOUNT_SID||''}:${process.env.TWILIO_AUTH_TOKEN||''}`).toString('base64');
  const response=await fetch(url,{headers:{Authorization:`Basic ${auth}`}});
  if(!response.ok)throw new Error(`Unable to read WhatsApp media (${response.status})`);
  return Buffer.from(await response.arrayBuffer());
}

async function transcribe(audio,type){
  if(!audio)return {text:'',status:'No voice note'};
  if(!process.env.OPENAI_API_KEY)return {text:'',status:'Awaiting AI API key'};
  const form=new FormData();form.append('model',process.env.OPENAI_TRANSCRIBE_MODEL||'gpt-4o-mini-transcribe');form.append('file',new Blob([audio],{type:type||'audio/ogg'}),'voice-note.ogg');
  const response=await fetch('https://api.openai.com/v1/audio/transcriptions',{method:'POST',headers:{Authorization:`Bearer ${process.env.OPENAI_API_KEY}`},body:form});
  if(!response.ok)return {text:'',status:`Transcription failed (${response.status})`};
  return {text:(await response.json()).text||'',status:'Transcribed'};
}

async function interpret(text,image,type,tasks){
  const fallback=()=>({...fallbackInterpret(text,type,tasks),analysisStatus:process.env.OPENAI_API_KEY?'AI interpretation unavailable; rules applied':'Awaiting AI API key'});
  if(!process.env.OPENAI_API_KEY)return fallback();
  const choices=allDeliverables(tasks),content=[{type:'input_text',text:`Extract a factual construction deliverable claim. Percentages are context only and must never become earned progress. Match only one candidate deliverable and return JSON only with taskId, deliverableId, deliverableName, actualValue (number or null), actualQuantity, targetMet (boolean), verificationEvidence, legacyPercent (number or null), proposedFinish (YYYY-MM-DD or empty), summary, mediaAnalysis and confidence (0 to 1). If an image is attached, mediaAnalysis must describe only visible construction elements, measurable evidence, quality or safety observations, and any uncertainty. targetMet can be true only when the message and visible evidence support that the whole deliverable is complete and the measured result reaches its target. Candidate deliverables: ${JSON.stringify(choices)}. Message or transcript: ${text||'(none)'}`}];
  if(image)content.push({type:'input_image',image_url:`data:${type};base64,${image.toString('base64')}`});
  const response=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{Authorization:`Bearer ${process.env.OPENAI_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify({model:process.env.OPENAI_VISION_MODEL||'gpt-4.1-mini',input:[{role:'user',content}]})});
  if(!response.ok)return fallback();
  const payload=await response.json().catch(()=>({}));
  const parts=Array.isArray(payload.output)?payload.output.flatMap(x=>Array.isArray(x.content)?x.content:[]):[];
  const raw=payload.output_text||parts.map(x=>x&&x.text||'').join('')||'';
  try{const parsed=JSON.parse(raw.replace(/^```json\s*|\s*```$/g,'')),deliverable=choices.find(x=>x.id===parsed.deliverableId);if(!deliverable)return {...fallback(),proposedFinish:parsed.proposedFinish||fallback().proposedFinish,mediaAnalysis:String(parsed.mediaAnalysis||''),analysisStatus:'Interpreted'};const actualValue=Number.isFinite(Number(parsed.actualValue))?Number(parsed.actualValue):null;return {...parsed,taskId:deliverable.taskId,deliverableName:deliverable.name,actualValue,actualQuantity:actualValue===null?'':`${actualValue.toLocaleString()} ${deliverable.unit}`,targetMet:parsed.targetMet===true&&actualValue!==null&&actualValue>=deliverable.target,verificationEvidence:String(parsed.verificationEvidence||''),mediaAnalysis:String(parsed.mediaAnalysis||''),legacyPercent:Number.isFinite(Number(parsed.legacyPercent))?Number(parsed.legacyPercent):null,analysisStatus:'Interpreted'};}catch{return fallback();}
}

function xml(value){return String(value).replace(/[<>&'\"]/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;',"'":'&apos;','"':'&quot;'}[c]));}
function twimlMessages(messages){return `<Response>${messages.map(message=>`<Message>${xml(message)}</Message>`).join('')}</Response>`;}

async function deliverReplies(params,messages){
  const accountSid=process.env.TWILIO_ACCOUNT_SID,token=process.env.TWILIO_AUTH_TOKEN,from=params.To,to=params.From;
  if(!accountSid||!token||!from||!to)return {mode:'twiml',body:twimlMessages(messages)};
  for(const message of messages){
    const response=await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,{
      method:'POST',headers:{Authorization:`Basic ${Buffer.from(`${accountSid}:${token}`).toString('base64')}`,'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({From:from,To:to,Body:message})
    });
    if(!response.ok){const detail=(await response.text()).slice(0,280).replace(/[\r\n]+/g,' ');throw new Error(`Twilio reply delivery failed (${response.status})${detail?`: ${detail}`:''}`);}
  }
  return {mode:'rest',body:'<Response></Response>'};
}

module.exports=async function handler(req,res){
  if(req.method!=='POST')return res.status(405).send('Method not allowed');
  const params=formBody(req);
  if(!validTwilio(req,params))return res.status(403).send('Invalid Twilio signature');
  try{
    const mediaType=params.MediaContentType0||'',media=await downloadMedia(params.MediaUrl0),isAudio=mediaType.startsWith('audio/'),isImage=mediaType.startsWith('image/');
    const transcription=isAudio?await transcribe(media,mediaType):{text:'',status:'Not applicable'},contractor=contractorFor(params.From,params.Body),tasks=TASKS[contractor]||TASKS.voltaic;
    const messageText=[params.Body,transcription.text].filter(Boolean).join('\n'),date=new Date().toISOString().slice(0,10);
    const liveNow=await liveState();
    const commandReplies=[
      ...(await agentAnalysisReplies(messageText,liveNow)),
      ...agentCommandRepliesSync(messageText,contractor,liveNow)
    ].slice(0,10);
    const mediaId=media?crypto.randomUUID():'',mediaFileName=isAudio?'whatsapp-voice-note.ogg':isImage?`whatsapp-site-photo.${mediaType.includes('png')?'png':mediaType.includes('webp')?'webp':'jpg'}`:'';
    if(mediaId)await storeMedia(mediaId,media,mediaType,mediaFileName);
    const mediaUrl=mediaId?`/api/media?id=${mediaId}`:'';
    if(commandReplies.length){
      const head=commandReplies[0]||'';
      const commandTitle=head.includes('FULL PROJECT SCHEDULE')?'Full project schedule'
        :head.includes('SITE INSPECTION CHECKLIST')?'Site inspection checklist'
        :(head.match(/^([A-Z][A-Z &]{4,40})\n/)||[])[1]?.trim()||'Project information';
      let delivery,deliveryError='';
      try{delivery=await deliverReplies(params,commandReplies);}catch(error){deliveryError=error.message;delivery={mode:'twiml',body:twimlMessages(commandReplies)};}
      const deliveryStatus=delivery.mode==='rest'?`${commandReplies.length} reply messages sent through Twilio`:`${commandReplies.length} reply messages returned to Twilio${deliveryError?` after API delivery failed: ${deliveryError}`:''}`;
      await appendUpdate({id:`WA-${params.MessageSid||crypto.randomUUID()}`,contractor,taskId:'',title:`Agent request · ${commandTitle}`,mediaType:isAudio?'voice':'message',mediaUrl,mediaContentType:mediaType,mediaFileName,mediaStatus:mediaId?'Stored in Bohio evidence vault':'WhatsApp request',text:messageText,transcript:transcription.text,transcriptionStatus:transcription.status,imageAnalysis:'',imageAnalysisStatus:'Not applicable',summary:`Bohio prepared the ${commandTitle.toLowerCase()}. ${deliveryStatus}.`,deliveryStatus,source:'Twilio WhatsApp · Planner/PM',reporterRole:'Planner / Project Manager',date,ts:new Date().toISOString(),command:commandTitle});
      res.setHeader('Content-Type','text/xml');return res.status(200).send(delivery.body);
    }
    const interpretation=await interpret(messageText,isImage?media:null,mediaType,tasks);
    /* Resolve against the whole project, not just the sender's own package.
     * Scoping this to TASKS[contractor] meant a planner on DEFAULT_CONTRACTOR
     * could only ever log duct and tele: an asphalt or drainage claim matched
     * the deliverable but was then discarded here, and the event was filed
     * against the wrong task. */
    const task=taskById(interpretation.taskId)||tasks[0],
      deliverable=everyDeliverable().find(x=>x.id===interpretation.deliverableId),
      verificationEvidence=mediaUrl||interpretation.verificationEvidence||'';
    const event={id:`WA-${params.MessageSid||crypto.randomUUID()}`,contractor,taskId:task.id,title:task.name,mediaType:isAudio?'voice':isImage?'photo':'message',mediaUrl,mediaContentType:mediaType,mediaFileName,mediaStatus:mediaId?'Stored in Bohio evidence vault':params.MediaUrl0?'Media unavailable':'Text evidence',text:params.Body||transcription.text,transcript:transcription.text,transcriptionStatus:transcription.status,imageAnalysis:isImage?String(interpretation.mediaAnalysis||interpretation.summary||'Image retained; no separate visual findings returned.'):'',imageAnalysisStatus:isImage?interpretation.analysisStatus:'Not applicable',evidence:verificationEvidence||'WhatsApp text',pct:null,legacyPercent:interpretation.legacyPercent,previousPct:null,confidence:Number(interpretation.confidence)||.5,date,ts:new Date().toISOString(),proposedFinish:interpretation.proposedFinish||'',deliverableId:deliverable?.id||'',deliverableName:deliverable?.name||'',actualValue:interpretation.actualValue,actualQuantity:interpretation.actualQuantity||'',targetMet:interpretation.targetMet===true,verificationEvidence,summary:interpretation.summary||'WhatsApp evidence received',source:'Twilio WhatsApp · Planner/PM',reporterRole:'Planner / Project Manager'};
    await appendUpdate(event);

    /* Push to Monday from the server. Previously only index.html ever called
     * api/monday.js, so anything sent over WhatsApp while nobody had Bohio
     * open never reached the board at all. The photo goes up with it, and the
     * status only moves for a verified deliverable. */
    /* Only a verified deliverable or an approved date change may reach the
     * board — api/monday.js has always said so. Previously this ran for every
     * inbound message, so a stray line of chatter posted an update and moved
     * a status on whichever item happened to be first for that contractor. */
    const verifiedClaim=event.targetMet===true&&!!verificationEvidence;
    const dateChange=!!event.proposedFinish;
    const shouldSync=verifiedClaim||dateChange;
    let mondaySync=shouldSync
      ? {ok:false,skipped:'Monday is not configured'}
      : {ok:false,skipped:deliverable?'Held in Bohio until the claim is verified':'No deliverable claimed'};
    if(shouldSync&&mondayConfigured()){
      try{
        const base=(process.env.PUBLIC_BASE_URL||'').replace(/\/$/,'');
        mondaySync=await syncToMonday({
          taskId:task.id,taskName:task.name,
          detail:event.summary||event.text||'WhatsApp evidence received',
          reporter:event.reporterRole,
          evidenceUrl:mediaUrl?`${base}${mediaUrl}`:'',
          statusLabel:verifiedClaim?'Done':'',
          proposedFinish:event.proposedFinish||'',
          verified:verifiedClaim,
          file:media?{buffer:media,fileName:mediaFileName||'whatsapp-evidence',contentType:mediaType}:null
        });
      }catch(error){ mondaySync={ok:false,error:error.message}; }
    }
    event.mondaySync=mondaySync;

    /* Record in the shared state only what the message actually established.
     * A status is written when the claim is verified; a message that named no
     * deliverable must not move anything. */
    if(deliverable||dateChange){
      try{
        await applyChange(task.id,{
          status:verifiedClaim?'Done':undefined,
          plannedFinish:event.proposedFinish||undefined,
          mondayItemId:mondaySync.itemId||undefined
        },'whatsapp',event.reporterRole||'WhatsApp');
      }catch(e){ /* state is best-effort; the update itself is already stored */ }
    }

    const uploadConfirmation=(mediaId?` Evidence uploaded to Bohio at ${new Date().toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit',timeZone:'Asia/Riyadh'})}. View it in Schedule > ${task.name}.`:'')
      +(mondaySync.ok
        ? ` On Monday: update posted to "${mondaySync.itemName}"${mondaySync.file&&!mondaySync.file.error?' with the photo attached':''}${mondaySync.status&&!mondaySync.status.error?', status updated':''}.`
        : mondaySync.error? ` Monday sync failed: ${mondaySync.error}.` : '');
    /* State exactly what was received. The reply must never assert more than
     * the message supports: naming a deliverable is not a claim that it is
     * finished, and a quantity is not evidence. */
    const qty=event.actualQuantity||'';
    const target=deliverable?`${Number(deliverable.target).toLocaleString()} ${deliverable.unit}`:'';
    const reply=(event.proposedFinish
      ?`Bohio matched ${task.name}. The date change is waiting for planner approval.`
      :!deliverable
        ?`Bohio logged the ${event.mediaType} as project evidence. Name the completed deliverable, measured quantity and evidence before progress can be earned.`
        :event.targetMet&&verificationEvidence
          ?`Bohio matched "${event.deliverableName}" at ${qty} against a target of ${target}, with evidence attached. It is logged for verification; Primavera is unchanged until it is accepted.`
          :event.targetMet
            ?`Bohio matched "${event.deliverableName}" at ${qty}, which meets the ${target} target, but no evidence was attached. Send a photo or a test reference to complete the claim.`
            :qty
              ?`Bohio filed this against "${event.deliverableName}" at ${qty} of a ${target} target. It earns zero until the full target is measured and evidenced.`
              :`Bohio filed this as evidence against "${event.deliverableName}". No measured quantity was given, so no progress was recorded. Reply with the quantity against the ${target} target to claim it.`)
      +uploadConfirmation;
    let delivery;
    try{delivery=await deliverReplies(params,[reply]);}catch{delivery={body:twimlMessages([reply])};}
    res.setHeader('Content-Type','text/xml');return res.status(200).send(delivery.body);
  }catch(error){
    res.setHeader('Content-Type','text/xml');return res.status(200).send(twimlMessages([`Bohio could not process this update: ${error.message}`]));
  }
};
