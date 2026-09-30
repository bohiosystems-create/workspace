"""
Bohio EstateMaster runner: STARTER KIT (not yet tested against EstateMaster).

Runs on the Windows machine where EstateMaster (trial) and Excel are installed. It exposes a small
HTTP API that writes assumptions into the model's live-linked Excel "control workbook", lets
EstateMaster recalculate, and reads the outputs back.

The one step that depends on EstateMaster itself is `refresh_estatemaster()`: how the live-link is
refreshed (automatically, by a macro, or from the EstateMaster screen) must be confirmed in your
trial and with Altus. Everything else is plain Excel automation.

Setup (PowerShell):
    py -m pip install fastapi uvicorn xlwings
    set RUNNER_TOKEN=<long random string>
    set CONTROL_WORKBOOK=C:\\Bohio\\AlNarjis_control.xlsx
    py -m uvicorn em_runner:app --host 127.0.0.1 --port 8765
Then expose it to Vercel with a tunnel (e.g. Cloudflare Tunnel) and keep RUNNER_TOKEN secret.

register_map.csv (next to this file): id,sheet,cell           e.g. c4,Inputs,C12
outputs_map.csv:                     name,sheet,cell         e.g. levered_irr,Outputs,C5
"""
import csv, os, time
from pathlib import Path
from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel
import xlwings as xw

HERE = Path(__file__).parent
TOKEN = os.environ.get("RUNNER_TOKEN", "")
WORKBOOK = os.environ.get("CONTROL_WORKBOOK", str(HERE / "control_workbook.xlsx"))
REFRESH_WAIT_S = float(os.environ.get("REFRESH_WAIT_S", "5"))

def load_map(name):
    with open(HERE / name, newline="", encoding="utf-8") as f:
        return {r[list(r.keys())[0]]: (r["sheet"], r["cell"]) for r in csv.DictReader(f)}

INPUTS = load_map("register_map.csv")
OUTPUTS = load_map("outputs_map.csv")
app = FastAPI(title="Bohio EstateMaster runner")

class RunRequest(BaseModel):
    inputs: dict[str, float]        # register id -> absolute value in the line's unit
    job_id: str | None = None

def check(token):
    if not TOKEN or token != f"Bearer {TOKEN}":
        raise HTTPException(401, "bad token")

def book():
    return xw.Book(WORKBOOK)       # opens the workbook in the running Excel instance (or starts Excel)

def refresh_estatemaster(wb):
    """CONFIRM IN YOUR TRIAL. Options, in order of preference:
    1. The live-link updates EstateMaster when the linked workbook recalculates and saves.
    2. A macro in the workbook (e.g. 'RefreshEstateMaster') triggers the refresh: wb.macro('RefreshEstateMaster')()
    3. Last resort: UI automation of EstateMaster's refresh command (pywinauto); brittle, check the licence.
    """
    wb.app.calculate()
    wb.save()
    time.sleep(REFRESH_WAIT_S)
    wb.app.calculate()

def read_outputs(wb):
    return {name: wb.sheets[s].range(c).value for name, (s, c) in OUTPUTS.items()}

@app.get("/health")
def health(authorization: str = Header("")):
    check(authorization)
    return {"ok": True, "workbook": WORKBOOK, "inputs_mapped": len(INPUTS), "outputs_mapped": len(OUTPUTS)}

@app.post("/run")
def run(req: RunRequest, authorization: str = Header("")):
    check(authorization)
    unknown = [k for k in req.inputs if k not in INPUTS]
    if unknown:
        raise HTTPException(400, f"not in register_map.csv: {unknown}")
    t0 = time.time()
    wb = book()
    before = {k: wb.sheets[INPUTS[k][0]].range(INPUTS[k][1]).value for k in req.inputs}
    for k, v in req.inputs.items():
        s, c = INPUTS[k]
        wb.sheets[s].range(c).value = v
    refresh_estatemaster(wb)
    out = read_outputs(wb)
    return {"job_id": req.job_id, "before": before, "outputs": out, "seconds": round(time.time() - t0, 2)}

@app.get("/extract")
def extract(authorization: str = Header("")):
    check(authorization)
    wb = book()
    refresh_estatemaster(wb)
    return {"inputs": {k: wb.sheets[s].range(c).value for k, (s, c) in INPUTS.items()}, "outputs": read_outputs(wb), "at": time.strftime("%Y-%m-%dT%H:%M:%S")}
