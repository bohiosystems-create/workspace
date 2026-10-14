"""Embed ../market-data.xlsx into ../index.html as a data URI so the demo is one self-contained file.
Run after generate_dummy_data.py (and after recalculating the workbook, so cached values are included)."""
import base64, re
from pathlib import Path
root = Path(__file__).resolve().parent.parent
b64 = base64.b64encode((root / 'market-data.xlsx').read_bytes()).decode()
html = root / 'index.html'
s = html.read_text(encoding='utf8')
uri = 'data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,' + b64
s2, n = re.subn(r'href="(?:market-data\.xlsx|data:application/vnd\.openxmlformats[^"]*)" download="?[^" >]*"?', f'href="{uri}" download="Al_Narjis_market_data_DUMMY.xlsx"', s)
s2, m = re.subn(r'href="market-data\.xlsx" download', f'href="{uri}" download="Al_Narjis_market_data_DUMMY.xlsx"', s2)
html.write_text(s2, encoding='utf8'); print('embedded xlsx', n + m, 'link(s)')
