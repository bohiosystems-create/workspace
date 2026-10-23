"""A synthetic US single-asset syndication for the agreement test (t_lpa_us): a Word limited partnership agreement written the way such
agreements are (Word's own automatic clause numbering, a waterfall in lettered tiers with IRR hurdles measured on different parties, fees on
gross collections, a capital exhibit as a table) and the deal model it should drive. Nothing from a client. Planted, on purpose:
  match     tier (C) 10% IRR hurdle pro rata; tier (D) split 80/20; acquisition fees; property management 2.25% within the 2.5% cap;
            the percentage interests 0.5 / 89.5 / 10
  differ    tier (D) hurdle 17% on the Investor Partner (model 15%); tier (E) split 60/40 (model 70/30); asset management fee 1% of gross
            collections (model 1.5%)
  absent    tiers (A) and (B) on additional capital (not in the model); a due diligence fee
  itself    Exhibit A's contributions add up to 9,050,000, not the 10,000,000 total it states, and the Investor Partner's 8,000,000 is 80%,
            not the 89.50% beside it; the number of units is left blank (a draft)
The model is annual (2026-2033) with a refinancing in 2029 and a sale in 2033; its waterfall pays the tiers from hurdle balances
compounded each year. Saved through LibreOffice so every formula carries its result.
Run: python3 gen_lpa_us.py <out_dir_docs> <out_dir_models>"""
import sys, os, shutil, subprocess, tempfile, zipfile
from xml.sax.saxutils import escape
from openpyxl import Workbook
from openpyxl.utils import get_column_letter as L

DOCS, MODELS = sys.argv[1], sys.argv[2]

