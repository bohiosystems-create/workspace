// /api/voice transcribe: the recording goes to ElevenLabs speech-to-text and comes back as words.
process.env.ELEVENLABS_API_KEY='k';const API=__dirname+'/../api/';const R=[];const ck=(n,ok,d)=>R.push([ok?'PASS':'FAIL',n,String(d??'').slice(0,200)]);
let sent=null;global.fetch=async(url,o={})=>{sent={url:String(url),o};return{ok:true,status:200,json:async()=>({text:'  Why is the margin\n under the hurdle? '})}};
const call=(h,body)=>new Promise(ok=>{const req={method:'POST',url:'/api/voice',headers:{host:'a.example',origin:'https://a.example'},body};const res={statusCode:200,setHeader(){},end(b){let j=b;try{j=JSON.parse(b)}catch{}ok({status:this.statusCode,body:j})}};h(req,res)});
(async()=>{const v=require(API+'voice.js');
  let r=await call(v,{transcribe:true,audio_base64:Buffer.alloc(3000,1).toString('base64'),mime:'audio/webm;codecs=opus',lang:'en'});
  ck('transcribe: ElevenLabs speech-to-text with scribe_v1, English, the audio as a file; text cleaned',r.status===200&&r.body.text==='Why is the margin under the hurdle?'&&/speech-to-text/.test(sent.url)&&sent.o.body.get('model_id')==='scribe_v1'&&sent.o.body.get('language_code')==='eng'&&sent.o.body.get('file').size===3000,JSON.stringify(r.body));
  r=await call(v,{transcribe:true,audio_base64:Buffer.alloc(3000,1).toString('base64'),mime:'audio/mp4',lang:'ar'});ck('Arabic recording: language ara',sent.o.body.get('language_code')==='ara',sent.o.body.get('language_code'));
  r=await call(v,{transcribe:true,audio_base64:'abc'});ck('no audio refused',r.status===400,r.status);
  for(const x of R)console.log(x.join('  '))})();
