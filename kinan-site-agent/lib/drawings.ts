/**
 * Generates demo construction drawings as SVG so the drawing viewer has real
 * content to pan / zoom / mark up before any files are uploaded.
 */
const W = 1200, H = 850;

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");

function frame(title: string, sheet: string, rev: string, scale: string, body: string, sub = "") {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="Helvetica,Arial,sans-serif">
<rect width="${W}" height="${H}" fill="#fff"/>
<rect x="15" y="15" width="${W - 30}" height="${H - 30}" fill="none" stroke="#111" stroke-width="2"/>
${body}
<g transform="translate(${W - 395},${H - 135})">
<rect width="380" height="120" fill="#fff" stroke="#111" stroke-width="1.5"/>
<line x1="0" y1="34" x2="380" y2="34" stroke="#111"/><line x1="0" y1="78" x2="380" y2="78" stroke="#111"/>
<line x1="260" y1="78" x2="260" y2="120" stroke="#111"/>
<text x="10" y="23" font-size="14" font-weight="700">KINAN — KINAN HEIGHTS</text>
<text x="10" y="62" font-size="17" font-weight="700">${esc(title)}</text>
<text x="10" y="98" font-size="11" fill="#444">${esc(sub)}</text>
<text x="10" y="113" font-size="10" fill="#444">Scale ${scale}</text>
<text x="270" y="98" font-size="11">SHEET ${esc(sheet)}</text>
<text x="270" y="113" font-size="11" font-weight="700">REV ${esc(rev)}</text></g>
<g transform="translate(40,${H - 70})"><rect width="90" height="6" fill="#111"/><rect x="0" width="45" height="6" fill="#fff" stroke="#111"/>
<text y="22" font-size="10">0</text><text x="40" y="22" font-size="10">5</text><text x="82" y="22" font-size="10">10 m</text></g>
<g transform="translate(${W - 70},60)"><circle r="20" fill="none" stroke="#111"/><path d="M0,-18 L6,8 L0,3 L-6,8Z" fill="#111"/><text y="-24" font-size="11" text-anchor="middle">N</text></g>
</svg>`;
}

function grid(x0: number, y0: number, nx: number, ny: number, dx: number, dy: number) {
  let s = "";
  for (let i = 0; i <= nx; i++) {
    const x = x0 + i * dx;
    s += `<line x1="${x}" y1="${y0 - 25}" x2="${x}" y2="${y0 + ny * dy + 25}" stroke="#c0392b" stroke-dasharray="14 4 2 4" stroke-width=".8"/>`;
    s += `<circle cx="${x}" cy="${y0 - 38}" r="11" fill="#fff" stroke="#c0392b"/><text x="${x}" y="${y0 - 34}" font-size="11" text-anchor="middle" fill="#c0392b">${"ABCDEFGHIJ"[i]}</text>`;
  }
  for (let j = 0; j <= ny; j++) {
    const y = y0 + j * dy;
    s += `<line x1="${x0 - 25}" y1="${y}" x2="${x0 + nx * dx + 25}" y2="${y}" stroke="#c0392b" stroke-dasharray="14 4 2 4" stroke-width=".8"/>`;
    s += `<circle cx="${x0 - 38}" cy="${y}" r="11" fill="#fff" stroke="#c0392b"/><text x="${x0 - 38}" y="${y + 4}" font-size="11" text-anchor="middle" fill="#c0392b">${j + 1}</text>`;
  }
  return s;
}

function dim(x1: number, y1: number, x2: number, y2: number, label: string, off = 0) {
  const horiz = y1 === y2;
  const o = off;
  return horiz
    ? `<g stroke="#2563eb" fill="#2563eb"><line x1="${x1}" y1="${y1 + o}" x2="${x2}" y2="${y2 + o}"/><line x1="${x1}" y1="${y1 + o - 5}" x2="${x1}" y2="${y1 + o + 5}"/><line x1="${x2}" y1="${y2 + o - 5}" x2="${x2}" y2="${y2 + o + 5}"/><text x="${(x1 + x2) / 2}" y="${y1 + o - 4}" font-size="10" text-anchor="middle" stroke="none">${label}</text></g>`
    : `<g stroke="#2563eb" fill="#2563eb"><line x1="${x1 + o}" y1="${y1}" x2="${x2 + o}" y2="${y2}"/><line x1="${x1 + o - 5}" y1="${y1}" x2="${x1 + o + 5}" y2="${y1}"/><line x1="${x2 + o - 5}" y1="${y2}" x2="${x2 + o + 5}" y2="${y2}"/><text x="${x1 + o + 14}" y="${(y1 + y2) / 2}" font-size="10" stroke="none">${label}</text></g>`;
}

/** Residential typical floor plan. */
function floorplan(label: string, rev: string) {
  const x0 = 260, y0 = 170, dx = 110, dy = 100, nx = 6, ny = 5;
  let b = grid(x0, y0, nx, ny, dx, dy);
  b += `<rect x="${x0}" y="${y0}" width="${nx * dx}" height="${ny * dy}" fill="#f4f4f0" stroke="#111" stroke-width="3"/>`;
  // core
  b += `<rect x="${x0 + 2 * dx}" y="${y0 + 1.5 * dy}" width="${2 * dx}" height="${2 * dy}" fill="#ddd" stroke="#111" stroke-width="3"/>`;
  b += `<text x="${x0 + 3 * dx}" y="${y0 + 2.5 * dy}" text-anchor="middle" font-size="14" font-weight="700">CORE</text>`;
  b += `<text x="${x0 + 3 * dx}" y="${y0 + 2.5 * dy + 16}" text-anchor="middle" font-size="10">Lifts ×4 · Stair S1/S2 · Shafts</text>`;
  // apartments
  const units: [number, number, number, number, string][] = [
    [0, 0, 2, 1.5, "APT 01 · 2BR"], [4, 0, 2, 1.5, "APT 02 · 2BR"], [0, 3.5, 2, 1.5, "APT 03 · 3BR"],
    [4, 3.5, 2, 1.5, "APT 04 · 3BR"], [2, 0, 2, 1.5, "APT 05 · 1BR"], [2, 3.5, 2, 1.5, "APT 06 · 1BR"],
    [0, 1.5, 2, 2, "APT 07 · STUDIO"], [4, 1.5, 2, 2, "APT 08 · STUDIO"],
  ];
  for (const [ux, uy, uw, uh, t] of units) {
    b += `<rect x="${x0 + ux * dx}" y="${y0 + uy * dy}" width="${uw * dx}" height="${uh * dy}" fill="none" stroke="#111" stroke-width="1.5"/>`;
    b += `<line x1="${x0 + ux * dx + 20}" y1="${y0 + uy * dy + uh * dy * 0.45}" x2="${x0 + (ux + uw) * dx - 20}" y2="${y0 + uy * dy + uh * dy * 0.45}" stroke="#888" stroke-dasharray="3 3"/>`;
    b += `<text x="${x0 + (ux + uw / 2) * dx}" y="${y0 + (uy + uh / 2) * dy}" text-anchor="middle" font-size="11">${t}</text>`;
  }
  // columns
  for (let i = 0; i <= nx; i++) for (let j = 0; j <= ny; j++) b += `<rect x="${x0 + i * dx - 6}" y="${y0 + j * dy - 6}" width="12" height="12" fill="#111"/>`;
  b += dim(x0, y0 + ny * dy + 50, x0 + nx * dx, y0 + ny * dy + 50, "66 600", 0);
  b += dim(x0 + nx * dx + 50, y0, x0 + nx * dx + 50, y0 + ny * dy, "50 000", 0);
  b += `<text x="40" y="60" font-size="18" font-weight="700">${esc(label)}</text>`;
  b += `<text x="40" y="80" font-size="11" fill="#555">Typical residential floor · FFL +${(label.match(/\d+/)?.[0] ? Number(label.match(/\d+/)![0]) * 3.6 : 0).toFixed(1)} m · slab 250 mm PT</text>`;
  b += `<g transform="translate(40,120)" font-size="10"><text font-weight="700">LEGEND</text><rect y="8" width="14" height="10" fill="#ddd" stroke="#111"/><text x="20" y="17">RC core wall (300 mm)</text><rect y="26" width="14" height="10" fill="#111"/><text x="20" y="35">RC column</text><line y1="48" x2="14" y2="48" stroke="#c0392b" stroke-dasharray="4 2"/><text x="20" y="52">Structural grid</text></g>`;
  return frame(label, "A-201", rev, "1:100 @ A1", b, "Architectural · Typical floor plan");
}

function structural(label: string, rev: string) {
  const x0 = 260, y0 = 170, dx = 110, dy = 100, nx = 6, ny = 5;
  let b = grid(x0, y0, nx, ny, dx, dy);
  b += `<rect x="${x0}" y="${y0}" width="${nx * dx}" height="${ny * dy}" fill="none" stroke="#111" stroke-width="2.5"/>`;
  // PT tendons
  for (let j = 0; j < ny; j++) for (let k = 1; k <= 3; k++) {
    const y = y0 + j * dy + (k * dy) / 4;
    b += `<path d="M${x0},${y} C${x0 + 80},${y - 8} ${x0 + nx * dx - 80},${y + 8} ${x0 + nx * dx},${y}" fill="none" stroke="#16a34a" stroke-width="1"/>`;
  }
  b += `<rect x="${x0 + 2 * dx}" y="${y0 + 1.5 * dy}" width="${2 * dx}" height="${2 * dy}" fill="#ccc" stroke="#111" stroke-width="4"/>`;
  b += `<text x="${x0 + 3 * dx}" y="${y0 + 2.5 * dy}" text-anchor="middle" font-size="12" font-weight="700">RC CORE · C60/75</text>`;
  for (let i = 0; i <= nx; i++) for (let j = 0; j <= ny; j++) {
    b += `<rect x="${x0 + i * dx - 11}" y="${y0 + j * dy - 11}" width="22" height="22" fill="#555" stroke="#111"/>`;
    b += `<text x="${x0 + i * dx + 14}" y="${y0 + j * dy - 13}" font-size="8" fill="#333">C${i + 1}${j + 1}</text>`;
  }
  b += `<text x="40" y="60" font-size="18" font-weight="700">${esc(label)}</text>`;
  b += `<g transform="translate(40,120)" font-size="10"><text font-weight="700">NOTES</text><text y="16">1. Slab: 250 mm post-tensioned, f'c = 50 MPa</text><text y="30">2. Columns: 900 × 900 mm, C60/75 below L20</text><text y="44">3. Cover: 40 mm (soffit), 30 mm (top)</text><text y="58">4. Stressing 7 days, min 25 MPa</text><text y="72">5. Cores slip-formed, 300 mm walls</text><text y="98" font-weight="700" fill="#16a34a">— PT tendon layout</text></g>`;
  return frame(label, "S-105", rev, "1:100 @ A1", b, "Structural · Slab framing & PT");
}

