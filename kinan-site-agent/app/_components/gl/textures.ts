/**
 * Procedural textures for the 3D site, drawn on canvases at load (no image files): the site ground from the plan
 * geometry, curtain wall with lit windows, exposed concrete, crane lattice, rebar mats, and Kinan's branded hoarding
 * and climbing screens using the real logo and chevron vectors.
 */
import * as THREE from "three";
import { PLAN, SHAPES, type Layer } from "@/lib/siteplan";
import { CHEVRON, KINAN, LOGO } from "@/lib/brand";

export const M = PLAN.metresPerUnit; // metres per plan unit

function canvas(w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  return { c, g: c.getContext("2d")! };
}
function tex(c: HTMLCanvasElement, opts: { repeat?: boolean; srgb?: boolean; aniso?: number } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (opts.srgb !== false) t.colorSpace = THREE.SRGBColorSpace;
  if (opts.repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = opts.aniso ?? 4;
  t.needsUpdate = true;
  return t;
}
/** Deterministic pseudo-random numbers (same scene on every device). */
export function rng(seed: number) { let s = seed >>> 0 || 1; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

// ------------------------------------------------------------------ ground
export interface GroundOpts { layers: Record<Layer, boolean>; night: boolean; roads: number; landscape: number; size: number }
const GROUND = {
  day: { sand: "#d8c3a0", plot: "#cdbb98", zone1: "rgba(80,120,190,.07)", zone2: "rgba(60,150,90,.08)", zone3: "rgba(241,90,34,.07)", base: "#8a8a86", asphalt: "#4b4b4f", line: "#f1efe8", yard: "#bfb08c", gravel: "#a89f8c", bay: "#9a9a96", camp: "#c9b28f", green: "#7fae6a", water: "#5fb3dd", pub: "#3a3a3d", kerb: "#d9d4c8" },
  night: { sand: "#3a3328", plot: "#353026", zone1: "rgba(90,130,200,.1)", zone2: "rgba(70,160,100,.1)", zone3: "rgba(255,106,51,.08)", base: "#36363a", asphalt: "#202024", line: "#b9b6ad", yard: "#3f3a2c", gravel: "#38352e", bay: "#3d3d40", camp: "#3f382c", green: "#2d4a2c", water: "#1f5f86", pub: "#18181b", kerb: "#5a574f" },
};

/** The site ground, drawn from the same plan shapes as the 2D sheet, in plan units scaled to the canvas. */
export function drawGround(o: GroundOpts) {
  const W = o.size, H = Math.round((o.size * PLAN.h) / PLAN.w), k = W / PLAN.w;
  const { c, g } = canvas(W, H);
  const P = o.night ? GROUND.night : GROUND.day;
  const R = rng(7);
  g.fillStyle = P.sand; g.fillRect(0, 0, W, H);
  // sand grain
  for (let i = 0; i < (W * H) / 90; i++) { g.fillStyle = `rgba(${o.night ? "255,240,210" : "90,70,40"},${0.03 + R() * 0.05})`; g.fillRect(R() * W, R() * H, 1 + R() * 2, 1 + R() * 2); }
  g.save(); g.scale(k, k);
  const rect = (s: { x?: number; y?: number; w?: number; h?: number }) => g.fillRect(s.x!, s.y!, s.w!, s.h!);
  const poly = (pts: [number, number][]) => { g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); };
  for (const s of SHAPES) {
    if (s.t === "poly" && s.cls === "plot") { poly(s.pts!); g.fillStyle = P.plot; g.fill(); }
    if (s.t === "rect" && s.cls === "public-road") { g.fillStyle = P.pub; rect(s); g.fillStyle = P.kerb; g.fillRect(0, s.y!, PLAN.w, 1.2); g.setLineDash([10, 8]); g.strokeStyle = P.line; g.lineWidth = 1; g.beginPath(); g.moveTo(0, s.y! + s.h! / 2); g.lineTo(PLAN.w, s.y! + s.h! / 2); g.stroke(); g.setLineDash([]); }
  }
  for (const s of SHAPES) if (s.t === "rect" && s.cls.startsWith("zone")) { g.fillStyle = s.cls.includes("z1") ? P.zone1 : s.cls.includes("z2") ? P.zone2 : P.zone3; rect(s); }
  // yards, camp, laydown
  for (const s of SHAPES) {
    if (s.t !== "rect") continue;
    if (s.cls.includes("tmp yard")) { g.fillStyle = P.yard; rect(s); g.strokeStyle = "rgba(0,0,0,.18)"; g.setLineDash([4, 3]); g.lineWidth = 1; g.strokeRect(s.x!, s.y!, s.w!, s.h!); g.setLineDash([]); }
    if (s.cls.includes("tmp camp") || s.cls.includes("tmp office") || s.cls.includes("tmp batch") || s.cls.includes("tmp waste")) { g.fillStyle = P.gravel; rect(s); }
  }
  // roads: base course, then asphalt once the wearing course is down
  for (const s of SHAPES) if (s.t === "rect" && s.cls === "road") { g.fillStyle = P.kerb; g.fillRect(s.x! - 1.2, s.y! - 1.2, s.w! + 2.4, s.h! + 2.4); }
  for (const s of SHAPES) if (s.t === "rect" && s.cls === "road") { g.fillStyle = o.roads > 0.99 ? P.asphalt : P.base; rect(s); }
  g.strokeStyle = P.line; g.lineWidth = 1; g.setLineDash([8, 7]);
  for (const s of SHAPES) if (s.t === "line" && s.cls === "cl") { g.beginPath(); s.pts!.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.stroke(); }
  g.setLineDash([]);
  // parking bays, wheel wash, gates, pools, gardens
  for (const s of SHAPES) {
    if (s.t !== "rect") continue;
    if (s.cls === "bay") { g.strokeStyle = P.line; g.lineWidth = 0.6; g.strokeRect(s.x!, s.y!, s.w!, s.h!); }
    if (s.cls === "wash") { g.fillStyle = P.water; rect(s); }
    if (s.cls === "gate") { g.fillStyle = "#3f9a5a"; rect(s); }
    if (s.cls === "garden") { g.fillStyle = P.green; g.globalAlpha = 0.35 + o.landscape * 0.65; rect(s); g.globalAlpha = 1; }
  }
  // Phase 2 landscaping grows in with the landscaping activity
  if (o.landscape > 0) {
    const z2 = SHAPES.find((s) => s.cls === "zone z2")!;
    g.globalAlpha = 0.5 * o.landscape; g.fillStyle = P.green;
    for (let i = 0; i < 160 * o.landscape; i++) { const x = z2.x! + R() * z2.w!, y = z2.y! + R() * z2.h!; g.beginPath(); g.arc(x, y, 4 + R() * 9, 0, Math.PI * 2); g.fill(); }
    g.globalAlpha = 1;
  }
  // HSE muster points, first aid: painted circles
  for (const s of SHAPES) if (s.t === "circle" && s.cls === "hse-pt") { g.fillStyle = "#3f9a5a"; g.beginPath(); g.arc(s.cx!, s.cy!, s.r! * 1.4, 0, Math.PI * 2); g.fill(); g.fillStyle = "#fff"; g.font = `700 ${s.r! * 1.3}px Montserrat, sans-serif`; g.textAlign = "center"; g.textBaseline = "middle"; const lbl = SHAPES.find((q) => q.t === "text" && q.cls === "lbl-h" && Math.abs(q.x! - s.cx!) < 1 && Math.abs(q.y! - 3 - s.cy!) < 1); g.fillText(lbl?.text ?? "", s.cx!, s.cy! + 0.5); }
  // crane radius rings
  if (o.layers.cranes) for (const s of SHAPES) if (s.t === "circle" && s.cls === "crane-r") { g.strokeStyle = "rgba(241,90,34,.55)"; g.setLineDash([8, 5]); g.lineWidth = 1.2; g.beginPath(); g.arc(s.cx!, s.cy!, s.r!, 0, Math.PI * 2); g.stroke(); g.setLineDash([]); }
  // optional layers drawn on the ground: grid and underground utilities
  if (o.layers.grid) {
    g.strokeStyle = "#d0543a"; g.lineWidth = 0.7; g.setLineDash([10, 3, 2, 3]);
    for (const s of SHAPES) if (s.layer === "grid" && s.t === "line") { g.beginPath(); s.pts!.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.stroke(); }
    g.setLineDash([]); g.fillStyle = "#d0543a"; g.font = "700 9px Montserrat, sans-serif"; g.textAlign = "center";
    for (const s of SHAPES) if (s.layer === "grid" && s.t === "text") g.fillText(s.text!, s.x!, s.y!);
  }
  if (o.layers.utilities) {
    const col: Record<string, string> = { "u-water": "#3b7fe0", "u-sewer": "#a8642a", "u-storm": "#1aa093", "u-power": "#e04545", "u-tel": "#8f62e0", "u-fire": "#e63e6d" };
    for (const s of SHAPES) if (s.layer === "utilities" && s.t === "line") { g.strokeStyle = col[s.cls] ?? "#888"; g.lineWidth = s.cls === "u-power" ? 3 : 2.2; g.beginPath(); s.pts!.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.stroke(); }
  }
  // zone and road names, large and quiet
  g.fillStyle = o.night ? "rgba(255,255,255,.28)" : "rgba(46,46,47,.38)"; g.textAlign = "left";
  g.font = "700 14px Montserrat, sans-serif";
  for (const s of SHAPES) if (s.t === "text" && s.cls === "lbl-zone") g.fillText(s.text!.split("").join(" "), s.x!, s.y!);
  g.fillStyle = o.night ? "rgba(255,255,255,.55)" : "rgba(255,255,255,.85)"; g.font = "600 9px Montserrat, sans-serif"; g.textAlign = "center";
  for (const s of SHAPES) if (s.t === "text" && s.cls === "lbl-road") g.fillText(s.text!, s.x!, s.y! + 1);
  g.restore();
  return tex(c, { aniso: 8 });
}

// ------------------------------------------------------------------ building skins
/** Unitised curtain wall: 1.5 m modules per storey with a spandrel at slab level. map + emissive (lit rooms at night). */
export function curtainWall(lit: boolean) {
  const cw = 256, ch = 256; // one texture = 6 modules × 4 storeys
  const { c, g } = canvas(cw, ch);
  const e = canvas(cw, ch);
  const R = rng(lit ? 11 : 3);
  const mw = cw / 6, sh = ch / 4;
  for (let row = 0; row < 4; row++) for (let col = 0; col < 6; col++) {
    const x = col * mw, y = row * sh;
    const grd = g.createLinearGradient(x, y, x + mw, y + sh);
    const tone = 0.85 + R() * 0.25;
    grd.addColorStop(0, `rgb(${Math.round(120 * tone)},${Math.round(150 * tone)},${Math.round(172 * tone)})`);
    grd.addColorStop(1, `rgb(${Math.round(70 * tone)},${Math.round(96 * tone)},${Math.round(118 * tone)})`);
    g.fillStyle = grd; g.fillRect(x, y, mw, sh);
    // spandrel band
    g.fillStyle = "#4b5560"; g.fillRect(x, y + sh * 0.82, mw, sh * 0.18);
    if (lit) {
      const on = R() < 0.42, warm = R() < 0.7, k = 0.35 + R() * 0.55;
      if (on) {
        const gl = e.g.createLinearGradient(x, y, x, y + sh * 0.8);
        const c = warm ? `255,${190 + Math.round(R() * 40)},${120 + Math.round(R() * 60)}` : `${200 + Math.round(R() * 40)},225,255`;
        gl.addColorStop(0, `rgba(${c},${k * 0.55})`); gl.addColorStop(1, `rgba(${c},${k})`);
        e.g.fillStyle = gl; e.g.fillRect(x + 3, y + 3, mw - 6, sh * 0.79 - 3);
        if (R() < 0.4) { e.g.fillStyle = "rgba(0,0,0,.55)"; e.g.fillRect(x + 3, y + 3, mw - 6, (sh * 0.79 - 3) * (0.2 + R() * 0.5)); }
      }
    }
  }
  // mullions and transoms
  g.fillStyle = "#c9ced3";
  for (let col = 0; col <= 6; col++) g.fillRect(col * mw - 1.5, 0, 3, ch);
  for (let row = 0; row <= 4; row++) g.fillRect(0, row * sh - 1.5, cw, 3);
  e.g.globalCompositeOperation = "destination-over"; e.g.fillStyle = "#000"; e.g.fillRect(0, 0, cw, ch);
  const map = tex(c, { repeat: true, aniso: 8 }), em = tex(e.c, { repeat: true, aniso: 8 });
  return { map, emissive: em };
}
/** Exposed concrete: board-marked, slightly mottled. */
export function concrete(seed = 5, tone = 196) {
  const { c, g } = canvas(256, 256);
  const R = rng(seed);
  g.fillStyle = `rgb(${tone},${tone - 3},${tone - 8})`; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 2600; i++) { const v = tone - 30 + R() * 50; g.fillStyle = `rgba(${v},${v - 2},${v - 6},.25)`; g.fillRect(R() * 256, R() * 256, 1 + R() * 3, 1 + R() * 3); }
  g.strokeStyle = "rgba(0,0,0,.06)"; for (let y = 0; y < 256; y += 32) { g.beginPath(); g.moveTo(0, y); g.lineTo(256, y); g.stroke(); }
  return tex(c, { repeat: true });
}
/** Tower crane lattice: alpha-tested so the bracing reads from any angle. */
export function lattice(color = "#f15a22") {
  const { c, g } = canvas(64, 64);
  g.clearRect(0, 0, 64, 64);
  g.strokeStyle = color; g.lineCap = "square";
  g.lineWidth = 7; g.strokeRect(3.5, -4, 57, 72);
  g.lineWidth = 4; g.beginPath(); g.moveTo(4, 4); g.lineTo(60, 60); g.moveTo(60, 4); g.lineTo(4, 60); g.stroke();
  g.lineWidth = 5; g.beginPath(); g.moveTo(0, 2); g.lineTo(64, 2); g.stroke();
  const t = tex(c, { repeat: true, aniso: 8 });
  return t;
}
/** Rebar mat on the deck being cast. */
export function rebar() {
  const { c, g } = canvas(128, 128);
  g.fillStyle = "#6e5c4c"; g.fillRect(0, 0, 128, 128);
  g.strokeStyle = "#a0522d"; g.lineWidth = 2;
  for (let i = 0; i < 128; i += 8) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 128); g.stroke(); g.beginPath(); g.moveTo(0, i); g.lineTo(128, i); g.stroke(); }
  return tex(c, { repeat: true });
}
function drawArt(g: CanvasRenderingContext2D, art: { viewBox: string; d: string } | null, x: number, y: number, h: number, color: string) {
  if (!art) return 0;
  const [vx, vy, vw, vh] = art.viewBox.split(/\s+/).map(Number), s = h / vh;
  g.save(); g.translate(x, y); g.scale(s, s); g.translate(-vx, -vy); g.fillStyle = color; g.fill(new Path2D(art.d)); g.restore();
  return vw * s;
}
/** Branded site hoarding: charcoal panels, white logo, orange chevrons, project name. */
export function hoarding() {
  const { c, g } = canvas(1024, 128);
  g.fillStyle = KINAN.charcoal; g.fillRect(0, 0, 1024, 128);
  g.fillStyle = KINAN.orange; g.fillRect(0, 116, 1024, 12);
  const lw = drawArt(g, LOGO, 40, 26, 64, "#ffffff");
  g.fillStyle = "rgba(255,255,255,.35)"; g.fillRect(40 + lw + 26, 30, 2, 58);
  g.fillStyle = "#ffffff"; g.font = "700 30px Montserrat, sans-serif"; g.textBaseline = "middle";
  g.fillText("KINAN HEIGHTS", 40 + lw + 52, 50);
  g.fillStyle = "rgba(255,255,255,.7)"; g.font = "600 17px Montserrat, sans-serif";
  g.fillText("L I V E   T H E   P L A C E", 40 + lw + 52, 82);
  for (let i = 0; i < 3; i++) drawArt(g, CHEVRON, 840 + i * 50, 24, 70, i === 2 ? KINAN.orange : `rgba(241,90,34,${0.35 + i * 0.25})`);
  for (let x = 0; x < 1024; x += 256) { g.fillStyle = "rgba(0,0,0,.25)"; g.fillRect(x, 0, 2, 116); }
  return tex(c, { repeat: true, aniso: 8 });
}
/** Climbing screen wrapped round the top floors of a tower under construction. */
export function climbScreen() {
  const { c, g } = canvas(512, 256);
  g.fillStyle = KINAN.charcoal; g.fillRect(0, 0, 512, 256);
  g.fillStyle = KINAN.orange; g.fillRect(0, 0, 512, 10); g.fillRect(0, 246, 512, 10);
  drawArt(g, LOGO, 60, 70, 110, "#ffffff");
  drawArt(g, CHEVRON, 400, 70, 110, KINAN.orange);
  g.strokeStyle = "rgba(255,255,255,.08)"; for (let x = 0; x < 512; x += 64) { g.beginPath(); g.moveTo(x, 10); g.lineTo(x, 246); g.stroke(); }
  return tex(c, { repeat: true, aniso: 8 });
}
/** Portacabin / site office cladding: panels with a window strip. */
export function cabin() {
  const { c, g } = canvas(128, 64);
  g.fillStyle = "#e9e7e1"; g.fillRect(0, 0, 128, 64);
  g.fillStyle = "#5e7387"; for (let x = 10; x < 128; x += 40) g.fillRect(x, 18, 24, 18);
  g.fillStyle = "rgba(0,0,0,.08)"; for (let x = 0; x < 128; x += 8) g.fillRect(x, 0, 1, 64);
  g.fillStyle = KINAN.orange; g.fillRect(0, 56, 128, 4);
  return tex(c, { repeat: true });
}
/** Sky dome gradient (day or night). */
export function sky(night: boolean) {
  const { c, g } = canvas(4, 256);
  const grd = g.createLinearGradient(0, 0, 0, 256);
  if (night) { grd.addColorStop(0, "#05070d"); grd.addColorStop(0.55, "#121a2c"); grd.addColorStop(0.8, "#2a2a3a"); grd.addColorStop(1, "#3b3029"); }
  else { grd.addColorStop(0, "#5f8fc4"); grd.addColorStop(0.5, "#a8c6e0"); grd.addColorStop(0.82, "#efe3cc"); grd.addColorStop(1, "#f3d9b0"); }
  g.fillStyle = grd; g.fillRect(0, 0, 4, 256);
  return tex(c);
}
/** Soft round glow for floodlights and aviation lights. */
export function glow() {
  const { c, g } = canvas(64, 64);
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, "rgba(255,255,255,1)"); grd.addColorStop(0.25, "rgba(255,255,255,.6)"); grd.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
  return tex(c);
}
