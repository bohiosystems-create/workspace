/**
 * A 3D/4D scene built from a ProjectModelSpec (lib/model3d/spec.ts): the model an AI engine (or the offline parser)
 * read out of uploaded project documents. It reuses the Kinan Heights building kit (towers floor by floor with
 * core, jump-form, curtain wall and climbing screen; townhouses; tower cranes with a work cycle; the work zone and
 * landscaping at each building's foot) and draws the ground from the spec: the site plot, roads with kerbs and
 * markings, laydown and compound zones, parking bays, gates, crane exclusion zones. `setDate` drives everything
 * from the programme through `specAt`.
 *
 * World units are metres: x east from the site's west edge, z south from its north edge, y up.
 */
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { specAt, type BuildingState, type ProjectModelSpec, type SpecBuilding } from "@/lib/model3d/spec";
import { canvas, glow, rng, sky, tex } from "./textures";
import { ORANGE, at, box, materials, mergeStatic, shadow, tag, walls } from "./common";
import { craneModel, setCraneHeight, stepCrane, towerModel, truckModel, villaModel, type Built, type Crane } from "./scene";
import { aroundKit, type AroundEnv, type Kind } from "./around";

type Rect = { x: number; z: number; w: number; d: number };
export const MARGIN = 70;

export interface SpecSceneApi {
  scene: THREE.Scene; sun: THREE.DirectionalLight;
  setDate(date: string): Record<string, BuildingState>; setNight(n: boolean): void; setSelected(id?: string): void;
  tick(dt: number, time: number, animate: boolean): void;
  pickables(): THREE.Object3D[]; heightOf(id: string): number | null;
  center: THREE.Vector3; extent: number;
  dispose(): void;
}

const kindOf = (b: SpecBuilding): Kind => b.use === "townhouse" ? "villa" : b.use === "retail" || b.use === "parking" ? "podium" : ["amenity", "school", "mosque", "utility"].includes(b.use) || b.floors <= 4 ? "club" : "tower";
const isComplete = (b: SpecBuilding, s: BuildingState) => s.topped && s.glazed >= b.floors - 0.01 && s.fitted >= b.floors;

/** Axis-aligned boxes round each road segment (for keeping site furniture off the carriageway). */
function roadRects(spec: ProjectModelSpec): Rect[] {
  const out: Rect[] = [];
  for (const r of spec.roads) for (let i = 0; i < r.points.length - 1; i++) {
    const [x1, z1] = r.points[i], [x2, z2] = r.points[i + 1], h = r.width / 2;
    out.push({ x: Math.min(x1, x2) - h, z: Math.min(z1, z2) - h, w: Math.abs(x2 - x1) + 2 * h, d: Math.abs(z2 - z1) + 2 * h });
  }
  return out;
}

