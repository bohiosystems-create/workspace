# Adds the security headers (and a day's cache for the demo video) to a vercel.json, keeping everything else
import json,sys
for p in sys.argv[1:]:
    vj=json.load(open(p));hs=vj.setdefault('headers',[])
    allr=next((h for h in hs if h.get('source')=='/(.*)'),None)
    if not allr:allr={'source':'/(.*)','headers':[]};hs.insert(0,allr)
    want={'X-Content-Type-Options':'nosniff','Referrer-Policy':'strict-origin-when-cross-origin',
          'Strict-Transport-Security':'max-age=63072000; includeSubDomains',
          'Permissions-Policy':'camera=(), geolocation=(), payment=(), usb=()'}
    have={h['key']:h for h in allr['headers']}
    for k,v in want.items():
        if k in have:have[k]['value']=v
        else:allr['headers'].append({'key':k,'value':v})
    if not any(h.get('source')=='/assets/(.*)' for h in hs):hs.append({'source':'/assets/(.*)','headers':[{'key':'Cache-Control','value':'public, max-age=31536000, immutable'}]})   # content-hashed names: a new build gets new names
    if not any(h.get('source')=='/vendor/(.*)' for h in hs):hs.append({'source':'/vendor/(.*)','headers':[{'key':'Cache-Control','value':'public, max-age=31536000, immutable'}]})   # versioned library files (hyperformula-3.5.0…)
    if not any(h.get('source')=='/demo.webm' for h in hs):hs.append({'source':'/demo.webm','headers':[{'key':'Cache-Control','value':'public, max-age=86400'}]})
    json.dump(vj,open(p,'w'),indent=2);open(p,'a').write('\n');print('patched',p)
