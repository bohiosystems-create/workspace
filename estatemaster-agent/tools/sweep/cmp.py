# Perturbation sweep, comparison: every result the app computed against LibreOffice's. Exit 1 when any differs by more than 1e-8
# relative (IRR and XIRR stop when the rate moves less than 1e-7, in Excel, LibreOffice and the app alike, so a figure built on an IRR
# can differ in the ninth digit; circular models: 1e-7, both engines iterate to their own tolerance), or one engine gives a number where
# the other does not. A result LibreOffice cannot compute is named in skip.json ({"model": {"ignore": [key], "why": ...}}).
# Usage: python3 cmp.py <dir with <model>.json and <model>.lo.json>
import json,sys,os,glob
d=sys.argv[1];tot=0;bad=[];worst=0;skipped=[]
SK=json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)),'skip.json')))
for f in sorted(glob.glob(os.path.join(d,'*.json'))):
    if f.endswith('.lo.json'):continue
    a=json.load(open(f));m=os.path.basename(f)[:-5];lf=os.path.join(d,m+'.lo.json')
    if a.get('err'):bad.append((m,'-','-','app: '+a['err'],''));continue
    if not os.path.exists(lf):bad.append((m,'-','-','no LibreOffice result','' ));continue
    l=json.load(open(lf));tol=1e-7 if a.get('circ') else 1e-8;ign=set((SK.get(m) or {}).get('ignore',[]) if isinstance(SK.get(m),dict) else []);mx=0;n=0
    if isinstance(l,dict):bad.append((m,'-','-','LibreOffice: '+l.get('err',''),''));continue
    for sc,av,lv in zip(a['scenarios'],a['app'],l):
        for k,x,y in zip(a['keys'],av,lv):
            if k in ign:continue
            if x is None or y is None:
                if (x is None)!=(y is None):bad.append((m,sc['name'],k,x,y))
                continue
            n+=1;rel=abs(x-y)/abs(y) if abs(y)>1e-6 else abs(x-y);mx=max(mx,rel)
            if rel>tol:bad.append((m,sc['name'],k,x,y))
    tot+=n;worst=max(worst,mx);print(f'{m}: {len(a["scenarios"])} scenarios × {len(a["keys"])} results, largest relative difference {mx:.1e}')
print(f'\n{tot} figures compared; worst {worst:.1e}; differences: {len(bad)}')
for b in bad[:40]:print('  DIFF',b)
sys.exit(1 if bad else 0)