// ------------------------------------------------------------------ ground
const PAL = {
  day: { sand: "#d8c3a0", plot: "#cdbb98", asphalt: "#4b4b4f", base: "#8a8a86", line: "#f1efe8", kerb: "#d9d4c8", yard: "#bfb08c", gravel: "#a89f8c", green: "#7fae6a", apron: "#c4bcac", text: "rgba(46,46,47,.42)" },
  night: { sand: "#3a3328", plot: "#353026", asphalt: "#202024", base: "#36363a", line: "#b9b6ad", kerb: "#5a574f", yard: "#3f3a2c", gravel: "#38352e", green: "#2d4a2c", apron: "#4a463e", text: "rgba(255,255,255,.3)" },
};
function drawSpecGround(spec: ProjectModelSpec, o: { night: boolean; size: number; paved: number; landscape: number }) {
  const EW = spec.site.width + 2 * MARGIN, ED = spec.site.depth + 2 * MARGIN;
  const Wpx = o.size, Hpx = ED / EW > 0.7 ? o.size : o.size / 2;
  const { c, g } = canvas(Wpx, Hpx);
  const P = o.night ? PAL.night : PAL.day, R = rng(11);
  g.fillStyle = P.sand; g.fillRect(0, 0, Wpx, Hpx);
  for (let i = 0; i < (Wpx * Hpx) / 90; i++) { g.fillStyle = `rgba(${o.night ? "255,240,210" : "90,70,40"},${0.03 + R() * 0.05})`; g.fillRect(R() * Wpx, R() * Hpx, 1 + R() * 2, 1 + R() * 2); }
  // from here on draw in site metres
  g.save(); g.scale(Wpx / EW, Hpx / ED); g.translate(MARGIN, MARGIN);
  const S = spec.site;
  g.fillStyle = P.plot; g.fillRect(0, 0, S.width, S.depth);
  g.strokeStyle = P.kerb; g.lineWidth = 1; g.strokeRect(0, 0, S.width, S.depth);
  // zones
  for (const z of spec.zones) {
    if (z.kind === "landscape") { g.fillStyle = P.green; g.globalAlpha = 0.25 + 0.75 * o.landscape; g.fillRect(z.x, z.z, z.w, z.d); g.globalAlpha = 1; continue; }
    g.fillStyle = z.kind === "laydown" ? P.yard : z.kind === "parking" ? P.asphalt : P.gravel; g.fillRect(z.x, z.z, z.w, z.d);
    g.strokeStyle = "rgba(0,0,0,.2)"; g.setLineDash([3, 2]); g.lineWidth = 0.5; g.strokeRect(z.x, z.z, z.w, z.d); g.setLineDash([]);
    if (z.kind === "parking") { g.strokeStyle = P.line; g.lineWidth = 0.15; for (let x = z.x + 1; x < z.x + z.w - 2.5; x += 2.6) { g.beginPath(); g.moveTo(x, z.z + 1); g.lineTo(x, z.z + 6); g.moveTo(x, z.z + z.d - 1); g.lineTo(x, z.z + z.d - 6); g.stroke(); } }
    if (z.kind === "laydown") { g.strokeStyle = o.night ? "rgba(0,0,0,.3)" : "rgba(80,60,35,.18)"; g.lineWidth = 0.8; for (let i = 0; i < 3; i++) { const y0 = z.z + R() * z.d; g.beginPath(); g.moveTo(z.x, y0); g.bezierCurveTo(z.x + z.w * 0.3, y0 + (R() - 0.5) * 12, z.x + z.w * 0.7, y0 + (R() - 0.5) * 12, z.x + z.w, y0); g.stroke(); } }
  }
  // building aprons
  g.fillStyle = P.apron;
  for (const b of spec.buildings) g.fillRect(b.x - 3, b.z - 3, b.w + 6, b.d + 6);
  // roads: kerb, then base course or asphalt, centre line, arrows, oil stains
  const path = (pts: [number, number][]) => { g.beginPath(); pts.forEach(([x, z], i) => (i ? g.lineTo(x, z) : g.moveTo(x, z))); };
  g.lineJoin = "round"; g.lineCap = "butt";
  for (const r of spec.roads) { path(r.points); g.strokeStyle = P.kerb; g.lineWidth = r.width + 1.2; g.stroke(); }
  for (const r of spec.roads) { path(r.points); g.strokeStyle = o.paved > 0.99 ? P.asphalt : P.base; g.lineWidth = r.width; g.stroke(); }
  g.strokeStyle = P.line; g.lineWidth = 0.25; g.setLineDash([3, 3]);
  for (const r of spec.roads) { path(r.points); g.stroke(); }
  g.setLineDash([]);
  for (const r of spec.roads) for (let i = 0; i < r.points.length - 1; i++) {
    const [x1, z1] = r.points[i], [x2, z2] = r.points[i + 1], len = Math.hypot(x2 - x1, z2 - z1), ang = Math.atan2(z2 - z1, x2 - x1);
    for (let s = 20; s < len - 10; s += 45) {
      for (const dir of [1, -1]) {
        const off = dir * r.width / 4, x = x1 + (Math.cos(ang) * s) - Math.sin(ang) * off, z = z1 + Math.sin(ang) * s + Math.cos(ang) * off;
        g.save(); g.translate(x, z); g.rotate(dir > 0 ? ang : ang + Math.PI); g.fillStyle = P.line;
        g.beginPath(); g.moveTo(2.2, 0); g.lineTo(0.3, -1.2); g.lineTo(0.3, -0.45); g.lineTo(-2.2, -0.45); g.lineTo(-2.2, 0.45); g.lineTo(0.3, 0.45); g.lineTo(0.3, 1.2); g.closePath(); g.fill(); g.restore();
      }
    }
    for (let k = 0; k < len / 12; k++) { const t = R(); g.fillStyle = `rgba(20,20,20,${0.05 + R() * 0.08})`; g.beginPath(); g.ellipse(x1 + (x2 - x1) * t + (R() - 0.5) * r.width * 0.6, z1 + (z2 - z1) * t + (R() - 0.5) * r.width * 0.6, 0.6 + R() * 1, 0.3 + R() * 0.5, R() * 3, 0, Math.PI * 2); g.fill(); }
  }
  // gates: green apron and a zebra crossing
  for (const gt of spec.gates) {
    g.fillStyle = "#3f9a5a"; g.fillRect(gt.x - 5, gt.z - 1.5, 10, 3);
    g.fillStyle = P.line; for (let i = 0; i < 6; i++) g.fillRect(gt.x - 5 + i * 1.8, gt.z + 2.5, 0.9, 5);
  }
  // crane exclusion zones and radius rings
  for (const cr of spec.cranes) {
    g.save(); g.beginPath(); g.arc(cr.x, cr.z, 5, 0, Math.PI * 2); g.clip(); g.strokeStyle = "rgba(241,90,34,.7)"; g.lineWidth = 0.5;
    for (let k = -12; k < 12; k += 1.8) { g.beginPath(); g.moveTo(cr.x + k - 6, cr.z - 6); g.lineTo(cr.x + k + 6, cr.z + 6); g.stroke(); }
    g.restore();
    g.strokeStyle = "rgba(241,90,34,.5)"; g.setLineDash([4, 2.5]); g.lineWidth = 0.55; g.beginPath(); g.arc(cr.x, cr.z, cr.radius, 0, Math.PI * 2); g.stroke(); g.setLineDash([]);
  }
  // names
  g.fillStyle = P.text; g.font = "700 6px Montserrat, sans-serif"; g.textAlign = "left";
  for (const z of spec.zones) if (z.w > 18) g.fillText(z.name.toUpperCase().slice(0, 28), z.x + 1.5, z.z + 6.5, z.w - 3);
  g.fillStyle = o.night ? "rgba(255,255,255,.55)" : "rgba(255,255,255,.85)"; g.font = "600 3.4px Montserrat, sans-serif"; g.textAlign = "center";
  for (const r of spec.roads) { const [a, b] = r.points; const ang = Math.atan2(b[1] - a[1], b[0] - a[0]); g.save(); g.translate((a[0] + b[0]) / 2, (a[1] + b[1]) / 2); g.rotate(Math.abs(ang) > Math.PI / 2 ? ang + Math.PI : ang); g.fillText(r.name, 0, 1.1); g.restore(); }
  g.restore();
  return tex(c, { aniso: 8 });
}