# ---- the agreement: (level, text); level None = an unnumbered paragraph; 'table' = Exhibit A ----
P = [
 (None, 'LIMITED PARTNERSHIP AGREEMENT OF'), (None, 'RIVERBEND APARTMENTS, LP'), (None, 'a Texas limited partnership'),
 (None, '(synthetic fixture for testing; not a real agreement)'),
 (None, 'A. The General Partner has caused a Certificate of Formation for the Partnership to be filed in order to form a limited partnership for the purpose of acquiring, holding and operating a ___-unit apartment community known as Riverbend (the “Property”).'),
 (None, 'NOW, THEREFORE, in consideration of the mutual covenants hereinafter set forth, the parties agree as follows:'),
 (0, 'DEFINITIONS. The following words and phrases used in this Agreement shall have the meanings set forth below:'),
 (1, 'CAPITAL CONTRIBUTION. The total amount of cash contributed to the Partnership by a Partner.'),
 (1, 'INVESTOR PARTNER. Riverbend Investor Fund, LLC, a Texas limited liability company, and its permitted successors.'),
 (1, 'IRR. Internal Rate of Return on a Partner’s Capital Contribution from the date such Capital Contribution is made, compounded annually. Such IRR shall include any distributions paid to the Partner pursuant to Sections 7.1.1 (A), (C) and (D).'),
 (1, 'PERCENTAGE INTEREST. For each Partner, the percentage set forth opposite its name on Exhibit A.'),
 (1, 'SPONSOR. Riverbend Sponsor Co-Invest, LLC, a Texas limited liability company (the “Sponsor”).'),
 (0, 'FORMATION AND PURPOSE.'),
 (1, 'NAME. The name of the Partnership is Riverbend Apartments, LP.'),
 (1, 'PURPOSE. The purpose of the Partnership is to acquire, own, operate, refinance and sell the Property.'),
 (0, 'CAPITAL.'),
 (1, 'INITIAL CAPITAL CONTRIBUTIONS. Each Partner shall make an Initial Capital Contribution equal to its Percentage Interest of the Initial Capital of Ten Million Dollars ($10,000,000), as set forth in Exhibit A attached hereto.'),
 (1, 'ADDITIONAL CONTRIBUTIONS. No Partner shall be required to make any Additional Capital Contribution. Additional Capital Contributions approved by the General Partner and the Investor Partner shall be distributed as described in Section 7.1.1(A) and (B).'),
 (0, 'MANAGEMENT.'),
 (1, 'GENERAL PARTNER. The business of the Partnership shall be managed by Riverbend GP, LLC, the General Partner.'),
 (0, 'LIABILITY.'),
 (1, 'LIMITED LIABILITY. No Limited Partner shall be liable for the debts of the Partnership beyond its Capital Contribution.'),
 (0, 'FEES AND COMPENSATION.'),
 (1, 'FEES UPON ACQUISITION.'),
 (2, 'Acquisition Fees. At the closing of the acquisition of the Property, the Sponsor will receive from the Partnership an acquisition fee in the amount of Two Hundred Sixteen Thousand Seven Hundred Dollars ($216,700), and the Investor Partner’s manager will receive an acquisition fee in the amount of Three Hundred Thousand Dollars ($300,000.00) and a due diligence fee in the amount of Fifty Thousand Dollars ($50,000).'),
 (1, 'MANAGEMENT FEES.'),
 (2, 'Property Management Agreement. The Partnership may contract with an Affiliate of the General Partner to manage the Property, and shall pay property management fees not to exceed two and a quarter percent (2.25%) of the gross collections of rent.'),
 (2, 'Asset Management Fee. The General Partner, or its Affiliate, shall be entitled to an asset management fee equal to one percent (1.0%) of the gross collections of rent payable monthly.'),
 (0, 'DISTRIBUTIONS.'),
 (1, 'ALLOCATION OF DISTRIBUTABLE CASH. The Distributable Cash of the Partnership shall be distributed annually, within thirty days after the end of each calendar year, and within ten (10) days after the closing of a Capital Transaction.'),
 (2, 'Distributions Prior to Termination. The Distributable Cash of the Partnership prior to its termination shall be distributed as follows:'),
 (3, 'First, to all Partners who have made Additional Capital Contributions, pro rata, until the cumulative cash distributions to such Partners equals an IRR approved by the General Partner and the Investor Partner (not to exceed twenty-five percent (25%) per annum) on the Additional Capital Contributions;'),
 (3, 'Second, to all Partners who have made Additional Capital Contributions, pro rata, until each such Partner has been paid in full an amount equal to its Additional Capital Contributions;'),
 (3, 'Third, to the Partners, pro rata, based upon their respective Percentage Interests, until the cumulative cash distributions to the Partners equals an IRR of ten percent (10%) per annum through the date of such distribution;'),
 (3, 'Fourth, pari passu: (a) eighty percent (80%) to the Partners pro rata, based upon their respective Percentage Interests; and (b) twenty percent (20%) to the Sponsor, until the cumulative cash distributions to the Investor Partner equals an IRR of seventeen percent (17%) per annum through the date of such distribution; and'),
 (3, 'Thereafter, pari passu: (a) sixty percent (60%) to the Partners pro rata, based upon their respective Percentage Interests; and (b) forty percent (40%) to the Sponsor.'),
 (2, 'Distributions upon Termination. All distributions following the dissolution of the Partnership shall be made to the Partners in proportion to their positive Capital Account balances.'),
 (0, 'GENERAL PROVISIONS.'),
 (1, 'GOVERNING LAW. This Agreement shall be governed by the laws of the State of Texas.'),
 (None, 'EXHIBIT A'), (None, 'INITIAL CAPITAL CONTRIBUTIONS AND PERCENTAGE INTERESTS'),
 ('table', [['Name', 'Capital Contribution', 'Percentage Interest'], ['GENERAL PARTNER: Riverbend GP, LLC', '$50,000', '0.50%'],
            ['INVESTOR PARTNER: Riverbend Investor Fund, LLC', '$8,000,000', '89.50%'], ['SPONSOR: Riverbend Sponsor Co-Invest, LLC', '$1,000,000', '10.00%'],
            ['Total', '$10,000,000', '100%']]),
]
W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"'
def para(lv, t):
    num = '' if lv is None else f'<w:pPr><w:numPr><w:ilvl w:val="{lv}"/><w:numId w:val="1"/></w:numPr></w:pPr>'
    # a run split in two, as Word does, so the reader has to join runs
    h = len(t) // 2
    return f'<w:p>{num}<w:r><w:t xml:space="preserve">{escape(t[:h])}</w:t></w:r><w:r><w:t xml:space="preserve">{escape(t[h:])}</w:t></w:r></w:p>'
def table(rows):
    return '<w:tbl>' + ''.join('<w:tr>' + ''.join(f'<w:tc><w:p><w:r><w:t>{escape(c)}</w:t></w:r></w:p></w:tc>' for c in r) + '</w:tr>' for r in rows) + '</w:tbl>'
body = ''.join(table(t) if lv == 'table' else para(lv, t) for lv, t in P)
document = f'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document {W}><w:body>{body}<w:sectPr/></w:body></w:document>'
lv = [('decimal', '%1.'), ('decimal', '%1.%2'), ('decimal', '%1.%2.%3'), ('upperLetter', '(%4)')]
numbering = (f'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:numbering {W}><w:abstractNum w:abstractNumId="0">'
             + ''.join(f'<w:lvl w:ilvl="{i}"><w:start w:val="1"/><w:numFmt w:val="{f}"/><w:lvlText w:val="{t}"/></w:lvl>' for i, (f, t) in enumerate(lv))
             + '</w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num></w:numbering>')
