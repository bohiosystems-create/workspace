"""A synthetic limited partnership agreement for the fund-agreement test (t_fundlpa), written for the Aurora fund fixture
(r39_fund_waterfall_eur.xlsx). Nothing from a client. Its terms partly match the model and partly differ, on purpose:
  match     management fee 1.5% of commitments in the investment period then 1.25% of invested capital; 8% preferred return compounding
            annually; 20% carried interest; a whole-fund (European) waterfall; distributions pro rata to commitments; fund expenses
            within the EUR 400,000 cap (the model carries 350,000)
  differ    GP commitment 1% (model 2%); investment period 5 years (model 4); GP catch-up 50% (model 100%)
  absent    clawback, key person, two one-year extensions of the term, recycling of early proceeds (none is in the model)
Eight pages, with a table of contents and a Definitions article, so the reader has to find the right articles. Run: python3 gen_lpa.py"""
import pymupdf, pathlib
OUT = pathlib.Path(__file__).resolve().parents[1] / "docs"
P = [
"AURORA REAL ESTATE FUND I, L.P.\n\nAMENDED AND RESTATED LIMITED PARTNERSHIP AGREEMENT\n\n(synthetic fixture for testing; not a real agreement)\n\n"
"Dated 12 January 2026\n\nBetween Aurora Capital Partners GP S.a.r.l. (the General Partner) and the Limited Partners admitted from time to time.\n\n"
"TABLE OF CONTENTS\n1. Definitions .......... page 2\n2. Capital Commitments and Contributions .......... page 3\n3. Management Fee and Fund Expenses .......... page 4\n"
"4. Distributions .......... page 5\n5. Carried Interest and Clawback .......... page 6\n6. Term, Investment Period and Key Person .......... page 7\n7. Miscellaneous .......... page 8\n",

"ARTICLE 1. DEFINITIONS\n\n"
"\"Commitment\" means, for each Partner, the amount it has agreed to contribute to the Partnership as set out in its subscription agreement. The aggregate Commitments are EUR 150,000,000.\n\n"
"\"Contributed Capital\" means the aggregate capital contributions actually made by a Partner.\n\n"
"\"Invested Capital\" means, at any time, the Contributed Capital used to acquire Portfolio Investments that have not been disposed of, net of returns of capital.\n\n"
"\"Investment Period\" means the period from the Initial Closing until the fifth (5th) anniversary of the Initial Closing.\n\n"
"\"Preferred Return\" means a return of eight per cent (8%) per annum, compounded annually, on the Contributed Capital of the Limited Partners from the date each contribution is made until returned.\n\n"
"\"Portfolio Investment\" means a real estate asset or interest acquired by the Partnership.\n",

"ARTICLE 2. CAPITAL COMMITMENTS AND CONTRIBUTIONS\n\n"
"2.1 Commitments. The aggregate Commitments of all Partners are EUR 150,000,000.\n\n"
"2.2 General Partner commitment. The General Partner shall commit an amount equal to one per cent (1%) of the aggregate Commitments, on the same terms as the Limited Partners.\n\n"
"2.3 Drawdowns. Capital shall be called as needed to fund Portfolio Investments, the Management Fee and Fund Expenses, on not less than ten business days' notice.\n\n"
"2.4 Recycling. Proceeds from Portfolio Investments disposed of within eighteen months of acquisition may be reinvested during the Investment Period, up to the amount of Contributed Capital so returned.\n",

"ARTICLE 3. MANAGEMENT FEE AND FUND EXPENSES\n\n"
"3.1 Management Fee. The Partnership shall pay the Manager an annual management fee equal to 1.5% of aggregate Commitments during the Investment Period and, thereafter, 1.25% of Invested Capital, payable quarterly in advance.\n\n"
"3.2 Fee offsets. Transaction, monitoring and directors' fees received by the Manager from Portfolio Investments shall reduce the Management Fee by one hundred per cent (100%) of such amounts.\n\n"
"3.3 Fund Expenses. The Partnership shall bear its operating expenses, provided that ordinary fund expenses shall not exceed EUR 400,000 in any year.\n\n"
"3.4 Organisational expenses. Organisational expenses are borne by the Partnership up to EUR 1,500,000.\n",

"ARTICLE 4. DISTRIBUTIONS\n\n"
"4.1 Whole-fund waterfall. Distributable proceeds from all Portfolio Investments shall be aggregated and apportioned among the Partners pro rata to their Commitments, and the Limited Partners' share shall be distributed in the following order of priority:\n\n"
"(a) first, one hundred per cent (100%) to the Limited Partners until they have received cumulative distributions equal to their Contributed Capital;\n\n"
"(b) second, one hundred per cent (100%) to the Limited Partners until they have received the Preferred Return;\n\n"
"(c) third, fifty per cent (50%) to the General Partner and fifty per cent (50%) to the Limited Partners until the General Partner has received twenty per cent (20%) of the cumulative amounts distributed under paragraph (b) and this paragraph (c);\n\n"
"(d) thereafter, eighty per cent (80%) to the Limited Partners and twenty per cent (20%) to the General Partner.\n\n"
"4.2 Timing. Distributions shall be made as soon as practicable after proceeds are received, and at least annually.\n",

"ARTICLE 5. CARRIED INTEREST AND CLAWBACK\n\n"
"5.1 Carried interest. Amounts distributed to the General Partner under Article 4.1(c) and (d) constitute the carried interest, equal to twenty per cent (20%) of profits after the Preferred Return.\n\n"
"5.2 Clawback. On the dissolution of the Partnership, if the General Partner has received carried interest in excess of the amount to which it would be entitled had all distributions been made at that time, it shall return the excess, net of taxes paid, to the Partnership for distribution to the Limited Partners.\n\n"
"5.3 Escrow. Twenty per cent (20%) of each carried interest distribution shall be held in escrow until the Preferred Return has been paid in full.\n",

"ARTICLE 6. TERM, INVESTMENT PERIOD AND KEY PERSON\n\n"
"6.1 Term. The Partnership shall terminate on the tenth (10th) anniversary of the Initial Closing, subject to two (2) successive one-year extensions at the discretion of the General Partner with the consent of the Advisory Committee.\n\n"
"6.2 Investment Period. No new Portfolio Investment shall be made after the end of the Investment Period, being the fifth anniversary of the Initial Closing, except follow-on investments up to 10% of Commitments.\n\n"
"6.3 Key person. If fewer than two of the Key Persons devote substantially all of their business time to the Partnership, the Investment Period shall be suspended until a replacement is approved by Limited Partners holding a majority of Commitments.\n",

"ARTICLE 7. MISCELLANEOUS\n\n7.1 Currency. All amounts are denominated and paid in euro.\n\n7.2 Reports. The General Partner shall deliver audited financial statements within 120 days of each year end and quarterly reports within 60 days of each quarter end.\n\n"
"7.3 Governing law. This Agreement is governed by the laws of the Grand Duchy of Luxembourg.\n\nExecuted on 12 January 2026.\n",
]
def pdf(name, pages):
    d = pymupdf.open()
    for t in pages:
        pg = d.new_page(width=595, height=842)
        pg.insert_textbox(pymupdf.Rect(56, 56, 539, 786), t, fontsize=10.5, fontname="helv")
    d.save(OUT / name); d.close()
OUT.mkdir(parents=True, exist_ok=True)
pdf("lpa_aurora.pdf", P)
(OUT / "lpa_aurora.txt").write_text("\n\n".join(f"[page {i+1}]\n{t}" for i, t in enumerate(P)))
print("written lpa_aurora.pdf,", len(P), "pages")