// ------------------------------------------------------------------ trucks on the spec's roads
interface Path { P: THREE.Vector2[]; seg: number[]; len: number }
function pathOf(pts: [number, number][]): Path {
  const P = [...pts, ...pts.slice(0, -1).reverse()].map(([x, z]) => new THREE.Vector2(x, z));
  const seg = P.slice(1).map((p, i) => p.distanceTo(P[i]));
  return { P, seg, len: seg.reduce((a, b) => a + b, 0) };
}
interface Truck { g: THREE.Group; drum?: THREE.Mesh; path: Path; s: number; speed: number }
function placeTruck(t: Truck) {
  let s = t.s % t.path.len, i = 0;
  while (i < t.path.seg.length - 1 && s > t.path.seg[i]) { s -= t.path.seg[i]; i++; }
  const a = t.path.P[i], b = t.path.P[i + 1], dir = b.clone().sub(a).normalize();
  const p = a.clone().add(dir.clone().multiplyScalar(s)), side = new THREE.Vector2(-dir.y, dir.x).multiplyScalar(-2.4);
  t.g.position.set(p.x + side.x, 0, p.y + side.y); t.g.rotation.y = -Math.atan2(dir.y, dir.x);
}

// ------------------------------------------------------------------ the scene
export function createSpecScene(renderer: THREE.WebGLRenderer, spec: ProjectModelSpec, opts: { textureSize: number; night: boolean }): SpecSceneApi {
  const scene = new THREE.Scene();
  const m = materials();
  let night = opts.night;
  const S = spec.site, cx = S.width / 2, cz = S.depth / 2, extent = Math.max(S.width, S.depth);
  const pm = new THREE.PMREMGenerator(renderer);
  const envTex = pm.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = envTex;

  const skyMat = new THREE.MeshBasicMaterial({ map: sky(night), side: THREE.BackSide, fog: false, depthWrite: false });
  const skyDome = new THREE.Mesh(new THREE.SphereGeometry(Math.max(1600, extent * 4), 32, 16), skyMat); skyDome.position.set(cx, 0, cz); scene.add(skyDome);
  scene.fog = new THREE.Fog(0xe9dcc4, extent * 1.6, extent * 5 + 800);
  scene.background = new THREE.Color(0xe9dcc4);
  const sunDisc = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow(), color: 0xfff3d0, transparent: true, depthWrite: false, fog: false }));
  sunDisc.scale.set(220, 220, 1); scene.add(sunDisc);
  const hemi = new THREE.HemisphereLight(0xdfe9f5, 0xa88c66, 0.7); scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff1dc, 2.6);
  sun.position.set(cx - extent * 0.9, extent * 0.6 + 150, cz + extent * 0.35); sun.target.position.set(cx, 0, cz);
  sun.castShadow = true;
  { const sc = sun.shadow.camera as THREE.OrthographicCamera, h = extent * 0.75 + 60; sc.left = -h; sc.right = h; sc.top = h; sc.bottom = -h; sc.near = 10; sc.far = extent * 4 + 800; }
  sun.shadow.mapSize.set(opts.textureSize >= 4096 ? 4096 : 2048, opts.textureSize >= 4096 ? 4096 : 2048);
  sun.shadow.bias = -0.00015; sun.shadow.normalBias = 0.35; sun.shadow.radius = 3;
  scene.add(sun, sun.target);

  // ground: the drawn site with a margin, sunk desert beyond, a kerb between
  const EW = S.width + 2 * MARGIN, ED = S.depth + 2 * MARGIN;
  let groundKey = "", groundTex = drawSpecGround(spec, { night, size: opts.textureSize, paved: 0, landscape: 0 });
  const groundMat = new THREE.MeshStandardMaterial({ map: groundTex, roughness: 0.95 });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(EW, ED).rotateX(-Math.PI / 2), groundMat);
  ground.position.set(cx, 0, cz); ground.receiveShadow = true; scene.add(ground);
  const desert = new THREE.Mesh(new THREE.PlaneGeometry(extent * 14, extent * 14).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xd2bd98, roughness: 1 }));
  desert.position.set(cx, -0.45, cz); desert.receiveShadow = true; scene.add(desert);
  const kerb = new THREE.Mesh(walls(EW, ED, 0.45, 4, 0.45), new THREE.MeshStandardMaterial({ color: 0xd8d2c4, roughness: 0.9 }));
  kerb.position.set(cx, -0.45, cz); scene.add(kerb);

  const roads = roadRects(spec);
  const env: AroundEnv = { roads, footprints: spec.buildings.map((b) => ({ id: b.id, r: { x: b.x, z: b.z, w: b.w, d: b.d } })) };
  const inRect = (r: Rect, x: number, z: number, pad = 0) => x > r.x - pad && x < r.x + r.w + pad && z > r.z - pad && z < r.z + r.d + pad;
  const onRoad = (x: number, z: number, pad = 0.5) => roads.some((q) => inRect(q, x, z, pad));
  const onBuilding = (x: number, z: number, pad = 2) => spec.buildings.some((b) => inRect(b, x, z, pad));

  // branded hoarding round the site boundary, open at the gates
  const hoard = new THREE.Group(); scene.add(hoard);
  {
    const corners: [number, number][] = [[0, 0], [S.width, 0], [S.width, S.depth], [0, S.depth], [0, 0]];
    for (let e = 0; e < 4; e++) {
      const [x1, z1] = corners[e], [x2, z2] = corners[e + 1], len = Math.hypot(x2 - x1, z2 - z1), n = Math.ceil(len / 12);
      for (let i = 0; i < n; i++) {
        const t0 = i / n, t1 = (i + 1) / n, mx = x1 + (x2 - x1) * (t0 + t1) / 2, mz = z1 + (z2 - z1) * (t0 + t1) / 2;
        if (spec.gates.some((g) => Math.hypot(g.x - mx, g.z - mz) < 9) || onRoad(mx, mz, 0)) continue;
        const p = new THREE.Mesh(box(len / n, 2.8, 0.2, 2.8 * 8, 2.8), m.hoard);
        p.position.set(mx, 1.4, mz); p.rotation.y = -Math.atan2(z2 - z1, x2 - x1); hoard.add(p);
      }
    }
    // gatehouses
    for (const gt of spec.gates) { const side = gt.x < 2 || gt.x > S.width - 2 ? [0, 7] : [7, 0]; hoard.add(at(new THREE.Mesh(box(3, 2.8, 3, 6, 2.8), m.cabin), gt.x + side[0], 1.4, gt.z + side[1])); }
  }
  mergeStatic(hoard); shadow(hoard, true, false);

  // site compound cabins and laydown stock in the spec's zones
  const temp = new THREE.Group(); scene.add(temp);
  {
    const R = rng(23);
    for (const z of spec.zones) {
      const g = new THREE.Group();
      if (z.kind === "compound") {
        const n = Math.max(1, Math.floor((z.w - 4) / 13)), rows = Math.max(1, Math.min(3, Math.floor((z.d - 4) / 7)));
        for (let i = 0; i < n; i++) for (let j = 0; j < rows; j++) for (let k = 0; k < (j === 0 ? 2 : 1); k++) g.add(at(new THREE.Mesh(box(12, 2.9, 3.2, 12, 2.9), m.cabin), z.x + 8.5 + i * 13, 1.45 + k * 3, z.z + 3.5 + j * 6.4));
      } else if (z.kind === "laydown") {
        const n = Math.min(40, Math.floor((z.w * z.d) / 90));
        for (let i = 0; i < n; i++) {
          const t = i % 4, o = t === 0 ? at(new THREE.Mesh(box(12, 0.5 + R() * 0.6, 1.4), m.rust), 0, 0.5, 0) : t === 1 ? at(new THREE.Mesh(box(4.8, 0.6 + R() * 1.6, 2.4), m.ply), 0, 0.8, 0) : t === 2 ? at(new THREE.Mesh(box(8, 0.8 + R() * 1.4, 3.2, 8, 3.2), m.concrete), 0, 0.9, 0) : at(new THREE.Mesh(box(3 + R() * 2, 1.6, 2.2), m.glass), 0, 1.2, 0);
          o.position.x += z.x + 6 + R() * Math.max(1, z.w - 12); o.position.z += z.z + 4 + R() * Math.max(1, z.d - 8); o.rotation.y = R() < 0.5 ? 0 : Math.PI / 2;
          if (!onRoad(o.position.x, o.position.z, 2) && !onBuilding(o.position.x, o.position.z)) g.add(o);
        }
      } else if (z.kind === "parking") {
        const cars = [m.white, m.dark, new THREE.MeshStandardMaterial({ color: 0xb9bec4, roughness: 0.3, metalness: 0.5 })];
        for (let x = z.x + 2.3; x < z.x + z.w - 2.3; x += 2.6) for (const zz of [z.z + 3.5, z.z + z.d - 3.5]) if (R() < 0.62) { g.add(at(new THREE.Mesh(box(1.9, 1.3, 4.4), cars[Math.floor(R() * 3)]), x, 0.75, zz)); g.add(at(new THREE.Mesh(box(1.7, 0.8, 2.3), m.dark), x, 1.75, zz + 0.2)); }
      } else continue;
      temp.add(shadow(mergeStatic(g)));
    }
  }

  // palms and lamps along the roads; palms in the landscape zones (grow in with completion)
  const palmSpots: [number, number][] = [], lampSpots: [number, number][] = [];
  for (const r of spec.roads) for (let i = 0; i < r.points.length - 1; i++) {
    const [x1, z1] = r.points[i], [x2, z2] = r.points[i + 1], len = Math.hypot(x2 - x1, z2 - z1), ux = (x2 - x1) / len, uz = (z2 - z1) / len;
    for (let s = 8; s < len - 4; s += 16) for (const side of [1, -1]) {
      const off = side * (r.width / 2 + 2.6), x = x1 + ux * s - uz * off, z = z1 + uz * s + ux * off;
      if (x < -MARGIN + 4 || x > S.width + MARGIN - 4 || z < -MARGIN + 4 || z > S.depth + MARGIN - 4 || onRoad(x, z, 1) || onBuilding(x, z, 3)) continue;
      (Math.round(s / 16) % 2 ? palmSpots : lampSpots).push([x, z]);
    }
  }
  { const R = rng(41); for (const z of spec.zones) if (z.kind === "landscape") for (let i = 0; i < Math.min(30, (z.w * z.d) / 140); i++) { const x = z.x + 3 + R() * (z.w - 6), zz = z.z + 3 + R() * (z.d - 6); if (!onRoad(x, zz, 1) && !onBuilding(x, zz, 2)) palmSpots.push([x, zz]); } }
  const frond = (() => { const parts: THREE.BufferGeometry[] = []; for (let i = 0; i < 9; i++) { const p = new THREE.PlaneGeometry(1.2, 5.2, 1, 4); const pos = p.attributes.position; for (let k = 0; k < pos.count; k++) { const y = pos.getY(k) + 2.6; pos.setY(k, 0); pos.setZ(k, y); pos.setY(k, -0.09 * y * y + 0.5 * y); } p.rotateY((i / 9) * Math.PI * 2); parts.push(p); } const g = mergeGeometries(parts)!; g.computeVertexNormals(); return g; })();
  const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.22, 0.38, 9, 6).translate(0, 4.5, 0), m.trunk, Math.max(1, palmSpots.length));
  const crowns = new THREE.InstancedMesh(frond.translate(0, 9, 0), m.palm, Math.max(1, palmSpots.length));
  { const mx = new THREE.Matrix4(), R = rng(3); palmSpots.forEach(([x, z], i) => { const s = 0.75 + R() * 0.45; mx.compose(new THREE.Vector3(x, 0, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, R() * 6, (R() - 0.5) * 0.12)), new THREE.Vector3(s, s, s)); trunks.setMatrixAt(i, mx); crowns.setMatrixAt(i, mx); }); }
  // shuffle-free growth: palms appear in a fixed pseudo-random order
  const palms = new THREE.Group(); palms.add(trunks, crowns); shadow(palms, true, false); scene.add(palms);
  const glowTex = glow();
  const lamps = new THREE.Group(); scene.add(lamps);
  const lampPole = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.1, 0.16, 9, 6).translate(0, 4.5, 0), new THREE.MeshStandardMaterial({ color: 0x55575c, roughness: 0.6 }), Math.max(1, lampSpots.length));
  { const mx = new THREE.Matrix4(); lampSpots.forEach(([x, z], i) => lampPole.setMatrixAt(i, mx.makeTranslation(x, 0, z))); }
  lampPole.count = lampSpots.length; lampPole.castShadow = true; lamps.add(lampPole);
  const lampGlow = new THREE.SpriteMaterial({ map: glowTex, color: 0xffe2b0, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
  const lampSprites = new THREE.Group(); lamps.add(lampSprites);
  for (const [x, z] of lampSpots) { const sp = new THREE.Sprite(lampGlow); sp.scale.set(6, 6, 1); at(sp, x, 9.2, z); lampSprites.add(sp); }

  // dynamic: structures, cranes, piling rigs, trucks
  const structs = new THREE.Group(); scene.add(structs);
  const built: Record<string, Built & { key: string }> = {};
  const cranes: (Crane & { building?: string })[] = spec.cranes.map((c, i) => Object.assign(craneModel(m, c.id, { x: c.x, z: c.z, r: c.radius, skip: i % 2 === 1 }), { building: c.building }));
  const craneGroup = new THREE.Group(); cranes.forEach((c) => craneGroup.add(c.root)); scene.add(craneGroup);
  const rigs = new THREE.Group(); scene.add(rigs);
  const trucks: Truck[] = [];
  const truckGroup = new THREE.Group(); scene.add(truckGroup);
  spec.roads.slice(0, 4).forEach((r, ri) => { const path = pathOf(r.points); if (path.len < 30) return; for (let i = 0; i < 2; i++) { const g = truckModel(m, ri * 2 + i); const t: Truck = { g, drum: g.userData.drum, path, s: (path.len * i) / 2 + ri * 13, speed: 6 + ((ri + i) % 3) }; trucks.push(t); truckGroup.add(g); placeTruck(t); } });
  const sel = new THREE.Group(); scene.add(sel);
  const pulseMats: THREE.MeshStandardMaterial[] = [];
  let selId: string | undefined, date = spec.schedule.dataDate, states: Record<string, BuildingState> = {};

  function buildingModel(b: SpecBuilding, s: BuildingState): Built {
    const r = { x: b.x, z: b.z, w: b.w, d: b.d }, kind = kindOf(b);
    let mdl: Built;
    if (kind === "villa") {
      mdl = villaModel(m, b.id, r, { built: Math.min(s.built, 3), active: s.active, enclosed: s.glazed >= b.floors - 0.01, finished: s.fitted >= b.floors, handedOver: s.handedOver }, night);
    } else {
      mdl = towerModel(m, b.id, r, b.floors, { built: s.built, active: s.active, glazed: s.glazed, fitted: s.fitted, topped: s.topped }, b.storeyHeight, { podium: kind === "podium", club: kind === "club" });
      if (b.use === "mosque" && s.topped) {
        // dome and minaret
        const top = b.floors * b.storeyHeight, rr = Math.min(b.w, b.d) * 0.28;
        mdl.group.add(shadow(at(new THREE.Mesh(new THREE.SphereGeometry(rr, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), m.white), 0, top, 0)));
        const min = new THREE.Group(); min.add(at(new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.6, top + 18, 12), m.render), 0, (top + 18) / 2, 0)); min.add(at(new THREE.Mesh(new THREE.ConeGeometry(1.6, 4.5, 12), m.white), 0, top + 20.2, 0));
        at(min, b.w / 2 - 2.5, 0, -b.d / 2 + 2.5); mdl.group.add(shadow(tag(min, b.id)));
      }
    }
    if (s.started || s.built > 0) mdl.group.add(aroundKit(m, b.id, kind, r, { built: s.built, floors: b.floors, glazed: s.glazed, fitted: s.fitted, topped: s.topped, active: s.active }, kind === "villa" ? 3.6 : b.storeyHeight, b.id.length * 7 + Math.round(b.x), env));
    return mdl;
  }

  function setDate(d: string) {
    const first = !Object.keys(states).length;
    date = d; states = specAt(spec, d);
    for (const b of spec.buildings) {
      const s = states[b.id];
      const key = `${s.built}|${Math.round(s.active * 4)}|${Math.round(s.glazed * 2)}|${s.fitted}|${s.topped}|${s.started}|${s.handedOver}|${night}`;
      if (built[b.id]?.key === key) continue;
      if (built[b.id]) { structs.remove(built[b.id].group); disposeTree(built[b.id].group); }
      const mdl = buildingModel(b, s); built[b.id] = { ...mdl, key }; structs.add(mdl.group);
    }
    pulseMats.length = 0; for (const b of Object.values(built)) pulseMats.push(...b.pulse);
    // piling rigs on buildings in substructure
    for (const o of [...rigs.children]) { rigs.remove(o); disposeTree(o); }
    for (const b of spec.buildings) {
      const s = states[b.id]; if (!s.started || s.built > 0 || s.active > 0 || b.use === "townhouse") continue;
      const g = new THREE.Group();
      for (let i = 0; i < Math.min(3, Math.ceil((b.w * b.d) / 900)); i++) {
        const x = b.x + b.w * (0.25 + 0.25 * i), z = b.z + b.d * (i % 2 ? 0.35 : 0.65);
        g.add(at(new THREE.Mesh(box(6, 2.2, 3.4), m.yellow), x, 1.1, z));
        g.add(at(new THREE.Mesh(box(0.9, 22, 0.9, 0.9, 0.9), m.lattice), x + 2.2, 13, z));
        g.add(at(new THREE.Mesh(box(1.6, 1.2, 1.6), m.dark), x + 2.2, 24.4, z));
      }
      const pad = at(new THREE.Mesh(box(b.w, 0.2, b.d), new THREE.MeshStandardMaterial({ color: 0x9c8a6c, roughness: 1 })), b.x + b.w / 2, 0.1, b.z + b.d / 2);
      g.add(pad);
      rigs.add(tag(shadow(g), b.id));
    }
    // cranes: up from the start of their building's structure until it is clad
    for (const c of cranes) {
      const b = spec.buildings.find((x) => x.id === c.building) ?? spec.buildings.reduce<SpecBuilding | undefined>((best, x) => { const dist = Math.hypot(x.x + x.w / 2 - c.root.position.x, x.z + x.d / 2 - c.root.position.z); return !best || dist < Math.hypot(best.x + best.w / 2 - c.root.position.x, best.z + best.d / 2 - c.root.position.z) ? x : best; }, undefined);
      const s = b ? states[b.id] : undefined;
      c.up = !!b && !!s && (s.built > 0 || s.active > 0) && !(s.topped && s.glazed >= b.floors - 0.5);
      c.root.visible = c.up;
      if (!c.up || !b || !s) continue;
      const h = Math.max(36, s.built * b.storeyHeight + 14);
      setCraneHeight(c, h);
      if (first || c.cab > h) c.cab = c.cabTarget = Math.max(6, h * 0.4);
    }
    const anyActive = spec.buildings.some((b) => !isComplete(b, states[b.id]) && states[b.id].started);
    truckGroup.visible = anyActive;
    const done = spec.buildings.filter((b) => isComplete(b, states[b.id])).length / Math.max(1, spec.buildings.length);
    hoard.visible = done < 0.999; temp.visible = done < 0.999;
    const n = Math.round(palmSpots.length * Math.min(1, done * 1.25)); trunks.count = n; crowns.count = n;
    const gk = `${done > 0.6 ? 1 : 0}|${Math.round(done * 5)}`;
    if (gk !== groundKey) { groundKey = gk; redrawGround(done); }
    setSelected(selId);
    return states;
  }
  function redrawGround(done: number) {
    const old = groundTex;
    groundTex = drawSpecGround(spec, { night, size: opts.textureSize, paved: done > 0.6 ? 1 : 0, landscape: done });
    groundMat.map = groundTex; groundMat.needsUpdate = true; old.dispose();
  }

  function setNight(n: boolean) {
    if (n === night && Object.keys(states).length) return;
    night = n;
    skyMat.map?.dispose(); skyMat.map = sky(n); skyMat.needsUpdate = true;
    (scene.fog as THREE.Fog).color.set(n ? 0x161a26 : 0xe9dcc4); (scene.background as THREE.Color).set(n ? 0x161a26 : 0xe9dcc4);
    sunDisc.visible = !n; sunDisc.position.copy(sun.position).sub(sun.target.position).normalize().multiplyScalar(extent * 3 + 600).add(sun.target.position);
    hemi.intensity = n ? 0.32 : 0.7; hemi.color.set(n ? 0x7d8fb8 : 0xdfe9f5); hemi.groundColor.set(n ? 0x2a2420 : 0xa88c66);
    sun.intensity = n ? 0.55 : 3.2; sun.color.set(n ? 0x9fb2ff : 0xfff0d8);
    scene.environmentIntensity = n ? 0.25 : 0.7;
    m.glassLit.emissiveIntensity = n ? 0.95 : 0; m.renderLit.emissiveIntensity = n ? 0.55 : 0;
    (desert.material as THREE.MeshStandardMaterial).color.set(n ? 0x2f2a22 : 0xd2bd98);
    m.ghost.color.set(n ? 0xffffff : 0x2e2e2f); m.ghostFill.color.set(n ? 0xffffff : 0x2e2e2f);
    lampSprites.visible = n;
    groundKey = "";
    for (const k of Object.keys(built)) built[k].key = "";
    setDate(date);
  }
  setNight(night);

  function boundsOf(id: string) {
    const b = new THREE.Box3(); let any = false;
    scene.traverse((o) => { if (o.userData.loc === id && (o as THREE.Mesh).isMesh && !o.userData.ghost && o.visible) { b.expandByObject(o); any = true; } });
    return any ? b : null;
  }
  function setSelected(id?: string) {
    selId = id; sel.clear();
    const bd = id ? spec.buildings.find((x) => x.id === id) : undefined; if (!bd) return;
    const b = boundsOf(id!) ?? new THREE.Box3(new THREE.Vector3(bd.x, 0, bd.z), new THREE.Vector3(bd.x + bd.w, 2, bd.z + bd.d));
    b.expandByScalar(1.2);
    const helper = new THREE.Box3Helper(b, ORANGE); (helper.material as THREE.LineBasicMaterial).depthTest = false; (helper.material as THREE.LineBasicMaterial).transparent = true; helper.renderOrder = 10;
    sel.add(helper);
    const c = b.getCenter(new THREE.Vector3()), size = b.getSize(new THREE.Vector3());
    const ring = new THREE.Mesh(new THREE.RingGeometry(Math.max(size.x, size.z) * 0.62, Math.max(size.x, size.z) * 0.62 + 1.6, 64).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: ORANGE, transparent: true, opacity: 0.75, depthWrite: false }));
    at(ring, c.x, 0.15, c.z); ring.userData.ring = true; sel.add(ring);
  }

  const topAt = (x: number, z: number) => { for (const b of spec.buildings) if (x >= b.x && x <= b.x + b.w && z >= b.z && z <= b.z + b.d) return built[b.id]?.top ?? 0; return 0; };
  function tick(dt: number, time: number, animate: boolean) {
    const p = 0.5 + 0.5 * Math.sin(time * 3.2);
    for (const mm of pulseMats) mm.emissiveIntensity = 0.15 + p * (night ? 1.4 : 0.75);
    m.formwork.emissiveIntensity = night ? 0.25 : 0;
    for (const o of sel.children) if (o.userData.ring) { const s = 1 + 0.05 * Math.sin(time * 2.4); o.scale.set(s, 1, s); }
    for (const c of cranes) {
      c.light.visible = !night || Math.sin(time * 4 + c.r) > 0;
      if (c.up && animate) stepCrane(c, dt, time, topAt);
      else if (c.up) { c.slew.rotation.y = c.ang; c.trolley.position.x = c.tr; c.cable.scale.y = c.cab; c.cable.position.y = 0.6 - c.cab / 2; c.hook.position.y = 0.6 - c.cab; }
    }
    if (animate && truckGroup.visible) for (const t of trucks) { t.s += t.speed * dt; placeTruck(t); if (t.drum) t.drum.rotation.x += dt * 2.4; }
  }
  function pickables() {
    const out: THREE.Object3D[] = [];
    scene.traverse((o) => { if (o.userData.loc && (o as THREE.Mesh).isMesh && !o.userData.ghost && o.visible) out.push(o); });
    return out;
  }
  const heightOf = (id: string) => { const b = boundsOf(id); return b ? b.max.y : null; };
  function disposeTree(o: THREE.Object3D) {
    const shared = new Set<THREE.Material>(Object.values(m) as THREE.Material[]);
    o.traverse((c) => {
      const mesh = c as THREE.Mesh; mesh.geometry?.dispose();
      const mats = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : [];
      for (const mm of mats) if (!shared.has(mm)) mm.dispose();
    });
  }
  function dispose() {
    scene.traverse((c) => { (c as THREE.Mesh).geometry?.dispose(); });
    for (const mm of Object.values(m)) { (mm as THREE.MeshStandardMaterial).map?.dispose(); (mm as THREE.MeshStandardMaterial).emissiveMap?.dispose(); mm.dispose(); }
    groundTex.dispose(); groundMat.dispose(); skyMat.map?.dispose(); skyMat.dispose(); glowTex.dispose(); envTex.dispose(); pm.dispose();
  }
  return { scene, sun, setDate, setNight, setSelected, tick, pickables, heightOf, center: new THREE.Vector3(cx, 0, cz), extent, dispose };
}
