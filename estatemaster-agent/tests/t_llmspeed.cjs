// The AI proxy's speed features change nothing the model receives except what is allowed: prompt caching marks the tools, the
// system prompt and (in the agent's loop) the conversation so far as cacheable, with the same text; the chat's answer streams
// through untouched; anything else stays one JSON reply; a stream that breaks ends with an error event, never silently.
const path=__dirname+'/../api/';
const mk=(body,headers={})=>{const req={method:'POST',url:'/api/llm',headers:{host:'x.test','content-type':'application/json','x-forwarded-for':'10.9.0.'+(headers.ip||1),...headers},body,socket:{},[Symbol.asyncIterator]:async function*(){yield Buffer.from(JSON.stringify(body))}};
  const res={code:200,hdr:{},out:'',chunks:[],setHeader(k,v){this.hdr[k.toLowerCase()]=v},write(c){this.chunks.push(Buffer.from(c).toString())},end(s){if(s)this.out=String(s);this.done=true}};Object.defineProperty(res,'statusCode',{get(){return this.code},set(v){this.code=v}});return[req,res]};
let pass=0,fail=0;const ok=(c,m)=>{console.log((c?'PASS':'FAIL')+' | '+m);c?pass++:fail++};
(async()=>{
  process.env.ANTHROPIC_API_KEY='k';process.env.OPENAI_API_KEY='k';delete process.env.DEMO_PASSWORD;delete process.env.DEMO_SESSION_SECRET;
  const llm=require(path+'llm.js');let sent=null;
  const sse=['event: message_start\ndata: {"type":"message_start","message":{"id":"m","role":"assistant","content":[]}}\n\n','event: content_block_start\ndata: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}\n\n','event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hello"}}\n\n','event: message_stop\ndata: {"type":"message_stop"}\n\n'];
  let mode='json';
  global.fetch=async(url,o)=>{sent=JSON.parse(o.body);
    if(mode==='sse')return{ok:true,status:200,headers:{get:k=>/content-type/i.test(k)?'text/event-stream':null},body:(async function*(){for(const c of sse)yield Buffer.from(c)})(),text:async()=>''};
    if(mode==='broken')return{ok:true,status:200,headers:{get:k=>/content-type/i.test(k)?'text/event-stream':null},body:(async function*(){yield Buffer.from(sse[0]);throw new Error('socket hang up')})(),text:async()=>''};
    return{ok:true,status:200,headers:{get:()=> 'application/json'},text:async()=>JSON.stringify({content:[{type:'text',text:'ok'}]})}};
  const tools=[{name:'a',description:'d',input_schema:{type:'object',properties:{}}},{name:'b',description:'d',input_schema:{type:'object',properties:{}}}];
  const msgs=[{role:'user',content:'q'},{role:'assistant',content:[{type:'text',text:'t'},{type:'tool_use',id:'x',name:'a',input:{}}]},{role:'user',content:[{type:'tool_result',tool_use_id:'x',content:'r'}]}];
  let [q,r]=mk({provider:'anthropic',task:'agent',payload:{model:'claude-fable-5-1',system:'SYS TEXT',tools,messages:msgs,max_tokens:100}});await llm(q,r);
  ok(Array.isArray(sent.system)&&sent.system[0].text==='SYS TEXT'&&sent.system[0].cache_control&&sent.system[0].cache_control.type==='ephemeral','the system prompt is marked cacheable, same text');
  ok(sent.tools.length===2&&!sent.tools[0].cache_control&&sent.tools[1].cache_control&&sent.tools[1].name==='b'&&sent.tools[1].description==='d','only the last tool carries the cache mark; tools unchanged');
  const lm=sent.messages[2].content;ok(lm[0].type==='tool_result'&&lm[0].content==='r'&&lm[0].cache_control,'the agent loop: the latest tool result is marked, so the next step reuses the conversation');
  ok(JSON.stringify(sent.messages[1])===JSON.stringify(msgs[1])&&sent.messages[0].content==='q','earlier messages are untouched');
  ok(!('stream' in sent)&&r.hdr['content-type']==='application/json'&&JSON.parse(r.out).content[0].text==='ok','no stream asked: one JSON reply as before');
  const marks=JSON.stringify(sent).split('cache_control').length-1;ok(marks<=4,'at most 4 cache marks (the API limit): '+marks);
  [q,r]=mk({provider:'anthropic',task:'calc',payload:{model:'claude-fable-5-1',system:'S',messages:[{role:'user',content:'q'}],stream:true,max_tokens:100}});await llm(q,r);
  ok(!('stream' in sent)&&sent.messages[0].content==='q','a calculation never streams and its single message is not altered');
  mode='sse';[q,r]=mk({provider:'anthropic',task:'agent',payload:{model:'claude-fable-5-1',system:'S',messages:[{role:'user',content:'q'}],stream:true,max_tokens:100}},{ip:2});await llm(q,r);
  ok(sent.stream===true&&/event-stream/.test(r.hdr['content-type'])&&r.chunks.join('')===sse.join('')&&r.done,'the chat answer streams through byte for byte');
  mode='broken';[q,r]=mk({provider:'anthropic',task:'answer',payload:{model:'claude-fable-5-1',system:'S',messages:[{role:'user',content:'q'}],stream:true,max_tokens:100}},{ip:3});await llm(q,r);
  ok(/event: error/.test(r.chunks.join(''))&&/stream broke/.test(r.chunks.join(''))&&r.done,'a stream that breaks ends with an error event the page reports');
  mode='json';[q,r]=mk({provider:'openai',task:'agent',payload:{model:'gpt-5',messages:[{role:'user',content:'q'}],stream:true}},{ip:4});await llm(q,r);
  ok(!('stream' in sent)&&!JSON.stringify(sent).includes('cache_control'),'OpenAI requests are unchanged (no stream, no Claude cache marks)');
  console.log(`${pass} pass, ${fail} fail`);process.exit(fail?1:0)})();
