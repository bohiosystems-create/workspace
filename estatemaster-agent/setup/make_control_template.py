"""
Builds the KINAN control workbook template from runner/register_map.csv and points the map at it.

    python setup/make_control_template.py

Writes setup/KINAN_control_workbook_template.xlsx and fills the sheet/cell columns of
runner/register_map.csv, so every model set up from the template uses the same fixed map.
The layout (sheet names, header row, first data row, value column) must stay as it is: the runner,
the checker and the demo's "Connect control workbook" all read it.
"""
import csv
from pathlib import Path
from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.worksheet.datavalidation import DataValidation

ROOT = Path(__file__).resolve().parent.parent
MAP = ROOT / "runner" / "register_map.csv"
OUT = ROOT / "setup" / "KINAN_control_workbook_template.xlsx"
HEADER_ROW, FIRST_ROW, VALUE_COL = 3, 4, "E"
INK, SAND, PALE = "000919", "E6E2E2", "F4F2F2"

with open(MAP, newline="", encoding="utf-8") as f:
    rows = list(csv.DictReader(f))
fields = list(rows[0].keys())

wb = Workbook()
bold, white = Font(bold=True), Font(bold=True, color="FFFFFF")
head_fill, input_fill = PatternFill("solid", fgColor=INK), PatternFill("solid", fgColor="FFF7D6")


def header(ws, row, names, widths):
    for i, (n, w) in enumerate(zip(names, widths), start=1):
        c = ws.cell(row=row, column=i, value=n)
        c.font, c.fill = white, head_fill
        ws.column_dimensions[c.column_letter].width = w
    ws.freeze_panes = ws.cell(row=row + 1, column=1)


# ReadMe
ws = wb.active
ws.title = "ReadMe"
ws.column_dimensions["A"].width = 110
for i, line in enumerate([
    "KINAN control workbook: the only place the Bohio agent writes EstateMaster inputs",
    "",
    "1. Setup (once per model, analyst + Copilot setup agent): fill column E of the Inputs sheet from the model's",
    "   Office Links export. Record where each value came from in column F and log every match on the Mapping sheet.",
    "2. Check: run  py runner/control_check.py <this file>  (or Model data -> Connect control workbook in the Bohio app).",
    "3. Link: in EstateMaster, link each input to its cell in column E (Office Links). On the KINAN master template",
    "   this is already done. Confirm in the trial that the links survive copying the model.",
    "4. After setup, only the Bohio runner writes to this file, and only approved changes. Do not edit it by hand.",
    "",
    "Do not insert or delete rows or columns, or rename sheets: the runner writes to fixed cells (runner/register_map.csv).",
    "Units: % values as percentages (7.5 means 7.5%), money as shown in the Unit column.",
    "Lines this project does not use: leave column E blank and put N/A in column H.",
    "Every other assumption goes on the Lines sheet: no limit, one row per input, id L0001, L0002, … Add rows at the",
    "   bottom only, link column E in EstateMaster, then put Y in column J. Unlinked lines are never written by the runner.",
], start=1):
    ws.cell(row=i, column=1, value=line).font = Font(bold=(i == 1), size=13 if i == 1 else 11)

# Project
ws = wb.create_sheet("Project")
header(ws, 1, ["Field", "Value"], [28, 60])
for i, k in enumerate(["Project name", "Bohio model id", "EstateMaster file (.emdf)", "Prepared by",
                       "Date", "Checked by", "Status (draft / checked / linked / live)"], start=2):
    ws.cell(row=i, column=1, value=k).font = bold
    ws.cell(row=i, column=2).fill = input_fill

# Inputs
ws = wb.create_sheet("Inputs")
ws["A1"] = "Assumption register: fill column E only"
ws["A1"].font = Font(bold=True, size=13)
ws["A2"] = "Column E is what EstateMaster reads through its Excel link. Columns F to I are the audit trail."
header(ws, HEADER_ROW, ["id", "Section", "Assumption", "Unit", "Value", "Source in EstateMaster export",
                        "Mapped by", "Confirmed (Y/N/N/A)", "Notes"], [8, 30, 30, 18, 14, 36, 16, 16, 36])
