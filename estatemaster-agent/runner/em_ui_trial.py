"""
Bohio EstateMaster UI trial: step 2 (not yet run against EstateMaster).

Runs one full round trip with no person at the keyboard and times every step:
    write inputs to the control workbook -> open model -> Office Links Refresh -> recalculate
    -> Office Links Excel export -> save a scenario copy -> close -> read the export by label.

Before running, replace the placeholder button names in ui_steps.json with the names em_ui_probe.py
recorded, and the labels in output_labels.csv with the row labels in your export.

    py -m pip install pywinauto pillow openpyxl
    py em_ui_trial.py "C:\\Bohio\\Trial\\AlNarjis.emdf" "C:\\Bohio\\Trial\\AlNarjis_control.xlsx" c4=1400

Arguments after the two paths are register id=value pairs written to the control workbook first.
On any failure it stops, saves a screenshot to trial_out\\ and reports no numbers.
"""
import json, sys, time
from pathlib import Path

import em_ui
from em_runner import write_inputs, outputs_from

HERE = Path(__file__).parent
OUT = HERE / "trial_out"


def main():
    if len(sys.argv) < 3:
        sys.exit(__doc__)
    emdf, control = Path(sys.argv[1]).resolve(), Path(sys.argv[2]).resolve()
    inputs = {k: float(v) for k, v in (a.split("=", 1) for a in sys.argv[3:] if "=" in a)}
    stamp, timings, t0, res = time.strftime("%Y%m%d_%H%M%S"), [], time.time(), {}
    OUT.mkdir(exist_ok=True)
    try:
        if inputs:
            t = time.time()
            res["before"] = write_inputs(control, inputs)
            timings.append(("write inputs", round(time.time() - t, 1)))
        files = em_ui.round_trip(emdf, OUT / "exports", stamp, timings, OUT)
        t = time.time()
        res["outputs"], res["missing"] = outputs_from(files)
        timings.append(("read export", round(time.time() - t, 1)))
        res["files"], res["ok"] = [str(f) for f in files], not res["missing"]
    except Exception as e:
        res.update(ok=False, error=str(e), screenshot=getattr(e, "screenshot", None))
    res["timings"], res["total_seconds"] = timings, round(time.time() - t0, 1)
    (OUT / f"trial_{stamp}.json").write_text(json.dumps(res, indent=2, default=str))
    print(json.dumps(res, indent=2, default=str))


if __name__ == "__main__":
    main()
