"""A synthetic past report of Adel Real Estate (August 2026), the kind the team writes by hand: used to teach the app the house style."""
import sys
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas
from reportlab.lib.colors import HexColor
from reportlab.lib.utils import ImageReader

out, logo = sys.argv[1], sys.argv[2]
CH, GOLD, INK = HexColor('#3d3935'), HexColor('#caa862'), HexColor('#2b2825')
W, H = A4
c = canvas.Canvas(out, pagesize=A4)
c.setTitle('Monthly Project Report – Al Nakheel Gate – August 2026'); c.setAuthor('Adel Real Estate – Investment Management')

def band(page):
    c.setFillColor(CH); c.rect(0, H - 70, W, 70, fill=1, stroke=0)
    c.drawImage(ImageReader(logo), 36, H - 58, width=150, height=150 * 305 / 1226, mask='auto')
    c.setFillColor(GOLD); c.rect(0, H - 73, W, 3, fill=1, stroke=0)
    c.setFillColor(HexColor('#8a8580')); c.setFont('Helvetica', 8)
    c.drawString(36, 28, 'Adel Real Estate – Investment Management · Confidential'); c.drawRightString(W - 36, 28, f'Page {page}')

y = 0
def para(text, size=10, lead=14, color=INK, font='Helvetica', width=95):
    global y
    c.setFont(font, size); c.setFillColor(color)
    words, line = text.split(), ''
    for w in words:
        if len(line) + len(w) + 1 > width:
            c.drawString(46, y, line); y -= lead; line = w
        else:
            line = (line + ' ' + w).strip()
    if line: c.drawString(46, y, line); y -= lead
    y -= 6

def head(t):
    global y
    y -= 8; c.setFillColor(GOLD); c.rect(36, y - 2, 4, 14, fill=1, stroke=0)
    c.setFillColor(CH); c.setFont('Helvetica-Bold', 13); c.drawString(46, y, t); y -= 22

page = 1; band(page); y = H - 110
c.setFillColor(GOLD); c.setFont('Helvetica-Bold', 9); c.drawString(46, y, 'MONTHLY PROJECT REPORT'); y -= 26
c.setFillColor(CH); c.setFont('Helvetica-Bold', 20); c.drawString(46, y, 'Monthly Project Report – Al Nakheel Gate – August 2026'); y -= 18
c.setFont('Helvetica', 10); c.setFillColor(HexColor('#6b655e')); c.drawString(46, y, 'Prepared for the Investment Committee by the Investment Management team · 3 September 2026'); y -= 30

head('1. Executive Summary')
para('The project remains on programme for completion in mid 2029. The Equity IRR of the base case stands at 14.1%, above the 12% hurdle '
     'set by the Investment Committee, and the Development profit is SAR 652 million. Sales of the first residential phase continue ahead of plan.')
para('The main watch point is the Murabaha facility: the debt service cover sits on its 1.25x covenant in the first operating year.')
head('2. Project Returns')
para('Key figures: Equity IRR 14.1%, Project IRR 11.8%, Return on cost 47.4%, Development profit SAR 651.7 million, money multiple 1.57x.')
para('Returns are measured on the approved base case. The Equity IRR is the return on the equity invested by the partners after the Murabaha facility.')
head('3. Financing and Covenants')
para('Peak facility SAR 985 million in month 30, repaid by month 72. Lowest DSCR 1.25x against a covenant of 1.25x; loan to value 53.1% '
     'against a maximum of 60%. The bank has been informed of the tight debt service cover in 2032.')
head('4. Sensitivity and Risk')
para('Construction cost and the apartment price drive the Equity IRR most. A 10% rise in construction cost takes the Equity IRR to 10.7% and '
     'breaches the DSCR covenant; a 9.3% fall in the apartment price takes it to the 12% hurdle.')

c.showPage(); page = 2; band(page); y = H - 110
head('5. Scenario Analysis')
para('Upside, base and downside cases are kept in the model. The downside case gives an Equity IRR of 2.8% and a lowest DSCR of 1.14x.')
head('6. Development Budget and Cash Flow')
para('Total project cost SAR 2,110 million, of which land SAR 650 million and construction SAR 1,153 million. Spend to date is in line with the budget.')
head('7. Next Steps')
para('Tender the main contract package in Q4 2026; agree a covenant holiday for the first operating year with the bank; update the sales plan for phase two.')
c.showPage(); c.save()