ct = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>'
      '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>'
      '<Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/></Types>')
rels = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>')
drels = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
         '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/></Relationships>')
os.makedirs(DOCS, exist_ok=True)
with zipfile.ZipFile(os.path.join(DOCS, 'lpa_riverbend.docx'), 'w', zipfile.ZIP_DEFLATED) as z:
    z.writestr('[Content_Types].xml', ct); z.writestr('_rels/.rels', rels); z.writestr('word/document.xml', document)
    z.writestr('word/_rels/document.xml.rels', drels); z.writestr('word/numbering.xml', numbering)

# ---- the deal model ----
wb = Workbook()
i = wb.active; i.title = 'Inputs'
i['A1'] = 'RIVERBEND APARTMENTS (USD)'
rows = [('Purchase price', 30000000), ('Senior loan', 21000000), ('Initial capital (equity)', 10000000), ('Sponsor acquisition fee', 216700),
        ('Investor manager acquisition fee', 300000), ('Gross collections year 1', 3200000), ('Rent growth', 0.05), ('Operating expenses (share of collections)', 0.38),
        ('Property management fee (share of collections)', 0.0225), ('Asset management fee (share of collections)', 0.015), ('Interest rate', 0.055),
        ('Refinancing loan', 36000000), ('Refinancing year', 3), ('Exit cap rate', 0.0525), ('Selling costs', 0.02), ('Exit year', 7),
        ('GP percentage interest', 0.005), ('Investor percentage interest', 0.895), ('Sponsor percentage interest', 0.10),
        ('Hurdle 1 IRR (all partners)', 0.10), ('Hurdle 2 IRR (Investor Partner)', 0.15), ('Tier 2 split to partners', 0.80), ('Tier 2 promote to Sponsor', 0.20),
        ('Tier 3 split to partners', 0.70), ('Tier 3 promote to Sponsor', 0.30)]
for r, (k, v) in enumerate(rows, start=3):
    i.cell(r, 1, k); i.cell(r, 2, v)
    if isinstance(v, float) and v < 1: i.cell(r, 2).number_format = '0.00%'
I = {k: f'Inputs!$B${r}' for r, (k, v) in enumerate(rows, start=3)}
r0 = 3 + len(rows) + 1
i.cell(r0, 1, 'Working capital reserve'); i.cell(r0, 2, f'={I["Senior loan"]}+{I["Initial capital (equity)"]}-{I["Purchase price"]}-{I["Sponsor acquisition fee"]}-{I["Investor manager acquisition fee"]}')
RES = f'Inputs!$B${r0}'

N = 8
c = wb.create_sheet('Cash Flow'); c['A1'] = 'CASH FLOW (USD)'; c['A3'] = 'Year'; c['A4'] = 'Period'
lab = {6: 'Gross collections', 7: 'Operating expenses', 8: 'Property management fee', 9: 'Asset management fee', 10: 'Net operating income',
       11: 'Interest', 12: 'Refinancing proceeds', 13: 'Sale proceeds (net of debt)', 14: 'Distributable cash', 15: 'Equity contributions'}
for r, t in lab.items(): c.cell(r, 1, t)
for k in range(N):
    col = L(3 + k); p = L(2 + k)
    c[f'{col}3'] = 2026 + k; c[f'{col}4'] = 0 if k == 0 else f'={p}4+1'
    c[f'{col}6'] = f'=IF({col}$4>=1,{I["Gross collections year 1"]}*(1+{I["Rent growth"]})^({col}$4-1),0)'
    c[f'{col}7'] = f'=-{col}6*{I["Operating expenses (share of collections)"]}'
    c[f'{col}8'] = f'=-{col}6*{I["Property management fee (share of collections)"]}'
    c[f'{col}9'] = f'=-{col}6*{I["Asset management fee (share of collections)"]}'
    c[f'{col}10'] = f'=SUM({col}6:{col}9)'
    c[f'{col}11'] = f'=IF({col}$4>=1,-IF({col}$4>{I["Refinancing year"]},{I["Refinancing loan"]},{I["Senior loan"]})*{I["Interest rate"]},0)'
    c[f'{col}12'] = f'=IF({col}$4={I["Refinancing year"]},{I["Refinancing loan"]}-{I["Senior loan"]},0)'
    c[f'{col}13'] = f'=IF({col}$4={I["Exit year"]},{col}10*(1+{I["Rent growth"]})/{I["Exit cap rate"]}*(1-{I["Selling costs"]})-{I["Refinancing loan"]}+{RES},0)'
    c[f'{col}14'] = f'=IF({col}$4>=1,MAX(0,{col}10+{col}11+{col}12+{col}13),0)'
    c[f'{col}15'] = f'=IF({col}$4=0,{I["Initial capital (equity)"]},0)'

