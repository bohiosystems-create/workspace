# LibreOffice as an independent referee: set input cells with openpyxl (formulas kept, cached values dropped), let LibreOffice recalculate, read the outputs.
import openpyxl, subprocess, os, shutil, sys, json, tempfile, warnings
warnings.filterwarnings('ignore')
def recalc(src, sets, reads):
    d = tempfile.mkdtemp(dir=os.path.dirname(os.path.abspath(__file__)))
    wb = openpyxl.load_workbook(src)
    for ref, v in sets:
        sh, c = ref.rsplit('!', 1); wb[sh.strip("'")][c] = v
    p = os.path.join(d, 'in.xlsx'); wb.save(p)
    out = os.path.join(d, 'out'); os.makedirs(out)
    subprocess.run(['soffice', '--headless', '--calc', '--convert-to', 'xlsx:Calc MS Excel 2007 XML', '--outdir', out, p], check=True, capture_output=True, timeout=600)
    r = openpyxl.load_workbook(os.path.join(out, 'in.xlsx'), data_only=True)
    vals = []
    for ref in reads:
        sh, c = ref.rsplit('!', 1); v = r[sh.strip("'")][c].value; vals.append(v if isinstance(v, (int, float)) else None)
    shutil.rmtree(d); return vals
if __name__ == '__main__':
    job = json.load(open(sys.argv[1])); res = []
    for sc in job['scenarios']:
        res.append(recalc(job['file'], sc['sets'], job['reads']))
        print(sc['name'], res[-1], file=sys.stderr, flush=True)
    json.dump(res, open(sys.argv[2], 'w'))
