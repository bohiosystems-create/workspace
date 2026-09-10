#!/usr/bin/env python3
"""
Builds the Site Walk Quick Reference PDF from the mock project data set.

Ordered for how you actually use it on site: safety first, then the things
you get asked to recall standing next to the work — levels, revisions,
permits, spec thresholds, test results, and what is running late.

    python3 site-reference/build_pdf.py
"""
from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (BaseDocTemplate, Frame, KeepTogether, NextPageTemplate, PageBreak,
                                PageTemplate, Paragraph, Spacer, Table, TableStyle)

OUT = "site-reference/Site-Walk-Quick-Reference.pdf"

INK      = colors.HexColor("#1f2430")
MUTED    = colors.HexColor("#6b7280")
RULE     = colors.HexColor("#d8dce4")
BAND     = colors.HexColor("#f2f4f8")
NAVY     = colors.HexColor("#0f2d52")
RED      = colors.HexColor("#c62134")
AMBER    = colors.HexColor("#b26a00")
GREEN    = colors.HexColor("#00713f")
BLUE     = colors.HexColor("#0060b9")

# --------------------------------------------------------------- data
META = dict(name="Al Khumrah Infrastructure Package", code="BOH-INF-014",
            client="Bohio Systems LTD", consultant="Khatib & Alami",
            contractor="Nesma & Partners", location="Al Khumrah, South Jeddah",
            contract="SAR 48.6m", form="FIDIC Red Book 1999",
            start="12 Jan 2026", finish="04 Mar 2027", data_date="10 Sept 2026",
            progress="38.4% complete · 4.2% behind baseline")

HSE = dict(emergency="999  ·  site control +966 55 019 4477",
           clinic="Site clinic — Gate 2, Portakabin C3",
           assembly="Assembly Point A — north of the batching plant",
           hospital="Al Khumrah General, 8 km / 14 min",
           ppe="Hard hat, hi-vis, steel toe, eye protection. Gloves for rebar and kerb laying.",
           permits="Hot works · confined space · excavation >1.2 m · live LV/HV · lifting ops",
           incident="27 days ago — minor hand laceration, kerb handling",
           toolbox="06:15 daily at the muster hut")

CONTACTS = [
    ("Yousef Al-Harbi",    "Project Manager",          "Nesma & Partners", "+966 55 214 8890"),
    ("Sara Al-Otaibi",     "Site Engineer (Civils)",   "Nesma & Partners", "+966 55 331 7742"),
    ("Rami Haddad",        "Site Engineer (Elec.)",    "Nesma & Partners", "+966 56 908 1123"),
    ("Mohammed Zahrani",   "QA/QC Manager",            "Nesma & Partners", "+966 50 774 2210"),
    ("Elena Marquez",      "Resident Engineer",        "Khatib & Alami",   "+966 54 662 0091"),
    ("Khalid Saleh",       "HSE Officer",              "Nesma & Partners", "+966 55 019 4477"),
    ("Matteo Bevilacqua",  "Planner / PM",             "Bohio Systems",    "+966 57 440 3312"),
]

PERMITS = [
    ("Excavation permit", "PTW-2209", "Ductbank ch 0+200–0+500",    "16 Sept 2026", "Valid"),
    ("Road closure",      "MUN-4471", "Al Khumrah Rd southbound",   "21 Sept 2026", "Valid"),
    ("Hot works",         "PTW-2213", "Substation plinth",          "11 Sept 2026", "Expires tomorrow"),
    ("Confined space",    "PTW-2215", "MH-12 drainage chamber",     "14 Sept 2026", "Valid"),
    ("HV isolation",      "—",        "Substation tie-in",          "—",            "Not yet applied"),
]

UTILITIES = [
    ("Existing 11kV STC cable", "Ch 0+180, west verge", "1.1 m", "Saudi Electricity",
     "Hand-dig within 500 mm. Cable-avoidance tool mandatory."),
    ("Existing 300 mm water main", "Ch 0+450 crossing", "1.6 m", "NWC",
     "Do not expose without NWC attendance."),
    ("Unrecorded 160 mm duct", "Ch 0+610", "0.8 m", "Unknown",
     "RFI-018 open. Hand-dig only."),
    ("Fibre backbone", "Ch 0+050 east verge", "0.9 m", "STC",
     "Marked with tape, keep 1 m clear."),
]