function mep(label: string, rev: string) {
  const x0 = 260, y0 = 170, dx = 110, dy = 100, nx = 6, ny = 5;
  let b = grid(x0, y0, nx, ny, dx, dy);
  b += `<rect x="${x0}" y="${y0}" width="${nx * dx}" height="${ny * dy}" fill="#fafafa" stroke="#111" stroke-width="2"/>`;
  const run = (col: string, w: number, d: string) => `<path d="${d}" fill="none" stroke="${col}" stroke-width="${w}"/>`;
  b += run("#2563eb", 5, `M${x0 + 3 * dx},${y0 + 1.5 * dy} V${y0 + 0.3 * dy} H${x0 + 0.4 * dx} M${x0 + 3 * dx},${y0 + 0.3 * dy} H${x0 + 5.6 * dx}`); // chilled water
  b += run("#dc2626", 4, `M${x0 + 3 * dx},${y0 + 3.5 * dy} V${y0 + 4.7 * dy} H${x0 + 0.4 * dx} M${x0 + 3 * dx},${y0 + 4.7 * dy} H${x0 + 5.6 * dx}`); // fire
  b += run("#f59e0b", 3, `M${x0 + 2 * dx},${y0 + 2.5 * dy} H${x0 + 0.3 * dx} M${x0 + 4 * dx},${y0 + 2.5 * dy} H${x0 + 5.7 * dx}`); // power tray
  b += run("#16a34a", 3, `M${x0 + 2.1 * dx},${y0 + 1.8 * dy} H${x0 + 0.5 * dx} V${y0 + 1.2 * dy}`); // drainage
  b += `<rect x="${x0 + 2 * dx}" y="${y0 + 1.5 * dy}" width="${2 * dx}" height="${2 * dy}" fill="#e5e7eb" stroke="#111" stroke-width="3"/>`;
  b += `<text x="${x0 + 3 * dx}" y="${y0 + 2.5 * dy + 4}" text-anchor="middle" font-size="12" font-weight="700">RISER ROOM</text>`;
  b += `<text x="40" y="60" font-size="18" font-weight="700">${esc(label)}</text>`;
  b += `<g transform="translate(40,120)" font-size="10"><text font-weight="700">SERVICES</text>
  <line y1="16" x2="22" y2="16" stroke="#2563eb" stroke-width="5"/><text x="28" y="19">Chilled water Ø150 (CHWS/R)</text>
  <line y1="32" x2="22" y2="32" stroke="#dc2626" stroke-width="4"/><text x="28" y="35">Fire main Ø100 (wet riser)</text>
  <line y1="48" x2="22" y2="48" stroke="#f59e0b" stroke-width="3"/><text x="28" y="51">Power tray 300×50</text>
  <line y1="64" x2="22" y2="64" stroke="#16a34a" stroke-width="3"/><text x="28" y="67">Drainage Ø110</text></g>`;
  return frame(label, "M-310", rev, "1:100 @ A1", b, "MEP · Coordinated services plan");
}

