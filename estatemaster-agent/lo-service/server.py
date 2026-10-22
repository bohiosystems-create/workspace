"""LibreOffice recalculation service: the second formula engine, for workbooks the in-browser engine cannot reproduce exactly
(a function it does not have, INDIRECT built in ways it cannot follow, FREQUENCY, macros-free Data Tables it misses …).

POST /recalc  (Authorization: Bearer $LO_TOKEN)
  {"file": base64 xlsx (first call), "hash": sha256 of the file (later calls), "sets": [["Sheet!B5", 2000], …], "read": ["Sheet!B6", …],
   "check": true (compare every formula's result with the value the file stores, as the app does at upload)}
  → {"hash", "values": [...], "check": {"tot", "match", "bad": [...]}, "ms"}
GET /health → {"ok": true, "version": "LibreOffice x.y"}

Each request starts from the workbook as uploaded (the sets are applied, everything recalculated, the reads taken): no state leaks between
what-ifs. Workbooks are kept in memory by hash (least recently used first out, LO_CACHE files) and never written anywhere but a private
temporary folder that is emptied after loading. Macros never run (MacroExecutionMode NEVER_EXECUTE).
"""
import base64, hashlib, json, os, re, subprocess, tempfile, threading, time, uuid
from collections import OrderedDict
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import uno
from com.sun.star.beans import PropertyValue

TOKEN = os.environ.get('LO_TOKEN', '')
PORT = int(os.environ.get('PORT', '8080'))
CACHE_N = int(os.environ.get('LO_CACHE', '8'))
MAX_BYTES = int(os.environ.get('LO_MAX_MB', '40')) * 1024 * 1024
LOCK = threading.Lock()   # one LibreOffice process: calls run one at a time (Cloud Run scales out by instances)
CACHE = OrderedDict()     # hash → raw bytes of the workbook as uploaded


def prop(n, v):
    p = PropertyValue(); p.Name = n; p.Value = v; return p