LEVELS = [
    ("Grid C4",      "Formation level",  "+12.350 m", "Lowered 150 mm per RFI-011"),
    ("Grid D2",      "Formation level",  "+12.500 m", "As drawing C-210 Rev C"),
    ("MH-12",        "Invert level",     "+9.820 m",  "Storm, DN400 outfall"),
    ("MH-13",        "Invert level",     "+9.640 m",  "Storm, 1:200 fall to outfall"),
    ("Ch 0+320",     "Ductbank soffit",  "+11.100 m", "Clash zone — see RFI-014"),
    ("Substation",   "Plinth FFL",       "+13.000 m", "E-540 Rev B"),
    ("Road ch 0+000","Finished road lvl","+13.250 m", "Tie-in to existing"),
]

DRAWINGS = [
    ("C-101", "Site Layout & Setting Out",      "Rev D", "28 Aug 2026", "Approved"),
    ("C-210", "Earthworks & Formation Levels",  "Rev C", "14 Aug 2026", "Approved"),
    ("C-320", "Stormwater Drainage Layout",     "Rev F", "02 Sept 2026", "Approved"),
    ("C-321", "Drainage Longitudinal Sections", "Rev E", "02 Sept 2026", "Approved"),
    ("C-410", "Sewerage & Water Network",       "Rev C", "19 Aug 2026", "Approved"),
    ("E-510", "Electrical Ductbank Layout",     "Rev G", "06 Sept 2026", "Approved"),
    ("E-511", "Ductbank Typical Sections",      "Rev D", "06 Sept 2026", "Approved"),
    ("E-540", "Substation Plinth & Earthing",   "Rev B", "24 Aug 2026", "For construction"),
    ("T-610", "Telecoms & Fibre Duct Routes",   "Rev B", "11 Aug 2026", "Approved"),
    ("R-710", "Road Sub-base, Kerbs & Surfacing","Rev E", "01 Sept 2026", "Approved"),
    ("L-810", "Street Lighting Layout",         "Rev A", "30 Jul 2026", "Under review"),
    ("L-910", "Landscaping & Public Realm",     "Rev A", "22 Jul 2026", "Under review"),
]

SPECS = [
    ("02300", "Earthworks",          "Fill in 250 mm layers, min 95% MDD (AASHTO T-180)."),
    ("02320", "Trench Backfill",     "Bedding 150 mm sand; surround 300 mm above crown; 95% MDD."),
    ("02510", "Water Networks",      "HDPE PE100 PN16. Pressure test 1.5× working, hold 2 h."),
    ("02630", "Stormwater Drainage", "uPVC SN8. Max deflection 5%. CCTV survey before handover."),
    ("02740", "Asphalt Surfacing",   "Binder 60 mm, wearing 40 mm. Compaction 96–100% Marshall."),
    ("02750", "Road Sub-base",       "Type 1 crushed, 300 mm compacted, CBR ≥ 80%, 95% MDD."),
    ("16050", "Electrical Ductbank", "Concrete surround C25/30, 75 mm cover, red oxide dye."),
    ("16400", "Street Lighting",     "10 m columns @ 32 m spacing, 8 m³ base, 30 lux average."),
]

TESTS = [
    ("FDT-118", "Field density",      "Ch 0+200–0+260 sub-base", "08 Sept", "Pass", "96.4% MDD", "≥95%"),
    ("FDT-119", "Field density",      "Ch 0+260–0+320 sub-base", "09 Sept", "Pass", "95.8% MDD", "≥95%"),
    ("FDT-120", "Field density",      "Ch 0+320–0+380 sub-base", "09 Sept", "FAIL", "93.1% MDD", "≥95%"),
    ("CUB-064", "Concrete cube 28-d", "Ductbank surround 0+200", "05 Sept", "Pass", "32.4 MPa", "C25/30"),
    ("CUB-067", "Concrete cube 7-d",  "Substation plinth",       "08 Sept", "Pass", "24.1 MPa", "≥20 MPa"),
    ("PRS-022", "Pressure test",      "Water main 0+000–0+300",  "07 Sept", "Pass", "24 bar / 2 h", "1.5× working"),
]

