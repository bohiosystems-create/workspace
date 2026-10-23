"""
The Jadwa edition of the app: the same engine, tools and demo content, in Jadwa's look (jadwa.com: a white band with the sage
sapling mark, serif titles, navy actions, sand rules, a pale page with the big sapling motif). Applied to a built page at
build time (tools/build_options.py), so the KINAN source stays as it is.

    apply(html)  -> the branded page
    guide(html)  -> the branded one-page guide
"""
import re

NAVY, NAVY_DEEP, SAND, SAGE, INK, SOFT, BLUE, PALE, SAND_SOFT = '#0b1f5c', '#071542', '#b7a68f', '#878378', '#2f332f', '#6b706b', '#5160d2', '#f3f3f1', '#f1ece3'

# the sapling, traced from Jadwa's own mark (jadwa.com: the white mark on the sage square, and the large motif on the sand block):
# a narrow V, two inner arcs bending down to the centre, two outer arcs sweeping down and running on vertically. In the square the
# outer arcs run off the bottom edge, as on the site; standing alone they end on a baseline.
V, INNER, OUTER = 'M43 29 L50 40 L57 29', 'M31 41 C37.4 42.4 42.9 48.8 45.7 55 M69 41 C62.6 42.4 57.1 48.8 54.3 55', 'M27 55 C35.8 58.2 43.7 69.3 44.5 80 M73 55 C64.2 58.2 56.3 69.3 55.5 80'
import pathlib
_BR = pathlib.Path(__file__).resolve().parents[1] / "brand" / "jadwa"
_S = re.search(r'transform="([^"]*)" d="([^"]*)"', (_BR / "symbol.svg").read_text())
SYM_TR, SYM_D = _S.group(1), _S.group(2)
LOGO_PATHS = re.search(r'<g fill="#878378">(.*)</g>', (_BR / "logo.svg").read_text(), re.S).group(1)
SYM_VB, LOGO_VB, LOGO_AR = "0 0 1051.42 1051.43", "26.5 34.9 363.4 105", 363.4 / 105
def square_svg(px, sq=None, tree="#fff", label=True):
    """Jadwa's square: the symbol in sage, the tree knocked out and showing `tree` (a backing square in that colour)"""
    sq = sq or SAGE
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{SYM_VB}" width="{px}" height="{px}"' + (' role="img" aria-label="Jadwa"' if label else ' aria-hidden="true"')
            + f' style="display:block;width:{px}px;height:{px}px"><rect width="1051.42" height="1051.43" fill="{tree}"/><path fill="{sq}" transform="{SYM_TR}" d="{SYM_D}"/></svg>')
def tree_svg(colour, opacity=1, mid="jt"):
    """the tree alone: the square minus the symbol (an SVG mask), so the exact shapes, trunks included"""
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{SYM_VB}"><defs><mask id="{mid}"><rect width="1051.42" height="1051.43" fill="#fff"/><path fill="#000" transform="{SYM_TR}" d="{SYM_D}"/></mask></defs>'
            f'<rect width="1051.42" height="1051.43" fill="{colour}" opacity="{opacity}" mask="url(#{mid})"/></svg>')
def data_uri(svg):
    return "data:image/svg+xml;utf8," + svg.replace("#", "%23").replace('"', "'")
def lockup_svg(colour, h):
    """the full logo (Arabic name, Jadwa Investment, the square) in one colour, as Jadwa's own files have it"""
    w = round(h * LOGO_AR)
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{LOGO_VB}" width="{w}" height="{h}" role="img" aria-label="Jadwa Investment" style="display:block;width:{w}px;height:{h}px"><g fill="{colour}">{LOGO_PATHS}</g></svg>')
SAPLING = f'<path d="{V}"/><path d="{INNER}"/><path d="{OUTER} M44.5 80 L44.5 95 M55.5 80 L55.5 95"/>'
SAPLING_SQ = f'<path d="{V}"/><path d="{INNER}"/><path d="{OUTER} M44.5 80 L44.5 108 M55.5 80 L55.5 108"/>'
MARK = square_svg(40)
# the layered angular shapes of Jadwa's covers and section pages (the annual report: translucent sand shards overlapping from the
# corners), drawn as vectors so every report and slide carries them without an image
def _shards(op):
    polys=[('0,0 520,0 520,70 160,400 0,400',op),('120,0 680,0 420,400 300,400',op*.6),('640,0 1000,0 1000,260 820,400 700,400',op*.8),('780,0 1000,0 1000,120',op*.5),('0,260 140,400 0,400',op*.7)]
    return ('data:image/svg+xml;utf8,'+('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 400" preserveAspectRatio="none">'+''.join(f'<polygon points="{pt}" fill="{SAND}" opacity="{o:.2f}"/>' for pt,o in polys)+'</svg>').replace('#','%23').replace('"',"'"))
