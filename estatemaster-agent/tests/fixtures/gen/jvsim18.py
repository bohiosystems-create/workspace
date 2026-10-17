# Independent implementation of the round 18 JV model (no spreadsheet engine): the fixed point of its circular cash flow, every row,
# and the returns. Used (1) to write correct stored values into the fixture, since LibreOffice's iteration does not converge on it,
# and (2) as the referee for the app's exact what-ifs on it.
import math,json,sys,re,zipfile,shutil,os
from openpyxl.utils import get_column_letter as L
BASE=dict(units=240,price=650000,sstart=24,pace=10,sell=.03,land=18e6,hard=72e6,hstart=3,soft=.12,cont=.05,ltc=.6,rate=.075,fee=.01,lp=.9,h1=.08,h2=.15,s2=.75,s3=.6)
CELL={'units':'B3','price':'B4','sstart':'B5','pace':'B6','sell':'B7','land':'B8','hard':'B9','hstart':'B10','soft':'B11','cont':'B12','ltc':'B13','rate':'B14','fee':'B15','lp':'B16','h1':'B17','h2':'B18','s2':'B19','s3':'B20'}
W0=[math.sin(math.pi*(i+0.5)/24) for i in range(24)];SW=sum(W0);W=[round(x/SW,8) for x in W0]
def irr(cf):
    f=lambda r:sum(c/(1+r)**t for t,c in enumerate(cf))
    lo,hi=-0.99,1.0
    if f(lo)*f(hi)>0:return float('nan')
    for _ in range(300):
        m=(lo+hi)/2
        if f(lo)*f(m)<=0:hi=m
        else:lo=m
    return (lo+hi)/2
def sim(P):
    T=48;tot_c=100e6;rows=None
    for it in range(2000):
        facility=P['ltc']*tot_c;eqcap=(1-P['ltc'])*tot_c;R={k:[0.0]*T for k in ['land','hard','soft','cont','fee','int','tc','cumc','eq','cume','dd','sold','rev','rep','bal','dist','ecf','ucf','lpc','t1o','t1','lp1','t2o','t2','lp2','a2','lpt','lpcf','gpcf','t1c','t2c','cums']}
        for t in range(T):
            g=lambda k:R[k][t];p=lambda k:R[k][t-1] if t>0 else 0.0
            R['land'][t]=P['land'] if t==0 else 0
            R['hard'][t]=P['hard']*W[t-int(P['hstart'])] if P['hstart']<=t<P['hstart']+24 else 0
            R['soft'][t]=R['hard'][t]*P['soft'];R['cont'][t]=R['hard'][t]*P['cont']
            R['fee'][t]=P['fee']*facility if t==0 else 0
            R['int'][t]=0 if t==0 else p('bal')*P['rate']/12
            R['tc'][t]=R['land'][t]+R['hard'][t]+R['soft'][t]+R['cont'][t]+R['fee'][t]+R['int'][t]
            R['cumc'][t]=p('cumc')+R['tc'][t]
            R['eq'][t]=min(R['tc'][t],max(0,eqcap-p('cume')));R['cume'][t]=p('cume')+R['eq'][t];R['dd'][t]=R['tc'][t]-R['eq'][t]
            R['sold'][t]=min(P['pace'],P['units']-p('cums')) if t>=P['sstart'] else 0;R['cums'][t]=p('cums')+R['sold'][t]
            R['rev'][t]=R['sold'][t]*P['price']*(1-P['sell'])
            R['rep'][t]=min(R['rev'][t],p('bal')+R['dd'][t]);R['bal'][t]=p('bal')+R['dd'][t]-R['rep'][t]
            R['dist'][t]=R['rev'][t]-R['rep'][t];R['ecf'][t]=R['dist'][t]-R['eq'][t]
            R['ucf'][t]=R['rev'][t]-(R['land'][t]+R['hard'][t]+R['soft'][t]+R['cont'][t])
            m1=(1+P['h1'])**(1/12)-1;m2=(1+P['h2'])**(1/12)-1
            R['lpc'][t]=R['eq'][t]*P['lp'];R['t1o'][t]=p('t1c')*(1+m1)+R['lpc'][t]
            R['t1'][t]=min(R['dist'][t],R['t1o'][t]/P['lp']);R['lp1'][t]=R['t1'][t]*P['lp'];R['t1c'][t]=R['t1o'][t]-R['lp1'][t]
            R['t2o'][t]=p('t2c')*(1+m2)+R['lpc'][t]
            R['t2'][t]=min(R['dist'][t]-R['t1'][t],max(0,R['t2o'][t]-R['lp1'][t])/P['s2']);R['lp2'][t]=R['t2'][t]*P['s2']
            R['t2c'][t]=max(0,R['t2o'][t]-R['lp1'][t]-R['lp2'][t]);R['a2'][t]=R['dist'][t]-R['t1'][t]-R['t2'][t]
            R['lpt'][t]=R['lp1'][t]+R['lp2'][t]+R['a2'][t]*P['s3'];R['lpcf'][t]=R['lpt'][t]-R['lpc'][t];R['gpcf'][t]=R['ecf'][t]-R['lpcf'][t]
        new=sum(R['tc']);rows=R
        if abs(new-tot_c)<1e-7:break
        tot_c=new
    a=lambda cf:(1+irr(cf))**12-1
    np_=sum(rows['ecf']);tdc=sum(rows['tc'])
    out={'Returns!B3':a(rows['ucf']),'Returns!B4':a(rows['ecf']),'Returns!B5':a(rows['lpcf']),'Returns!B6':a(rows['gpcf']),
         'Returns!B7':sum(x for x in rows['lpcf'] if x>0)/-sum(x for x in rows['lpcf'] if x<0),'Returns!B8':np_,'Returns!B9':tdc,'Returns!B10':np_/tdc,'Returns!B11':max(rows['bal']),
         'Returns!B12':sum(rows['gpcf'])-(1-P['lp'])*np_}
    return rows,out