RFIS = [
    ("RFI-014", "Ductbank crossing over storm line at ch 0+320", "Open",     "due 12 Sept",
     "Holding pour at ch 0+300–0+340."),
    ("RFI-016", "Kerb radius at the roundabout approach",        "Open",     "due 15 Sept",
     "Awaiting consultant."),
    ("RFI-017", "Substation earthing grid conductor size",       "Answered", "due 16 Sept",
     "Use 95 mm² bare copper; E-540 Rev B applies."),
    ("RFI-018", "Unrecorded 160 mm service at ch 0+610",         "Open",     "due 18 Sept",
     "Awaiting utility trace. Hand-dig only."),
]

DELAYS = [
    ("[light] Street Lighting",   "Critical", "+20 d", "No PO raised — 35 d lead time vs 18 d to need-by."),
    ("[duct] Ductbank & S/S",     "Critical", "+10 d", "PO-4471 stuck in approval 6 d against a 3 d SLA."),
    ("[sub]  Sub-base & Kerbs",   "At risk",  "+5 d",  "PO-4468 vendor promised after the need-by date."),
    ("[water] Sewerage & Water",  "Watch",    "—",     "PO-4470 lands 1 d before need-by. No float."),
    ("[asph] Asphalt & Surfacing","Watch",    "—",     "PO-4482 still draft; mix design MS-063 rejected."),
]

QUANTITIES = [
    ("Bulk excavation",        "48,500", "m³",  "92%"),
    ("Sub-base Type 1",        "3,800",  "t",   "18%"),
    ("uPVC DN400 storm pipe",  "900",    "m",   "41%"),
    ("HDPE DN250 water main",  "1,400",  "m",   "12%"),
    ("11kV XLPE cable",        "1,200",  "m",   "0%"),
    ("Fibre subduct 4-way",    "2,200",  "m",   "0%"),
    ("Asphalt binder+wearing", "2,600",  "t",   "0%"),
    ("LED columns 10 m",       "64",     "no.", "0%"),
]

LOGISTICS = [
    ("Delivery gate", "Gate 2 (Al Khumrah Road) — deliveries 06:00–16:00"),
    ("Working hours", "Sat–Thu 06:00–18:00. Fri closed. Night works need 48 h notice."),
    ("Laydown",       "Laydown B, east of the substation plot"),
    ("Haul route",    "Internal haul road via chainage 0+450"),
    ("Concrete",      "On-site batching plant — 40 m³/h, 90 min max haul to pour"),
    ("Visitors",      "Park at Gate 1, sign in at the security cabin"),
]


HOLD_POINTS = [
    ("Before a concrete pour",
     "Rebar & blinding inspected · formwork checked · no open RFI on the section · "
     "excavation permit valid · mix to spec 16050 (C25/30, 75 mm cover, red oxide dye)"),
    ("Before backfilling a trench",
     "Passing density test on the section · pipe deflection <5% · bedding 150 mm sand · "
     "surround 300 mm above crown · consultant signed the inspection request"),
    ("Before laying sub-base",
     "Formation level checked against C-210 Rev C · formation proof-rolled · "
     "no soft spots · CBR \u2265 80% on the imported material"),
    ("Before surfacing",
     "Sub-base at \u226595% MDD · levels & falls checked · kerbs set and cured · "
     "mix design approved (MS-063 currently REJECTED \u2014 resubmit first)"),
    ("Before energising / HV tie-in",
     "HV isolation permit issued (NOT YET APPLIED) · earthing grid to E-540 Rev B, 95 mm\u00b2 "
     "bare copper · cable tests witnessed · SEC attendance booked"),
    ("Before any excavation",
     "Permit to dig valid · services traced & marked · cable-avoidance tool on site · "
     "hand-dig within 500 mm of a known service"),
]