class Office:
    def __init__(self):
        self.proc = None; self.desktop = None; self.version = ''
        self.start()

    def start(self):
        pipe = 'lo_' + uuid.uuid4().hex[:8]
        self.proc = subprocess.Popen(['soffice', '--headless', '--invisible', '--nologo', '--norestore', '--nodefault', '--nolockcheck',
                                      f'--accept=pipe,name={pipe};urp;StarOffice.ComponentContext'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        local = uno.getComponentContext()
        resolver = local.ServiceManager.createInstanceWithContext('com.sun.star.bridge.UnoUrlResolver', local)
        for _ in range(120):
            try:
                ctx = resolver.resolve(f'uno:pipe,name={pipe};urp;StarOffice.ComponentContext'); break
            except Exception:
                time.sleep(0.25)
        else:
            raise RuntimeError('LibreOffice did not start')
        smgr = ctx.ServiceManager
        self.desktop = smgr.createInstanceWithContext('com.sun.star.frame.Desktop', ctx)
        try:
            cp = smgr.createInstanceWithContext('com.sun.star.configuration.ConfigurationProvider', ctx)
            node = cp.createInstanceWithArguments('com.sun.star.configuration.ConfigurationAccess', (prop('nodepath', '/org.openoffice.Setup/Product'),))
            self.version = f'LibreOffice {node.getByName("ooSetupVersionAboutBox")}'
        except Exception:
            self.version = 'LibreOffice'

    def alive(self):
        return self.proc and self.proc.poll() is None

    def load(self, data):
        d = tempfile.mkdtemp(prefix='lo_')
        path = os.path.join(d, 'model.xlsx')
        with open(path, 'wb') as f:
            f.write(data)
        try:
            doc = self.desktop.loadComponentFromURL(uno.systemPathToFileUrl(path), '_blank', 0,
                                                    (prop('Hidden', True), prop('MacroExecutionMode', 0), prop('UpdateDocMode', 0), prop('ReadOnly', False)))
        finally:
            try:
                os.remove(path); os.rmdir(d)
            except OSError:
                pass
        if doc is None:
            raise ValueError('the workbook could not be opened')
        return doc


OFFICE = None


def cell_of(doc, ref):
    m = re.match(r"^(?:'((?:[^']|'')+)'|([^!]+))!\$?([A-Za-z]{1,3})\$?(\d+)$", ref.strip())
    if not m:
        raise ValueError(f'not a cell reference: {ref}')
    sheet = (m.group(1) or m.group(2)).replace("''", "'")
    col = 0
    for ch in m.group(3).upper():
        col = col * 26 + ord(ch) - 64
    sh = doc.Sheets.getByName(sheet)
    return sh.getCellByPosition(col - 1, int(m.group(4)) - 1)


def value_of(c):
    t = c.Type.value   # EMPTY, VALUE, TEXT, FORMULA
    if t == 'EMPTY':
        return None
    if t == 'FORMULA':
        if c.getError():
            return {'err': '#ERR' + str(c.getError())}
        rt = getattr(c, 'FormulaResultType2', 1)   # com.sun.star.sheet.FormulaResult: 1 a number, 2 text, 4 an error
        rt = getattr(rt, 'value', rt)
        return c.getString() if rt in (2, 'STRING', 'TEXT') else c.getValue()
    if t == 'TEXT':
        return c.getString()
    return c.getValue()


def stored_values(data):
    """the value the file stores with each formula (what Excel computed when it saved), read without recalculating"""
    import zipfile, io
    out = {}
    z = zipfile.ZipFile(io.BytesIO(data))
    wbx = z.read('xl/workbook.xml').decode('utf8', 'replace')
    rels = z.read('xl/_rels/workbook.xml.rels').decode('utf8', 'replace')
    rid = {m.group(1): m.group(2) for m in re.finditer(r'<Relationship\b[^>]*Id="([^"]+)"[^>]*Target="([^"]+)"', rels)}
    rid.update({m.group(2): m.group(1) for m in re.finditer(r'<Relationship\b[^>]*Target="([^"]+)"[^>]*Id="([^"]+)"', rels)})
    shared = []
    if 'xl/sharedStrings.xml' in z.namelist():
        ss = z.read('xl/sharedStrings.xml').decode('utf8', 'replace')
        for si in re.findall(r'<si>(.*?)</si>', ss, re.S):
            shared.append(''.join(re.findall(r'<t[^>]*>(.*?)</t>', si, re.S)))
    for m in re.finditer(r'<sheet\b[^>]*name="([^"]*)"[^>]*r:id="([^"]+)"', wbx):
        name, target = m.group(1).replace('&amp;', '&').replace('&apos;', "'"), rid.get(m.group(2), '')
        path = 'xl/' + target.lstrip('/').replace('xl/', '', 1) if not target.startswith('/xl/') else target.lstrip('/')
        if path not in z.namelist():
            continue
        x = z.read(path).decode('utf8', 'replace')
        for c in re.finditer(r'<c r="([A-Z]+\d+)"([^>]*)>(.*?)</c>', x, re.S):
            body = c.group(3)
            if '<f' not in body or 't="dataTable"' in body:
                continue
            v = re.search(r'<v>(.*?)</v>', body, re.S)
            if not v:
                continue
            t = re.search(r'\bt="([^"]+)"', c.group(2))
            t = t.group(1) if t else 'n'
            raw = v.group(1)
            q = "'" + name.replace("'", "''") + "'" if re.search(r'[^A-Za-z0-9_]', name) else name
            if t == 'n':
                out[f'{q}!{c.group(1)}'] = float(raw)
            elif t == 'b':
                out[f'{q}!{c.group(1)}'] = raw == '1'
            elif t == 'e':
                out[f'{q}!{c.group(1)}'] = {'err': raw}
            elif t == 's':
                out[f'{q}!{c.group(1)}'] = shared[int(raw)] if raw.isdigit() and int(raw) < len(shared) else raw
            else:
                out[f'{q}!{c.group(1)}'] = raw.replace('&amp;', '&').replace('&lt;', '<').replace('&gt;', '>')
    return out


def same(a, b):
    if isinstance(a, dict) or isinstance(b, dict):
        return isinstance(a, dict) and isinstance(b, dict)
    if isinstance(a, bool) or isinstance(b, bool):
        return bool(a) == bool(b) if isinstance(a, (bool, int, float)) and isinstance(b, (bool, int, float)) else False
    if isinstance(a, (int, float)) and isinstance(b, (int, float)):
        return abs(a - b) <= 1e-9 * max(1.0, abs(a), abs(b)) or abs(a - b) < 1e-9
    return str(a or '') == str(b or '')


def recalc(req):
    global OFFICE
    data = None
    if req.get('file'):
        data = base64.b64decode(req['file'])
        if len(data) > MAX_BYTES:
            raise ValueError('the workbook is larger than this service accepts')
        h = hashlib.sha256(data).hexdigest()
        CACHE[h] = data; CACHE.move_to_end(h)
        while len(CACHE) > CACHE_N:
            CACHE.popitem(last=False)
    else:
        h = req.get('hash', '')
        if h not in CACHE:
            return {'error': 'unknown workbook', 'need_file': True}
        data = CACHE[h]; CACHE.move_to_end(h)
    t0 = time.time()
    with LOCK:
        if OFFICE is None or not OFFICE.alive():
            OFFICE = Office()
        doc = OFFICE.load(data)
        try:
            out = {'hash': h}
            if req.get('check'):
                doc.calculateAll()
                st = stored_values(data)
                bad = []
                for ref, v in st.items():
                    try:
                        if not same(value_of(cell_of(doc, ref)), v):
                            bad.append(ref)
                    except Exception:
                        bad.append(ref)
                out['check'] = {'tot': len(st), 'match': len(st) - len(bad), 'bad': bad[:200]}
            for ref, v in req.get('sets') or []:
                c = cell_of(doc, ref)
                if isinstance(v, (int, float)) and not isinstance(v, bool):
                    c.setValue(float(v))
                elif isinstance(v, str) and v.startswith('='):
                    c.setFormula(v)
                elif v is None:
                    c.setString('')
                else:
                    c.setString(str(v))
            doc.calculateAll()
            out['values'] = [value_of(cell_of(doc, r)) for r in req.get('read') or []]
        finally:
            doc.close(True)
    out['ms'] = int((time.time() - t0) * 1000)
    return out


class H(BaseHTTPRequestHandler):
    def _send(self, code, obj):
        b = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(b)))
        self.end_headers()
        self.wfile.write(b)

    def _auth(self):
        return TOKEN and self.headers.get('Authorization', '') == f'Bearer {TOKEN}'

    def do_GET(self):
        if self.path == '/health':
            global OFFICE
            try:
                with LOCK:
                    if OFFICE is None or not OFFICE.alive():
                        OFFICE = Office()
                return self._send(200, {'ok': True, 'version': OFFICE.version})
            except Exception as e:
                return self._send(500, {'ok': False, 'error': str(e)})
        self._send(404, {'error': 'not found'})

    def do_POST(self):
        if self.path != '/recalc':
            return self._send(404, {'error': 'not found'})
        if not self._auth():
            return self._send(401, {'error': 'unauthorised'})
        n = int(self.headers.get('Content-Length', '0'))
        if n > MAX_BYTES * 2:
            return self._send(413, {'error': 'too large'})
        try:
            req = json.loads(self.rfile.read(n) or b'{}')
            res = recalc(req)
            self._send(409 if res.get('need_file') else 200, res)
        except Exception as e:
            self._send(400, {'error': str(e)[:300]})

    def log_message(self, *a):
        pass


if __name__ == '__main__':
    if not TOKEN:
        raise SystemExit('LO_TOKEN must be set')
    ThreadingHTTPServer(('0.0.0.0', PORT), H).serve_forever()
