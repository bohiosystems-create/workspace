"""
The Jadwa edition of the app: the same engine, tools and demo content, in Jadwa's look (jadwa.com: a white band with the sage
sapling mark, serif titles, navy actions, sand rules, a pale page with the big sapling motif). Applied to a built page at
build time (tools/build_options.py), so the KINAN source stays as it is.

    apply(html)  -> the branded page
    guide(html)  -> the branded one-page guide
"""
import re

NAVY, NAVY_DEEP, SAND, SAGE, INK, SOFT, BLUE, PALE, SAND_SOFT = '#0b1f5c', '#071542', '#b7a68f', '#7e8273', '#2f332f', '#6b706b', '#5160d2', '#f3f3f1', '#f1ece3'

# the sapling, traced from Jadwa's own mark (jadwa.com: the white mark on the sage square, and the large motif on the sand block):
# a narrow V, two inner arcs bending down to the centre, two outer arcs sweeping down and running on vertically. In the square the
# outer arcs run off the bottom edge, as on the site; standing alone they end on a baseline.
V, INNER, OUTER = 'M43 29 L50 40 L57 29', 'M31 41 C37.4 42.4 42.9 48.8 45.7 55 M69 41 C62.6 42.4 57.1 48.8 54.3 55', 'M27 55 C35.8 58.2 43.7 69.3 44.5 80 M73 55 C64.2 58.2 56.3 69.3 55.5 80'
SAPLING = f'<path d="{V}"/><path d="{INNER}"/><path d="{OUTER} M44.5 80 L44.5 95 M55.5 80 L55.5 95"/>'
SAPLING_SQ = f'<path d="{V}"/><path d="{INNER}"/><path d="{OUTER} M44.5 80 L44.5 108 M55.5 80 L55.5 108"/>'
MARK = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="40" height="40" role="img" aria-label="Jadwa" style="display:block;width:40px;height:40px">'
        f'<rect width="100" height="100" fill="{SAGE}"/><g fill="none" stroke="#fff" stroke-width="4.2" stroke-linecap="round" stroke-linejoin="round">{SAPLING_SQ}</g></svg>')
