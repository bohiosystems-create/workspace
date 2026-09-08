const crypto=require('node:crypto');
const {appendUpdate,storeMedia}=require('./_store');

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
  delta:[{id:'earth',name:'Earthworks & Bulk Excavation',deliverables:[['earth-01','Topsoil stripped and stockpiled',48000,'m²','Drone surface and stockpile survey'],['earth-02','North basin cut complete',82000,'m³','Approved cut-volume survey'],['earth-03','Central platform filled',96000,'m³','Compaction tests and level survey'],['earth-04','South corridor formation complete',31000,'m²','Formation level and proof-roll record'],['earth-05','Earthworks close-out accepted',1,'pack','As-built model and engineer acceptance']]}],
  aqua:[{id:'drain',name:'Stormwater & Drainage Network',deliverables:[['drain-01','Primary storm line installed',1240,'m','Surveyed invert levels and inspection photos'],['drain-02','Secondary storm branches installed',860,'m','Surveyed invert levels and joint records'],['drain-03','Catchpits and manholes complete',34,'units','Inspection checklist for every structure'],['drain-04','Outfall and headwall commissioned',2,'outfalls','Structural inspection and flow test'],['drain-05','Drainage network accepted',1,'network','CCTV survey and signed handover']]}],
  verdant:[{id:'land',name:'Landscaping & Handover',deliverables:[['land-01','Topsoil placement accepted',22000,'m²','Depth checks and survey'],['land-02','Irrigation network commissioned',1,'system','Pressure test and zone demonstration'],['land-03','Trees and shrubs planted',1480,'units','Geotagged planting register'],['land-04','Hard landscape complete',6400,'m²','Finish inspection and snag close-out'],['land-05','Landscape establishment accepted',1,'area','30-day establishment inspection']]}],
  robopave:[{id:'asph',name:'Asphalt & Surfacing',deliverables:[['asph-01','Asphalt mix design approved',1,'design','Laboratory approval and trial panel'],['asph-02','Binder course — north spine accepted',9600,'m²','Core density and level survey'],['asph-03','Binder course — south loop accepted',8900,'m²','Core density and level survey'],['asph-04','Wearing course complete',18500,'m²','Thickness, density and ride-quality tests'],['asph-05','Road markings and opening certificate',1,'network','Safety inspection and opening certificate']]}],
  gridbot:[{id:'light',name:'Street Lighting & ITS',deliverables:[['light-01','Lighting foundations accepted',64,'units','Foundation inspection records'],['light-02','Poles installed and aligned',64,'units','Surveyed alignment and torque records'],['light-03','Luminaries and feeder cabling complete',64,'units','Cable test and installation records'],['light-04','ITS field devices commissioned',18,'devices','Functional test sheets'],['light-05','Lighting and ITS system accepted',1,'system','Night test and handover certificate']]}],
  terra:[{id:'sub',name:'Road Sub-base & Kerbing survey support',deliverables:[['sub-03','Sub-base compacted and accepted',12800,'m²','Density tests and level survey']]}]
};
function allDeliverables(tasks){return tasks.flatMap(task=>task.deliverables.map(([id,name,target,unit,acceptance])=>({id,name,target,unit,acceptance,taskId:task.id,taskName:task.name})));}
function normalize(value){return String(value||'').toLowerCase().replace(/[^a-z0-9²³]+/g,' ');}
function fallbackInterpret(text,type,tasks){
  const source=String(text||''),normalized=normalize(source),candidates=allDeliverables(tasks),ranked=candidates.map(d=>{const tokens=normalize(d.name).split(' ').filter(x=>x.length>2&&!['and','the','complete','installed','accepted'].includes(x));return {d,score:tokens.filter(x=>normalized.includes(x)).length};}).sort((a,b)=>b.score-a.score),top=ranked[0],deliverable=top&&top.score>=1?top.d:null;
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
  const payload=await response.json(),raw=payload.output_text||payload.output?.flatMap(x=>x.content||[]).map(x=>x.text||'').join('')||'';
  try{const parsed=JSON.parse(raw.replace(/^```json\s*|\s*```$/g,'')),deliverable=choices.find(x=>x.id===parsed.deliverableId);if(!deliverable)return {...fallback(),proposedFinish:parsed.proposedFinish||fallback().proposedFinish,mediaAnalysis:String(parsed.mediaAnalysis||''),analysisStatus:'Interpreted'};const actualValue=Number.isFinite(Number(parsed.actualValue))?Number(parsed.actualValue):null;return {...parsed,taskId:deliverable.taskId,deliverableName:deliverable.name,actualValue,actualQuantity:actualValue===null?'':`${actualValue.toLocaleString()} ${deliverable.unit}`,targetMet:parsed.targetMet===true&&actualValue!==null&&actualValue>=deliverable.target,verificationEvidence:String(parsed.verificationEvidence||''),mediaAnalysis:String(parsed.mediaAnalysis||''),legacyPercent:Number.isFinite(Number(parsed.legacyPercent))?Number(parsed.legacyPercent):null,analysisStatus:'Interpreted'};}catch{return fallback();}
}

