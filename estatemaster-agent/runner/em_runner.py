"""
Bohio EstateMaster runner (not yet run against EstateMaster).

Runs on the Windows VM with EstateMaster and Excel, in a logged-in desktop session. The Bohio agent
(Vercel, /api/runner) sends it work only after a person has approved it, except stress checks, which run
on a scratch copy and change nothing. Job kinds:
  run      approved change: write every assumption into the model's control workbook, operate EstateMaster
           (open -> Office Links Refresh -> recalculate -> Excel export -> save a copy -> close), read results
  scratch  stress check: same, on the scratch copy if one is configured; the workbook is restored afterwards
  promote  approved promotion: back up the LIVE model's workbook, write the values, refresh, recalculate,
           export and SAVE the live model (ui_steps.json "save_live")
  create   new model: copy a KINAN master template (templates.json), write its values, register it, run it
Results are read from EstateMaster's own export by row label (output_labels.csv). If the automation fails,
or RUNNER_MODE=manual, the job becomes a one-minute task for an analyst and the agent collects the export
afterwards. It never reports a number EstateMaster did not produce.

Assumptions: the 33 core lines sit in fixed cells (register_map.csv). Every other assumption is a model line
on the workbook's "Lines" sheet, found by id, with no limit; the runner refuses to write a line that is not
marked as linked in EstateMaster (column J).

Setup (PowerShell, in the runner folder):
    py -m pip install fastapi uvicorn openpyxl pywinauto pillow
    setx RUNNER_TOKEN "<long random string>"          # the same value goes in Vercel
    setx RUNNER_MODE "ui"                              # or "manual" until the UI trial passes
    py -m uvicorn em_runner:app --host 127.0.0.1 --port 8765
Expose it to Vercel through a tunnel (e.g. Cloudflare Tunnel), never an open port.

models.json (next to this file) lists the connected models, see models.example.json:
    {"narjis": {"name": "...", "emdf": "...AlNarjis.emdf", "control_workbook": "...AlNarjis_control.xlsx",
                "scratch_emdf": "...", "scratch_control_workbook": "...",          optional, for stress checks
                "live_emdf": "...", "live_control_workbook": "..."}}              optional, for promotion
templates.json lists the KINAN master templates new models are copied from, see templates.example.json.
"""
import csv, json, os, queue, shutil, threading, time, uuid
from pathlib import Path
from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel
from openpyxl import load_workbook

import control_check
import em_ui

HERE = Path(__file__).parent
TOKEN = os.environ.get("RUNNER_TOKEN", "")
MODE = os.environ.get("RUNNER_MODE", "ui").lower()          # ui | manual
WORK = Path(os.environ.get("RUNNER_WORK_DIR", str(HERE / "work")))
MODELS_DIR = Path(os.environ.get("RUNNER_MODELS_DIR", str(WORK / "models")))
MODELS_FILE = HERE / "models.json"
TEMPLATES_FILE = HERE / "templates.json"
JOBS_LOG = WORK / "jobs.jsonl"
WORK.mkdir(parents=True, exist_ok=True)

with open(HERE / "register_map.csv", newline="", encoding="utf-8") as f:
    INPUTS = {r["id"]: (r["sheet"], r["cell"]) for r in csv.DictReader(f)}
with open(HERE / "output_labels.csv", newline="", encoding="utf-8") as f:
    OUT_ROWS = list(csv.DictReader(f))
LABELS = {r["name"]: r["label"] for r in OUT_ROWS}
SCALE = {r["name"]: float(r.get("scale") or 1) for r in OUT_ROWS}

app = FastAPI(title="Bohio EstateMaster runner")
JOBS, Q, LOCK, MLOCK = {}, queue.Queue(), threading.Lock(), threading.Lock()
WBLOCK = threading.RLock()  # every workbook read and write: a check never reads a workbook a job is writing


def save_atomic(wb, path):
    """Save through a temporary file so nothing ever sees a half-written workbook."""
    tmp = Path(path).with_name(Path(path).stem + ".saving" + Path(path).suffix)
    wb.save(tmp)
    os.replace(tmp, path)


def _json(path):
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else {}


def models():
    return _json(MODELS_FILE)


