"""Synthetic documents for the document-ingestion tests (nothing from a client): a lease and a facility term sheet for the
Al Waha fixture (r33_waha_sar.xlsx), whose terms partly match the model's inputs and partly differ. Run: python3 gen_docs.py"""
import pymupdf, pathlib
OUT = pathlib.Path(__file__).resolve().parents[1] / "docs"
LEASE = [
"LEASE AGREEMENT\n\nAL WAHA BUSINESS PARK (synthetic fixture)\n\nBetween Al Waha Development Company (the Landlord) and Northstar Logistics LLC (the Tenant).\n\n"
"1. Premises. The Landlord lets to the Tenant the whole of the business park, with a net lettable area of 60,000 sqm.\n\n"
"2. Term. The lease is granted for a term of ten (10) years from the commencement date.\n\n"
"3. Rent. The Tenant shall pay an annual base rent of SAR 30,000,000 payable quarterly in advance.\n\n"
"4. Escalation. The base rent shall escalate by 4% per annum on each anniversary of the commencement date.\n",
"5. Rent-free period. The Tenant is granted a rent-free period of 6 months from the commencement date.\n\n"
"6. Operating costs. The Landlord's operating costs are capped at 20% of the rent received in any lease year.\n\n"
"7. Deposit. The Tenant shall provide a security deposit equal to three months' rent.\n\n"
"Signed on 15 March 2026.\n",
]
TERMSHEET = [
"INDICATIVE TERM SHEET (synthetic fixture)\n\nBorrower: Al Waha Development Company\nLender: Gulf Development Bank\n\n"
"Facility: Murabaha construction facility.\nFacility amount: up to 55% of total project cost.\n"
"Profit rate: 3M SAIBOR plus a margin of 6.5% per annum.\nTenor: 7 years from first drawdown.\n"
"Covenants: minimum DSCR of 1.30x tested quarterly; maximum LTV of 60%.\n\nDated 2 April 2026.\n",
]
def pdf(name, pages):
    d = pymupdf.open()
    for t in pages:
        pg = d.new_page(width=595, height=842)
        pg.insert_textbox(pymupdf.Rect(56, 56, 539, 786), t, fontsize=11, fontname="helv")
    d.save(OUT / name); d.close()
OUT.mkdir(parents=True, exist_ok=True)
pdf("lease_waha.pdf", LEASE); pdf("termsheet_waha.pdf", TERMSHEET)
(OUT / "lease_waha.txt").write_text("".join(LEASE))
print("written", sorted(p.name for p in OUT.iterdir()))
