"""
Bohio EstateMaster UI trial: step 2 (not yet run against EstateMaster).

Runs one full round trip with no person at the keyboard and times every step:
    write inputs to the control workbook -> open model -> Office Links Refresh -> recalculate
    -> Office Links Excel export -> save a scenario copy -> close -> read the export.

The buttons it presses are listed in ui_steps.json. The names there are placeholders: replace
them with the real names from em_ui_probe.py's output before running.

    py -m pip install pywinauto pillow xlwings openpyxl
    py em_ui_trial.py "C:\\Bohio\\Trial\\AlNarjis.emdf" --set c4=5200

--set is optional: sheet!cell=value pairs are written to CONTROL_WORKBOOK first, or register ids
from register_map.csv. On any failure it stops, saves a screenshot to trial_out\\ and never
reports a number it did not read from EstateMaster's own export.
"""
import csv, json, os, re, sys, time
from pathlib import Path
from pywinauto import Desktop, keyboard
from pywinauto.application import Application

HERE = Path(__file__).parent
OUT = HERE / "trial_out"
TITLE_RE = os.environ.get("EM_TITLE_RE", r".*EstateMaster.*")
CONTROL_WORKBOOK = os.environ.get("CONTROL_WORKBOOK", "")
EXPORT_DIR = Path(os.environ.get("EM_EXPORT_DIR", str(OUT / "exports")))
TIMINGS = []


class StepFailed(Exception):
    pass


def timed(name):
    def wrap(fn):
        def run(*a, **k):
            t0 = time.time()
            try:
                return fn(*a, **k)
            finally:
                TIMINGS.append((name, round(time.time() - t0, 1)))
                print(f"  {name}: {TIMINGS[-1][1]}s")
        return run
    return wrap


def main_window(timeout=30):
    deadline = time.time() + timeout
    while time.time() < deadline:
        for w in Desktop(backend="uia").windows():
            if w.is_visible() and re.match(TITLE_RE, w.window_text() or ""):
                return Application(backend="uia").connect(handle=w.handle).window(handle=w.handle)
        time.sleep(1)
    raise StepFailed("EstateMaster window not found")


def find(win, step):
    """A control by the name/type recorded from the probe, searched in the main window and its dialogs."""
    crit = {k: step[k] for k in ("title", "title_re", "control_type", "auto_id") if k in step}
    ctrl = win.child_window(**crit)
    ctrl.wait("exists enabled", timeout=step.get("timeout", 20))
    return ctrl


def do_step(win, step):
    kind = step["do"]
    if kind == "click":
        c = find(win, step)
        try:
            c.invoke()          # works on most ribbon buttons without moving the mouse
        except Exception:
            c.click_input()     # fallback: real mouse click (needs an unlocked desktop)
    elif kind == "keys":
        win.set_focus()
        keyboard.send_keys(step["keys"])
    elif kind == "type":
        find(win, step).set_edit_text(step["text"].format(export_dir=EXPORT_DIR, stamp=STAMP))
    elif kind == "wait_dialog":
        dlg = Desktop(backend="uia").window(title_re=step["title_re"])
        dlg.wait("visible", timeout=step.get("timeout", 30))
        return dlg
    elif kind == "wait_idle":
        time.sleep(step.get("seconds", 2))
    else:
        raise StepFailed(f"unknown step type {kind}")


@timed("write inputs")
def write_inputs(pairs):
    if not pairs:
        return {}
    import xlwings as xw
    reg = {}
    p = HERE / "register_map.csv"
    if p.exists():
        with open(p, newline="", encoding="utf-8") as f:
            reg = {r["id"]: (r["sheet"], r["cell"]) for r in csv.DictReader(f)}
    wb = xw.Book(CONTROL_WORKBOOK)
    before = {}
    for key, val in pairs:
        sheet, cell = reg[key] if key in reg else key.split("!")
        before[key] = wb.sheets[sheet].range(cell).value
        wb.sheets[sheet].range(cell).value = float(val)
    wb.app.calculate()
    wb.save()
    return before


@timed("open model")
def open_model(model):
    os.startfile(str(model))
    return main_window(timeout=float(os.environ.get("EM_OPEN_WAIT_S", "60")))


def run_group(win, steps, group):
    @timed(group)
    def go():
        for s in steps:
            do_step(win, s)
    go()


@timed("read export")
def read_export():
    """Read the exported workbook(s) by row label, not by cell address."""
    import openpyxl
    files = sorted(EXPORT_DIR.glob(f"*{STAMP}*.xls*")) or sorted(EXPORT_DIR.glob("*.xls*"), key=os.path.getmtime)[-1:]
    if not files:
        raise StepFailed(f"no export found in {EXPORT_DIR}")
    wanted = json.loads((HERE / "ui_steps.json").read_text())["read_labels"]
    found = {}
    for f in files:
        for ws in openpyxl.load_workbook(f, data_only=True, read_only=True).worksheets:
            for row in ws.iter_rows(values_only=True):
                cells = [c for c in row if c is not None]
                for c in cells:
                    if isinstance(c, str) and c.strip() in wanted and c.strip() not in found:
                        nums = [v for v in cells if isinstance(v, (int, float))]
                        if nums:
                            found[c.strip()] = nums[-1]   # last number on the row = total/result; check in the trial
    return {"files": [str(f) for f in files], "values": found, "missing": [w for w in wanted if w not in found]}


def main():
    global STAMP
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    model = Path(sys.argv[1]).resolve()
    pairs = [a.split("=", 1) for a in sys.argv[2:] if "=" in a]
    STAMP = time.strftime("%Y%m%d_%H%M%S")
    OUT.mkdir(exist_ok=True)
    EXPORT_DIR.mkdir(parents=True, exist_ok=True)
    cfg = json.loads((HERE / "ui_steps.json").read_text())
    t0, win, result = time.time(), None, {}
    try:
        result["before"] = write_inputs(pairs)
        win = open_model(model)
        for group in ("refresh_links", "recalculate", "export_excel", "save_copy", "close"):
            run_group(win, cfg[group], group)
        result["export"] = read_export()
        result["ok"] = not result["export"]["missing"]
    except Exception as e:
        result["ok"], result["error"] = False, f"{type(e).__name__}: {e}"
        try:
            (win or main_window(5)).capture_as_image().save(OUT / f"failed_{STAMP}.png")
        except Exception:
            pass
    result["timings"] = TIMINGS
    result["total_seconds"] = round(time.time() - t0, 1)
    (OUT / f"trial_{STAMP}.json").write_text(json.dumps(result, indent=2, default=str))
    print(json.dumps(result, indent=2, default=str))


STAMP = ""
if __name__ == "__main__":
    main()