function xml(value){return String(value).replace(/[<>&'\"]/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;',"'":'&apos;','"':'&quot;'}[c]));}

/* ---------------------------------------------------------------------------
   Conversational commands (schedule, site-inspection checklist, status, help).
   These let a planner or contractor text the Bohio agent and receive an
   answer, instead of every message being force-matched to a deliverable.
   The schedule mirrors the portal seed (index.html) so both stay consistent.
--------------------------------------------------------------------------- */
const CONTRACTOR_NAMES={voltaic:'Voltaic Power Systems',meridian:'Meridian Roads',delta:'Delta Civil',aqua:'AquaFlow Infrastructure',verdant:'Verdant Landscapes',robopave:'RoboPave Autonomous Fleet',gridbot:'Gridline Robotics',terra:'Terra Survey Drones'};
const PROJECT={name:'Marina District — Access & Utilities Infrastructure',client:'Bohio Development Partners',dataDate:'2026-08-28'};
const SCHEDULE=[
  {id:'mob',  name:'Mobilization & Site Setup',        contractor:'delta',   start:'2026-01-06',finish:'2026-01-30',progress:100,status:'Complete'},
  {id:'earth',name:'Earthworks & Bulk Excavation',     contractor:'delta',   start:'2026-02-02',finish:'2026-04-10',progress:100,status:'Complete'},
  {id:'drain',name:'Stormwater & Drainage Network',    contractor:'aqua',    start:'2026-03-16',finish:'2026-05-29',progress:100,status:'Complete'},
  {id:'water',name:'Sewerage & Water Mains',           contractor:'aqua',    start:'2026-04-13',finish:'2026-06-26',progress:100,status:'Complete'},
  {id:'duct', name:'Electrical Ductbank & Substation', contractor:'voltaic', start:'2026-05-04',finish:'2026-07-31',progress:68, status:'In progress'},
  {id:'tele', name:'Telecoms & Fibre Ducting',         contractor:'voltaic', start:'2026-06-01',finish:'2026-07-24',progress:80, status:'In progress'},
  {id:'sub',  name:'Road Sub-base & Kerbing',          contractor:'meridian',start:'2026-06-15',finish:'2026-08-21',progress:72, status:'In progress'},
  {id:'asph', name:'Asphalt & Surfacing',              contractor:null,      start:'2026-08-24',finish:'2026-10-16',progress:0,  status:'Open tender'},
  {id:'light',name:'Street Lighting & ITS',            contractor:null,      start:'2026-09-07',finish:'2026-10-30',progress:0,  status:'Open tender'},
  {id:'land', name:'Landscaping & Handover',           contractor:'verdant', start:'2026-10-19',finish:'2026-12-11',progress:0,  status:'Not started'},
];
const MILESTONES=[
  {name:'Site Possession',plan:'2026-01-06'},
  {name:'Drainage Network Complete',plan:'2026-05-29'},
  {name:'Utilities Energized',plan:'2026-07-31'},
  {name:'Road Open to Traffic',plan:'2026-10-16'},
  {name:'Practical Completion & Handover',plan:'2026-12-11'},
];
function contractorMentioned(text){
  const t=String(text||'').toLowerCase();
  for(const id of Object.keys(CONTRACTOR_NAMES)){if(t.includes(id)||t.includes(CONTRACTOR_NAMES[id].toLowerCase()))return id;}
  return '';
}
function detectCommand(body){
  const t=String(body||'').trim().toLowerCase();
  if(!t)return null;
  const has=(...w)=>w.some(x=>t.includes(x));
  const words=t.split(/\s+/).length;
  if(/^(help|menu|commands?|options|start|hi|hello|hey)\b/.test(t)||has('what can you do','how do i use'))return {type:'help'};
  if(has('inspection checklist','site inspection','inspection check list','inspection list','snag list','snagging')||/\bchecklist\b/.test(t)||/\bcheck ?list\b/.test(t))return {type:'checklist',filter:contractorMentioned(t)};
  // Schedule / programme request. Treat as a query only when it reads like one and
  // carries no proposed date (a date means a schedule-change request, handled as evidence).
  const dateInBody=/20\d{2}-\d{2}-\d{2}/.test(t)||has('propose','proposed','extension','push to','move to','slipped','delay');
  const bare=/^(the\s+|full\s+|project\s+)*(schedule|programme|programme dates|timeline|gantt)(\s+please)?$/.test(t)||/^schedule\s+(voltaic|meridian|delta|aqua|verdant|robopave|gridbot|terra)$/.test(t);
  const requested=(/\bschedule\b|\bprogramme\b|\btimeline\b|\bgantt\b/.test(t))&&has('send','show','share','full','view','see','what','give','the whole','entire','look-ahead','look ahead');
  if(!dateInBody&&(bare||requested||has('full schedule','project schedule','send me the schedule')))return {type:'schedule',filter:contractorMentioned(t)};
  if(has('progress summary','overall progress','where are we','project status','status update','give me a status')||(/\bstatus\b/.test(t)&&words<=4)||(/\bprogress\b/.test(t)&&words<=4))return {type:'status',filter:contractorMentioned(t)};
  return null;
}
function fmtDate(iso){if(!/^\d{4}-\d{2}-\d{2}$/.test(String(iso||'')))return String(iso||'');const[y,m,d]=iso.split('-');return `${d} ${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][Number(m)-1]} ${y}`;}
// WhatsApp bodies cap near 1600 chars; split on blank lines, keeping chunks under 1400.
function chunkForWhatsApp(text,limit=1400){
  const blocks=String(text).split('\n\n'),chunks=[];let current='';
  for(const block of blocks){
    const piece=(current?current+'\n\n':'')+block;
    if(piece.length>limit&&current){chunks.push(current);current=block;}
    else current=piece;
    while(current.length>limit){chunks.push(current.slice(0,limit));current=current.slice(limit);}
  }
  if(current)chunks.push(current);
  return chunks.length?chunks:[String(text)];
}
function statusIcon(s){return {'Complete':'✅','In progress':'🔧','Open tender':'📋','Not started':'⏳'}[s]||'•';}
function buildSchedule(filter){
  const rows=SCHEDULE.filter(t=>!filter||t.contractor===filter);
  const scope=filter?`${CONTRACTOR_NAMES[filter]} — assigned packages`:'Full programme (10 work packages)';
  let out=`📅 *${PROJECT.name}*\nSchedule of record · Primavera P6\nData date ${fmtDate(PROJECT.dataDate)}\n${scope}\n`;
  rows.forEach((t,i)=>{
    const who=t.contractor?CONTRACTOR_NAMES[t.contractor]:'Open tender — not yet awarded';
    out+=`\n${i+1}. ${statusIcon(t.status)} *${t.name}*\n   ${fmtDate(t.start)} → ${fmtDate(t.finish)}\n   ${who}\n   ${t.status} · ${t.progress}% earned`;
  });
  if(!filter){
    out+='\n\n*Key milestones*';
    MILESTONES.forEach(m=>{out+=`\n• ${m.name} — ${fmtDate(m.plan)}`;});
  }
  out+='\n\nReply *checklist* for a site-inspection sheet, or *status* for a progress summary. Proposed date changes go to the planner for approval.';
  return out;
}
function buildChecklist(filter){
  const active=SCHEDULE.filter(t=>t.contractor&&t.status!=='Complete'&&(!filter||t.contractor===filter));
  const contractors=filter?[filter]:[...new Set(active.map(t=>t.contractor))];
  let out=`📋 *Site Inspection Checklist*\n${PROJECT.name}\nInspection date: ____________  Inspector: ____________\n`;
  out+='\n*A. Site setup & HSE (all areas)*';
  ['Permit to work displayed and valid','Access, edge protection & barriers in place','PPE compliance across the crew','Exclusion zones around plant & excavations','Spill kits, first aid & fire points present','Environmental controls (dust, silt, noise) working','Setting-out & survey control verified'].forEach((x,i)=>{out+=`\n  ${i+1}. [ ] ${x}`;});
  contractors.forEach(cid=>{
    const tasks=(TASKS[cid]||[]);
    const pkgNames=SCHEDULE.filter(t=>t.contractor===cid&&t.status!=='Complete').map(t=>t.name).join(', ');
    out+=`\n\n*B. ${CONTRACTOR_NAMES[cid]||cid}*${pkgNames?`\n${pkgNames}`:''}`;
    let n=0;
    tasks.forEach(task=>task.deliverables.forEach(([id,name,target,unit,acceptance])=>{
      n++;out+=`\n  ${n}. [ ] ${name}\n       Target ${Number(target).toLocaleString()} ${unit} · verify: ${acceptance}`;
    }));
    if(!n)out+='\n  (No open deliverables on record.)';
  });
  out+='\n\n*Evidence:* attach a geotagged site photo or a voice note against each item and it is filed to the Bohio evidence vault, then linked to Primavera once the deliverable is verified.\n*Sign-off:* Contractor ____________  Bohio verifier ____________';
  return out;
}
function buildStatus(filter){
  const rows=SCHEDULE.filter(t=>!filter||t.contractor===filter);
  const done=rows.filter(t=>t.status==='Complete').length,active=rows.filter(t=>t.status==='In progress');
  const avg=Math.round(rows.reduce((n,t)=>n+t.progress,0)/(rows.length||1));
  let out=`📊 *Progress summary*\n${filter?CONTRACTOR_NAMES[filter]:PROJECT.name}\nData date ${fmtDate(PROJECT.dataDate)}\n\n${done}/${rows.length} packages complete · ${avg}% weighted average.`;
  if(active.length){out+='\n\n*In progress:*';active.forEach(t=>{out+=`\n• ${t.name} — ${t.progress}% (due ${fmtDate(t.finish)})`;});}
  out+='\n\nReply *schedule* for full dates or *checklist* for an inspection sheet.';
  return out;
}
function buildHelp(){
  return `👋 *Bohio Project Agent*\nI turn WhatsApp messages, site photos and voice notes into verified progress on the ${PROJECT.name}.\n\nTry:\n• *schedule* — full programme dates & milestones\n• *schedule voltaic* — one contractor's packages\n• *checklist* — site-inspection sheet\n• *status* — progress summary\n\nTo report work, just describe the completed deliverable with its measured quantity and attach a photo or voice note as evidence — e.g. "Ductbank installed Grids A–C, 640 m, mandrel test passed". Percentages alone never earn progress; the full target plus evidence must be verified before Primavera is updated.`;
}
function renderCommand(command){
  const text=command.type==='schedule'?buildSchedule(command.filter):command.type==='checklist'?buildChecklist(command.filter):command.type==='status'?buildStatus(command.filter):buildHelp();
  return chunkForWhatsApp(text);
}
function sendTwiml(res,messages){
  const body=(Array.isArray(messages)?messages:[messages]).map(m=>`<Message>${xml(m)}</Message>`).join('');
  res.setHeader('Content-Type','text/xml');
  return res.status(200).send(`<Response>${body}</Response>`);
}