BIGMARK = MARK.replace('width="40" height="40"', 'width="64" height="64"').replace('width:40px;height:40px', 'width:64px;height:64px')
GRID = ('data:image/svg+xml;utf8,' + ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 90 90"><g stroke="%s" stroke-width=".6" fill="none" opacity=".55"><path d="M0 60 L30 90 M0 40 L50 90 M0 20 L70 90 M20 90 L0 70 M40 90 L0 50 M60 90 L0 30"/><path d="M0 60 L30 30 M0 80 L50 30"/></g></svg>' % SAND).replace('#', '%23').replace('"', "'"))
MOTIF = ('data:image/svg+xml;utf8,' + (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><g fill="none" stroke="{SAND}" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round" opacity=".55">{SAPLING}</g></svg>')
         .replace('#', '%23').replace('"', "'"))

CSS = f"""
/* ===== Jadwa theme: white band with the sage sapling, serif titles, navy actions, sand rules, pale page with the sapling motif ===== */
:root{{--bg:{PALE};--ink:{INK};--ink2:#3a3f3a;--soft:rgba(47,51,47,.66);--faint:rgba(47,51,47,.2);--hair:rgba(47,51,47,.13);
  --orange:{NAVY};--orange-deep:{NAVY_DEEP};--orange-fill:{NAVY};--orange-soft:{SAND_SOFT};--taupe:{SAGE};--green:#2e7d4f;--alert:#b8382f;
  --navy:{NAVY};--sand:{SAND};--sage:{SAGE};--jblue:{BLUE};
  --serif:'Playfair Display',Georgia,'Times New Roman',serif;--sans:'Nunito Sans','IBM Plex Sans Arabic',-apple-system,'Segoe UI',Tahoma,sans-serif;--ktex:none}}
body{{background:url("{MOTIF}") right -5vw bottom -8vh/46vmin no-repeat fixed,var(--bg);font-family:var(--sans)}}   /* the big sapling motif, as on jadwa.com */
@media(max-width:700px){{.ksub>span{{display:none}}header.kband{{height:auto}}}}
h1,h2,h3,.serif{{font-family:var(--sans);letter-spacing:.02em}}
/* band */
header.kband{{background:#fff;color:var(--ink);box-shadow:0 0 0 100vmax #fff;border-bottom:1px solid var(--hair);height:76px;gap:20px}}
header.kband .klogo{{gap:14px;align-items:center}}header.kband .klogo svg{{height:40px;width:40px}}
.jword{{display:flex;flex-direction:column;align-items:flex-end;gap:2px;line-height:1}}.jword .jar{{font-family:'IBM Plex Sans Arabic',var(--sans);font-size:19px;font-weight:600;color:var(--soft);direction:rtl}}.jword .jen{{font-family:var(--sans);font-size:13.5px;font-weight:400;color:var(--soft);letter-spacing:.01em}}
.ksub{{color:var(--sage);font-weight:700;letter-spacing:.3em}}
.ksub select{{color:var(--ink);border-color:rgba(47,51,47,.25)}}.ksub select option{{color:var(--ink)}}
header.kband .demo-chip{{color:var(--ink);border-color:rgba(47,51,47,.25)}}header.kband .demo-chip b{{color:var(--navy)}}
header.kband .eng{{border-color:var(--navy);color:var(--navy)}}header.kband .eng i{{background:var(--sand)}}
header.kband .eng.live i{{background:var(--navy);box-shadow:0 0 0 3px rgba(11,31,92,.18)}}
.k-gear,.k-ready{{border-color:rgba(47,51,47,.25);color:var(--ink)}}.k-gear:hover{{background:var(--navy);border-color:var(--navy);color:#fff}}
.kbell b{{background:var(--navy)}}#bellPanel{{border-top-color:var(--sand)}}.kn.unread{{background:var(--orange-soft);border-left-color:var(--sand)}}
.kn-change .kn-t::before,.kn-report .kn-t::before{{color:var(--sage)}}
/* tabs */
.tab{{color:var(--sage);font-weight:700}}.tab::after{{background:var(--navy)}}.tab.on{{color:var(--navy)!important}}.tab b{{background:var(--navy)!important}}
/* page title: serif, as jadwa.com sets its headings */
.ktitle{{font-family:var(--serif);text-transform:none;letter-spacing:0;color:var(--ink);font-weight:500;font-size:34px}}.ktitle svg{{height:26px}}
.kintro{{font-size:13.5px;color:var(--soft)}}
/* boxes: white with a sand rule */
.card,.cn,.kpi{{border-top:3px solid var(--sand)}}
.card h2,.card .sbhead h2{{color:var(--sage)}}.card h2::before{{background:var(--sand)}}
.cn.dk{{background:var(--navy);border-color:var(--navy);border-top-color:var(--sand)}}.cn .n{{color:var(--sand)}}.cn .dot,.cn.dk .dot.ok{{background:var(--sand)}}
.kpi .l{{color:var(--sage)}}.kpi .v{{font-family:var(--serif);font-weight:500;font-size:30px;color:var(--navy)}}
.kv b{{color:var(--sage)}}.body th{{color:var(--sage)}}
/* actions: navy, square, as the site's buttons */
.btn{{background:var(--navy);border-color:var(--navy)}}.btn.ghost{{background:#fff;color:var(--navy);border-color:var(--navy)}}
#send,#promote,.btn[data-apr],.btn[data-tdone],#sgGo,#exUp,#cwConn{{background:var(--navy);border-color:var(--navy)}}
.chip:hover{{background:var(--navy);border-color:var(--navy);color:#fff}}
.pill.p{{background:var(--navy);border-color:var(--navy)}}.rt-api{{background:var(--sage)}}
table.t th{{background:var(--navy)}}
/* chat */
.msg.user{{background:var(--navy)}}.msg.agent{{border-left-color:var(--sand)}}.post{{border-left-color:var(--sand);background:var(--orange-soft)}}
.st i{{border-top-color:var(--navy)}}.st.done i{{background:var(--navy)}}
.body a.go,a.go{{color:var(--jblue);border-bottom-color:var(--jblue)}}
.mkbox,.ext{{border-left-color:var(--sand)}}.trust{{border-left-color:var(--navy)}}.trust.warn{{border-left-color:var(--sand)}}
.sandbox{{background:var(--orange-soft)}}.dot.live{{background:var(--navy)}}
input[type=range]::-webkit-slider-thumb{{background:var(--navy)}}input[type=range]::-moz-range-thumb{{background:var(--navy)}}
.bars .b i{{background:var(--navy)}}
/* report */
.report h1{{font-family:var(--serif);text-transform:none;color:var(--navy);font-size:30px;font-weight:500}}
.report h3{{color:var(--sage)}}.report .rk div{{border-top-color:var(--sand)}}.report .rk b{{font-family:var(--serif);font-weight:500}}.report .verdict{{border-left-color:var(--sand)}}
#rplay{{background:var(--navy);border-color:var(--navy)}}
.wh{{background:var(--navy)}}
/* ===== decks and reports: Jadwa's annual report (navy pages with sand shards, light navy headings, navy table bands) ===== */
.kd-root,.k-doc{{font-family:var(--sans)}}
.kd-root .kd-fb-orange,.kd-root .kd-fb-dark{{background:{NAVY}}}.kd-fb-tex{{display:none}}
.kd-root .kd-fb-band{{top:auto;bottom:auto;right:auto;opacity:1;animation-name:jShard}}
.kd-root .kd-fb-band.w1{{left:-4vw;top:-6vh;width:38vw;height:58vh;background:rgba(183,166,143,.5);clip-path:polygon(0 0,100% 0,100% 22%,34% 100%,0 100%)}}
.kd-root .kd-fb-band.w2{{left:10vw;top:-12vh;width:30vw;height:72vh;background:rgba(183,166,143,.28);clip-path:polygon(0 0,100% 0,62% 100%,0 72%)}}
.kd-root .kd-fb-band.a{{right:-6vw;top:-8vh;width:40vw;height:62vh;background:rgba(183,166,143,.42);clip-path:polygon(0 0,100% 0,100% 100%,56% 100%,0 26%)}}
.kd-root .kd-fb-band.b{{right:14vw;top:-14vh;width:28vw;height:76vh;background:rgba(183,166,143,.22);clip-path:polygon(0 0,100% 0,100% 70%,40% 100%)}}
@keyframes jShard{{from{{opacity:0;transform:translate(-4%,-6%)}}to{{opacity:1;transform:none}}}}
.kd-root .kd-div-title{{text-transform:uppercase;font-weight:700;letter-spacing:.02em}}.kd-div-sub{{color:var(--sand);letter-spacing:.2em;text-transform:uppercase;font-size:12px}}
.kd-root .kd-cover-title{{font-weight:600}}.kd-kicker-w{{color:var(--sand)}}
.kd-root .kd-on-orange .kd-footline b,.kd-root .kd-on-dark .kd-footline b{{color:var(--sand)}}.kd-footline b{{color:var(--navy)}}
.k-cover{{background:{NAVY};background-image:none;text-align:left;padding:64px 40px 48px;overflow:hidden}}
.k-cover::before,.k-cover::after{{content:"";position:absolute;top:-30%;right:-6%;width:46%;height:120%;background:rgba(183,166,143,.42);clip-path:polygon(0 0,100% 0,100% 100%,56% 100%,0 26%);pointer-events:none}}
.k-cover::after{{right:22%;width:30%;background:rgba(183,166,143,.2);clip-path:polygon(0 0,100% 0,100% 70%,40% 100%)}}
.k-cover>*{{position:relative;z-index:1}}.k-kick{{color:var(--sand)}}.k-cover h1{{text-transform:none;font-weight:600;font-size:32px;letter-spacing:0}}.k-rule{{margin-left:0;background:var(--sand)}}
.k-sh{{font-size:22px;letter-spacing:0;text-transform:none;font-weight:400;color:var(--navy);border-top:1px solid rgba(11,31,92,.35);padding-top:14px;margin-bottom:16px}}.k-sh .k-bar{{display:none}}
.k-stats{{border-top-color:var(--navy)}}.k-stat-l{{color:var(--soft);letter-spacing:.14em}}.k-stat-v{{font-weight:600}}
.k-doc table.t th,table.t th{{background:{NAVY};letter-spacing:.06em;font-size:10.5px;text-transform:none;font-weight:600}}
.k-doc table.t td{{border-top-color:rgba(11,31,92,.14)}}
.k-close{{background:{NAVY};position:relative;overflow:hidden}}.k-close::before{{content:"";position:absolute;left:-8%;top:-40%;width:44%;height:160%;background:rgba(183,166,143,.4);clip-path:polygon(0 0,100% 0,100% 22%,34% 100%,0 100%)}}.k-close>*{{position:relative}}.k-tag{{color:var(--sand)}}
.k-sec{{background:url("{GRID}") left bottom/90px no-repeat}}
.report h1{{font-family:var(--sans);font-weight:400}}.report .rk b{{font-family:var(--sans);font-weight:600;color:var(--navy)}}
"""

FONTS = '<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;500;600&family=Nunito+Sans:wght@300;400;600;700&family=IBM+Plex+Sans+Arabic:wght@400;600;700&display=swap" rel="stylesheet">'

# the opening, as jadwa.com opens: the sage square with the mark on white in a soft halo, the strokes drawing themselves, then a fade
# into the app (the page's own timing script decides when: at least 2.6 s, or until the app is ready)
DRAW_SQ = (f'<path pathLength="100" d="{V}"/><path pathLength="100" d="M31 41 C37.4 42.4 42.9 48.8 45.7 55"/><path pathLength="100" d="M69 41 C62.6 42.4 57.1 48.8 54.3 55"/>'
           '<path pathLength="100" d="M27 55 C35.8 58.2 43.7 69.3 44.5 80 L44.5 108"/><path pathLength="100" d="M73 55 C64.2 58.2 56.3 69.3 55.5 80 L55.5 108"/>')
DRAW = (f'<path pathLength="100" d="{V}"/><path pathLength="100" d="M31 41 C37.4 42.4 42.9 48.8 45.7 55"/><path pathLength="100" d="M69 41 C62.6 42.4 57.1 48.8 54.3 55"/>'
        '<path pathLength="100" d="M27 55 C35.8 58.2 43.7 69.3 44.5 80 L44.5 95"/><path pathLength="100" d="M73 55 C64.2 58.2 56.3 69.3 55.5 80 L55.5 95"/>')
SPLASH = ('<div id="ksplash" role="status" aria-live="polite" aria-label="Loading Jadwa financial modelling"><style>'
          '#ksplash{position:fixed;inset:0;z-index:2147483000;overflow:hidden;background:#fff;display:grid;place-items:center;transition:opacity .55s ease}'
          '#ksplash.ks-leave{opacity:0;pointer-events:none}'
          '#ksplash .ks-halo{position:relative;width:min(44vmin,210px);height:min(44vmin,210px);display:grid;place-items:center;border-radius:50%;background:radial-gradient(circle,rgba(126,130,115,.14) 0,rgba(126,130,115,.06) 48%,rgba(255,255,255,0) 70%);animation:jHalo 1.4s ease .1s both}'
          '@keyframes jHalo{from{opacity:0;transform:scale(.8)}to{opacity:1;transform:none}}'
          f'#ksplash .ks-sq{{width:min(26vmin,124px);height:min(26vmin,124px);background:{SAGE};display:grid;place-items:center;overflow:hidden;animation:jSq .9s cubic-bezier(.2,.8,.2,1) .15s both;box-shadow:0 18px 40px rgba(47,51,47,.14)}}'
          '@keyframes jSq{from{opacity:0;transform:scale(.86)}to{opacity:1;transform:none}}'
          '#ksplash svg{width:100%;height:100%;overflow:visible}'
          '#ksplash svg path{fill:none;stroke:#fff;stroke-width:4.2;stroke-linecap:round;stroke-linejoin:round;stroke-dasharray:100;stroke-dashoffset:101;animation:jDraw .7s cubic-bezier(.4,0,.2,1) forwards}'
          '#ksplash svg path:nth-child(1){animation-delay:.45s}#ksplash svg path:nth-child(2),#ksplash svg path:nth-child(3){animation-delay:.8s}#ksplash svg path:nth-child(4),#ksplash svg path:nth-child(5){animation-delay:1.15s}'
          '@keyframes jDraw{to{stroke-dashoffset:0}}'
          '@media(prefers-reduced-motion:reduce){#ksplash svg path{animation:none;stroke-dashoffset:0}#ksplash .ks-halo,#ksplash .ks-sq{animation:none}}'
          '</style><div class="ks-halo"><div class="ks-sq">'
          f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" aria-hidden="true">{DRAW_SQ}</svg>'
          '</div></div>')

# the app's own vector (decks, reports, emails' preview) and the title mark, redrawn for Jadwa; the header mark re-rendered
SCRIPT = f"""<script>
window.BOHIO_BRAND='jadwa';
function klogo(h=34,c='#fff'){{const W=Math.round(h*2.9);return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 290 100" width="${{W}}" height="${{h}}" role="img" aria-label="Jadwa" style="display:block;width:${{W}}px;height:${{h}}px"><g fill="none" stroke="${{c}}" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round">{SAPLING}</g><text x="108" y="68" font-family="'Playfair Display',Georgia,serif" font-size="58" fill="${{c}}">Jadwa</text></svg>`}}
function kchev(h=30,c=KD.OR){{return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="${{h}}" height="${{h}}" aria-hidden="true" style="display:inline-block;vertical-align:middle;width:${{h}}px;height:${{h}}px"><g fill="none" stroke="${{c}}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round">{SAPLING}</g></svg>`}}
</script>"""

KD = ("const KD={OR:'%s',CH:'%s',INK:'%s',SOFT:'%s',TAUPE:'%s',GREY:'%s',FAINT:'rgba(47,51,47,.12)',GOOD:'#2e7d4f',WARN:'#c28a00',CRIT:'#b8382f',"
      "PAL:['%s','%s','%s','%s','#c9a86a','#4a3aa7'],site:'www.jadwa.com',tagline:'EXPANDING INVESTMENT HORIZONS',caption:'AI agent on EstateMaster'};"
      % (NAVY, INK, INK, SOFT, SAGE, SAND, NAVY, SAND, SAGE, BLUE))

# sentences about the company itself (the rest of the texts carry only the name)
SENTENCES = [
    ("KINAN is a Saudi real estate developer", "Jadwa Investment is a Saudi investment management and advisory firm, with real estate funds among its businesses"),
    ("for KINAN, a real estate developer and investor", "for Jadwa Investment, an investment management and advisory firm"),
]


def words(s):
    for a, b in SENTENCES:
        s = s.replace(a, b)
    s = s.replace("@kinan.example", "@jadwa.example").replace("cfo@kinan.com.sa", "cfo@jadwa.com").replace("www.kinan.com.sa", "www.jadwa.com")
    s = s.replace("app:'kinan-estatemaster'", "app:'jadwa-estatemaster'")
    s = s.replace("kinan|developer", "kinan|jadwa|developer").replace("kinan.?s ", "(?:kinan|jadwa).?s ")   # the readers' own regexes keep both names
    return s.replace("KINAN", "Jadwa").replace("Kinan", "Jadwa")


def apply(html):
    n0 = html.count("KINAN")
    html = re.sub(r"<title>.*?</title>", "<title>Jadwa · AI agent · financial modelling</title>", html, count=1, flags=re.S)
    html = html.replace('<link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@300;400;500;600;700&family=IBM+Plex+Sans+Arabic:wght@400;600;700&display=swap" rel="stylesheet">', FONTS, 1)
    assert html.index("</head>") < html.index("<body"), "the page head"   # later </head>s sit inside the report templates
    html = html.replace("</head>", "<style>" + CSS + "</style>\n</head>", 1)
    # the splash: Jadwa's, with the page's own timing script kept
    m = re.search(r"<!--ksplash:[^>]*-->(.*?)<!--/ksplash-->", html, flags=re.S)
    assert m, "splash block not found"
    js = re.search(r"<script>\(function\(\)\{var el=document\.getElementById\(\"ksplash\"\).*?</script>", m.group(1), flags=re.S)
    assert js, "splash script not found"
    html = html[:m.start()] + "<!--ksplash: Jadwa-->" + SPLASH + "</div>" + js.group(0) + "<!--/ksplash-->" + html[m.end():]
    # the header mark; KINAN's chevron (the band's and the page title's) becomes the sapling in sage
    html = re.sub(r'<div class="klogo">.*?</div>', lambda _: f'<div class="klogo"><span class="jword" aria-hidden="true"><span class="jar">جدوى للاستثمار</span><span class="jen">Jadwa Investment</span></span>{MARK}</div>', html, count=1, flags=re.S)
    chev = f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" aria-hidden="true"><g fill="none" stroke="{SAGE}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round">{SAPLING}</g></svg>'
    html = re.sub(r'<svg xmlns="http://www.w3.org/2000/svg" viewBox="935\.84 30\.03 24\.66 38\.05"[^>]*>.*?</svg>', lambda _: chev, html, flags=re.S)
    # the brand constants and the deck font
    html, n = re.subn(r"const KD=\{OR:'#f15a22'.*?caption:'AI agent on EstateMaster'\};", KD, html, count=1)
    assert n == 1, "KD not found"
    html = html.replace("Montserrat,'Segoe UI'", "'Nunito Sans','Segoe UI'")   # the deck's and the report's own font lines
    rcss = CSS[CSS.index("/* ===== decks and reports"):]   # the report theme also goes into the standalone report (its own page, with KD_CSS only)
    assert "`" not in rcss and "${" not in rcss
    html, n = re.subn(r"(const KD_CSS=`[^`]*)`", lambda m: m.group(1) + rcss + "`", html, count=1)   # after its own rules, so these win
    assert n == 1, "KD_CSS not found"
    html = html.replace('const FONT = "Montserrat,\'Segoe UI\',Roboto,Helvetica,Arial,sans-serif";', 'const FONT = "Nunito Sans,\'Segoe UI\',Roboto,Helvetica,Arial,sans-serif";', 1)
    # KINAN's colours wherever a stylesheet writes them in full
    for a, b in (("#f15a22", NAVY), ("rgba(241,90,34", "rgba(11,31,92"), ("#b83d0c", NAVY_DEEP), ("#fff1ea", SAND_SOFT), ("#d94a16", NAVY_DEEP), ("#f5602a", "#102566"), ("#e04f22", NAVY_DEEP), ("#2e2e2f", INK), ("rgba(245,96,42", "rgba(16,37,102"), ("rgba(224,79,34", "rgba(7,21,66"), ("'F15A22'", "'0B1F5C'"), ("'2E2E2F'", "'2F332F'")):   # the PowerPoint export writes its colours without #
        html = html.replace(a, b)
    html = words(html)
    i = html.rindex("</body>")   # after the app's own script, so the Jadwa klogo/kchev are the ones that stand (a later declaration wins)
    html = html[:i] + SCRIPT + "\n" + html[i:]
    assert "KINAN" not in html, "KINAN left in the page"
    return html


def guide(html):
    html = html.replace("#f15a22", NAVY).replace("rgba(241,90,34", "rgba(11,31,92")
    return words(html)