TOLERANCES = [
    ("Compaction \u2014 fill",      "\u226595% MDD (AASHTO T-180)", "250 mm max layers"),
    ("Compaction \u2014 sub-base",  "\u226595% MDD, CBR \u226580%",     "300 mm compacted"),
    ("Asphalt compaction",      "96\u2013100% Marshall",         "binder 60 mm / wearing 40 mm"),
    ("Pipe deflection (uPVC)",  "5% maximum",                "SN8, CCTV before handover"),
    ("Concrete cover to duct",  "75 mm",                     "C25/30, red oxide dye"),
    ("Water main pressure",     "1.5\u00d7 working, hold 2 h",    "HDPE PE100 PN16"),
    ("Lighting spacing",        "32 m centres, 30 lux avg",  "10 m columns, 8 m\u00b3 base"),
]

BOARD = [
    ("[earth] Earthworks & Bulk Excavation",  "Sara Al-Otaibi", "12 Jan \u2192 28 Aug",  "92%", "Ch 0+000\u20130+800", "C-210 Rev C"),
    ("[drain] Stormwater & Drainage",         "Sara Al-Otaibi", "03 Aug \u2192 30 Sept", "41%", "Ch 0+000\u20130+620", "C-320 Rev F"),
    ("[water] Sewerage & Water Networks",     "Sara Al-Otaibi", "18 Aug \u2192 21 Oct",  "12%", "Ch 0+000\u20130+900", "C-410 Rev C"),
    ("[duct]  Electrical Ductbank & S/S",     "Rami Haddad",    "25 Aug \u2192 18 Nov",  "22%", "Ch 0+200\u20130+500", "E-510 Rev G"),
    ("[tele]  Telecoms & Fibre Ducts",        "Rami Haddad",    "14 Sept \u2192 12 Nov", "0%",  "Ch 0+050\u20130+700", "T-610 Rev B"),
    ("[sub]   Road Sub-base & Kerbs",         "Sara Al-Otaibi", "01 Sept \u2192 30 Oct", "18%", "Ch 0+200\u20130+800", "R-710 Rev E"),
    ("[asph]  Asphalt & Surfacing",           "Unassigned",     "20 Oct \u2192 22 Dec",  "0%",  "Ch 0+000\u20130+900", "R-710 Rev E"),
    ("[light] Street Lighting",               "Unassigned",     "05 Nov \u2192 20 Jan",  "0%",  "Ch 0+000\u20130+900", "L-810 Rev A"),
    ("[land]  Landscaping & Public Realm",    "Unassigned",     "01 Dec \u2192 20 Feb",  "0%",  "Public realm",    "L-910 Rev A"),
]

INSPECTION = [
    ("Raise the inspection request", "Mohammed Zahrani (QA/QC) \u2014 +966 50 774 2210"),
    ("Witness & approve",            "Elena Marquez (Resident Engineer) \u2014 +966 54 662 0091"),
    ("Notice for a witnessed test",  "24 hours"),
    ("Failed test",                  "Re-work, re-test, then re-submit. Do not cover up."),
    ("Raise an RFI",                 "Through the PM \u2014 typical response window 7\u201310 days"),
    ("Material submittal",           "Approved before delivery. MS-063 asphalt mix is REJECTED."),
]

AGENT_CMDS = [
    ("Ask anything",     "\u201cwhat\u2019s late\u201d · \u201cinvert level of MH-12\u201d · \u201cany failed tests\u201d · \u201cwhere is PO-4471\u201d"),
    ("Site walk",        "\u201cwhat am I looking at here\u201d · \u201ccan I pour here\u201d · \u201ccan I cover this up\u201d"),
    ("Read the board",   "\u201cshow me everything on the ductbank\u201d · \u201cwho owns the drainage\u201d · \u201cwhat files are on it\u201d"),
    ("Write the board",  "\u201cset the ductbank status to done\u201d · \u201cassign the ductbank to Rami\u201d · \u201cset progress to 45%\u201d"),
    ("Report progress",  "Just say what happened \u2014 \u201csub-base at ch 0+400 compacted and accepted\u201d. It logs and moves the status."),
    ("Send evidence",    "Send a photo or PDF. It attaches to the item\u2019s Files tab on Monday."),
    ("Voice notes",      "Record in English or Arabic. It transcribes, then acts on the transcript."),
]