function sitelogistics(label: string, rev: string) {
  let b = `<rect x="80" y="110" width="1040" height="600" fill="#f3f4ef" stroke="#111" stroke-width="2"/>`;
  b += `<rect x="80" y="660" width="1040" height="30" fill="#bbb"/><text x="600" y="680" text-anchor="middle" font-size="11">KING FAHD BRANCH ROAD</text>`;
  b += `<rect x="300" y="200" width="200" height="200" fill="#e7e5e4" stroke="#111" stroke-width="3"/><text x="400" y="305" text-anchor="middle" font-weight="700">TOWER A</text>`;
  b += `<rect x="600" y="200" width="200" height="200" fill="#e7e5e4" stroke="#111" stroke-width="3"/><text x="700" y="305" text-anchor="middle" font-weight="700">TOWER B</text>`;
  b += `<circle cx="430" cy="300" r="170" fill="rgba(234,88,12,.08)" stroke="#ea580c" stroke-dasharray="6 4"/><circle cx="430" cy="300" r="7" fill="#ea580c"/><text x="430" y="285" font-size="10" text-anchor="middle" fill="#ea580c">TC1 · R=60 m · 32 t @ 15 m</text>`;
  b += `<rect x="120" y="500" width="160" height="90" fill="#fde68a" stroke="#92400e"/><text x="200" y="550" text-anchor="middle" font-size="11">LAYDOWN / FORMWORK</text>`;
  b += `<rect x="850" y="480" width="200" height="120" fill="#fde68a" stroke="#92400e"/><text x="950" y="545" text-anchor="middle" font-size="11">PRECAST LAYDOWN</text>`;
  b += `<path d="M590,690 V470 H880 V400" fill="none" stroke="#16a34a" stroke-width="6" stroke-dasharray="14 6"/><text x="740" y="462" font-size="11" fill="#166534">Delivery route (one-way) → Gate 2</text>`;
  b += `<text x="40" y="60" font-size="18" font-weight="700">${esc(label)}</text>`;
  return frame(label, "C-001", rev, "1:1000 @ A1", b, "Logistics · Site logistics plan");
}