def templates():
    return _json(TEMPLATES_FILE)


def save_models(ms):
    MODELS_FILE.write_text(json.dumps(ms, indent=2), encoding="utf-8")


def check(auth):
    if not TOKEN or auth != f"Bearer {TOKEN}":
        raise HTTPException(401, "bad token")


def log(job):
    with open(JOBS_LOG, "a", encoding="utf-8") as f:
        f.write(json.dumps({k: v for k, v in job.items() if k not in ("files", "restore")}, default=str) + "\n")


def lines_index(path):
    """{id: {row, linked, ...}} for the workbook's Lines sheet (empty if it has none)."""
    with WBLOCK:
        wb = load_workbook(path, read_only=True, data_only=True)
        try:
            if "Lines" not in wb.sheetnames:
                return {}
            idx, _ = control_check.read_lines(wb["Lines"])
        finally:
            wb.close()
    return idx


def check_lines(path, lines):
    """Raises ValueError naming model lines that are not in the workbook or not linked in EstateMaster."""
    if not lines:
        return
    idx = lines_index(path)
    unknown = [k for k in lines if k not in idx]
    unlinked = [k for k in lines if k in idx and not idx[k]["linked"]]
    if unknown:
        raise ValueError(f"model lines not in the workbook's Lines sheet: {unknown[:20]}{' …' if len(unknown) > 20 else ''}")
    if unlinked:
        raise ValueError(f"model lines not linked in EstateMaster (column J): {unlinked[:20]}{' …' if len(unlinked) > 20 else ''}")


def write_inputs(path, inputs, lines=None):
    """Writes core values (fixed cells) and model lines (Lines sheet, by id). Returns the previous values."""
    check_lines(path, lines)
    with WBLOCK:
        return _write_inputs(path, inputs, lines)


def _write_inputs(path, inputs, lines):
    wb = load_workbook(path)
    before = {"inputs": {}, "lines": {}}
    for k, v in inputs.items():
        sheet, cell = INPUTS[k]
        before["inputs"][k] = wb[sheet][cell].value
        wb[sheet][cell].value = float(v)
    if lines:
        idx, _ = control_check.read_lines(wb["Lines"])
        ws = wb["Lines"]
        for k, v in lines.items():
            c = ws[f"E{idx[k]['row']}"]
            before["lines"][k] = c.value
            c.value = v if isinstance(v, str) else float(v)
    save_atomic(wb, path)  # fails if the workbook is open in Excel: keep it closed on the runner
    return before


def restore_inputs(path, before):
    with WBLOCK:
        _restore_inputs(path, before)


def _restore_inputs(path, before):
    wb = load_workbook(path)
    for k, v in before.get("inputs", {}).items():
        sheet, cell = INPUTS[k]
        wb[sheet][cell].value = v
    if before.get("lines"):
        idx, _ = control_check.read_lines(wb["Lines"])
        for k, v in before["lines"].items():
            wb["Lines"][f"E{idx[k]['row']}"].value = v
    save_atomic(wb, path)


def outputs_from(files):
    vals, missing = em_ui.read_export(files, LABELS)
    return {k: v * SCALE[k] for k, v in vals.items()}, missing


def target(job, m):
    """(emdf, control workbook) the job works on."""
    if job["kind"] == "promote":
        return m["live_emdf"], m["live_control_workbook"]
    if job["kind"] == "scratch" and m.get("scratch_emdf"):
        return m["scratch_emdf"], m["scratch_control_workbook"]
    return m["emdf"], m["control_workbook"]


def manual_task(job, emdf, reason):
    folder = WORK / "exports" / job["id"]
    folder.mkdir(parents=True, exist_ok=True)
    save = " and save the model (Ctrl+S)" if job["kind"] == "promote" else ""
    job.update(status="needs_person", reason=reason, task=(
        f"Open {emdf} in EstateMaster, press Office Links → Refresh, recalculate{save}, then Office Links → Excel "
        f"and save the export in {folder}. Then press Collect on {job.get('cr_id') or job['id']} in the Bohio app."))