ABBREV = [
    ("MDD",  "Maximum dry density"),      ("CBR",  "California bearing ratio"),
    ("FDT",  "Field density test"),       ("NCR",  "Non-conformance report"),
    ("RFI",  "Request for information"),  ("PTW",  "Permit to work"),
    ("IL",   "Invert level"),             ("FFL",  "Finished floor level"),
    ("TBM",  "Temporary benchmark"),      ("Ch",   "Chainage (metres along the route)"),
    ("SEC",  "Saudi Electricity Company"),("NWC",  "National Water Company"),
    ("PO",   "Purchase order"),           ("MS",   "Material submittal"),
]

# --------------------------------------------------------------- styles
ss = getSampleStyleSheet()
def S(name, **kw):
    base = dict(name=name, fontName="Helvetica", fontSize=8.2, leading=10.4,
                textColor=INK, alignment=TA_LEFT)
    base.update(kw)
    return ParagraphStyle(**base)

st_title   = S("t",  fontName="Helvetica-Bold", fontSize=17, leading=20, textColor=colors.white)
st_sub     = S("s",  fontSize=8.6, leading=11, textColor=colors.HexColor("#c3d4e8"))
st_h       = S("h",  fontName="Helvetica-Bold", fontSize=9.6, leading=12, textColor=colors.white)
st_cell    = S("c")
st_cell_b  = S("cb", fontName="Helvetica-Bold")
st_small   = S("sm", fontSize=7.4, leading=9.2, textColor=MUTED)
st_alert   = S("al", fontSize=8.4, leading=10.6, textColor=colors.white)
st_alert_b = S("alb", fontName="Helvetica-Bold", fontSize=9, leading=11.4, textColor=colors.white)

def P(t, s=st_cell): return Paragraph(str(t), s)

def block(title, table, accent=NAVY):
    """Section bar glued to its table so a header never orphans."""
    return KeepTogether([section(title, accent), table])

def section(title, accent=NAVY):
    """Coloured section bar."""
    t = Table([[P(title, st_h)]], colWidths=[178*mm])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0,0), (-1,-1), accent),
        ("LEFTPADDING", (0,0), (-1,-1), 6), ("RIGHTPADDING", (0,0), (-1,-1), 6),
        ("TOPPADDING", (0,0), (-1,-1), 3.5), ("BOTTOMPADDING", (0,0), (-1,-1), 3.5),
    ]))
    return t

def grid(rows, widths, header=None, zebra=True, styles=None):
    data = []
    if header:
        data.append([P(h, st_cell_b) for h in header])
    for r in rows:
        data.append([c if isinstance(c, Paragraph) else P(c) for c in r])
    t = Table(data, colWidths=widths, repeatRows=1 if header else 0)
    cmds = [
        ("VALIGN", (0,0), (-1,-1), "TOP"),
        ("LINEBELOW", (0,0), (-1,-1), 0.4, RULE),
        ("LEFTPADDING", (0,0), (-1,-1), 5), ("RIGHTPADDING", (0,0), (-1,-1), 5),
        ("TOPPADDING", (0,0), (-1,-1), 2.4), ("BOTTOMPADDING", (0,0), (-1,-1), 2.4),
    ]
    if header:
        cmds += [("BACKGROUND", (0,0), (-1,0), BAND),
                 ("LINEBELOW", (0,0), (-1,0), 0.7, MUTED)]
    if zebra:
        off = 1 if header else 0
        for i in range(off, len(data)):
            if (i - off) % 2 == 1:
                cmds.append(("BACKGROUND", (0,i), (-1,i), colors.HexColor("#fafbfd")))
    if styles:
        cmds += styles
    t.setStyle(TableStyle(cmds))
    return t

