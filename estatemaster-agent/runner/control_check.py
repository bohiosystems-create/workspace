"""
Checks a KINAN control workbook before it is connected to the Bohio agent.

    py runner/control_check.py C:\\Bohio\\Models\\AlNarjis_control.xlsx
    py runner/control_check.py setup\\KINAN_control_workbook_template.xlsx --blank-ok

Model lines (sheet "Lines", any number of rows, found by id in column A) are checked too: unique ids,
numeric values (unless the unit is text or date), and whether each is linked in EstateMaster (column J).
Lines a project does not use (e.g. retail rents in a residential-only model) are left blank with
N/A in column H. Errors block the connection (missing or non-numeric values, values outside what the unit allows,
cells moved). Warnings need a person to look (values far from the reference, the same register line
mapped from two export rows, export rows with no register line). Exit code 0 = no errors.
The runner's /models/{id}/check and the demo's "Connect control workbook" apply the same rules.
"""
import csv, json, re, sys
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
FIRST_ROW = 4              # first data row on Inputs and Lines (row 3 is the header)
TEXT_UNITS = {"text", "date"}


def line_range(unit):
    """Model lines can mean anything, so only broad sanity limits (same as the app)."""
    if "%" in unit:
        return (-100, 100)
    if re.match(r"^(months?|years?|sqm|units?|SAR.*)$", unit, re.I):
        return (0, float("inf"))
    return (float("-inf"), float("inf"))


def read_lines(ws):
    """Model lines on the Lines sheet: {id: {row, section, label, unit, value, confirmed, linked}}, in sheet order.
    Rows are only ever appended, so a line keeps its row (and its EstateMaster link) for good."""
    out, dups = {}, []
    for n, row in enumerate(ws.iter_rows(min_row=FIRST_ROW, max_col=10, values_only=True), start=FIRST_ROW):
        rid = str(row[0]).strip() if row[0] is not None else ""
        if not rid:
            continue
        if rid in out:
            dups.append((rid, out[rid]["row"], n))
            continue
        out[rid] = {"row": n, "section": row[1] or "", "label": row[2] or "", "unit": str(row[3] or ""), "value": row[4],
                    "confirmed": str(row[7] or "").strip().upper(), "linked": str(row[9] or "").strip().upper() == "Y"}
    return out, dups


def load_map():
    with open(HERE / "register_map.csv", newline="", encoding="utf-8") as f:
        return [r for r in csv.DictReader(f)]


def check(path, blank_ok=False):
    reg = load_map()
    wb = load_workbook(path, data_only=True)
    res = {"file": str(path), "errors": [], "warnings": [], "info": [], "values": {}, "filled": 0, "lines": len(reg),
           "lines_values": {}, "model_lines": 0}
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
    if "Lines" in wb.sheetnames:
        lines, dups = read_lines(wb["Lines"])
        core = {r["id"] for r in reg}
        for rid, a, b in dups:
            res["errors"].append(f"Lines: id '{rid}' appears on rows {a} and {b}. Ids must be unique.")
        unconfirmed, unlinked = 0, 0
        for rid, l in lines.items():
            if rid in core:
                res["errors"].append(f"Lines row {l['row']}: '{rid}' is a core line id; model lines need their own ids (e.g. L0001).")
                continue
            if not l["label"]:
                res["errors"].append(f"Lines row {l['row']} ({rid}): no label")
            v = l["value"]
            if v is None or (isinstance(v, str) and not v.strip()):
                if l["confirmed"] != "N/A" and not blank_ok:
                    res["errors"].append(f"Lines {rid} {l['label']}: no value")
                continue
            if l["unit"].lower() not in TEXT_UNITS:
                try:
                    v = float(str(v).replace(",", "").replace("%", "")) if isinstance(v, str) else float(v)
                except ValueError:
                    res["errors"].append(f"Lines {rid} {l['label']}: '{v}' is not a number")
                    continue
                lo, hi = line_range(l["unit"])
                if not lo <= v <= hi:
                    res["errors"].append(f"Lines {rid} {l['label']}: {v:g} {l['unit']} is outside {lo:g}–{hi:g}")
                    continue
            unconfirmed += l["confirmed"] != "Y"
            unlinked += not l["linked"]
            res["lines_values"][rid] = v
        res["model_lines"] = len(lines)
        if unconfirmed:
            res["warnings"].append(f"Lines: {unconfirmed} model line(s) not marked confirmed (column H)")
        if unlinked:
            res["info"].append(f"Lines: {unlinked} model line(s) not linked in EstateMaster yet (column J). The agent can propose changes to them, but the runner will not write them until they are linked.")
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
        print(f"{out['file']}: {out['filled']}/{out['lines']} core values, {out['model_lines']} model lines, {len(out['errors'])} errors, {len(out['warnings'])} warnings")
        for k in ("errors", "warnings", "info"):
            for m in out[k]:
                print(f"  {k[:-1].upper():8} {m}")
        print("READY TO CONNECT" if out["ok"] else "NOT READY: fix the errors above")
    sys.exit(0 if out["ok"] else 1)
