"""
Checks a KINAN control workbook before it is connected to the Bohio agent.

    py runner/control_check.py C:\\Bohio\\Models\\AlNarjis_control.xlsx
    py runner/control_check.py setup\\KINAN_control_workbook_template.xlsx --blank-ok

Lines a project does not use (e.g. retail rents in a residential-only model) are left blank with
N/A in column H. Errors block the connection (missing or non-numeric values, values outside what the unit allows,
cells moved). Warnings need a person to look (values far from the reference, the same register line
mapped from two export rows, export rows with no register line). Exit code 0 = no errors.
The runner's /models/{id}/check and the demo's "Connect control workbook" apply the same rules.
"""
import csv, json, sys
from pathlib import Path
from openpyxl import load_workbook

HERE = Path(__file__).parent

# (min, max) allowed per unit; values outside are errors
UNIT_RANGE = {
    "%": (0, 100), "% of sales": (0, 20), "% of rent": (0, 60), "% of value": (0, 20),
    "% of construction": (0, 30), "% p.a.": (0, 30), "SAR/sqm": (1, 200000), "SAR/sqm/yr": (1, 20000),
    "SAR/sqm GFA": (0, 50000), "SAR M": (0, 100000), "sqm": (1, 10_000_000), "months": (0, 120),
}
SPECIFIC = {"cap": (1, 20), "sb": (0, 20), "mg": (0, 10)}
FAR_FROM_REFERENCE = 0.6   # warn when a value is more than 60% away from the register's reference value


def load_map():
    with open(HERE / "register_map.csv", newline="", encoding="utf-8") as f:
        return [r for r in csv.DictReader(f)]


def check(path, blank_ok=False):
    reg = load_map()
    wb = load_workbook(path, data_only=True)
    res = {"file": str(path), "errors": [], "warnings": [], "info": [], "values": {}, "filled": 0, "lines": len(reg)}
    if "Inputs" not in wb.sheetnames:
        res["errors"].append("No 'Inputs' sheet: this is not a KINAN control workbook (start from the template).")
        res["ok"] = False
        return res
    ws = wb["Inputs"]
    for r in reg:
        if not r["cell"]:
            res["errors"].append(f"{r['id']}: no cell in register_map.csv (run setup/make_control_template.py)")
            continue
        row = int("".join(c for c in r["cell"] if c.isdigit()))
        rid = ws[f"A{row}"].value
        if str(rid).strip() != r["id"]:
            res["errors"].append(f"{r['cell']}: expected line '{r['id']}' in column A but found '{rid}'. Rows were moved or deleted.")
            continue
        v = ws[r["cell"]].value
        na = str(ws[f"H{row}"].value or "").strip().upper() == "N/A"
        if v is None or (isinstance(v, str) and not v.strip()):
            if na:
                res["info"].append(f"{r['id']} {r['label']}: marked N/A (not used by this project)")
                res["lines"] -= 1
            elif not blank_ok:
                res["errors"].append(f"{r['id']} {r['label']}: no value")
            continue
        try:
            v = float(str(v).replace(",", "").replace("%", "")) if isinstance(v, str) else float(v)
        except ValueError:
            res["errors"].append(f"{r['id']} {r['label']}: '{v}' is not a number")
            continue
        lo, hi = SPECIFIC.get(r["id"], UNIT_RANGE.get(r["unit"], (float("-inf"), float("inf"))))
        if not lo <= v <= hi:
            hint = " (percentages are entered as 7.5, not 0.075)" if r["unit"].startswith("%") and 0 < v < 1 else ""
            res["errors"].append(f"{r['id']} {r['label']}: {v:g} {r['unit']} is outside {lo:g}–{hi:g}{hint}")
            continue
        ref = float(r["base_value"] or 0)
        if ref and abs(v / ref - 1) > FAR_FROM_REFERENCE:
            pct = r["unit"].startswith("%") and 0 < v < 1 and ref >= 2
            res["warnings"].append(f"{r['id']} {r['label']}: {v:g} is far from the reference {ref:g} {r['unit']}. "
                                   + ("Percentages are entered as 7.5, not 0.075." if pct else "Check the unit and the source row."))
        if str(ws[f"H{row}"].value or "").strip().upper() != "Y":
            res["warnings"].append(f"{r['id']} {r['label']}: not marked confirmed (column H)")
        res["values"][r["id"]] = v
        res["filled"] += 1
    if "Mapping" in wb.sheetnames:
        seen, unmapped = {}, 0
        for row in wb["Mapping"].iter_rows(min_row=2, values_only=True):
            label, rid = row[1], row[3]
            if not label:
                continue
            if not rid:
                unmapped += 1
                continue
            rid = str(rid).strip()
            if rid in seen:
                res["warnings"].append(f"{rid}: mapped from two export rows ('{seen[rid]}' and '{label}'). Check it is not double-counted.")
            seen[rid] = label
        if unmapped:
            res["info"].append(f"{unmapped} export row(s) have no register line. Fine if they are totals or not used by the agent.")
    res["ok"] = not res["errors"]
    return res


if __name__ == "__main__":
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    out = check(sys.argv[1], blank_ok="--blank-ok" in sys.argv)
    if "--json" in sys.argv:
        print(json.dumps(out, indent=2))
    else:
        print(f"{out['file']}: {out['filled']}/{out['lines']} values, {len(out['errors'])} errors, {len(out['warnings'])} warnings")
        for k in ("errors", "warnings", "info"):
            for m in out[k]:
                print(f"  {k[:-1].upper():8} {m}")
        print("READY TO CONNECT" if out["ok"] else "NOT READY: fix the errors above")
    sys.exit(0 if out["ok"] else 1)