def alert(title, body, bg=RED):
    t = Table([[P(title, st_alert_b)], [P(body, st_alert)]], colWidths=[178*mm])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0,0), (-1,-1), bg),
        ("LEFTPADDING", (0,0), (-1,-1), 8), ("RIGHTPADDING", (0,0), (-1,-1), 8),
        ("TOPPADDING", (0,0), (0,0), 6), ("BOTTOMPADDING", (0,-1), (-1,-1), 6),
        ("BOTTOMPADDING", (0,0), (0,0), 1),
    ]))
    return t

def tag(text, col):
    return Paragraph(f'<font color="#{col.hexval()[2:]}"><b>{text}</b></font>', st_cell)

# --------------------------------------------------------------- page furniture
def decorate(canvas, doc):
    canvas.saveState()
    w, h = A4
    if doc.page == 1:
        canvas.setFillColor(NAVY)
        canvas.rect(0, h-38*mm, w, 38*mm, stroke=0, fill=1)
        canvas.setFillColor(colors.white)
        canvas.setFont("Helvetica-Bold", 18)
        canvas.drawString(16*mm, h-19*mm, "Site Walk Quick Reference")
        canvas.setFont("Helvetica", 9.4)
        canvas.setFillColor(colors.HexColor("#c3d4e8"))
        canvas.drawString(16*mm, h-25.5*mm, f"{META['name']}  ·  {META['code']}")
        canvas.setFont("Helvetica", 8)
        canvas.drawString(16*mm, h-31*mm,
                          "Carry this on site. Everything below is what you get asked to recall standing next to the work.")
        canvas.setFont("Helvetica-Bold", 8.4)
        canvas.setFillColor(colors.white)
        canvas.drawRightString(w-16*mm, h-19*mm, f"Data date {META['data_date']}")
    canvas.setFont("Helvetica", 7)
    canvas.setFillColor(MUTED)
    canvas.drawString(16*mm, 10*mm, f"{META['name']} · {META['code']}  —  site walk quick reference")
    canvas.drawRightString(w-16*mm, 10*mm, f"Data date {META['data_date']}   ·   page {doc.page}")
    canvas.setStrokeColor(RULE)
    canvas.line(16*mm, 13*mm, w-16*mm, 13*mm)
    canvas.restoreState()