w = wb.create_sheet('Waterfall'); w['A1'] = 'DISTRIBUTION WATERFALL (USD)'; w['A3'] = 'Year'; w['A4'] = 'Period'
labw = {6: 'Contributions', 7: 'Distributable cash', 9: 'Hurdle 1 balance before distribution', 10: 'Tier 1 distribution (to 10% IRR)',
        11: 'Hurdle 1 balance after distribution', 13: 'Hurdle 2 Investor balance before distribution', 14: 'Tier 2 distribution (to Investor 17% IRR)',
        15: 'Hurdle 2 Investor balance after distribution', 17: 'Tier 3 distribution (thereafter)', 19: 'Promote to Sponsor',
        20: 'Distributed to partners pro rata', 21: 'Investor net cash flow', 22: 'Sponsor net cash flow', 23: 'GP net cash flow'}
for r, t in labw.items(): w.cell(r, 1, t)
H1, H2 = I['Hurdle 1 IRR (all partners)'], I['Hurdle 2 IRR (Investor Partner)']
LP2, GP2, LP3, GP3 = I['Tier 2 split to partners'], I['Tier 2 promote to Sponsor'], I['Tier 3 split to partners'], I['Tier 3 promote to Sponsor']
SI, SS, SG = I['Investor percentage interest'], I['Sponsor percentage interest'], I['GP percentage interest']
for k in range(N):
    col = L(3 + k); p = L(2 + k)
    w[f'{col}3'] = f"='Cash Flow'!{col}3"; w[f'{col}4'] = f"='Cash Flow'!{col}4"
    w[f'{col}6'] = f"='Cash Flow'!{col}15"; w[f'{col}7'] = f"='Cash Flow'!{col}14"
    w[f'{col}9'] = f'={col}6' if k == 0 else f'={p}11*(1+{H1})+{col}6'
    w[f'{col}10'] = f'=MIN({col}7,MAX(0,{col}9))'
    w[f'{col}11'] = f'={col}9-{col}10-{col}14'
    w[f'{col}13'] = f'={col}6*{SI}' if k == 0 else f'={p}15*(1+{H2})+{col}6*{SI}'
    w[f'{col}14'] = f'=MIN({col}7-{col}10,MAX(0,{col}13-{col}10*{SI})/({LP2}*{SI}))'
    w[f'{col}15'] = f'={col}13-{col}10*{SI}-{col}14*{LP2}*{SI}'
    w[f'{col}17'] = f'={col}7-{col}10-{col}14'
    w[f'{col}19'] = f'={col}14*{GP2}+{col}17*{GP3}'
    w[f'{col}20'] = f'={col}10+{col}14*{LP2}+{col}17*{LP3}'
    w[f'{col}21'] = f'=-{col}6*{SI}+{col}20*{SI}'
    w[f'{col}22'] = f'=-{col}6*{SS}+{col}20*{SS}+{col}19'
    w[f'{col}23'] = f'=-{col}6*{SG}+{col}20*{SG}'
last = L(2 + N)
s = wb.create_sheet('Returns'); s['A1'] = 'RETURNS'
for r, (k, f) in enumerate([('Levered IRR', f"=IRR(Waterfall!C25:{last}25)"), ('LP IRR', f'=IRR(Waterfall!C21:{last}21)'), ('Sponsor IRR', f'=IRR(Waterfall!C22:{last}22)'),
                            ('Carried interest (promote) total', f'=SUM(Waterfall!C19:{last}19)'), ('Equity multiple', f'=SUM(Waterfall!C7:{last}7)/SUM(Waterfall!C6:{last}6)')], start=3):
    s.cell(r, 1, k); s.cell(r, 2, f)
for r in (3, 4, 5): s.cell(r, 2).number_format = '0.00%'
w['A25'] = 'Equity net cash flow'
for k in range(N):
    col = L(3 + k); w[f'{col}25'] = f'={col}7-{col}6'

tmp = tempfile.mkdtemp(); src = os.path.join(tmp, 'lpa_us_model.xlsx'); wb.save(src)
out = os.path.join(tmp, 'o'); os.makedirs(out)
subprocess.run(['soffice', '--headless', '--calc', '--convert-to', 'xlsx:Calc MS Excel 2007 XML', '--outdir', out, src], check=True, capture_output=True, timeout=600)
os.makedirs(MODELS, exist_ok=True); shutil.copy(os.path.join(out, 'lpa_us_model.xlsx'), os.path.join(MODELS, 'lpa_us_model.xlsx')); shutil.rmtree(tmp, ignore_errors=True)
print('written lpa_riverbend.docx and lpa_us_model.xlsx')
