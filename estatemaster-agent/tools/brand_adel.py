"""
The Adel Real Estate edition of the app: the Jadwa edition's engine, tools and screens (the financial-modelling app on an Excel
workbook) in Adel's look (adelrealestate.com: a dark taupe page, gold lettering, the gold slanted stripes, the Arabic and Latin
lockup). Applied after the Jadwa edition at build time (tools/build_options.py), so the KINAN source stays as it is.

    apply(html)  -> the branded page
    guide(html)  -> the branded one-page guide
"""
import base64, pathlib, re
import brand_jadwa as J

_J_MAIL_KIT, _J_LOGO_JS = J.mail_kit, J.logo_js   # Jadwa's own, kept: apply() points the Jadwa build at Adel's while it runs

CHAR, CHAR_DEEP, CHAR_SOFT, GOLD, GOLD_DK, GOLD_ACC, SAND_SOFT = '#3d3935', '#2b2825', '#4a453f', '#caa862', '#8a7746', '#a67c2e', '#f3eee2'
_BR = pathlib.Path(__file__).resolve().parents[1] / "brand" / "adel"
_png = lambda n: "data:image/png;base64," + base64.b64encode((_BR / n).read_bytes()).decode()
LOGO_DARK, LOGO_WHITE, MARK, MARK_FAINT, ICON = _png("web-dark.png"), _png("web-white.png"), _png("mark-s.png"), _png("mark-faint-s.png"), _png("icon-s.png")
LOGO_AR = 1226 / 305

# Cairo carries Latin and Arabic in one voice (the site's own face is a rounded geometric sans; Cairo is the closest open font)
FONTS = '<link href="https://fonts.googleapis.com/css2?family=Cairo:wght@300;400;500;600;700&display=swap" rel="stylesheet">'
FONT_STACK = "'Cairo','IBM Plex Sans Arabic','Segoe UI',Tahoma,sans-serif"

COLOURS = [(J.NAVY, CHAR), (J.NAVY_DEEP, CHAR_DEEP), (J.SAND, GOLD), (J.SAGE, GOLD_DK), (J.BLUE, GOLD_ACC), (J.SAND_SOFT, SAND_SOFT),
           ("#102566", CHAR_SOFT), ("rgba(11,31,92", "rgba(61,57,53"), ("rgba(16,37,102", "rgba(74,69,63"), ("rgba(7,21,66", "rgba(43,40,37"),
           ("rgba(183,166,143", "rgba(202,168,98"), ("rgba(135,131,120", "rgba(138,119,70"), ("rgba(81,96,210", "rgba(166,124,46"), ("#2a3f8f", GOLD_DK),
           ("#8fa0d6", "#b3a690"), ("'0B1F5C'", "'3D3935'"), ("'B7A68F'", "'CAA862'"), ("'878378'", "'8A7746'")]   # the deck exports write colours without the hash

# what stays Jadwa's in the page's own words becomes Adel's
SENTENCES = [("Jadwa Investment is a Saudi investment management and advisory firm, with real estate funds among its businesses", "Adel Real Estate is a Saudi real estate company"),
             ("for Jadwa Investment, an investment management and advisory firm", "for Adel Real Estate, a Saudi real estate company")]
NAMES = [("Jadwa Investment", "Adel Real Estate"), ("EXPANDING INVESTMENT HORIZONS", "ADEL REAL ESTATE"), ("@jadwa.example", "@adel.example"), ("cfo@jadwa.com", "cfo@adelrealestate.com"), ("www.jadwa.com", "www.adelrealestate.com"),
         ("jadwa.com", "adelrealestate.com"), ("jadwa-estatemaster", "adel-estatemaster"), ("jadwa${atts", "adel${atts"), ("jadwa-${atts", "adel-${atts")]


def _names(s):
    for a, b in SENTENCES + NAMES:
        s = s.replace(a, b)
    return s.replace("Jadwa", "Adel")


def _colours(s):
    for a, b in COLOURS:
        s = s.replace(a, b).replace(a.upper(), b) if a.startswith("#") else s.replace(a, b)
    return s