yn = DataValidation(type="list", formula1='"Y,N,N/A"', allow_blank=True)
ws.add_data_validation(yn)
for i, r in enumerate(rows):
    n = FIRST_ROW + i
    for col, v in zip("ABCD", [r["id"], r["section"], r["label"], r["unit"]]):
        ws[f"{col}{n}"] = v
    ws[f"{VALUE_COL}{n}"].fill = input_fill
    ws[f"{VALUE_COL}{n}"].number_format = "#,##0.00"
    yn.add(f"H{n}")
    r["sheet"], r["cell"] = "Inputs", f"{VALUE_COL}{n}"
last = FIRST_ROW + len(rows) - 1

# Lines: every other assumption in the model, no limit. Append only: never insert, delete or reorder rows.
ws = wb.create_sheet("Lines")
ws["A1"] = "Model lines: every other assumption, no limit. Add rows at the bottom only"
ws["A1"].font = Font(bold=True, size=13)
ws["A2"] = ("One row per EstateMaster input. Id in column A (L0001, L0002, …), unique and never reused. Column E is what "
            "EstateMaster reads; link it once, then put Y in column J.")
header(ws, HEADER_ROW, ["id", "Section", "Assumption", "Unit", "Value", "Source in EstateMaster export", "Mapped by",
                        "Confirmed (Y/N/N/A)", "Notes", "Linked in EstateMaster (Y/N)"], [9, 30, 36, 16, 14, 36, 14, 16, 30, 16])
yn2 = DataValidation(type="list", formula1='"Y,N,N/A"', allow_blank=True)
yl = DataValidation(type="list", formula1='"Y,N"', allow_blank=True)
ws.add_data_validation(yn2)
ws.add_data_validation(yl)
yn2.add(f"H{FIRST_ROW}:H200000")
yl.add(f"J{FIRST_ROW}:J200000")
for n in range(FIRST_ROW, FIRST_ROW + 200):
    ws[f"{VALUE_COL}{n}"].fill = input_fill

# Mapping
ws = wb.create_sheet("Mapping")
header(ws, 1, ["Export sheet", "Export row label", "Export value", "Register id", "Confidence (high/medium/low)",
               "Comment"], [18, 40, 14, 12, 26, 50])
for n in range(2, 202):
    for c in "ABCDEF":
        ws[f"{c}{n}"].fill = PatternFill("solid", fgColor=PALE) if n % 2 else PatternFill(None)

# Checks
ws = wb.create_sheet("Checks")
header(ws, 1, ["Check", "Result"], [48, 16])
checks = [
    ("Assumption lines", f"=COUNTA(Inputs!A{FIRST_ROW}:A{last})"),
    ("Values filled", f"=COUNT(Inputs!E{FIRST_ROW}:E{last})"),
    ("Values missing", f"=B2-B3"),
    ("Lines confirmed (Y)", f'=COUNTIF(Inputs!H{FIRST_ROW}:H{last},"Y")'),
    ("Export rows logged on Mapping", "=COUNTA(Mapping!B2:B201)"),
    ("Mapping rows with no register id", '=COUNTA(Mapping!B2:B201)-COUNTA(Mapping!D2:D201)'),
    ("Ready for the checker", '=IF(AND(B4=0,B5=B2),"YES","NO")'),
    ("Model lines (sheet Lines)", "=COUNTA(Lines!A4:A200000)"),
    ("Model lines linked in EstateMaster", '=COUNTIF(Lines!J4:J200000,"Y")'),
]
for i, (k, f_) in enumerate(checks, start=2):
    ws.cell(row=i, column=1, value=k)
    ws.cell(row=i, column=2, value=f_).alignment = Alignment(horizontal="right")
ws.cell(row=len(checks) + 3, column=1,
        value="Full validation (units, ranges, duplicates): py runner/control_check.py <file>").font = Font(italic=True)

wb.save(OUT)
with open(MAP, "w", newline="", encoding="utf-8") as f:
    w = csv.DictWriter(f, fieldnames=fields)
    w.writeheader()
    w.writerows(rows)
print(f"{OUT.relative_to(ROOT)}: {len(rows)} lines, Inputs!{VALUE_COL}{FIRST_ROW}:{VALUE_COL}{last}; register_map.csv updated")
