/**
 * Roads and open ground outside the buildings: what a site manager sees walking between the blocks.
 *
 * Roads: kerbs on every internal road, the public road's footway, median with palms and lamps, a bus shelter,
 * speed humps, manhole and gully covers, water-filled barriers, road signs (speed limit, stop, no entry, PPE),
 * a weighbridge at the materials gate. Ground: shaded rest areas with water coolers, fire points, CCTV masts,
 * assembly-point signs, spoil heaps and sand piles, parked cars and wheel stops in the staff car park.
 * Outside the plot: desert scrub, low dunes and neighbouring plots for context.
 *
 * Everything repeated is one InstancedMesh (or one merged mesh per material), so all of this is ~40 draw calls.
 */
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { PLAN, SHAPES } from "@/lib/siteplan";
import type { SiteState } from "@/lib/scene/progress4d";
import { M, rng } from "./textures";
import { W, at, box, mergeStatic, rectOf, shadow, type Mats } from "./common";

const S = (p: THREE.MeshStandardMaterialParameters) => new THREE.MeshStandardMaterial(p);
const mx = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3();
function inst(geo: THREE.BufferGeometry, mat: THREE.Material, pts: { x: number; y?: number; z: number; ry?: number; s?: number; sy?: number; color?: number }[], cast = true) {
  const im = new THREE.InstancedMesh(geo, mat, Math.max(1, pts.length));
  pts.forEach((p, i) => { q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), p.ry ?? 0); sc.set(p.s ?? 1, p.sy ?? p.s ?? 1, p.s ?? 1); v.set(p.x, p.y ?? 0, p.z); im.setMatrixAt(i, mx.compose(v, q, sc)); if (p.color !== undefined) im.setColorAt(i, new THREE.Color(p.color)); });
  if (!pts.length) im.count = 0;
  im.castShadow = cast; im.receiveShadow = true;
  return im;
}
/** A road sign face: circle / octagon / triangle drawn on a canvas. */
function signTex(kind: "speed" | "stop" | "noentry" | "ppe" | "assembly" | "slow") {
  const c = document.createElement("canvas"); c.width = c.height = 128; const g = c.getContext("2d")!;
  g.clearRect(0, 0, 128, 128);
  const circ = (fill: string, ring?: string) => { g.beginPath(); g.arc(64, 64, 58, 0, Math.PI * 2); g.fillStyle = fill; g.fill(); if (ring) { g.lineWidth = 12; g.strokeStyle = ring; g.stroke(); } };
  g.textAlign = "center"; g.textBaseline = "middle";
  if (kind === "speed") { circ("#ffffff", "#d03b3b"); g.fillStyle = "#111"; g.font = "800 54px Montserrat, Arial"; g.fillText("15", 64, 68); }
  if (kind === "noentry") { circ("#d03b3b"); g.fillStyle = "#fff"; g.fillRect(24, 54, 80, 20); }
  if (kind === "ppe") { circ("#1f5fd1"); g.fillStyle = "#fff"; g.beginPath(); g.arc(64, 64, 26, Math.PI, 0); g.fill(); g.fillRect(30, 62, 68, 8); }
  if (kind === "stop") { g.beginPath(); for (let i = 0; i < 8; i++) { const a = Math.PI / 8 + (i * Math.PI) / 4; g.lineTo(64 + 60 * Math.cos(a), 64 + 60 * Math.sin(a)); } g.closePath(); g.fillStyle = "#d03b3b"; g.fill(); g.fillStyle = "#fff"; g.font = "800 34px Montserrat, Arial"; g.fillText("STOP", 64, 66); }
  if (kind === "slow") { g.beginPath(); g.moveTo(64, 8); g.lineTo(122, 116); g.lineTo(6, 116); g.closePath(); g.fillStyle = "#fff"; g.fill(); g.lineWidth = 10; g.strokeStyle = "#d03b3b"; g.stroke(); g.fillStyle = "#111"; g.font = "800 24px Montserrat, Arial"; g.fillText("SLOW", 64, 88); }
  if (kind === "assembly") { g.fillStyle = "#1f8a4c"; g.fillRect(4, 4, 120, 120); g.fillStyle = "#fff"; for (const [x, y] of [[40, 44], [88, 44], [40, 92], [88, 92]]) { g.beginPath(); g.arc(x, y, 10, 0, Math.PI * 2); g.fill(); } g.fillRect(56, 56, 16, 16); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}

export interface GroundsApi { group: THREE.Group; setState(s: SiteState): void; setNight(n: boolean): void; dispose(): void }

export function createGrounds(m: Mats): GroundsApi {
  const group = new THREE.Group();
  const R = rng(9090);
  const disposables: { dispose(): void }[] = [];
  const own = <T extends { dispose(): void }>(x: T) => { disposables.push(x); return x; };
  const kerbMat = own(S({ color: 0xd7d2c6, roughness: 0.9 }));
  const roads = SHAPES.filter((s) => s.t === "rect" && s.cls === "road").map((s) => W(s));
  const pub = W(SHAPES.find((s) => s.cls === "public-road")!);

  // ---------------------------------------------------------------- kerbs along every internal road (one merged mesh)
  {
    const parts: THREE.BufferGeometry[] = [];
    for (const r of roads) {
      const horiz = r.w > r.d;
      if (horiz) { for (const z of [r.z - 0.2, r.z + r.d + 0.2]) parts.push(box(r.w, 0.18, 0.4).translate(r.x + r.w / 2, 0.09, z)); }
      else { for (const x of [r.x - 0.2, r.x + r.w + 0.2]) parts.push(box(0.4, 0.18, r.d).translate(x, 0.09, r.z + r.d / 2)); }
    }
    // the public road: kerb + 4 m footway on the site side, central median
    parts.push(box(pub.w, 0.2, 0.4).translate(pub.x + pub.w / 2, 0.1, pub.z + 0.2));
    const kerbs = new THREE.Mesh(mergeGeometries(parts)!, kerbMat); kerbs.receiveShadow = true; group.add(kerbs);
    own(kerbs.geometry);
    const foot = new THREE.Mesh(box(pub.w, 0.16, 4, 4, 4), m.paving); at(foot, pub.x + pub.w / 2, 0.08, pub.z - 2); foot.receiveShadow = true; group.add(foot);
    const med = new THREE.Mesh(box(pub.w, 0.25, 2.4), own(S({ color: 0x6f8f4a, roughness: 1 }))); at(med, pub.x + pub.w / 2, 0.125, pub.z + pub.d / 2); med.receiveShadow = true; group.add(med);
    own(foot.geometry); own(med.geometry);
  }
  // ---------------------------------------------------------------- median palms and double-arm lamps; street trees on the footway; bus shelter
  {
    const zc = pub.z + pub.d / 2, palms: { x: number; z: number; s: number }[] = [], trees: { x: number; z: number; s: number }[] = [], lamps: { x: number; z: number }[] = [];
    for (let x = 12; x < PLAN.w * M; x += 24) { palms.push({ x, z: zc, s: 0.9 + R() * 0.3 }); lamps.push({ x: x + 12, z: zc }); }
    for (let x = 8; x < PLAN.w * M; x += 14) if (Math.abs(x - 600 * M) > 14 && Math.abs(x - 1150 * M) > 14) trees.push({ x, z: pub.z - 2.6, s: 0.8 + R() * 0.4 });
    const trunk = own(new THREE.CylinderGeometry(0.2, 0.32, 8, 6).translate(0, 4, 0));
    const crown = own(mergeGeometries(Array.from({ length: 8 }, (_, i) => box(0.6, 0.08, 4).translate(0, 0, 2).rotateX(0.5).rotateY((i / 8) * Math.PI * 2).translate(0, 8, 0)))!);
    group.add(inst(trunk, m.trunk, palms), inst(crown, m.palm, palms));
    const treeTrunk = own(new THREE.CylinderGeometry(0.12, 0.18, 2.6, 6).translate(0, 1.3, 0));
    const canopy = own(new THREE.IcosahedronGeometry(1.9, 1).scale(1, 0.8, 1).translate(0, 3.6, 0));
    group.add(inst(treeTrunk, m.trunk, trees), inst(canopy, own(S({ color: 0x5f8a3e, roughness: 0.9, flatShading: true })), trees));
    const lamp = own(mergeGeometries([new THREE.CylinderGeometry(0.1, 0.16, 11, 6).translate(0, 5.5, 0), box(5, 0.16, 0.16).translate(0, 11, 0), box(0.9, 0.2, 0.4).translate(2.4, 10.9, 0), box(0.9, 0.2, 0.4).translate(-2.4, 10.9, 0)])!);
    group.add(inst(lamp, own(S({ color: 0x5c5f66, roughness: 0.5, metalness: 0.4 })), lamps.map((l) => ({ ...l, ry: Math.PI / 2 }))));
    const bus = new THREE.Group();
    bus.add(at(new THREE.Mesh(box(8, 0.12, 2.4), m.dark), 0, 2.7, 0), at(new THREE.Mesh(box(8, 2.4, 0.06), m.glass), 0, 1.4, -1.1), at(new THREE.Mesh(box(6, 0.4, 0.5), m.white), 0, 0.5, -0.7), at(new THREE.Mesh(box(1.4, 2.4, 0.1, 1.4, 2.4), m.hoard), 3.9, 1.4, 0));
    for (const x of [-3.8, 3.8]) bus.add(at(new THREE.Mesh(box(0.1, 2.7, 0.1), m.dark), x, 1.35, 1.1));
    bus.position.set(600 * M - 30, 0, pub.z - 2.5); bus.rotation.y = Math.PI; group.add(shadow(mergeStatic(bus)));
  }
  // ---------------------------------------------------------------- speed humps (yellow/black) and manhole / gully covers
  {
    const stripe = (() => { const c = document.createElement("canvas"); c.width = 64; c.height = 8; const g = c.getContext("2d")!; for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? "#1d1d1f" : "#f2c200"; g.fillRect(i * 8, 0, 8, 8); } const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = THREE.RepeatWrapping; return t; })();
    const humpMat = own(S({ map: own(stripe), roughness: 0.7 }));
    // a half-cylinder 1 m long across the road (local z), scaled to the road's width
    const humpGeo = own(new THREE.CylinderGeometry(0.45, 0.45, 1, 12, 1, false, 0, Math.PI).rotateZ(Math.PI / 2).rotateY(Math.PI / 2).scale(1, 0.22, 1));
    const humps: [number, number, number, number][] = [];
    for (const r of roads) {
      const horiz = r.w > r.d, len = horiz ? r.w : r.d, n = Math.floor(len / 70);
      for (let i = 1; i <= n; i++) { const t = (i / (n + 1)) * len; humps.push(horiz ? [r.x + t, r.z + r.d / 2, 0, r.d - 1] : [r.x + r.w / 2, r.z + t, Math.PI / 2, r.w - 1]); }
    }
    const hm = new THREE.InstancedMesh(humpGeo, humpMat, Math.max(1, humps.length));
    humps.forEach(([x, z, ry, w], i) => { q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), ry); sc.set(1, 1, w); v.set(x, 0, z); hm.setMatrixAt(i, mx.compose(v, q, sc)); });
    hm.receiveShadow = true; group.add(hm);
    const covers: { x: number; z: number }[] = [];
    for (const s of SHAPES) if (s.t === "circle" && s.cls.startsWith("mh")) covers.push({ x: s.cx! * M, z: s.cy! * M });
    for (const r of roads) { const horiz = r.w > r.d; const len = horiz ? r.w : r.d; for (let t = 25; t < len; t += 50) covers.push(horiz ? { x: r.x + t, z: r.z + r.d * 0.3 } : { x: r.x + r.w * 0.3, z: r.z + t }); }
    group.add(inst(own(new THREE.CylinderGeometry(0.42, 0.42, 0.06, 16).translate(0, 0.03, 0)), own(S({ color: 0x2c2c2e, roughness: 0.6, metalness: 0.6 })), covers, false));
    const gullies: { x: number; z: number }[] = [];
    for (const r of roads) { const horiz = r.w > r.d; const len = horiz ? r.w : r.d; for (let t = 12; t < len; t += 30) gullies.push(horiz ? { x: r.x + t, z: r.z + 0.6 } : { x: r.x + 0.6, z: r.z + t }); }
    group.add(inst(own(box(0.9, 0.05, 0.45).translate(0, 0.025, 0)), own(S({ color: 0x3a3a3c, roughness: 0.5, metalness: 0.7 })), gullies, false));
  }
  // ---------------------------------------------------------------- water-filled barriers (red / white) along the spine and round the logistics links
  {
    const bars: { x: number; z: number; ry: number; color: number }[] = [];
    const spine = W(SHAPES.find((s) => s.cls === "road" && s.loc === "r-spine")!);
    for (let z = spine.z + 6, i = 0; z < spine.z + spine.d - 6; z += 2.1, i++) { bars.push({ x: spine.x - 1.2, z, ry: Math.PI / 2, color: i % 2 ? 0xffffff : 0xd03b3b }); bars.push({ x: spine.x + spine.w + 1.2, z, ry: Math.PI / 2, color: i % 2 ? 0xd03b3b : 0xffffff }); }
    const geo = own(mergeGeometries([box(1.9, 0.6, 0.5).translate(0, 0.3, 0), box(1.6, 0.4, 0.35).translate(0, 0.8, 0)])!);
    group.add(inst(geo, own(S({ color: 0xffffff, roughness: 0.6 })), bars));
  }
  // ---------------------------------------------------------------- road signs
  {
    const post = own(new THREE.CylinderGeometry(0.05, 0.05, 2.4, 6).translate(0, 1.2, 0));
    const face = own(new THREE.PlaneGeometry(0.9, 0.9).translate(0, 2.6, 0.04));
    const kinds: [Parameters<typeof signTex>[0], { x: number; z: number; ry: number }[]][] = [
      ["speed", [[600, 920], [1150, 920], [120, 560], [1460, 560], [885, 140]].map(([x, z]) => ({ x: x * M, z: z * M, ry: 0 }))],
      ["stop", [[875, 540], [895, 590], [445, 586], [1155, 586]].map(([x, z]) => ({ x: x * M, z: z * M, ry: 0.4 }))],
      ["noentry", [[1500, 886], [92, 120]].map(([x, z]) => ({ x: x * M, z: z * M, ry: 0 }))],
      ["ppe", [[590, 925], [1140, 925], [470, 600], [820, 600]].map(([x, z]) => ({ x: x * M, z: z * M, ry: 0 }))],
      ["slow", [[300, 586], [700, 586], [1000, 586], [1300, 586]].map(([x, z]) => ({ x: x * M, z: z * M, ry: Math.PI }))],
      ["assembly", [[500, 900], [1420, 520]].map(([x, z]) => ({ x: x * M + 3, z: z * M, ry: 0 }))],
    ];
    const allPosts: { x: number; z: number; ry: number }[] = [];
    for (const [k, pts] of kinds) {
      const mat = own(new THREE.MeshStandardMaterial({ map: own(signTex(k)), transparent: true, alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.6 }));
      group.add(inst(face, mat, pts, false)); allPosts.push(...pts);
    }
    group.add(inst(post, m.dark, allPosts));
  }
  // ---------------------------------------------------------------- weighbridge at the materials gate (Gate 2)
  {
    const g = new THREE.Group(), x = 1150 * M + 22, z = 934 * M - 22;
    g.add(at(new THREE.Mesh(box(18, 0.3, 3.4, 4, 4), m.concrete), x, 0.15, z));
    g.add(at(new THREE.Mesh(box(17, 0.12, 3, 2, 2), m.lattice), x, 0.36, z));
    g.add(at(new THREE.Mesh(box(4, 2.8, 3, 4, 2.8), m.cabin), x + 12, 1.4, z - 0.5));
    g.add(at(new THREE.Mesh(box(1.4, 0.9, 0.08), m.hoard), x - 9.5, 1.8, z - 2));
    group.add(shadow(mergeStatic(g)));
  }
  // ---------------------------------------------------------------- shaded rest areas (Riyadh heat): canopy, benches, water coolers
  const rest = new THREE.Group();
  {
    const canvasMat = own(S({ color: 0xf2efe8, roughness: 0.9, side: THREE.DoubleSide }));
    const spots: [number, number][] = [];
    for (const loc of ["rebar-yard", "laydown-1", "labour-camp", "batching", "store"]) { const r = rectOf(loc); if (r) { const qq = W(r); spots.push([qq.x + qq.w + 6, qq.z + 4]); } }
    for (const [x, z] of spots) {
      const g = new THREE.Group();
      for (const [dx, dz] of [[-4, -2.5], [4, -2.5], [-4, 2.5], [4, 2.5]]) g.add(at(new THREE.Mesh(box(0.14, 3.2, 0.14), m.dark), x + dx, 1.6, z + dz));
      const sail = at(new THREE.Mesh(new THREE.PlaneGeometry(9.5, 6.2), canvasMat), x, 3.25, z); sail.rotation.x = -Math.PI / 2 + 0.08; g.add(sail);
      for (const dz of [-1.4, 1.4]) g.add(at(new THREE.Mesh(box(6, 0.45, 0.5), m.trunk), x, 0.45, z + dz));
      g.add(at(new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 1.2, 12), own(S({ color: 0x3a7bd5, roughness: 0.4 }))), x + 3.6, 0.6, z));
      g.add(at(new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.5, 12), m.white), x + 3.6, 1.45, z));
      rest.add(g);
    }
    group.add(shadow(mergeStatic(rest)));
  }
  // ---------------------------------------------------------------- fire points, CCTV masts, first-aid boxes along the haul road
  {
    const fp: { x: number; z: number }[] = [], cams: { x: number; z: number; ry: number }[] = [];
    for (let x = 140 * M; x < 1460 * M; x += 55) fp.push({ x, z: 548 * M - 2.2 });
    for (const [x, z] of [[100, 100], [1500, 100], [100, 900], [1500, 900], [600, 920], [1150, 920], [885, 560]]) cams.push({ x: x * M, z: z * M, ry: R() * 6 });
    const stand = own(mergeGeometries([box(0.9, 1.6, 0.25).translate(0, 0.8, 0), new THREE.CylinderGeometry(0.12, 0.12, 0.6, 8).translate(-0.22, 0.6, 0.2), new THREE.CylinderGeometry(0.12, 0.12, 0.6, 8).translate(0.22, 0.6, 0.2)])!);
    group.add(inst(stand, own(S({ color: 0xc62828, roughness: 0.5 })), fp));
    const mast = own(mergeGeometries([new THREE.CylinderGeometry(0.1, 0.14, 8, 6).translate(0, 4, 0), box(0.6, 0.3, 0.3).translate(0.3, 7.8, 0), box(0.25, 0.25, 0.5).translate(0.6, 7.6, 0)])!);
    group.add(inst(mast, own(S({ color: 0xe8e8e8, roughness: 0.4, metalness: 0.4 })), cams));
  }
  // ---------------------------------------------------------------- spoil heaps and sand piles in the logistics zone and by the pit
  const spoil = new THREE.Group();
  {
    const heaps: { x: number; z: number; s: number; sy: number; ry: number; color: number }[] = [];
    const add = (x: number, z: number, n: number, spread: number, color: number) => { for (let i = 0; i < n; i++) heaps.push({ x: x + (R() - 0.5) * spread, z: z + (R() - 0.5) * spread * 0.6, s: 3 + R() * 4, sy: 0.35 + R() * 0.25, ry: R() * 6, color }); };
    add(1040 * M, 900 * M - 30, 6, 40, 0xb69b74); add(160 * M + 8, 560 * M - 40, 4, 20, 0xc8b089); add(820 * M, 120 * M + 6, 5, 50, 0xb69b74);
    const geo = own(new THREE.IcosahedronGeometry(1, 1).translate(0, 0.2, 0));
    const im = inst(geo, own(S({ color: 0xffffff, roughness: 1, flatShading: true })), heaps); spoil.add(im);
    group.add(spoil);
  }
  // ---------------------------------------------------------------- staff car park: parked cars and wheel stops
  {
    const bays = SHAPES.filter((s) => s.t === "rect" && s.cls === "bay").map((s) => W(s));
    const cars: { x: number; z: number; ry: number; color: number }[] = [], stops: { x: number; z: number }[] = [];
    const cols = [0xf4f4f2, 0x2e2e2f, 0xbdc3c7, 0xf4f4f2, 0x8d6e63, 0x1f5fd1, 0xc0392b, 0xecf0f1];
    bays.forEach((b, i) => { stops.push({ x: b.x + b.w / 2, z: b.z + 0.6 }); if (R() < 0.75) cars.push({ x: b.x + b.w / 2, z: b.z + b.d / 2 + 0.6, ry: Math.PI / 2, color: cols[i % cols.length] }); });
    // a second row of cars by the site offices
    const off = rectOf("site-office"); if (off) { const qq = W(off); for (let i = 0; i < 12; i++) cars.push({ x: qq.x + 4 + i * 5.6, z: qq.z + qq.d + 9, ry: Math.PI / 2, color: cols[(i * 3) % cols.length] }); }
    const body = own(mergeGeometries([box(4.3, 0.9, 1.85).translate(0, 0.75, 0), box(2.3, 0.7, 1.7).translate(-0.2, 1.5, 0)])!);
    group.add(inst(body, own(S({ color: 0xffffff, roughness: 0.3, metalness: 0.45 })), cars));
    group.add(inst(own(box(0.25, 0.15, 1.6).translate(0, 0.075, 0)), own(S({ color: 0xf2c200, roughness: 0.8 })), stops, false));
  }
  // ---------------------------------------------------------------- outside the plot: scrub, dunes, neighbouring plots
  const context = new THREE.Group();
  {
    const scrub: { x: number; z: number; s: number; sy: number; ry: number; color: number }[] = [];
    for (let i = 0; i < 520; i++) {
      const a = R() * Math.PI * 2, d = 520 + R() * 900;
      const x = 400 + Math.cos(a) * d * 1.1, z = 250 + Math.sin(a) * d * 0.8;
      if (z > pub.z - 5 && z < pub.z + pub.d + 30) continue;
      scrub.push({ x, z, s: 0.8 + R() * 1.4, sy: 0.5 + R() * 0.4, ry: R() * 6, color: R() < 0.5 ? 0x8a8a5a : 0x6f7d4a });
    }
    context.add(inst(own(new THREE.IcosahedronGeometry(1, 0)), own(S({ color: 0xffffff, roughness: 1, flatShading: true })), scrub, false));
    const dunes: { x: number; z: number; s: number; sy: number; ry: number }[] = [];
    for (let i = 0; i < 22; i++) { const a = R() * Math.PI * 2, d = 1100 + R() * 700; dunes.push({ x: 400 + Math.cos(a) * d * 1.2, z: 250 + Math.sin(a) * d, s: 60 + R() * 90, sy: 0.09 + R() * 0.06, ry: R() * 6 }); }
    context.add(inst(own(new THREE.SphereGeometry(1, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2)), own(S({ color: 0xd8c29b, roughness: 1 })), dunes, false));
    // neighbouring plots across the public road and to the east / west: low-rise villas and a few mid-rise blocks
    const blocks: { x: number; z: number; s: number; sy: number; ry: number; color: number }[] = [];
    const sand = [0xe2d6c0, 0xd9cbb1, 0xeee6d6, 0xcfc2aa];
    for (let i = 0; i < 70; i++) {
      const side = i % 3, rr = R();
      const x = side === 0 ? -40 + R() * (PLAN.w * M + 80) : side === 1 ? -60 - R() * 140 : PLAN.w * M + 60 + R() * 140;
      const z = side === 0 ? pub.z + pub.d + 20 + R() * 160 : -40 + R() * (PLAN.h * M + 60);
      blocks.push({ x, z, s: 9 + R() * 12, sy: rr < 0.12 ? 26 + R() * 30 : 6 + R() * 6, ry: Math.round(R() * 2) * (Math.PI / 2), color: sand[i % sand.length] });
    }
    const blockGeo = own(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0));
    const ctxMat = own(S({ color: 0xffffff, roughness: 0.85 }));
    const im = new THREE.InstancedMesh(blockGeo, ctxMat, blocks.length);
    blocks.forEach((b, i) => { q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), b.ry); sc.set(b.s * 1.4, b.sy, b.s); v.set(b.x, 0, b.z); im.setMatrixAt(i, mx.compose(v, q, sc)); im.setColorAt(i, new THREE.Color(b.color)); });
    im.castShadow = true; im.receiveShadow = true; context.add(im);
    group.add(context);
  }

  function setState(s: SiteState) {
    rest.visible = s.mobilised > 0.3;
    spoil.visible = s.excavation > 0 && s.landscape < 0.6;
  }
  function setNight(n: boolean) { void n; }
  function dispose() { for (const d of disposables) d.dispose(); }
  return { group, setState, setNight, dispose };
}