def _img(src, h, alt="", extra=""):
    return f'<img src="{src}" alt="{alt}" height="{h}" style="display:block;height:{h}px;width:auto{extra}">'


def words(s):
    return _names(J.words(s))


def mail_kit(src):
    return _names(_colours(_J_MAIL_KIT(src))).replace("'Nunito Sans','Segoe UI'", "'Cairo','Segoe UI'")


def logo_js():
    """the email logo module with Adel's lockup (white for the charcoal band, charcoal for white), rendered at 4x"""
    b64 = {n: base64.b64encode((_BR / f"mail-{n}.png").read_bytes()).decode() for n in ("white", "ink")}
    return ("// Adel Real Estate's logo for emails: the official lockup (brand/adel) rendered to PNG at 4x, white for the charcoal band, charcoal for white.\n"
            f"module.exports = {{\n  white: '{b64['white']}',\n  ink: '{b64['ink']}',\n  w: {round(34 * LOGO_AR)}, h: 34,\n}};\n")


# the page's own marks: the lockup in the header, the stripes for the splash, the tab icon and the faint motifs
CSS = f"""
:root{{--serif:{FONT_STACK};--sans:{FONT_STACK}}}
body,button,input,select,textarea{{font-family:{FONT_STACK}}}
h1,h2,h3,.serif,.kd-root,.k-doc,.report{{font-family:{FONT_STACK}}}
#ksplash{{background:{CHAR}!important}}
#ksplash .ks-halo{{background:radial-gradient(circle,rgba(202,168,98,.16) 0,rgba(202,168,98,.05) 48%,rgba(61,57,53,0) 70%)!important}}
#ksplash .ks-sq{{background:transparent!important;box-shadow:none!important;display:grid;place-items:center;width:min(34vmin,170px)!important;height:min(34vmin,170px)!important}}
#ksplash .ks-sq img{{width:78%;height:auto;animation:jSq 1.1s cubic-bezier(.2,.8,.2,1) .2s both}}
.klogo img{{height:46px;width:auto}}
/* the site's own look: a charcoal band with the white lockup, gold on dark for the navigation, a warm page */
:root{{--bg:#f4f2ee}}
header.kband{{background:{CHAR};color:#fff;box-shadow:0 0 0 100vmax {CHAR};border-bottom:1px solid rgba(202,168,98,.35)}}
header.kband .k-gear,header.kband .k-ready,header.kband .demo-chip{{border-color:rgba(255,255,255,.28);color:#f3eee2;background:transparent}}
header.kband .k-gear:hover{{background:{GOLD};border-color:{GOLD};color:{CHAR}}}header.kband .demo-chip b{{color:{GOLD}}}
header.kband .eng{{border-color:{GOLD};color:{GOLD}}}header.kband .kbell{{color:#f3eee2}}
.tabs{{background:{CHAR_DEEP}!important;box-shadow:0 0 0 100vmax {CHAR_DEEP}!important;border-bottom:0!important}}
#tabs .tab,#tabs .tab.gtab-hidden{{color:#d9cfbd!important;opacity:1!important}}#tabs .tab:hover{{color:#fff!important}}#tabs .tab.on{{color:{GOLD}!important}}#tabs .tab::after{{background:{GOLD}!important}}
.tabs .tab-model{{color:#fff!important;border-right-color:rgba(255,255,255,.18)!important}}.tabs .tab-model:before{{color:{GOLD}!important}}.tabs .tab-model small{{color:#d9cfbd!important}}
.btn:hover:not(:disabled){{background:{CHAR_DEEP};border-color:{CHAR_DEEP}}}.btn.ghost:hover:not(:disabled){{background:{SAND_SOFT};color:{CHAR}}}
#ksplash .ks-sq{{width:min(70vmin,420px)!important;height:auto!important}}#ksplash .ks-sq img{{width:100%!important}}#ksplash .ks-halo{{width:auto!important;height:auto!important;padding:48px}}
"""


