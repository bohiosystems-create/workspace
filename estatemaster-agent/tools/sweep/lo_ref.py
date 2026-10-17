# Perturbation sweep, referee side: LibreOffice recalculates each scenario of a job independently. The workbook's XML is edited
# directly (the scenario's cells set, every stored formula result cleared so everything is recalculated), all scenarios of a model
# are converted in one LibreOffice run, and the results read back. Usage: python3 lo_ref.py <job.json> <out.json>
import zipfile,re,sys,json,os,subprocess,tempfile,shutil,warnings;warnings.filterwarnings('ignore')
import openpyxl,datetime
def sheet_paths(z):
    wb=z.read('xl/workbook.xml').decode();rels=z.read('xl/_rels/workbook.xml.rels').decode()
    rid={m.group(1):m.group(2) for m in re.finditer(r'<Relationship[^>]*Id="([^"]+)"[^>]*Target="([^"]+)"',rels)}
    rid.update({m.group(2):m.group(1) for m in re.finditer(r'<Relationship[^>]*Target="([^"]+)"[^>]*Id="([^"]+)"',rels)})
    out={}
    for m in re.finditer(r'<sheet\b[^>]*>',wb):
        n=re.search(r'name="([^"]*)"',m.group(0)).group(1).replace('&amp;','&');i=re.search(r'r:id="([^"]+)"',m.group(0)).group(1);t=rid[i].lstrip('/');out[n]=t if t.startswith('xl/') else 'xl/'+t
    return out
def apply(src,dst,sets):
    z=zipfile.ZipFile(src);P=sheet_paths(z);by={}
    for ref,v in sets:
        m=re.match(r"^'?(.*?)'?!\$?([A-Z]+)\$?(\d+)$",ref);by.setdefault(P[m.group(1)],[]).append((m.group(2)+m.group(3),v))
    # TODAY() and NOW() are frozen at the values Excel last stored, as the app's engine does: a sweep run on a later day still
    # compares like with like
    fz={}
    for t in P.values():
        if t not in z.namelist():continue
        for m in re.finditer(r'<f\b[^>]*>\s*(TODAY|NOW)\(\)\s*</f>\s*<v>([^<]+)</v>',z.read(t).decode('utf8'),re.I):fz.setdefault(m.group(1).upper(),float(m.group(2)))
    if 'TODAY' not in fz and 'NOW' in fz:fz['TODAY']=float(int(fz['NOW']))
    if 'NOW' not in fz and 'TODAY' in fz:fz['NOW']=fz['TODAY']
    zo=zipfile.ZipFile(dst,'w',zipfile.ZIP_DEFLATED)
    for it in z.infolist():
        d=z.read(it.filename)
        if it.filename.startswith('xl/worksheets/') and it.filename.endswith('.xml'):
            x=d.decode('utf8')
            for a,v in by.get(it.filename,[]):
                rx=re.compile(r'<c\b(?=[^>]*\br="'+a+r'")([^>]*?)(?:/>|>([\s\S]*?)</c>)')
                m=rx.search(x);assert m,(it.filename,a);assert '<f' not in (m.group(2) or ''),a
                attrs=re.sub(r'\s+t="[^"]*"','',m.group(1));x=x[:m.start()]+(f'<c{attrs} t="inlineStr"><is><t>{v}</t></is></c>' if isinstance(v,str) else f'<c{attrs}><v>{repr(float(v))}</v></c>')+x[m.end():]
            for k,v in fz.items():x=re.sub(r'(<f\b[^>]*>[^<]*?)\b'+k+r'\(\)',lambda m,v=v:m.group(1)+'('+repr(v)+')',x,flags=re.I)
            x=re.sub(r'(<c\b[^>]*>)(\s*<f\b[\s\S]*?(?:</f>|/>))\s*<v>[\s\S]*?</v>',r'\1\2',x)
            d=x.encode('utf8')
        zo.writestr(it,d)
    zo.close()
job=json.load(open(sys.argv[1]))
if job.get('err'):json.dump({'err':job['err']},open(sys.argv[2],'w'));sys.exit(0)
ext='.xlsm' if job['file'].endswith('.xlsm') else '.xlsx';d=tempfile.mkdtemp();files=[]
for i,sc in enumerate(job['scenarios']):
    p=os.path.join(d,f's{i}{ext}');apply(job['file'],p,sc['sets']);files.append(p)
subprocess.run(['soffice','-env:UserInstallation=file://'+d+'/profile','--headless','--calc','--convert-to','xlsx:Calc MS Excel 2007 XML','--outdir',os.path.join(d,'o')]+files,check=True,capture_output=True,timeout=3600)
from openpyxl.utils import column_index_from_string as CI
want={}
for ref in job['reads']:
    sh,c=ref.rsplit('!',1);c=c.replace('$','');col=''.join(ch for ch in c if ch.isalpha());row=int(''.join(ch for ch in c if ch.isdigit()))
    want.setdefault(sh.strip("'").replace("''","'"),{})[(row,CI(col))]=ref
res=[]
for i,sc in enumerate(job['scenarios']):
    # read-only, one pass over the rows each sheet needs: a large workbook is read in seconds
    r=openpyxl.load_workbook(os.path.join(d,'o',f's{i}.xlsx'),data_only=True,read_only=True);got={}
    for sh,cells in want.items():
        mr=max(k[0] for k in cells);mc=max(k[1] for k in cells)
        for ri,row in enumerate(r[sh].iter_rows(min_row=1,max_row=mr,max_col=mc,values_only=True),1):
            for (rr,cc),ref in cells.items():
                if rr==ri and cc<=len(row):got[ref]=row[cc-1]
    r.close();vals=[]
    for ref in job['reads']:
        v=got.get(ref)
        if isinstance(v,datetime.datetime):v=(v-datetime.datetime(1899,12,30)).total_seconds()/86400   # a date is its serial number, as in Excel
        vals.append(v if isinstance(v,(int,float)) and not isinstance(v,bool) else None)
    res.append(vals)
shutil.rmtree(d);json.dump(res,open(sys.argv[2],'w'))