ORDER=['Month','land','hard','soft','cont','fee','int','tc','cumc','eq','cume','dd','sold','rev','rep','bal','dist','ecf','ucf','lpc','t1o','t1','lp1','t2o','t2','lp2','a2','lpt','lpcf','gpcf','t1c','t2c','cums']
def values(P):
    rows,out=sim(P);v={}
    for i,k in enumerate(ORDER):
        if k=='Month':continue
        for t in range(48):v[f'Cash Flow!{L(t+2)}{i+3}']=rows[k][t]
    v.update(out);v['Curve!B26']=sum(W);return v
def patch(src,dst,vals):
    z=zipfile.ZipFile(src);wbx=z.read('xl/workbook.xml').decode();rels=z.read('xl/_rels/workbook.xml.rels').decode()
    rid={m.group(1):m.group(2) for m in re.finditer(r'<Relationship[^>]*Id="([^"]+)"[^>]*Target="([^"]+)"',rels)}
    rid.update({m.group(2):m.group(1) for m in re.finditer(r'<Relationship[^>]*Target="([^"]+)"[^>]*Id="([^"]+)"',rels)})
    path={};
    for m in re.finditer(r'<sheet\b[^>]*>',wbx):
        n=re.search(r'name="([^"]*)"',m.group(0)).group(1);i=re.search(r'r:id="([^"]+)"',m.group(0)).group(1);t=rid[i].lstrip('/');path['xl/'+t if not t.startswith('xl/') else t]=n
    zo=zipfile.ZipFile(dst,'w',zipfile.ZIP_DEFLATED);miss=0
    for it in z.infolist():
        d=z.read(it.filename)
        if it.filename in path:
            sh=path[it.filename];x=d.decode()
            def rep(m):
                nonlocal miss
                a=re.search(r'\br="([A-Z]+\d+)"',m.group(1)).group(1);k=f'{sh}!{a}'
                if k not in vals or '<f' not in m.group(0):return m.group(0)
                body=re.sub(r'<v\s*/>|<v>[^<]*</v>','',m.group(2) or '');attrs=re.sub(r'\s+t="[^"]*"','',m.group(1))
                return f'<c{attrs}>{body}<v>{repr(float(vals[k]))}</v></c>'
            x=re.sub(r'<c\b([^>]*?)(?:/>|>([\s\S]*?)</c>)',rep,x);d=x.encode()
        zo.writestr(it,d)
    zo.close()
if __name__=='__main__':
    if sys.argv[1]=='fixture':
        v=values(BASE);patch(sys.argv[2],sys.argv[3],v);print(json.dumps({k:v[k] for k in v if k.startswith('Returns')}))
    else:   # referee: job file from the app -> same layout as lo2.py output
        job=json.load(open(sys.argv[2]));res=[];inv={'Assumptions!'+c:k for k,c in CELL.items()}
        for sc in job['scenarios']:
            P=dict(BASE)
            for ref,val in sc['sets']:
                r=ref.replace('$','').replace("'",'');P[inv[r]]=float(val)
            _,out=sim(P);res.append([out.get(r.replace('$','').replace("'",'')) for r in job['reads']])
        json.dump(res,open(sys.argv[3],'w'));print(res)