def create_files(job):
    """Copy a master template to a new model and register it."""
    t = templates()[job["template"]]
    MODELS_DIR.mkdir(parents=True, exist_ok=True)
    emdf, ctl = MODELS_DIR / f"{job['model']}.emdf", MODELS_DIR / f"{job['model']}_control.xlsx"
    if emdf.exists() or ctl.exists():
        raise ValueError(f"files for {job['model']} already exist in {MODELS_DIR}")
    shutil.copyfile(t["emdf"], emdf)
    shutil.copyfile(t["control_workbook"], ctl)
    with MLOCK:
        ms = models()
        ms[job["model"]] = {"name": job.get("name") or job["model"], "emdf": str(emdf), "control_workbook": str(ctl),
                            "template": job["template"], "created": time.strftime("%Y-%m-%dT%H:%M:%S")}
        save_models(ms)
    job["files_created"] = [str(emdf), str(ctl)]


def process(job):
    job.update(status="running", started=time.time())
    final = None
    try:
        if job["kind"] == "create":
            create_files(job)
        m = models()[job["model"]]
        emdf, ctl = target(job, m)
        if job["kind"] == "promote":
            backup = WORK / "backups" / f"{Path(ctl).stem}_{time.strftime('%Y%m%d_%H%M%S')}{Path(ctl).suffix}"
            backup.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(ctl, backup)
            job["backup"] = str(backup)
        if job["inputs"] or job["lines"]:
            job["before"] = write_inputs(ctl, job["inputs"], job["lines"])
        if MODE == "manual":
            return manual_task(job, emdf, "Runner is in manual mode")
        timings = []
        groups = em_ui.PROMOTE_GROUPS if job["kind"] == "promote" else em_ui.GROUPS
        with LOCK:  # one EstateMaster window at a time
            try:
                files = em_ui.round_trip(emdf, WORK / "exports" / job["id"], job["id"], timings, WORK, groups)
            except em_ui.UIFailed as e:
                job.update(timings=timings, screenshot=e.screenshot)
                return manual_task(job, emdf, f"EstateMaster automation failed: {e}")
        job["timings"] = timings
        job["outputs"], job["missing"] = outputs_from(files)
        final = "done" if not job["missing"] else "done_with_gaps"
    except Exception as e:
        final = "failed"
        job["error"] = f"{type(e).__name__}: {e}"
    finally:
        # a stress check never leaves its values behind (unless an analyst still has to run it by hand)
        if job["kind"] == "scratch" and job.get("before") and job["status"] != "needs_person":  # restore also after a failure
            try:
                restore_inputs(target(job, models()[job["model"]])[1], job["before"])
                job["restored"] = True
            except Exception as e:
                job["restore_error"] = f"{type(e).__name__}: {e}"
        job["seconds"] = round(time.time() - job["started"], 1)
        if final:
            job["status"] = final  # only now: a stress check reports done after its workbook is restored
        log(job)


def worker():
    while True:
        job = Q.get()
        process(job)
        Q.task_done()


threading.Thread(target=worker, daemon=True).start()


class JobRequest(BaseModel):
    model: str
    inputs: dict[str, float] = {}             # core register id -> value in the line's unit
    lines: dict[str, float | str] = {}        # model line id (Lines sheet) -> value; no limit
    kind: str = "run"                         # run | scratch | promote
    cr_id: str | None = None
    requested_by: str | None = None
    label: str | None = None                  # e.g. the stress scenario's name


class CreateRequest(BaseModel):
    model: str
    name: str
    template: str
    inputs: dict[str, float] = {}
    lines: dict[str, float | str] = {}
    cr_id: str | None = None
    requested_by: str | None = None


class ModelReg(BaseModel):
    name: str
    emdf: str
    control_workbook: str


def enqueue(job):
    job.update(id="J" + time.strftime("%Y%m%d%H%M%S") + uuid.uuid4().hex[:4], status="queued", created=time.time())
    JOBS[job["id"]] = job
    Q.put(job)
    return {"job_id": job["id"], "status": "queued", "position": Q.qsize()}


@app.get("/health")
def health(authorization: str = Header("")):
    check(authorization)
    ms = models()
    return {"ok": True, "mode": MODE, "models": list(ms), "queued": Q.qsize(), "busy": LOCK.locked(),
            "inputs_mapped": len(INPUTS), "outputs": list(LABELS), "templates": list(templates()),
            "live": [k for k, v in ms.items() if v.get("live_emdf")], "scratch": [k for k, v in ms.items() if v.get("scratch_emdf")]}


