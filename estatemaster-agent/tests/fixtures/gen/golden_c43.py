# Golden answers for round 43, from independent Python models (LibreOffice's iteration does not settle the circular JV, and the
# LibreOffice in CI has no SEQUENCE / FILTER / UNIQUE). python3 -I gen/golden_c43.py → golden/c43.json
import json, os, datetime
D = os.path.join(os.path.dirname(__file__), '..', 'golden')

def irr(c):
    lo, hi = -0.99, 10.0
    f = lambda r: sum(x / (1 + r) ** t for t, x in enumerate(c))
    if f(lo) * f(hi) > 0: return None
    for _ in range(300):
        m = (lo + hi) / 2
        if f(lo) * f(m) <= 0: hi = m
        else: lo = m
    return (lo + hi) / 2

def jv(land=50e6, cost=200e6, ltc=0.60, rate=0.08, rent=30e6, g=0.03, ey=0.075, hold=8, sc=0.02, lp=0.90, pref=0.08, lpa=0.80, N=10):
    phase = [0.3, 0.4, 0.3]; bal = 0.0; hb = 0.0; E = []; U = []; LP = []; GP = []; peak = 0.0; above = 0.0
    for t in range(1, N + 1):
        L = land if t == 1 else 0.0; C = cost * phase[t - 1] if t <= 3 else 0.0; on = t <= hold
        if t <= 3:   # draw = ltc*(L + C + rate*(bal + draw/2)): solved exactly, as the iteration converges to
            draw = ltc * (L + C + rate * bal) / (1 - ltc * rate / 2); intr = rate * (bal + draw / 2) * on
        else:
            draw = 0.0; intr = rate * bal * on
        tot = L + C + (intr if t <= 3 else 0.0)
        repay = bal + draw if t == hold else 0.0
        noi = rent * (1 + g) ** (t - 4) if 3 < t <= hold else 0.0
        sale = rent * (1 + g) ** (t - 3) / ey * (1 - sc) if t == hold else 0.0
        bal = bal + draw - repay if on else 0.0; peak = max(peak, bal)
        u = -L - C + noi + sale
        e = -tot + draw + noi - (intr if t > 3 else 0.0) + sale - repay
        lpc = max(0, -e) * lp; gpc = max(0, -e) * (1 - lp); dist = max(0, e)
        topref = min(dist, max(0, hb * (1 + pref) + lpc)); hb = hb * (1 + pref) + lpc - topref; ab = dist - topref; above += ab
        U.append(u); E.append(e); LP.append(-lpc + topref + ab * lpa); GP.append(-gpc + ab * (1 - lpa))
    pos = sum(x for x in E if x > 0); neg = -sum(x for x in E if x < 0)
    return {'levered_irr': irr(E), 'unlevered_irr': irr(U), 'lp_irr': irr(LP), 'gp_irr': irr(GP), 'net_profit': sum(E), 'peak_debt': peak,
            'equity_multiple': pos / neg, 'tier': 'Promote' if above > 0 else 'Pref only', 'equity': E}

def dyn(price=60e6, g=0.025, ey=0.065, disc=0.09, hold=10):
    leases = [('Anchor', 12000, 180, 1), ('Gym', 3000, 150, 2), ('Cafe', 800, 320, 1), ('Anchor', 4000, 175, 3), ('Clinic', 2500, 210, 4)]
    cf = []; dates = []
    for y in range(1, 11):
        rent = sum(a * r for t, a, r, s in leases if s <= y) * (1 + g) ** (y - 1)
        cf.append(rent + (-price if y == 1 else 0) + (rent * (1 + g) / ey if y == hold else 0)); dates.append(datetime.date(2026 + y, 12, 31))
    d0 = dates[0]; xnpv = sum(c / (1 + disc) ** ((d - d0).days / 365) for c, d in zip(cf, dates))
    return {'unlevered_irr': irr(cf), 'npv': xnpv, 'net_profit': sum(cf), 'tenants': 4, 'anchor_area': 16000, 'total_area': 22300}

G = {'jv': {'base': jv(), 'cost_plus_10': jv(cost=220e6), 'hold_7': jv(hold=7), 'ltc_50': jv(ltc=0.50), 'rent_minus_10': jv(rent=27e6)},
     'dyn': {'base': dyn(), 'growth_plus_1pt': dyn(g=0.035), 'exit_plus_50bps': dyn(ey=0.07)}}
os.makedirs(D, exist_ok=True); json.dump(G, open(os.path.join(D, 'c43.json'), 'w'), indent=1)
for k, v in G['jv'].items(): print('jv', k, {a: (round(b, 6) if isinstance(b, float) else b) for a, b in v.items() if a != 'equity'})
for k, v in G['dyn'].items(): print('dyn', k, {a: round(b, 6) if isinstance(b, float) else b for a, b in v.items()})
