// The Jadwa edition has no orange: no rule for a hovered, focused, pressed or selected element (and no deck button) may use an orange
// colour left over from KINAN's look. Builds the editions first (tools/build_options.py) when dist/ is missing.
const fs = require('fs'), path = require('path'), { execSync } = require('child_process');
const APP = path.join(__dirname, '..'), F = path.join(APP, 'dist/jadwa-readonly/index.html');
let pass = 0, fail = 0; const ok = (c, m, d) => { if (c) { pass++; console.log('PASS | ' + m) } else { fail++; console.log('FAIL | ' + m + (d !== undefined ? ' → ' + JSON.stringify(d).slice(0, 600) : '')) } };
if (!fs.existsSync(F)) execSync('python3 tools/build_options.py', { cwd: APP, stdio: 'ignore' });
const s = fs.readFileSync(F, 'utf8');
const hue = (r, g, b) => { r /= 255; g /= 255; b /= 255; const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn; if (!d) return null;
  const sat = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn); let h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h = (h * 60 + 360) % 360; return { h, sat, l } };
const orange = c => { let r, g, b, m; if ((m = c.match(/^#([0-9a-f]{6})$/i))) { r = parseInt(m[1].slice(0, 2), 16); g = parseInt(m[1].slice(2, 4), 16); b = parseInt(m[1].slice(4), 16) }
  else if ((m = c.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/))) { [r, g, b] = [+m[1], +m[2], +m[3]] } else return false; const x = hue(r, g, b); return !!x && x.h >= 10 && x.h <= 40 && x.sat > 0.5 && x.l > 0.3 && x.l < 0.9 };
const bad = [];
for (const m of s.matchAll(/([^{}]*(?::hover|:focus|:active|\.on\b|\.kd-primary|\.kd-vm-play|#rplay)[^{}]*)\{([^{}]*)\}/g)) {
  for (const c of m[2].match(/#[0-9a-fA-F]{6}\b|rgba?\([^)]*\)/g) || []) if (orange(c)) bad.push(m[1].trim().slice(-80) + ' { ' + c + ' }') }
ok(!bad.length, 'Jadwa: no hovered, focused, pressed or selected element is orange', bad.slice(0, 8));
ok(/\.kd-primary:hover:not\(:disabled\)\{background:#(?![fF][fF]6[aA]37)/.test(s), 'the deck’s main button keeps a Jadwa colour on hover');
// the icon in the tab and the address bar is the company's own: KINAN's chevron in every KINAN build, Jadwa's square in Jadwa's
const icon = f => { const m = fs.readFileSync(path.join(APP, f), 'utf8').match(/<link rel="icon" type="image\/svg\+xml" href="([^"]*)"/); return m ? decodeURIComponent(m[1].replace(/%23/g, '#')) : '' };
for (const f of ['index.html', 'dist/option2-readonly/index.html', 'dist/option3-analyst/index.html']) { const u = icon(f); ok(/#f15a22/i.test(u) && !/#878378/.test(u), `${f}: the tab icon is KINAN's chevron`, u.slice(0, 120)) }
{ const u = icon('dist/jadwa-readonly/index.html'); ok(/#878378/.test(u) && !/#f15a22/i.test(u), 'Jadwa: the tab icon is Jadwa’s square', u.slice(0, 120)) }
console.log(`${pass} pass, ${fail} fail`); process.exit(fail ? 1 : 0);