SHARDS, SHARDS_LIGHT = _shards(.42), _shards(.1)
SAPLING_SAGE, SAPLING_WHITE, SAPLING_SAND = data_uri(tree_svg(SAGE)), data_uri(tree_svg('#ffffff', .13)), data_uri(tree_svg(SAND, .35))
GRID = ('data:image/svg+xml;utf8,' + ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 90 90"><g stroke="%s" stroke-width=".6" fill="none" opacity=".55"><path d="M0 60 L30 90 M0 40 L50 90 M0 20 L70 90 M20 90 L0 70 M40 90 L0 50 M60 90 L0 30"/><path d="M0 60 L30 30 M0 80 L50 30"/></g></svg>' % SAND).replace('#', '%23').replace('"', "'"))
MOTIF = data_uri(tree_svg(SAND, .5))

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
/* ===== Jadwa first screen and ask bar ===== */
#jAsk{{display:flex;gap:8px;margin:14px 0 4px}}#jAsk input{{flex:1;border:1px solid var(--hair);border-radius:999px;padding:11px 18px;font:15px var(--sans);background:#fff;color:var(--ink)}}
#jAsk input:focus{{outline:2px solid rgba(11,31,92,.25);border-color:var(--navy)}}#jAsk .btn{{border-radius:999px;padding:0 22px}}
.jh-grid{{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:16px;margin-top:8px}}
.jh-card{{background:#fff;border:1px solid var(--hair);border-top:3px solid var(--sand);border-radius:10px;padding:18px 18px 16px;display:flex;flex-direction:column;gap:12px}}
.jh-card.on{{border-top-color:var(--navy)}}.jh-top{{display:flex;justify-content:space-between;gap:10px;align-items:baseline}}
.jh-card h3{{font-family:var(--serif);font-weight:400;font-size:21px;margin:0;color:var(--ink);letter-spacing:0;text-transform:none}}.jh-src{{font-size:12px;color:var(--soft);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:45%}}
.jh-figs{{display:grid;grid-template-columns:1fr 1fr;gap:10px 14px}}.jh-figs span{{display:block;font-size:12px;color:var(--soft)}}.jh-figs b{{font-family:var(--serif);font-weight:400;font-size:24px;color:var(--navy)}}
.jh-meta{{font-size:12.5px;color:var(--soft);line-height:1.5}}.jh-act{{display:flex;gap:8px;margin-top:auto}}.jh-new{{border-style:dashed;border-top-style:solid;background:transparent}}.jh-new p{{color:var(--soft);font-size:13.5px;margin:0}}.jh-none{{color:var(--soft);margin:0}}
/* ===== calmer pages: sentence case, no spaced capitals ===== */
.tab{{text-transform:none!important;letter-spacing:0!important;font-size:14px!important;font-weight:600}}
.card h2,.sbhead h2,.kpi .l,.kv b,th,table.t th{{text-transform:none!important;letter-spacing:.01em!important}}
.card h2,.sbhead h2{{font-size:15px!important;color:var(--ink)!important}}.card h2::before{{display:none!important}}
.btn,.f,.f label,.ksub,.k-ready,.pill,.pr-nav-i,.pr-nav-s,.pr-head,.pr-sub,.tab-model,.chat-head,.chat-fab,.kset-nav button,.llm,.rt,.kchart-src,.fw-rl,.fw-h,.fx-h,.as-axl,.cr-ll,.brand small,.msg.divider{{text-transform:none!important;letter-spacing:0!important}}
.pr-nav-i{{font-size:13.5px!important;font-weight:600!important}}.pr-head,.pr-sub{{font-size:13px!important}}.btn{{font-weight:600}}
.ksub>span:first-child{{display:none!important}}   /* no "AI agent · financial modelling" line beside the lockup */
body:not(.jdbg) #dbgWin{{display:none!important}}   /* the model debug is a tool for the analyst: it opens from its button, it does not float over a client demo */
/* ===== decks and reports: Jadwa's annual report (navy pages with sand shards, light navy headings, navy table bands) ===== */
.tag,.k-doc .tag{{display:none!important}}.fig,.k-doc .fig{{border-bottom-width:1px!important;border-bottom-style:dotted!important;font-weight:600}}   /* no badge under every figure: the source stays one click away and in the appendix */
.k-stat-l,.kd-root .kd-stat-l,.k-doc th,.k-doc table.t th{{text-transform:none!important;letter-spacing:.02em!important}}
.kd-root,.k-doc{{font-family:var(--sans)}}
.kd-root .kd-fb-orange,.kd-root .kd-fb-dark{{background:{NAVY}}}.kd-fb-tex{{display:none}}
.kd-root .kd-fb-band{{top:auto;bottom:auto;right:auto;opacity:1;animation-name:jShard}}
.kd-root .kd-fb-band.w1{{left:-4vw;top:-6vh;width:38vw;height:58vh;background:rgba(183,166,143,.5);clip-path:polygon(0 0,100% 0,100% 22%,34% 100%,0 100%)}}
.kd-root .kd-fb-band.w2{{left:10vw;top:-12vh;width:30vw;height:72vh;background:rgba(183,166,143,.28);clip-path:polygon(0 0,100% 0,62% 100%,0 72%)}}
.kd-root .kd-fb-band.a{{right:-6vw;top:-8vh;width:40vw;height:62vh;background:rgba(183,166,143,.42);clip-path:polygon(0 0,100% 0,100% 100%,56% 100%,0 26%)}}
.kd-root .kd-fb-band.b{{right:14vw;top:-14vh;width:28vw;height:76vh;background:rgba(183,166,143,.22);clip-path:polygon(0 0,100% 0,100% 70%,40% 100%)}}
@keyframes jShard{{from{{opacity:0;transform:translate(-4%,-6%)}}to{{opacity:1;transform:none}}}}
/* titles as Jadwa sets them: the cover and the dividers in the site's serif, title case, light; slide and section headings in a light
   sans, title case, navy; no caption lines, bars or rules above or under them */
.kd-root .kd-kicker,.kd-root .kd-kbar,.kd-root .kd-rule,.kd-root .kd-sweep,.k-kick,.k-rule{{display:none!important}}
.kd-root .kd-cover-title,.kd-root .kd-div-title{{font-family:var(--serif);font-weight:400;text-transform:none;letter-spacing:0;line-height:1.1}}
.kd-root .kd-cover-title{{font-size:clamp(34px,5.4vw,80px);margin:0 0 14px}}.kd-root .kd-div-title{{font-size:clamp(36px,5.6vw,82px);max-width:16ch}}
.kd-root .kd-div-sub{{color:var(--sand);letter-spacing:.08em;text-transform:none;font-size:clamp(13px,1.2vw,17px);font-weight:400;margin-top:12px}}
.kd-root .kd-cover-sub{{font-size:clamp(14px,1.3vw,19px);color:rgba(255,255,255,.82)}}
.kd-root .kd-h2,.k-chart .kd-h2{{font-family:var(--sans);font-weight:300;text-transform:none;letter-spacing:0;color:var(--navy)}}
.kd-root .kd-h2{{font-size:clamp(26px,3.2vw,46px);line-height:1.15}}.kd-root .kd-h2.kd-or{{color:var(--navy)}}
.kd-root .kd-sub{{letter-spacing:0;text-transform:none;font-size:clamp(13px,1.1vw,16px);color:var(--soft)}}
.kd-root .kd-stat-l,.k-stat-l{{letter-spacing:.06em;font-weight:600;font-size:11px;color:var(--soft)}}
.kd-root .kd-close-tag .kd-tagline{{font-family:var(--serif);text-transform:none;letter-spacing:0;font-weight:400}}
.k-cover h1{{font-family:var(--serif);font-weight:400;font-size:40px;line-height:1.1;margin:0 0 10px}}.k-csub{{font-size:14px;opacity:.85}}
.k-sh{{font-family:var(--sans);font-weight:300;font-size:26px}}.k-chart .kd-h2{{font-size:20px}}.k-chart .kd-sub{{letter-spacing:0;text-transform:none}}
/* the figures in the same face as the titles: the serif, light, with lining tabular numerals */
.kd-root .kd-stat-v,.k-stat-v,.kd-root .kd-svgnum,.k-doc .kd-svgnum,.kd-root .kd-ring-v,.k-doc .kd-ring-v,.kd-root .kd-kpi-v,.k-doc .kd-kpi-v,.kd-root .kd-hval,.k-doc .kd-hval,.k-doc .kpi .v,.kd-root .kd-count,.k-doc .kd-stat-v{{font-family:var(--serif);font-weight:400;font-variant-numeric:lining-nums tabular-nums}}
.kd-root .kd-svglab,.k-doc .kd-svglab{{font-family:var(--sans);font-weight:400;letter-spacing:0}}
.kd-root .kd-stat-v{{font-size:clamp(30px,3.1vw,46px)}}.k-stat-v{{font-size:32px}}
/* the mark, used more: on every section heading, as a watermark on the navy pages, on the content slides' corner */
.k-sh::before{{content:"";display:inline-block;width:22px;height:22px;margin-right:12px;background:url("{SAPLING_SAGE}") center/contain no-repeat;flex:none}}
.k-cover,.k-close{{background-image:url("{SAPLING_WHITE}"),url("{SHARDS}");background-size:34% auto,100% 100%;background-position:right -4% bottom -18%,center;background-repeat:no-repeat,no-repeat}}
.k-cover .k-mark{{position:absolute;top:22px;right:26px;z-index:1}}
.kd-root .kd-fb-orange,.kd-root .kd-fb-dark{{background-image:url("{SAPLING_WHITE}");background-size:30vh auto;background-position:right 4vw bottom -6vh;background-repeat:no-repeat}}
.kd-root .kd-bg{{background:url("{SAPLING_SAND}") right 3vw bottom 8vh/22vh auto no-repeat,url("{SHARDS_LIGHT}") right top/70% 36vh no-repeat}}
.kd-root{{background:#fbfaf7 url("{GRID}") left bottom/120px no-repeat}}.kd-root .kd-bg{{background:url("{SHARDS_LIGHT}") right top/70% 36vh no-repeat}}.kd-root .kd-grid,.kd-root .kd-tex{{display:none}}.kd-kicker-w{{color:var(--sand)}}
.kd-root .kd-on-orange .kd-footline b,.kd-root .kd-on-dark .kd-footline b{{color:var(--sand)}}.kd-footline b{{color:var(--navy)}}
.k-cover{{background:{NAVY} url("{SHARDS}") center/100% 100% no-repeat;text-align:left;padding:72px 40px 56px;overflow:hidden;min-height:200px}}
.k-cover>*{{position:relative;z-index:1}}.k-kick{{color:var(--sand)}}.k-cover h1{{text-transform:none;font-weight:600;font-size:32px;letter-spacing:0}}.k-rule{{margin-left:0;background:var(--sand)}}
.k-sh{{font-size:22px;letter-spacing:0;text-transform:none;font-weight:400;color:var(--navy);border-top:1px solid rgba(11,31,92,.35);padding-top:14px;margin-bottom:16px}}.k-sh .k-bar{{display:none}}
.k-stats{{border-top-color:var(--navy)}}.k-stat-l{{color:var(--soft);letter-spacing:.14em}}.k-stat-v{{font-weight:600}}
.k-doc table.t th,table.t th{{background:{NAVY};letter-spacing:.06em;font-size:10.5px;text-transform:none;font-weight:600}}
.k-doc table.t td{{border-top-color:rgba(11,31,92,.14)}}
.k-close{{background:{NAVY} url("{SHARDS}") center/100% 100% no-repeat;position:relative}}.k-tag{{color:var(--sand)}}
.k-sec{{background:url("{GRID}") left bottom/90px no-repeat,url("{SHARDS_LIGHT}") right top/60% 140px no-repeat}}
.k-doc{{background:#fbfaf7}}.k-head{{background:#fff}}
#report.rtl .k-cover{{text-align:right}}#report.rtl .k-rule{{margin-left:auto;margin-right:0}}#report.rtl .k-sh{{flex-direction:row-reverse}}#report.rtl .k-fact td.n{{text-align:left}}
.report h1{{font-family:var(--sans);font-weight:400}}.report .rk b{{font-family:var(--sans);font-weight:600;color:var(--navy)}}
"""

FONTS = '<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;500;600&family=Nunito+Sans:wght@300;400;600;700&family=IBM+Plex+Sans+Arabic:wght@400;600;700&display=swap" rel="stylesheet">'

# the opening: the square appears and the tree grows up from its trunks, then a fade into the app (the page's own timing
# script decides when: at least 2.6 s, or until the app is ready)
SPLASH = ('<div id="ksplash" role="status" aria-live="polite" aria-label="Loading Jadwa financial modelling"><style>'
          '#ksplash{position:fixed;inset:0;z-index:2147483000;overflow:hidden;background:#fff;display:grid;place-items:center;transition:opacity .55s ease}'
          '#ksplash.ks-leave{opacity:0;pointer-events:none}'
          '#ksplash .ks-halo{position:relative;width:min(44vmin,210px);height:min(44vmin,210px);display:grid;place-items:center;border-radius:50%;background:radial-gradient(circle,rgba(135,131,120,.14) 0,rgba(135,131,120,.06) 48%,rgba(255,255,255,0) 70%);animation:jHalo 1.4s ease .1s both}'
          '@keyframes jHalo{from{opacity:0;transform:scale(.8)}to{opacity:1;transform:none}}'
          f'#ksplash .ks-sq{{width:min(26vmin,124px);height:min(26vmin,124px);background:{SAGE};overflow:hidden;animation:jSq .9s cubic-bezier(.2,.8,.2,1) .15s both;box-shadow:0 18px 40px rgba(47,51,47,.14)}}'
          '@keyframes jSq{from{opacity:0;transform:scale(.86)}to{opacity:1;transform:none}}'
          '#ksplash .ks-sq svg{width:100%!important;height:100%!important}'
          '#ksplash .ks-sq rect{transform-box:fill-box;transform-origin:50% 100%;transform:scaleY(0);animation:jGrow 1.25s cubic-bezier(.45,0,.2,1) .55s forwards}'
          '@keyframes jGrow{to{transform:scaleY(1)}}'
          '@media(prefers-reduced-motion:reduce){#ksplash .ks-sq rect{animation:none;transform:none}#ksplash .ks-halo,#ksplash .ks-sq{animation:none}}'
          '</style><div class="ks-halo"><div class="ks-sq">' + square_svg(124, label=False) + '</div></div>')

# the app's own vector (decks, reports, emails' preview) and the title mark, redrawn for Jadwa; the header mark re-rendered
SCRIPT = f"""<script>
window.BOHIO_BRAND='jadwa';
function klogo(h=34,c='#fff'){{const col=/^#?f{{3,6}}$/i.test(String(c).replace('#',''))||/^(#fff|#ffffff|white)$/i.test(c)?'#ffffff':'{SAGE}',W=Math.round(h*{LOGO_AR:.4f});return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="{LOGO_VB}" width="${{W}}" height="${{h}}" role="img" aria-label="Jadwa Investment" style="display:block;width:${{W}}px;height:${{h}}px"><g fill="${{col}}">{LOGO_PATHS}</g></svg>`}}
/* ready reports in Jadwa's vocabulary: one sentence in the designer, or the list, gives the finished document */
try{{for(const [id,d] of Object.entries({{
  jfact:{{name:'Fund fact sheet',aud:'Unit holders',sched:'On request',builtin:true,purpose:'The fund on one page as the annual report shows each property: the figures with their cells, the case, the timeline, the investor returns',blocks:['wb_factsheet','wb_investors','portfolio_allocation']}},
  junit:{{name:'Unit-holder quarterly update',aud:'Unit holders',sched:'Quarterly',builtin:true,purpose:'What changed this quarter: headline figures against the previous export, the fact sheet, the what-ifs tested, its share of the portfolio',blocks:['kpis','kpis_prev','wb_factsheet','wb_whatifs','portfolio_allocation']}},
  jinvestor:{{name:'Fund investor report',aud:'Fund investors',sched:'Quarterly',builtin:true,purpose:'For the fund\u2019s investors: the headline returns, each class\u2019s returns and distributions, the fund manager\u2019s fees and performance fee, all as the workbook reports them; the fact sheet, debt and cover, the what-ifs tested and the documents behind the figures',blocks:['kpis','wb_investors','wb_factsheet','wb_debt','wb_whatifs','wb_documents','portfolio_allocation']}},
  jlender:{{name:'Lender pack',aud:'Lenders',sched:'On request',builtin:true,purpose:'The facility, cover and covenants from the workbook, the cash flow and the stress cases',blocks:['kpis','wb_debt','cashflow_annual','stress_table','headroom','wb_sensitivity']}},
  jevidence:{{name:'Deal evidence',aud:'Investment committee',sched:'On request',builtin:true,purpose:'The model against its documents: every term and provision its contracts (a fund\u2019s LPA, a facility or murabaha agreement, a lease; English or Arabic), term sheets and valuations state, with the quote and what it means for the model, next to the model\u2019s cell or proved on its behaviour (fee basis, waterfall, covenants period by period, dates); what moves the results and which tested ranges break a covenant; the what-ifs that came from them; the model debug\u2019s findings',blocks:['wb_factsheet','wb_documents','wb_sensitivity','wb_whatifs','wb_debug']}}
}})){{if(!RPTS[id])wireReport(id,d)}}if(typeof renderReportList==='function')renderReportList();if(typeof renderDocs==='function')renderDocs()}}catch(e){{}}
function kchev(h=30,c=KD.OR){{const id='jt'+(window.__jt=(window.__jt||0)+1);return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="{SYM_VB}" width="${{h}}" height="${{h}}" aria-hidden="true" style="display:inline-block;vertical-align:middle;width:${{h}}px;height:${{h}}px"><defs><mask id="${{id}}"><rect width="1051.42" height="1051.43" fill="#fff"/><path fill="#000" transform="{SYM_TR}" d="{SYM_D}"/></mask></defs><rect width="1051.42" height="1051.43" fill="${{c}}" mask="url(#${{id}})"/></svg>`}}
</script>"""

HOME_JS = '\n/* Jadwa\'s first screen: "Your models", one card per model (its own figures, its versions, its documents) with ask, open and\n   report; and an ask bar on every page. Jadwa works on Excel alone: the daily feed of exports and emails is not its start. */\n(function(){try{\n  const anchor=document.querySelector(\'#p-appr\');if(!anchor)return;\n  const home=document.createElement(\'section\');home.className=\'pane\';home.id=\'p-home\';home.innerHTML=\'<div class="jh-grid" id="jhGrid"></div>\';anchor.parentNode.insertBefore(home,anchor);\n  TABS.unshift([\'home\',\'Your models\']);TAB_INTRO.home=\'Every model in the workspace, from its own workbook. Ask about any of them, open it, or build its report.\';\n  const tabs=document.querySelector(\'#tabs\');if(tabs){const t=document.createElement(\'div\');t.className=\'tab\';t.dataset.t=\'home\';t.textContent=\'Your models\';t.onclick=()=>showTab(\'home\');tabs.insertBefore(t,tabs.querySelector(\'.tab\'))}\n  const bar=document.createElement(\'form\');bar.id=\'jAsk\';bar.setAttribute(\'role\',\'search\');bar.innerHTML=\'<input id="jAskIn" autocomplete="off" aria-label="Ask the agent"><button class="btn" type="submit">Ask</button>\';\n  if(tabs&&tabs.parentNode)tabs.parentNode.insertBefore(bar,tabs.nextSibling);\n  const ph=()=>{const i=document.getElementById(\'jAskIn\');if(i)i.placeholder=\'Ask about \'+(PROJ&&PROJ.name?PROJ.name:\'your models\')+\': “what if the exit cap rate is 7.5%?”, “where does the IRR come from?”\'};\n  bar.addEventListener(\'submit\',e=>{e.preventDefault();const i=document.getElementById(\'jAskIn\'),q=i.value.trim();if(!q)return;i.value=\'\';try{toggleDock(true)}catch(_){}setTimeout(()=>webAsk(q),60)});\n  const fmt=(k,v,cy)=>!Number.isFinite(v)?\'—\':/irr|profit_on_cost/.test(k)?v.toFixed(2)+\'%\':k===\'equity_multiple\'?v.toFixed(2)+\'x\':fMc(v,cy);\n  window.renderHome=function(){const g=document.getElementById(\'jhGrid\');if(!g)return;const ps=activeProjects();\n    const card=p=>{const x=latestExport(p.id),o=(x&&x.out)||{},cy=(x&&x.meta&&x.meta.currency)||p.currency||\'\';const V=(MVERS[p.id]||[]).filter(v=>!v.base&&x&&v.ex===x.id),lv=V[V.length-1],D=(typeof DOCS!==\'undefined\'&&DOCS[p.id])||[];\n      const rows=[[\'levered_irr\',\'Levered IRR\'],[\'unlevered_irr\',\'Unlevered IRR\'],[\'profit_on_cost\',\'Profit on cost\'],[\'net_profit\',\'Net profit\'],[\'equity_multiple\',\'Equity multiple\']].filter(([k])=>Number.isFinite(o[k])).slice(0,4);\n      return \'<article class="jh-card\'+(p.id===PROJ.id?\' on\':\'\')+\'" data-p="\'+esc(p.id)+\'"><div class="jh-top"><h3>\'+esc(p.name)+\'</h3><span class="jh-src">\'+(x?(x.src===\'file\'?esc(x.file||\'workbook\'):\'demo model\'):\'no model yet\')+\'</span></div>\'\n        +\'<div class="jh-figs">\'+(rows.map(([k,l])=>\'<div><span>\'+l+\'</span><b>\'+esc(fmt(k,o[k],cy))+\'</b></div>\').join(\'\')||\'<p class="jh-none">No figures yet: upload the workbook.</p>\')+\'</div>\'\n        +\'<div class="jh-meta">\'+(x?\'Version \'+esc(x.id):\'\')+(V.length?\' · \'+V.length+\' what-if\'+(V.length>1?\'s\':\'\')+\' tested\':\'\')+(D.length?\' · \'+D.length+\' document\'+(D.length>1?\'s\':\'\'):\'\')+(lv?\'<br>Last: \'+esc(String(lv.label).slice(0,90)):\'\')+\'</div>\'\n        +\'<div class="jh-act"><button class="btn" data-jh="ask">Ask</button><button class="btn ghost" data-jh="open">Open</button><button class="btn ghost" data-jh="report">Report</button></div></article>\'};\n    g.innerHTML=ps.map(card).join(\'\')+\'<article class="jh-card jh-new"><h3>Add a model</h3><p>Upload an Excel model: it is read, mapped and recalculated exactly, ready to ask about.</p><div class="jh-act"><button class="btn" data-jh="new">Upload a workbook</button></div></article>\'};\n  document.addEventListener(\'click\',e=>{const b=e.target.closest&&e.target.closest(\'[data-jh]\');if(!b)return;const a=b.dataset.jh,c=b.closest(\'[data-p]\'),id=c&&c.dataset.p;\n    if(a===\'new\'){openNewProject();return}if(id&&id!==PROJ.id)switchProject(id);ph();\n    if(a===\'ask\'){try{toggleDock(true)}catch(_){}setTimeout(()=>{const i=document.getElementById(\'ask\');if(i)i.focus()},120)}else if(a===\'open\')showTab(\'em\');else if(a===\'report\')showTab(\'report\')});\n  const st=showTab;showTab=function(id){const r=st(id);try{ph();if(id===\'home\'){document.body.classList.add(\'gpage\');renderHome()}}catch(_){}return r};\n  const rp=renderProjectUI;renderProjectUI=function(){const r=rp.apply(this,arguments);try{ph();if(document.getElementById(\'p-home\').classList.contains(\'on\'))renderHome()}catch(_){}return r};\n  document.addEventListener(\'click\',e=>{if(e.target.closest&&e.target.closest(\'#exDbg\'))document.body.classList.add(\'jdbg\')},true);\n  ph();showTab(\'home\');\n}catch(e){try{console.warn(\'jadwa home\',e)}catch(_){}}})();\n'

# the charts in Jadwa's colours, as the annual report draws them: navy for the figure that stands, sand for what is deducted or to
# watch, sage for what fails or is neutral, the blue of the site's links fourth; no red, no green, no orange
NAVY_LIGHT, SAND_LIGHT = '#8fa0d6', '#d6cdbd'
KD = ("const KD={OR:'%s',CH:'%s',INK:'%s',SOFT:'%s',TAUPE:'%s',GREY:'%s',FAINT:'rgba(47,51,47,.12)',GOOD:'%s',WARN:'%s',CRIT:'%s',"
      "PAL:['%s','%s','%s','%s','%s','%s'],site:'www.jadwa.com',tagline:'EXPANDING INVESTMENT HORIZONS',caption:'AI agent on EstateMaster'};"
      % (NAVY, INK, INK, SOFT, SAGE, SAND, NAVY, SAND, SAGE, NAVY, SAND, SAGE, BLUE, NAVY_LIGHT, SAND_LIGHT))

# sentences about the company itself (the rest of the texts carry only the name)
# Jadwa runs on Excel alone: every EstateMaster phrase becomes the workbook's (longest first, so the specific wins)
EM_WORDS = [
    ("<h2>EstateMaster exports</h2>", "<h2>Workbook versions</h2>"), ("<th>Export</th><th>Option / stage</th>", "<th>Version</th><th>Case</th>"),
    ("<th>Option / stage</th><th>Export</th>", "<th>Case</th><th>Version</th>"),
    ("comes from the full EstateMaster model; on this uploaded workbook it shows as", "is not a section of this workbook; it shows as"),
    ("needs the full EstateMaster model, which this uploaded workbook is not, so it is left out here", "is not in this workbook, so it is left out here"),
    ("drawn from the full EstateMaster model, which this uploaded workbook is not", "not in this workbook"),
    ("They come from the full EstateMaster model; ask me", "They are not in this workbook; ask me"),
    ("This project is an uploaded workbook, not a full EstateMaster model: only", "Only"),
    ("EstateMaster\u2019s own figure", "the workbook\u2019s own figure"), ("EstateMaster\u2019s own cash flow", "the workbook\u2019s own cash flow"),
    ("EstateMaster\u2019s own", "the workbook\u2019s own"), ("EstateMaster\u2019s", "the workbook\u2019s"), ("EstateMaster's", "the workbook's"),
    ("EstateMaster exports", "workbook versions"), ("EstateMaster export", "workbook version"), ("EstateMaster figures", "the workbook\u2019s figures"),
    ("EstateMaster figure", "workbook figure"), ("EstateMaster model", "Excel model"), ("EstateMaster outputs", "the workbook\u2019s outputs"),
    ("AI agent on EstateMaster", "AI agent on the model"), ("ARGUS EstateMaster figures and", "the"), ("EstateMaster is the trusted layer", "the workbook is the trusted layer"),
    ("from EstateMaster", "from the workbook"), ("(export ${x.id}", "(version ${x.id}"), (" (export ${x.id})", " (version ${x.id})"), ("option ${optOf(x)})", "case ${optOf(x)})"), ("No return figures found in the export.", "No return figures found in the workbook."), ("No exports yet", "No workbook versions yet"), ("No exports", "No workbook versions"), ("exports yet", "workbook versions yet"), ("by the latest export", "by the latest version"), ("latest export", "latest version"), ("in EstateMaster", "in the workbook"), ("EstateMaster", "the Excel model"),
]
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
    for a, b in EM_WORDS:
        s = s.replace(a, b)
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
    html = re.sub(r'<div class="klogo">.*?</div>', lambda _: f'<div class="klogo">{lockup_svg(SAGE, 46)}</div>', html, count=1, flags=re.S)
    _n = iter(range(1, 999))
    chev = None
    html = re.sub(r'<svg xmlns="http://www.w3.org/2000/svg" viewBox="935\.84 30\.03 24\.66 38\.05"[^>]*>.*?</svg>', lambda _: tree_svg(SAGE, 1, f"jtc{next(_n)}"), html, flags=re.S)
    # the brand constants and the deck font
    html, n = re.subn(r"const KD=\{OR:'#f15a22'.*?caption:'AI agent on EstateMaster'\};", KD, html, count=1)
    assert n == 1, "KD not found"
    html = html.replace('<link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@300;400;500;600;700&display=swap" rel="stylesheet">', FONTS)   # the standalone report's own font link
    html = html.replace("Montserrat,'Segoe UI'", "'Nunito Sans','Segoe UI'").replace('font-family="Montserrat,Arial"', 'font-family="Playfair Display,Georgia,serif"')
    html = html.replace('<div class="k-cover">', '<div class="k-cover"><span class="k-mark">' + MARK.replace('width="40" height="40"', 'width="48" height="48"').replace('width:40px;height:40px', 'width:48px;height:48px') + '</span>', 1)   # the deck's and the report's own font lines
    rcss = (f":root{{--serif:'Playfair Display',Georgia,'Times New Roman',serif;--sans:'Nunito Sans','IBM Plex Sans Arabic',-apple-system,'Segoe UI',Tahoma,sans-serif;--navy:{NAVY};--sand:{SAND};--sage:{SAGE};--soft:{SOFT};--ink:{INK};--jblue:{BLUE}}}"
            + CSS[CSS.index("/* ===== decks and reports"):])   # the standalone report is its own page: the variables travel with the rules   # the report theme also goes into the standalone report (its own page, with KD_CSS only)
    assert "`" not in rcss and "${" not in rcss
    html, n = re.subn(r"(const KD_CSS=`[^`]*)`", lambda m: m.group(1) + rcss + "`", html, count=1)   # after its own rules, so these win
    assert n == 1, "KD_CSS not found"
    html = html.replace('const FONT = "Montserrat,\'Segoe UI\',Roboto,Helvetica,Arial,sans-serif";', 'const FONT = "Nunito Sans,\'Segoe UI\',Roboto,Helvetica,Arial,sans-serif";', 1)
    # KINAN's colours wherever a stylesheet writes them in full
    for a, b in (("#f15a22", NAVY), ("rgba(241,90,34", "rgba(11,31,92"), ("#b83d0c", NAVY_DEEP), ("#fff1ea", SAND_SOFT), ("#d94a16", NAVY_DEEP), ("#f5602a", "#102566"), ("#e04f22", NAVY_DEEP), ("#2e2e2f", INK), ("rgba(245,96,42", "rgba(16,37,102"), ("rgba(224,79,34", "rgba(7,21,66"), ("'F15A22'", "'0B1F5C'"), ("'2E2E2F'", "'2F332F'"), ("#1baf7a", SAGE), ("#e87ba4", NAVY_LIGHT), ("#eda100", SAND), ("#ff7a45", "#2a3f8f"), ("#2a78d6", BLUE), ("#1b7a4f", NAVY), ("#1b7a43", NAVY)):   # the PowerPoint export writes its colours without #
        html = html.replace(a, b)
    i, j = html.index('/*MAILUI-SYNC-START*/'), html.index('/*MAILUI-SYNC-END*/') + len('/*MAILUI-SYNC-END*/')   # the email preview in Jadwa's look, with its logo
    html = html[:i] + mail_block((_BR.parents[1] / 'api' / '_lib' / 'mailui.js').read_text(encoding='utf-8')) + html[j:]
    html = words(html)
    i = html.rindex("</body>")   # after the app's own script, so the Jadwa klogo/kchev are the ones that stand (a later declaration wins)
    html = html[:i] + SCRIPT + "\n<script>" + HOME_JS + "</script>\n" + html[i:]
    assert "KINAN" not in html, "KINAN left in the page"
    return html


def mail_kit(src):
    """the email design kit (api/_lib/mailui.js) in Jadwa's look: navy band and actions, sand rules, sage labels, Nunito Sans"""
    for a, b in (("ink: '#2e2e2f'", f"ink: '{NAVY}'"), ("taupe: '#51473d'", f"taupe: '{SAGE}'"), ("or: '#f15a22'", f"or: '{SAND}'"), ("orFill: '#b83d0c'", f"orFill: '{NAVY}'"),
                 ("orTint: '#fff1ea'", f"orTint: '{SAND_SOFT}'"), ("bg: '#efeeeb'", f"bg: '{PALE}'"), ("Montserrat,'Segoe UI'", "'Nunito Sans','Segoe UI'"),
                 ('alt="KINAN"', 'alt="Jadwa Investment"'), ("`kinan${atts.length + 1}@bohio`", "`jadwa${atts.length + 1}@bohio`"), ("`kinan-${atts.length + 1}.", "`jadwa-${atts.length + 1}.")):
        assert a in src, ("mail kit: " + a)
        src = src.replace(a, b)
    return words(src)


def logo_js():
    """the email logo module (api/_lib/logo.js) with Jadwa's official lockup, rendered at 4x (white for the band, sage for white)"""
    import base64
    w, h = round(34 * LOGO_AR), 34
    b64 = {n: base64.b64encode((_BR / f"mail-{n}.png").read_bytes()).decode() for n in ("white", "ink")}
    return ("// Jadwa's logo for emails: the official lockup (brand/jadwa) rendered to PNG at 4x, white for the navy band, sage for white.\n"
            f"module.exports = {{\n  white: '{b64['white']}',\n  ink: '{b64['ink']}',\n  w: {w}, h: {h},\n}};\n")


def mail_block(mailui_src):
    """the page's own copy of the email kit (index.html's MAILUI block), rebuilt from the Jadwa kit and logo"""
    src = mail_kit(mailui_src)
    lit = re.search(r"module\.exports = (\{[\s\S]*?\});", logo_js()).group(1)
    src = src.replace("const LOGO = require('./logo');", f"const LOGO = {lit};")
    exp = re.search(r"module\.exports = (\{[^}]*\});", src)
    return '/*MAILUI-SYNC-START*/\nconst MAILUI=(()=>{\n' + src[:exp.start()] + f"return {exp.group(1)};" + '\n})();\n/*MAILUI-SYNC-END*/'


def guide(html):
    html = html.replace("#f15a22", NAVY).replace("rgba(241,90,34", "rgba(11,31,92")
    return words(html)