def apply(html):
    # Jadwa's build first, with Adel's email logo and kit; then the look
    J.mail_kit, J.logo_js = mail_kit, logo_js
    try:
        html = J.apply(html)
    finally:
        J.mail_kit, J.logo_js = _J_MAIL_KIT, _J_LOGO_JS
    # Jadwa's own klogo and kchev (the app's vector helpers, drawn from Jadwa's lockup and sapling) go; Adel's are defined at the end of the page
    k = html.index("window.BOHIO_BRAND='jadwa';")   # Jadwa's block only: the app's own klogo and kchev before it stay (Adel's are defined after)
    head, tail = html[:k], html[k:]
    tail, n = re.subn(r"function klogo\(h=34,c='#fff'\)\{const col=[^\n]*\n", "", tail)
    tail, m = re.subn(r"function kchev\(h=30,c=KD\.OR\)\{[^\n]*\n", "", tail)
    html = head + tail
    assert n == 1 and m == 1, ("Jadwa's klogo/kchev not found", n, m)
    # the marks: the header lockup, the splash, the tab icon, the deck and report cover mark, the sapling motifs and every sapling drawn inline
    html = html.replace(J.lockup_svg(J.SAGE, 46), _img(LOGO_WHITE, 46))   # on the charcoal band, as on adelrealestate.com
    html = html.replace(J.square_svg(124, label=False), _img(LOGO_WHITE, 104, "Adel Real Estate"))   # the opening: the white lockup on charcoal, as the site's own page
    html = html.replace(J.MARK.replace('width="40" height="40"', 'width="48" height="48"').replace('width:40px;height:40px', 'width:48px;height:48px'), _img(MARK, 48))
    for svg in (J.tree_svg(J.SAGE, 1), J.tree_svg("#ffffff", .13), J.tree_svg(J.SAND, .35), J.tree_svg(J.SAND, .5)):
        html = html.replace(J.data_uri(svg), MARK_FAINT)
    html = re.sub(r'<svg[^>]*viewBox="0 0 1051\.42 1051\.43"[^>]*>.*?</svg>', lambda m: _img(MARK, 24, extra=";display:inline-block;vertical-align:middle"), html, flags=re.S)
    html = _names(html)
    html = html.replace(J.FONTS, FONTS)
    html = html.replace("'Playfair Display',Georgia,'Times New Roman',serif", FONT_STACK).replace("'Nunito Sans','IBM Plex Sans Arabic',-apple-system,'Segoe UI',Tahoma,sans-serif", FONT_STACK)
    html = html.replace("'Playfair Display'", "'Cairo'").replace("'Nunito Sans'", "'Cairo'").replace("Playfair Display,Georgia,serif", "Cairo,sans-serif").replace("Nunito Sans,", "Cairo,")
    html = _colours(html)
    html = re.sub(r'<link rel="icon" type="image/svg\+xml" href="[^"]*">', f'<link rel="icon" type="image/png" href="{ICON}">', html, count=1)
    assert 'rel="icon" type="image/png"' in html, "the icon link"
    html = html.replace("</head>", "<style>" + CSS + "</style>\n</head>", 1)
    # the app's vector helpers, redrawn for Adel: the lockup (white on dark, charcoal on light) and the stripes
    over = f"""<script>
function klogo(h=34,c='#fff'){{const w=/^#?f{{3,6}}$/i.test(String(c).replace('#',''))||/^(#fff|#ffffff|white)$/i.test(c),W=Math.round(h*{LOGO_AR:.4f});return `<img src="${{w?'{LOGO_WHITE}':'{LOGO_DARK}'}}" alt="Adel Real Estate" width="${{W}}" height="${{h}}" style="display:block;width:${{W}}px;height:${{h}}px">`}}
function kchev(h=30){{return `<img src="{MARK}" alt="" aria-hidden="true" height="${{h}}" style="display:inline-block;vertical-align:middle;height:${{h}}px;width:auto">`}}
</script>"""
    i = html.rindex("</body>")
    html = html[:i] + over + "\n" + html[i:]
    assert "Jadwa" not in html.replace("BOHIO_BRAND", ""), "Jadwa left in the page"
    return html


def guide(html):
    return _names(_colours(J.guide(html))).replace("'Nunito Sans'", "'Cairo'")
