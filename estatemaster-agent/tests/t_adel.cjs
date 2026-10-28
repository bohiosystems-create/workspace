// The Adel Real Estate edition (tools/brand_adel.py, built on the Jadwa edition): Adel's name, colours, Cairo, its lockup and stripes mark,
// its tab icon and its emails; nothing of Jadwa's or KINAN's left in the page, the guide or the email kit.
const fs = require('fs'), path = require('path'), { execSync } = require('child_process');
const APP = path.join(__dirname, '..'), D = path.join(APP, 'dist/adel-readonly');
let pass = 0, fail = 0; const ok = (c, m, d) => { if (c) { pass++; console.log('PASS | ' + m) } else { fail++; console.log('FAIL | ' + m + (d !== undefined ? ' → ' + JSON.stringify(d).slice(0, 400) : '')) } };
if (!fs.existsSync(path.join(D, 'index.html'))) execSync('python3 tools/build_options.py', { cwd: APP, stdio: 'ignore' });
const s = fs.readFileSync(path.join(D, 'index.html'), 'utf8'), g = fs.readFileSync(path.join(D, 'guide.html'), 'utf8');
const mail = fs.readFileSync(path.join(D, 'api/_lib/mailui.js'), 'utf8'), logo = fs.readFileSync(path.join(D, 'api/_lib/logo.js'), 'utf8');
ok(/<title>Adel · AI agent · financial modelling<\/title>/.test(s), 'the page is titled for Adel');
ok(!/Jadwa|KINAN/.test(s.replace(/BOHIO_BRAND/g, '')) && !/Jadwa|KINAN/.test(g) && !/Jadwa|KINAN/.test(mail), 'no Jadwa or KINAN wording in the page, the guide or the email kit');
ok(/family=Cairo/.test(s) && !/Playfair|Nunito/.test(s), 'Cairo is the font, none of Jadwa\'s');
ok(!/#0b1f5c|#b7a68f|#878378|#5160d2|#f15a22|rgba\(11,31,92/i.test(s), 'none of Jadwa\'s or KINAN\'s colours is left');
ok(/#3d3935/i.test(s) && /#caa862/i.test(s), 'the charcoal and the gold are the palette');
ok(/<link rel="icon" type="image\/png" href="data:image\/png;base64,/.test(s), 'the tab icon is Adel\'s stripes');
ok((s.match(/alt="Adel Real Estate"/g) || []).length >= 2 && /function klogo/.test(s), 'the header and the deck draw Adel\'s lockup');
ok(!/viewBox="0 0 1051\.42 1051\.43"/.test(s), 'no sapling left in the page');
ok(/module\.exports = \{\s*white: '[A-Za-z0-9+\/=]{1000,}'/.test(logo) && /ink: '[A-Za-z0-9+\/=]{1000,}'/.test(logo), 'the emails carry Adel\'s logo (white and charcoal)');
ok(/window\.BOHIO_BRAND='jadwa'/.test(s), 'it keeps the financial-modelling feature set of the Jadwa edition');
// nothing of Jadwa's artwork: its lockup's outlines and its sapling's outline appear nowhere in the build
{const br = path.join(APP, 'brand/jadwa'), lg = fs.readFileSync(path.join(br, 'logo.svg'), 'utf8').match(/ d="([^"]{80,})"/), sy = fs.readFileSync(path.join(br, 'symbol.svg'), 'utf8').match(/ d="([^"]{80,})"/);
  const all = [s, g, mail, logo].join('\n');
  ok(lg && sy && !all.includes(lg[1].slice(0, 80)) && !all.includes(sy[1].slice(0, 80)), 'Jadwa\'s lockup and sapling artwork are nowhere in the Adel build')}
ok(/\.tabs\{background:#3d3935!important;box-shadow:0 0 0 100vmax #3d3935/.test(s)&&/header\.kband\{background:#3d3935/.test(s)&&/#ksplash\{background:#3d3935/.test(s)&&/#ksplash \.ks-halo\{background:none/.test(s),'one charcoal for the opening, the band and the navigation (no second shade, no glow)');
console.log(`${pass} pass, ${fail} fail`); process.exit(fail ? 1 : 0);
