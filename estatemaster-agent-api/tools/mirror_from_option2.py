"""
Builds this demo (the EstateMaster API option) from Option 2's current source, so every change pushed to Option 2 is
mirrored here. The API option is Option 2 plus the API patch below (the mode, the simulated API module, the approval
flow writing through the API, the wording). Run after building Option 2:

    python tools/mirror_from_option2.py            (from estatemaster-agent-api/)

Reads ../estatemaster-agent/index.html and api/, writes index.html, api/, vercel.json, package.json, market-data.xlsx here.
"""
import json, re, shutil
from pathlib import Path
HERE = Path(__file__).resolve().parent.parent
SRC = HERE.parent / 'estatemaster-agent'
B = json.load(open(HERE / 'tools/api_blocks.json', encoding='utf-8'))
s = (SRC / 'index.html').read_text(encoding='utf-8')
def rep(old, new, n=1):
    global s
    assert s.count(old) == n, (s.count(old), old[:90]); s = s.replace(old, new)
assert s.count("\n<script>\n") == 1
s = s.replace("\n<script>\n", "\n<script>window.BOHIO_MODE='api';</script>\n<script>\n", 1)
s = re.sub(r"<title>.*?</title>", "<title>KINAN · AI agent · financial modelling</title>", s, count=1, flags=re.S)
rep("const ok=['full','readonly','analyst'];", "const ok=['full','readonly','analyst','api'];")
anchor = "Never give a figure for a change as if it were a result: say EstateMaster will calculate it once refreshed.'}"
rep(anchor, anchor + B['mode_info'])
anchor = "const MI=()=>MODE_INFO[MODE]||MODE_INFO.readonly;"
rep(anchor, anchor + B['module'])
rep("""  else{t=addTask(MODE==='analyst'?'refresh':'apply',cr);""", """  else if(MODE==='api'){t=addTask('api',cr);detail=`${cr.id} approved: job ${t.id} writes it to EstateMaster through the API, then reads EstateMaster’s recalculated figures back`}
  else{t=addTask(MODE==='analyst'?'refresh':'apply',cr);""")
rep("""  if(t)toast(`${cr.id} approved · task ${t.id} for an analyst`);""", """  if(t)toast(MODE==='api'?`${cr.id} approved · writing to EstateMaster through the API (${t.id})`:`${cr.id} approved · task ${t.id} for an analyst`);""")
rep("saveMem();return{cr,who,task:t}}", "saveMem();if(MODE==='api'&&t)apiRun(t.id);return{cr,who,task:t}}")
rep("""function taskTitle(t){return t.kind==='newmodel'""", """function taskTitle(t){if(MODE==='api')return t.kind==='newmodel'?'Create the model in EstateMaster (API)':t.kind==='stress'?`Run ${t.scen.length} stress scenario${t.scen.length>1?'s':''} in EstateMaster (API, sandbox copy)`:MI().task;return t.kind==='newmodel'""")
anchor = "  const f=slug()+'.emdf',crs=t.crs.map(id=>APQ.find(c=>c.id===id)).filter(Boolean);"
rep(anchor, anchor + B['steps'])
rep("async function completeTask(id,file){", "async function completeTask(id,file,opt={}){")
rep("by:'Analyst'+(file?'':' (simulated)')};", "by:opt.api?'EstateMaster API (simulated)':'Analyst'+(file?'':' (simulated)')};")
rep("logEvent({kind:'stress',actor:'Analyst (simulated)',channel:'EstateMaster export',detail:`${t.id} done:", "logEvent({kind:'stress',actor:opt.api?'EstateMaster API (simulated)':'Analyst (simulated)',channel:'EstateMaster export',detail:`${t.id} done:")
rep("addExport(parsed?'file':'sim',", "addExport(parsed?'file':opt.api?'api':'sim',")
rep("parsed?parsed.out:simOut(),file&&file.name,crs.map(c=>c.id).join(', '),parsed||undefined);", "parsed?parsed.out:opt.out||simOut(),file&&file.name,crs.map(c=>c.id).join(', '),parsed||(opt.api?{inputs:apiInputs()}:undefined));")
rep(":'Analyst (simulated)',export:x.id};", ":opt.api?'EstateMaster API (simulated)':'Analyst (simulated)',export:x.id};")
rep("renderGen();renderEMTab();saveMem();return t}", "renderGen();renderEMTab();saveMem();if(MODE==='api')apiRun(t.id);return t}")
rep("function taskButtons(t){return`", "function taskButtons(t){" + B['buttons'] + "return`")
rep(":x.src==='initial'?'starting export (simulated)':'simulated export'}", ":x.src==='api'?'EstateMaster API (simulated)':x.src==='initial'?'starting export (simulated)':'simulated export'}")
rep(":'simulated export (demo stand-in for EstateMaster)'}", ":x.src==='api'?'read through the EstateMaster API (simulated)':'simulated export (demo stand-in for EstateMaster)'}")
rep(":'EstateMaster · exports';", ":MODE==='api'?'EstateMaster · API':'EstateMaster · exports';")
rep("if(MODE==='readonly'){$('#cwDown').style.display='none';$('#cwConn').style.display='none'}", "if(MODE==='readonly'||MODE==='api'){$('#cwDown').style.display='none';$('#cwConn').style.display='none'}\n  if(MODE==='api')apiInit();")
rep("if(!latestExport())addExport('initial','starting export of the approved model',simOut());", "if(!latestExport())MODE==='api'?addExport('api','first read of the approved model through the EstateMaster API',simOut(),'','',{inputs:apiInputs()}):addExport('initial','starting export of the approved model',simOut());\n  if(MODE==='api')setTimeout(()=>apiSync(true),900);")
rep("  const rows=[['EstateMaster · Excel export (documented integration)',x?", "  const rows=[" + B['integration'] + "['EstateMaster · Excel export (documented integration)',x?")
rep("'<h2>Integrations and feeds</h2><div class=\"sub\">What the agent reads and where it sends. Nothing writes to EstateMaster.</div>'", "'<h2>Integrations and feeds</h2><div class=\"sub\">What the agent reads and where it sends. '+(MODE==='api'?'Only approved change requests are written to EstateMaster, through its API.':'Nothing writes to EstateMaster.')+'</div>'")
rep("function sysPrompt(ch,role){", "function sysPrompt(ch,role){return ax(sysPrompt0(ch,role))}\nfunction sysPrompt0(ch,role){")
# the daily feed card title and the modelling page copy follow the API wording through ax()/axNode()
(HERE / 'index.html').write_text(s, encoding='utf-8')
for f in ('llm.js', 'scan.js', 'voice.js', 'mail.js', 'cron.js', 'schedule.js'):
    shutil.copy(SRC / 'api' / f, HERE / 'api' / f)
shutil.rmtree(HERE / 'api/_lib', ignore_errors=True); shutil.copytree(SRC / 'api/_lib', HERE / 'api/_lib')
vj = json.loads((SRC / 'vercel.json').read_text()); vj['functions'].pop('api/runner.js', None)
(HERE / 'vercel.json').write_text(json.dumps(vj, indent=2) + '\n')
pk = json.loads((SRC / 'package.json').read_text()); pk['name'] = 'bohio-estatemaster-option-api'
(HERE / 'package.json').write_text(json.dumps(pk, indent=2) + '\n')
shutil.copy(SRC / 'market-data.xlsx', HERE / 'market-data.xlsx')
print('API demo mirrored from Option 2:', len(s) // 1024, 'KB')