module.exports=async function handler(req,res){
  if(req.method!=='POST')return res.status(405).send('Method not allowed');
  const params=formBody(req);
  if(!validTwilio(req,params))return res.status(403).send('Invalid Twilio signature');
  try{
    // Conversational commands (schedule, checklist, status, help) — text only.
    // A message carrying media is always treated as site evidence, never a command.
    if(!params.MediaUrl0){
      const command=detectCommand(params.Body);
      if(command)return sendTwiml(res,renderCommand(command));
    }
    let mediaError='';
    const mediaType=params.MediaContentType0||'',media=params.MediaUrl0?await downloadMedia(params.MediaUrl0).catch(e=>{mediaError=e.message;return null;}):null,isAudio=mediaType.startsWith('audio/'),isImage=mediaType.startsWith('image/');
    const transcription=isAudio&&media?await transcribe(media,mediaType):{text:'',status:isAudio?(mediaError||'Voice note unavailable'):'Not applicable'},contractor=contractorFor(params.From,params.Body),tasks=TASKS[contractor]||TASKS.voltaic;
    const interpretation=await interpret([params.Body,transcription.text].filter(Boolean).join('\n'),isImage?media:null,mediaType,tasks),task=tasks.find(x=>x.id===interpretation.taskId)||tasks[0],deliverable=allDeliverables(tasks).find(x=>x.id===interpretation.deliverableId),date=new Date().toISOString().slice(0,10);
    const mediaId=media?crypto.randomUUID():'',mediaFileName=isAudio?'whatsapp-voice-note.ogg':isImage?`whatsapp-site-photo.${mediaType.includes('png')?'png':mediaType.includes('webp')?'webp':'jpg'}`:'';
    if(mediaId)await storeMedia(mediaId,media,mediaType,mediaFileName);
    const mediaUrl=mediaId?`/api/media?id=${mediaId}`:'',verificationEvidence=mediaUrl||interpretation.verificationEvidence||'';
    const event={id:`WA-${params.MessageSid||crypto.randomUUID()}`,contractor,taskId:task.id,title:task.name,mediaType:isAudio?'voice':isImage?'photo':'message',mediaUrl,mediaContentType:mediaType,mediaFileName,mediaStatus:mediaId?'Stored in Bohio evidence vault':params.MediaUrl0?(mediaError?`Media unavailable (${mediaError})`:'Media unavailable'):'Text evidence',text:params.Body||transcription.text,transcript:transcription.text,transcriptionStatus:transcription.status,imageAnalysis:isImage?String(interpretation.mediaAnalysis||interpretation.summary||'Image retained; no separate visual findings returned.'):'',imageAnalysisStatus:isImage?interpretation.analysisStatus:'Not applicable',evidence:verificationEvidence||'WhatsApp text',pct:null,legacyPercent:interpretation.legacyPercent,previousPct:null,confidence:Number(interpretation.confidence)||.5,date,ts:new Date().toISOString(),proposedFinish:interpretation.proposedFinish||'',deliverableId:deliverable?.id||'',deliverableName:deliverable?.name||'',actualValue:interpretation.actualValue,actualQuantity:interpretation.actualQuantity||'',targetMet:interpretation.targetMet===true,verificationEvidence,summary:interpretation.summary||'WhatsApp evidence received',source:'Twilio WhatsApp'};
    await appendUpdate(event);
    const reply=event.proposedFinish?`Bohio matched ${task.name}. The date change is waiting for planner approval.`:event.targetMet&&verificationEvidence?`Bohio matched ${event.deliverableName}. The full target and evidence are logged for verification. Primavera remains unchanged until it is accepted.`:deliverable?`Bohio logged ${event.deliverableName} as work in progress. It earns zero until the complete target and evidence are verified.`:`Bohio logged the ${event.mediaType} as project evidence. Name the completed deliverable, measured quantity and evidence before progress can be earned. Reply "schedule" or "checklist" any time.`;
    return sendTwiml(res,reply);
  }catch(error){
    return sendTwiml(res,`Bohio could not process this update: ${error.message}`);
  }
};