function sections(label: string, rev: string) {
  let b = "";
  const floors = 8, fh = 70, x0 = 350, base = 700;
  for (let i = 0; i <= floors; i++) {
    const y = base - i * fh;
    b += `<line x1="${x0 - 60}" y1="${y}" x2="${x0 + 500}" y2="${y}" stroke="#111" stroke-width="${i === 0 ? 4 : 1.2}"/>`;
    b += `<rect x="${x0}" y="${y - 6}" width="440" height="6" fill="#999" stroke="#111"/>`;
    b += `<text x="${x0 - 70}" y="${y + 4}" font-size="10" text-anchor="end">L${i} +${(i * 3.6).toFixed(2)}</text>`;
  }
  b += `<rect x="${x0 + 170}" y="${base - floors * fh}" width="100" height="${floors * fh}" fill="#ddd" stroke="#111" stroke-width="3"/>`;
  b += dim(x0 + 520, base, x0 + 520, base - fh, "3 600 f-f", 0);
  b += `<text x="40" y="60" font-size="18" font-weight="700">${esc(label)}</text>`;
  return frame(label, "A-301", rev, "1:100 @ A1", b, "Architectural · Building section");
}

export function renderDrawing(kind: string, label: string, rev = "C"): string {
  switch (kind) {
    case "structural": return structural(label, rev);
    case "mep": return mep(label, rev);
    case "logistics": return sitelogistics(label, rev);
    case "section": return sections(label, rev);
    default: return floorplan(label, rev);
  }
}