@app.get("/models")
def list_models(authorization: str = Header("")):
    check(authorization)
    return models()


@app.post("/models/{mid}/check")
def check_model(mid: str, authorization: str = Header("")):
    check(authorization)
    if mid not in models():
        raise HTTPException(404, f"model {mid} not connected")
    return control_check.check(models()[mid]["control_workbook"])


@app.post("/models/create")
def create_model(req: CreateRequest, authorization: str = Header("")):
    """New model from a KINAN master template (after its change request is approved)."""
    check(authorization)
    if req.model in models():
        raise HTTPException(409, f"model {req.model} already exists")
    if req.template not in templates():
        raise HTTPException(400, f"unknown template {req.template}; templates.json has {list(templates())}")
    unknown = [k for k in req.inputs if k not in INPUTS]
    if unknown:
        raise HTTPException(400, f"not in register_map.csv: {unknown}")
    try:
        check_lines(templates()[req.template]["control_workbook"], req.lines)
    except ValueError as e:
        raise HTTPException(400, str(e))
    return enqueue({"kind": "create", "model": req.model, "name": req.name, "template": req.template,
                    "inputs": req.inputs, "lines": req.lines, "cr_id": req.cr_id, "requested_by": req.requested_by})


@app.post("/models/{mid}")
def register_model(mid: str, body: ModelReg, authorization: str = Header("")):
    """Connect an existing model. The workbook must pass the checks."""
    check(authorization)
    res = control_check.check(body.control_workbook)
    if not res["ok"]:
        raise HTTPException(400, {"message": "control workbook failed the checks", "check": res})
    with MLOCK:
        ms = models()
        ms[mid] = body.model_dump()
        save_models(ms)
    return {"ok": True, "model": mid, "check": res}


@app.post("/jobs")
def submit(req: JobRequest, authorization: str = Header("")):
    check(authorization)
    if req.kind not in ("run", "scratch", "promote"):
        raise HTTPException(400, "kind must be run, scratch or promote")
    ms = models()
    if req.model not in ms:
        raise HTTPException(404, f"model {req.model} is not connected to the runner (models.json)")
    if req.kind == "promote" and not ms[req.model].get("live_emdf"):
        raise HTTPException(400, f"no live model configured for {req.model}: add live_emdf and live_control_workbook to models.json")
    unknown = [k for k in req.inputs if k not in INPUTS]
    if unknown:
        raise HTTPException(400, f"not in register_map.csv: {unknown}")
    job = {"kind": req.kind, "model": req.model, "inputs": req.inputs, "lines": req.lines, "cr_id": req.cr_id,
           "requested_by": req.requested_by, "label": req.label}
    try:
        check_lines(target(job, ms[req.model])[1], req.lines)
    except ValueError as e:
        raise HTTPException(400, str(e))
    return enqueue(job)


@app.get("/jobs/{jid}")
def job_status(jid: str, authorization: str = Header("")):
    check(authorization)
    if jid not in JOBS:
        raise HTTPException(404, "unknown job")
    return {k: v for k, v in JOBS[jid].items() if k != "before"}


@app.post("/jobs/{jid}/collect")
def collect(jid: str, authorization: str = Header("")):
    """Fallback: an analyst ran Refresh and Export by hand; read the export they saved."""
    check(authorization)
    job = JOBS.get(jid)
    if not job:
        raise HTTPException(404, "unknown job")
    if job["status"] != "needs_person":
        raise HTTPException(409, f"job is {job['status']}")
    files = em_ui.latest_exports(WORK / "exports" / jid, job["created"])
    if not files:
        raise HTTPException(409, f"no export yet in {WORK / 'exports' / jid}")
    job["outputs"], job["missing"] = outputs_from(files)
    job["status"], job["collected"] = ("done" if not job["missing"] else "done_with_gaps"), time.time()
    if job["kind"] == "scratch" and job.get("before"):
        restore_inputs(target(job, models()[job["model"]])[1], job["before"])
        job["restored"] = True
    log(job)
    return {k: v for k, v in job.items() if k != "before"}
