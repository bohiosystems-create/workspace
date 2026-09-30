"""
Bohio EstateMaster runner (not yet run against EstateMaster).

Runs on the Windows VM with EstateMaster and Excel, in a logged-in desktop session. The Bohio agent
(Vercel, /api/runner) sends it APPROVED changes only. For each job it:
  1. writes every assumption into the model's control workbook (fixed cells, register_map.csv)
  2. operates EstateMaster: open -> Office Links Refresh -> recalculate -> Excel export -> save copy -> close
  3. reads the results from EstateMaster's own export, by row label (output_labels.csv)
If step 2 fails, or RUNNER_MODE=manual, the job becomes a one-minute task for an analyst
("open, Refresh, Export"); the agent collects the export afterwards. It never reports a number
EstateMaster did not produce.

Setup (PowerShell, in the runner folder):
    py -m pip install fastapi uvicorn openpyxl pywinauto pillow
    setx RUNNER_TOKEN "<long random string>"          # the same value goes in Vercel
    setx RUNNER_MODE "ui"                              # or "manual" until the UI trial passes
    py -m uvicorn em_runner:app --host 127.0.0.1 --port 8765
Expose it to Vercel through a tunnel (e.g. Cloudflare Tunnel), never an open port.

models.json (next to this file) lists the connected models:
    {"narjis": {"name": "Al Narjis Mixed-Use", "emdf": "C:\\\\Bohio\\\\Models\\\\AlNarjis.emdf",
                "control_workbook": "C:\\\\Bohio\\\\Models\\\\AlNarjis_control.xlsx"}}
"""
import csv, json, os, queue, threading, time, uuid
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
MODELS_FILE = HERE / "models.json"
JOBS_LOG = WORK / "jobs.jsonl"
WORK.mkdir(parents=True, exist_ok=True)

with open(HERE / "register_map.csv", newline="", encoding="utf-8") as f:
    INPUTS = {r["id"]: (r["sheet"], r["cell"]) for r in csv.DictReader(f)}
with open(HERE / "output_labels.csv", newline="", encoding="utf-8") as f:
    OUT_ROWS = list(csv.DictReader(f))
LABELS = {r["name"]: r["label"] for r in OUT_ROWS}
SCALE = {r["name"]: float(r.get("scale") or 1) for r in OUT_ROWS}

app = FastAPI(title="Bohio EstateMaster runner")
JOBS, Q, LOCK = {}, queue.Queue(), threading.Lock()


def models():
    return json.loads(MODELS_FILE.read_text(encoding="utf-8")) if MODELS_FILE.exists() else {}


def check(auth):
    if not TOKEN or auth != f"Bearer {TOKEN}":
        raise HTTPException(401, "bad token")


def log(job):
    with open(JOBS_LOG, "a", encoding="utf-8") as f:
        f.write(json.dumps({k: v for k, v in job.items() if k != "files"}, default=str) + "\n")


def write_inputs(path, inputs):
    """Writes values into the control workbook; returns the values that were there before."""
    wb = load_workbook(path)
    before = {}
    for k, v in inputs.items():
        sheet, cell = INPUTS[k]
        before[k] = wb[sheet][cell].value
        wb[sheet][cell].value = float(v)
    wb.save(path)  # fails if the workbook is open in Excel: keep it closed on the runner
    return before


def outputs_from(files):
    vals, missing = em_ui.read_export(files, LABELS)
    return {k: v * SCALE[k] for k, v in vals.items()}, missing


def manual_task(job, m, reason):
    job.update(status="needs_person", reason=reason, task=(
        f"Open {m['emdf']} in EstateMaster, press Office Links → Refresh, recalculate, then Office Links → Excel "
        f"and save the export in {WORK / 'exports' / job['id']}. Then press Collect on {job.get('cr_id') or job['id']} "
        f"in the Bohio app."))
    (WORK / "exports" / job["id"]).mkdir(parents=True, exist_ok=True)


def process(job):
    m = models()[job["model"]]
    job.update(status="running", started=time.time())
    try:
        if job["inputs"]:
            job["before"] = write_inputs(m["control_workbook"], job["inputs"])
        if MODE == "manual":
            return manual_task(job, m, "Runner is in manual mode")
        timings = []
        with LOCK:  # one EstateMaster window at a time
            try:
                files = em_ui.round_trip(m["emdf"], WORK / "exports" / job["id"], job["id"], timings, WORK)
            except em_ui.UIFailed as e:
                job.update(timings=timings, screenshot=e.screenshot)
                return manual_task(job, m, f"EstateMaster automation failed: {e}")
        job["timings"] = timings
        job["outputs"], job["missing"] = outputs_from(files)
        job["status"] = "done" if not job["missing"] else "done_with_gaps"
    except Exception as e:
        job.update(status="failed", error=f"{type(e).__name__}: {e}")
    finally:
        job["seconds"] = round(time.time() - job["started"], 1)
        log(job)


def worker():
    while True:
        job = Q.get()
        process(job)
        Q.task_done()


threading.Thread(target=worker, daemon=True).start()


class JobRequest(BaseModel):
    model: str
    inputs: dict[str, float] = {}      # register id -> value in the line's unit; empty = extract only
    cr_id: str | None = None
    requested_by: str | None = None


class ModelReg(BaseModel):
    name: str
    emdf: str
    control_workbook: str


@app.get("/health")
def health(authorization: str = Header("")):
    check(authorization)
    return {"ok": True, "mode": MODE, "models": list(models()), "queued": Q.qsize(), "busy": LOCK.locked(),
            "inputs_mapped": len(INPUTS), "outputs": list(LABELS)}


@app.get("/models")
def list_models(authorization: str = Header("")):
    check(authorization)
    return models()


@app.post("/models/{mid}")
def register_model(mid: str, body: ModelReg, authorization: str = Header("")):
    """Connect a model (called after the connection change request is approved). The workbook must pass the checks."""
    check(authorization)
    res = control_check.check(body.control_workbook)
    if not res["ok"]:
        raise HTTPException(400, {"message": "control workbook failed the checks", "check": res})
    ms = models()
    ms[mid] = body.model_dump()
    MODELS_FILE.write_text(json.dumps(ms, indent=2), encoding="utf-8")
    return {"ok": True, "model": mid, "check": res}


@app.post("/models/{mid}/check")
def check_model(mid: str, authorization: str = Header("")):
    check(authorization)
    if mid not in models():
        raise HTTPException(404, f"model {mid} not connected")
    return control_check.check(models()[mid]["control_workbook"])


@app.post("/jobs")
def submit(req: JobRequest, authorization: str = Header("")):
    check(authorization)
    if req.model not in models():
        raise HTTPException(404, f"model {req.model} is not connected to the runner (models.json)")
    unknown = [k for k in req.inputs if k not in INPUTS]
    if unknown:
        raise HTTPException(400, f"not in register_map.csv: {unknown}")
    job = {"id": "J" + time.strftime("%Y%m%d%H%M%S") + uuid.uuid4().hex[:4], "model": req.model, "inputs": req.inputs,
           "cr_id": req.cr_id, "requested_by": req.requested_by, "status": "queued", "created": time.time()}
    JOBS[job["id"]] = job
    Q.put(job)
    return {"job_id": job["id"], "status": "queued", "position": Q.qsize()}


@app.get("/jobs/{jid}")
def job_status(jid: str, authorization: str = Header("")):
    check(authorization)
    if jid not in JOBS:
        raise HTTPException(404, "unknown job")
    return JOBS[jid]


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
    log(job)
    return job