def build():
    doc = BaseDocTemplate(OUT, pagesize=A4,
                          leftMargin=16*mm, rightMargin=16*mm,
                          topMargin=16*mm, bottomMargin=16*mm,
                          title="Site Walk Quick Reference",
                          author="Bohio Systems LTD",
                          subject=f"{META['name']} ({META['code']})")
    frame_first = Frame(16*mm, 16*mm, 178*mm, A4[1]-16*mm-42*mm, id="f1")
    frame_rest  = Frame(16*mm, 16*mm, 178*mm, A4[1]-32*mm, id="f2")
    doc.addPageTemplates([
        PageTemplate(id="first", frames=[frame_first], onPage=decorate),
        PageTemplate(id="rest",  frames=[frame_rest],  onPage=decorate),
    ])

    F = [NextPageTemplate("rest")]
    gap = lambda n=3.5: Spacer(1, n*mm)

    # ---------- 1. emergency, first thing you need ----------
    F.append(alert("EMERGENCY  \u00b7  " + HSE["emergency"],
                   f"{HSE['clinic']}  |  {HSE['assembly']}  |  Nearest hospital: {HSE['hospital']}"))
    F.append(gap())

    # ---------- 2. project at a glance ----------
    meta_rows = [
        [P("Client", st_cell_b), META["client"], P("Contractor", st_cell_b), META["contractor"]],
        [P("Consultant", st_cell_b), META["consultant"], P("Location", st_cell_b), META["location"]],
        [P("Contract", st_cell_b), f"{META['contract']} \u00b7 {META['form']}",
         P("Period", st_cell_b), f"{META['start']} \u2192 {META['finish']}"],
        [P("Progress", st_cell_b),
         P(f'<b><font color="#b26a00">{META["progress"]}</font></b>', st_cell),
         P("Data date", st_cell_b), META["data_date"]],
    ]
    F.append(block("Project at a glance",
                   grid(meta_rows, [22*mm, 67*mm, 22*mm, 67*mm], zebra=False)))
    F.append(gap())

    # ---------- 3. buried services ----------
    F.append(block("Buried services \u2014 check before you break ground",
                   grid([[P(sv, st_cell_b), loc, d, own, P(note, st_small)]
                         for sv, loc, d, own, note in UTILITIES],
                        [42*mm, 33*mm, 14*mm, 27*mm, 62*mm],
                        header=["Service", "Location", "Depth", "Owner", "Rule on site"]),
                   RED))
    F.append(gap())

    # ---------- 4. permits ----------
    prow = []
    for typ, ref, area, valid, status in PERMITS:
        col = GREEN if status == "Valid" else (RED if "Not yet" in status else AMBER)
        prow.append([P(typ, st_cell_b), ref, area, valid, tag(status, col)])
    F.append(block("Permits to work",
                   grid(prow, [34*mm, 22*mm, 55*mm, 30*mm, 37*mm],
                        header=["Permit", "Ref", "Area", "Valid to", "Status"])))
    F.append(gap())

    # ---------- 5. contacts ----------
    F.append(block("Who to call",
                   grid([[P(n, st_cell_b), r, c, P(f"<b>{ph}</b>", st_cell)]
                         for n, r, c, ph in CONTACTS],
                        [42*mm, 44*mm, 44*mm, 48*mm],
                        header=["Name", "Role", "Company", "Phone"])))
    F.append(gap())

    # ---------- 6. levels ----------
    F.append(block("Levels & setting out",
                   grid([[P(l, st_cell_b), t, P(f"<b>{v}</b>", st_cell), P(n, st_small)]
                         for l, t, v, n in LEVELS],
                        [30*mm, 34*mm, 28*mm, 86*mm],
                        header=["Location", "Type", "Level", "Note"])))
    F.append(P("All levels to project datum, tied to the site TBM at Gate 2 (+13.412 m).", st_small))
    F.append(gap())

    # ---------- 7. drawings ----------
    drow = []
    for no, title, rev, date, status in DRAWINGS:
        col = GREEN if status == "Approved" else (BLUE if "construction" in status else AMBER)
        drow.append([P(no, st_cell_b), title, P(f"<b>{rev}</b>", st_cell), date, tag(status, col)])
    F.append(block("Drawing register \u2014 are you on the latest revision?",
                   grid(drow, [20*mm, 68*mm, 18*mm, 30*mm, 42*mm],
                        header=["No.", "Title", "Rev", "Issued", "Status"])))
    F.append(gap())

    # ---------- 8. specs ----------
    F.append(block("Spec thresholds you get asked for",
                   grid([[P(sc, st_cell_b), t, req] for sc, t, req in SPECS],
                        [18*mm, 40*mm, 120*mm],
                        header=["Sec.", "Subject", "Requirement"])))
    F.append(gap())

    # ---------- 9. open NCR ----------
    F.append(alert("OPEN NON-CONFORMANCE  \u00b7  FDT-120 failed",
                   "Ch 0+320\u20130+380 sub-base at 93.1% MDD against a \u226595% spec. "
                   "Re-work and re-test before anything is laid over it.", RED))
    F.append(gap())

    # ---------- 10. tests ----------
    trow = []
    for ref, typ, loc, date, res, val, spec in TESTS:
        col = RED if res == "FAIL" else GREEN
        trow.append([P(ref, st_cell_b), typ, loc, date, tag(res, col),
                     P(f"<b>{val}</b>", st_cell), spec])
    F.append(block("Test results",
                   grid(trow, [21*mm, 27*mm, 44*mm, 17*mm, 15*mm, 28*mm, 26*mm],
                        header=["Ref", "Type", "Location", "Date", "Result", "Value", "Spec"])))
    F.append(gap())

    # ---------- 11. RFIs ----------
    rrow = []
    for no, subj, status, due, note in RFIS:
        col = RED if status == "Open" else GREEN
        rrow.append([P(no, st_cell_b), subj, tag(status, col), due, P(note, st_small)])
    F.append(block("Open RFIs & holds",
                   grid(rrow, [21*mm, 62*mm, 20*mm, 22*mm, 53*mm],
                        header=["RFI", "Subject", "Status", "Due", "Effect on site"]), AMBER))
    F.append(gap())

    # ---------- 12. flagged delays ----------
    drow2 = []
    for item, lvl, slip, why in DELAYS:
        col = RED if lvl == "Critical" else (colors.HexColor("#d2571f") if lvl == "At risk" else AMBER)
        drow2.append([P(item, st_cell_b), tag(lvl, col), P(f"<b>{slip}</b>", st_cell), P(why, st_small)])
    F.append(block("Flagged delays \u2014 from the purchasing system",
                   grid(drow2, [48*mm, 22*mm, 16*mm, 92*mm],
                        header=["Item", "Risk", "Slip", "Why"]), RED))
    F.append(gap())

    # ---------- 13. quantities ----------
    F.append(block("Quantities & progress",
                   grid([[P(i, st_cell_b), q, u, P(f"<b>{d}</b>", st_cell)]
                         for i, q, u, d in QUANTITIES],
                        [62*mm, 30*mm, 22*mm, 64*mm],
                        header=["Item", "Contract qty", "Unit", "Installed"])))
    F.append(gap())

    # ---------- 14. hold points — the "can I proceed?" checks ----------
    F.append(block("Hold points — check these before you proceed",
                   grid([[P(k, st_cell_b), v] for k, v in HOLD_POINTS],
                        [42*mm, 136*mm]), AMBER))
    F.append(gap())

    # ---------- 15. tolerances ----------
    F.append(block("Tolerances & thresholds",
                   grid([[P(a, st_cell_b), P(f"<b>{b}</b>", st_cell), c] for a, b, c in TOLERANCES],
                        [50*mm, 56*mm, 72*mm],
                        header=["Item", "Tolerance", "Note"])))
    F.append(gap())

    # ---------- 16. inspection routine ----------
    F.append(block("Inspection & sign-off",
                   grid([[P(k, st_cell_b), v] for k, v in INSPECTION],
                        [58*mm, 120*mm], zebra=False)))
    F.append(gap())

    # ---------- 17. board snapshot ----------
    F.append(block("Schedule board — items, owners & locations",
                   grid([[P(i, st_cell_b), o, tl, P(f"<b>{pr}</b>", st_cell), ch, dw]
                         for i, o, tl, pr, ch, dw in BOARD],
                        [48*mm, 26*mm, 27*mm, 13*mm, 30*mm, 34*mm],
                        header=["Item", "Owner", "Timeline", "Prog.", "Location", "Drawing"])))
    F.append(gap())

    # ---------- 18. logistics + HSE ----------
    site_rows = [[P(k, st_cell_b), v] for k, v in LOGISTICS] + [
        [P("PPE", st_cell_b), HSE["ppe"]],
        [P("Permit needed for", st_cell_b), HSE["permits"]],
        [P("Toolbox talk", st_cell_b), HSE["toolbox"]],
        [P("Last incident", st_cell_b), HSE["incident"]],
    ]
    F.append(block("Access, hours & logistics",
                   grid(site_rows, [32*mm, 146*mm], zebra=False)))
    F.append(gap())

    # ---------- 19. asking the agent from site ----------
    F.append(block("Ask the site agent on WhatsApp",
                   grid([[P(k, st_cell_b), v] for k, v in AGENT_CMDS],
                        [32*mm, 146*mm], zebra=False), GREEN))
    F.append(gap())

    # ---------- 20. abbreviations ----------
    ab = [[P(a, st_cell_b), b, P(c, st_cell_b), d]
          for (a, b), (c, d) in zip(ABBREV[0::2], ABBREV[1::2])]
    F.append(block("Abbreviations",
                   grid(ab, [16*mm, 73*mm, 16*mm, 73*mm], zebra=False)))

    doc.build(F)
    print("wrote", OUT)


if __name__ == "__main__":
    build()
