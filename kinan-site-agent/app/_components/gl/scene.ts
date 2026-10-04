/**
 * The 3D site: a lit, shadowed WebGL model of Kinan Heights built from the plan geometry, with every structure drawn
 * floor by floor from the 4D state (lib/scene/progress4d.ts). Towers show the core and jump-form, cast slabs and
 * columns, the deck being cast (pulsing), the branded climbing screen, curtain wall where the façade zones are done,
 * lit fitted-out floors at night, and a dashed ghost of the final massing. Tower cranes run a work cycle (slew,
 * trolley, hoist), hoists travel, trucks loop the haul roads, the pit opens and fills as the basement goes in.
 *
 * World units are metres: x = plan x × 0.5, z = plan y × 0.5, y up.
 */
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { BUILDINGS, PLAN, SHAPES, VILLAS, type Layer } from "@/lib/siteplan";
import { structKey, type SiteState, type StructState, type VillaState } from "@/lib/scene/progress4d";
import { M, cabin, climbScreen, concrete, curtainWall, drawGround, glow, hoarding, lattice, rebar, rng, sky } from "./textures";

export const STOREY = 3.6;
const PODIUM_STOREY = 5.4;
const ORANGE = 0xf15a22;
const CRANE_AT: Record<string, { x: number; z: number; r: number; tower: string }> = {};
for (const s of SHAPES) if (s.layer === "cranes" && s.t === "circle" && s.cls === "crane" && s.loc) {
  const ring = SHAPES.find((q) => q.cls === "crane-r" && q.cx === s.cx && q.cy === s.cy);
  CRANE_AT[s.loc] = { x: s.cx! * M, z: s.cy! * M, r: (ring?.r ?? 100) * M, tower: s.loc === "tc3" ? "hotel-c" : s.loc === "tc2" ? "tower-b" : "tower-a" };
}
const rectOf = (loc: string) => SHAPES.find((s) => s.t === "rect" && s.loc === loc && s.layer !== "base" && s.layer !== "roads");
const W = (r: { x?: number; y?: number; w?: number; h?: number }) => ({ x: r.x! * M, z: r.y! * M, w: r.w! * M, d: r.h! * M });

/** A box whose UVs repeat by face size (so one texture tiles at a fixed real-world module). */
function box(w: number, h: number, d: number, modW = 0, modH = 0) {
  const g = new THREE.BoxGeometry(w, h, d);
  if (modW && modH) {
    const uv = g.attributes.uv as THREE.BufferAttribute;
    const faces: [number, number][] = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
    for (let f = 0; f < 6; f++) for (let v = 0; v < 4; v++) { const i = f * 4 + v; uv.setXY(i, uv.getX(i) * (faces[f][0] / modW), uv.getY(i) * (faces[f][1] / modH)); }
  }
  return g;
}
/** Four outward wall planes round a footprint (no top or bottom), UVs tiled by size. */
function walls(w: number, d: number, h: number, modW: number, modH: number) {
  const parts: THREE.BufferGeometry[] = [];
  const side = (len: number, rotY: number, x: number, z: number) => {
    const p = new THREE.PlaneGeometry(len, h);
    const uv = p.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (len / modW), uv.getY(i) * (h / modH));
    p.rotateY(rotY); p.translate(x, h / 2, z); parts.push(p);
  };
  side(w, 0, 0, d / 2); side(w, Math.PI, 0, -d / 2); side(d, Math.PI / 2, w / 2, 0); side(d, -Math.PI / 2, -w / 2, 0);
  return mergeGeometries(parts)!;
}
const at = <T extends THREE.Object3D>(o: T, x: number, y: number, z: number) => { o.position.set(x, y, z); return o; };
function shadow<T extends THREE.Object3D>(o: T, cast = true, receive = true) { o.traverse((c) => { if ((c as THREE.Mesh).isMesh) { c.castShadow = cast; c.receiveShadow = receive; } }); return o; }
function tag<T extends THREE.Object3D>(o: T, loc?: string): T { if (loc) o.traverse((c) => { c.userData.loc = loc; }); return o; }

interface Mats {
  concrete: THREE.MeshStandardMaterial; core: THREE.MeshStandardMaterial; slabEdge: THREE.MeshStandardMaterial;
  glass: THREE.MeshStandardMaterial; glassLit: THREE.MeshStandardMaterial; formwork: THREE.MeshStandardMaterial; deck: THREE.MeshStandardMaterial;
  screen: THREE.MeshStandardMaterial; steel: THREE.MeshStandardMaterial; lattice: THREE.MeshStandardMaterial; weight: THREE.MeshStandardMaterial;
  render: THREE.MeshStandardMaterial; renderLit: THREE.MeshStandardMaterial; block: THREE.MeshStandardMaterial; water: THREE.MeshStandardMaterial; stone: THREE.MeshStandardMaterial;
  cabin: THREE.MeshStandardMaterial; hoard: THREE.MeshStandardMaterial; ghost: THREE.LineDashedMaterial; ghostFill: THREE.MeshBasicMaterial;
  white: THREE.MeshStandardMaterial; dark: THREE.MeshStandardMaterial; skylight: THREE.MeshStandardMaterial; palm: THREE.MeshStandardMaterial; trunk: THREE.MeshStandardMaterial;
  aviation: THREE.MeshBasicMaterial; rust: THREE.MeshStandardMaterial; ply: THREE.MeshStandardMaterial; sel: THREE.LineBasicMaterial;
}
function materials(): Mats {
  const cw = curtainWall(false), cwl = curtainWall(true);
  const S = (p: THREE.MeshStandardMaterialParameters) => new THREE.MeshStandardMaterial(p);
  const conc = concrete(5, 200), conc2 = concrete(9, 168), stoneT = concrete(13, 222);
  return {
    concrete: S({ map: conc, roughness: 0.92 }),
    core: S({ map: conc2, roughness: 0.95 }),
    slabEdge: S({ color: 0xc9c6bf, roughness: 0.9 }),
    glass: S({ map: cw.map, roughness: 0.18, metalness: 0.55, envMapIntensity: 1.25 }),
    glassLit: S({ map: cw.map, emissiveMap: cwl.emissive, emissive: 0xffd9a0, emissiveIntensity: 0, roughness: 0.18, metalness: 0.55, envMapIntensity: 1.25 }),
    formwork: S({ color: 0xe0a030, roughness: 0.75, emissive: ORANGE, emissiveIntensity: 0 }),
    deck: S({ map: rebar(), roughness: 0.8, emissive: ORANGE, emissiveIntensity: 0 }),
    screen: S({ map: climbScreen(), roughness: 0.7, side: THREE.DoubleSide }),
    steel: S({ color: ORANGE, roughness: 0.55, metalness: 0.3 }),
    lattice: S({ map: lattice("#f15a22"), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.55, metalness: 0.3 }),
    weight: S({ color: 0x8c8a86, roughness: 0.9 }),
    render: S({ color: 0xf2ede3, roughness: 0.85 }),
    renderLit: S({ color: 0xf2ede3, roughness: 0.85, emissive: 0xffd9a0, emissiveIntensity: 0 }),
    block: S({ map: concrete(21, 150), roughness: 0.95 }),
    water: S({ color: 0x3fa7d6, roughness: 0.08, metalness: 0.1, envMapIntensity: 1.4 }),
    stone: S({ map: stoneT, roughness: 0.8 }),
    cabin: S({ map: cabin(), roughness: 0.8 }),
    hoard: S({ map: hoarding(), roughness: 0.7 }),
    ghost: new THREE.LineDashedMaterial({ color: 0x2e2e2f, dashSize: 3, gapSize: 2.4, transparent: true, opacity: 0.45 }),
    ghostFill: new THREE.MeshBasicMaterial({ color: 0x2e2e2f, transparent: true, opacity: 0.045, depthWrite: false }),
    white: S({ color: 0xf4f4f2, roughness: 0.6 }),
    dark: S({ color: 0x24272b, roughness: 0.4, metalness: 0.3 }),
    skylight: S({ color: 0x9cc6dd, roughness: 0.05, metalness: 0.6, transparent: true, opacity: 0.75, envMapIntensity: 1.5 }),
    palm: S({ color: 0x4f7d39, roughness: 0.85, side: THREE.DoubleSide }),
    trunk: S({ color: 0x8a6a48, roughness: 0.95 }),
    aviation: new THREE.MeshBasicMaterial({ color: 0xff2a1a }),
    rust: S({ color: 0x8a4a2a, roughness: 0.9, metalness: 0.2 }),
    ply: S({ color: 0xc89a55, roughness: 0.85 }),
    sel: new THREE.LineBasicMaterial({ color: ORANGE, transparent: true, opacity: 0.95, depthTest: false }),
  };
}


/** Merge a static group's meshes that share a material into one mesh each (fewer draw calls on phones). */
function mergeStatic<T extends THREE.Group>(g: T): T {
  g.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(g.matrixWorld).invert();
  const byMat = new Map<THREE.Material, { geos: THREE.BufferGeometry[]; meshes: THREE.Mesh[] }>();
  g.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || (mesh as unknown as THREE.InstancedMesh).isInstancedMesh || Array.isArray(mesh.material) || o.userData.keep) return;
    const geo = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
    for (const k of Object.keys(geo.attributes)) if (!["position", "normal", "uv"].includes(k)) geo.deleteAttribute(k);
    if (!geo.attributes.uv) geo.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(geo.attributes.position.count * 2), 2));
    geo.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, mesh.matrixWorld));
    const e = byMat.get(mesh.material) ?? { geos: [], meshes: [] };
    e.geos.push(geo); e.meshes.push(mesh); byMat.set(mesh.material, e);
  });
  for (const [mat, e] of byMat) {
    if (e.meshes.length < 2) { e.geos.forEach((x) => x.dispose()); continue; }
    const merged = mergeGeometries(e.geos); e.geos.forEach((x) => x.dispose());
    if (!merged) continue;
    for (const mesh of e.meshes) { mesh.parent?.remove(mesh); mesh.geometry.dispose(); }
    const out = new THREE.Mesh(merged, mat); out.userData = { ...e.meshes[0].userData }; out.castShadow = true; out.receiveShadow = true;
    g.add(out);
  }
  return g;
}

// ------------------------------------------------------------------ structures
interface Built { group: THREE.Group; top: number; pulse: THREE.MeshStandardMaterial[] }

function towerModel(m: Mats, id: string, r: { x: number; z: number; w: number; d: number }, floors: number, s: StructState, storey = STOREY, opts: { podium?: boolean; club?: boolean; raft?: boolean } = {}): Built {
  const g = new THREE.Group();
  const inset = opts.podium ? 0.6 : opts.club ? 1 : Math.min(r.w, r.d) * 0.08;
  const w = r.w - inset * 2, d = r.d - inset * 2, cx = r.x + r.w / 2, cz = r.z + r.d / 2;
  g.position.set(cx, 0, cz);
  const pulse: THREE.MeshStandardMaterial[] = [];
  const top = s.built * storey;
  const glazed = Math.min(Math.floor(s.glazed + 1e-6), s.built), fitted = Math.min(s.fitted, glazed);
  // raft / ground slab
  if (opts.raft !== false) g.add(at(new THREE.Mesh(box(w + 4, 0.8, d + 4, 8, 8), m.concrete), 0, 0.4, 0));
  // slabs (instanced)
  if (s.built > 0) {
    const slab = new THREE.InstancedMesh(box(w, 0.35, d, 8, 8), m.concrete, s.built);
    const mx = new THREE.Matrix4();
    for (let i = 0; i < s.built; i++) slab.setMatrixAt(i, mx.makeTranslation(0, (i + 1) * storey - 0.175, 0));
    g.add(slab);
  }
  // columns on exposed floors (above the curtain wall)
  const exposed = s.built - glazed;
  if (exposed > 0) {
    const nx = Math.max(3, Math.round(w / 9)), nz = Math.max(3, Math.round(d / 9));
    const pos: [number, number][] = [];
    for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) if (i === 0 || j === 0 || i === nx - 1 || j === nz - 1 || (i % 2 === 0 && j % 2 === 0)) pos.push([-w / 2 + 0.6 + (i * (w - 1.2)) / (nx - 1), -d / 2 + 0.6 + (j * (d - 1.2)) / (nz - 1)]);
    const col = new THREE.InstancedMesh(box(0.9, storey - 0.35, 0.9), m.concrete, pos.length * exposed);
    const mx = new THREE.Matrix4(); let n = 0;
    for (let f = glazed; f < s.built; f++) for (const [x, z] of pos) col.setMatrixAt(n++, mx.makeTranslation(x, f * storey + (storey - 0.35) / 2, z));
    g.add(col);
  }
  // curtain wall: fitted floors (lit at night) and the rest of the glazed floors
  const skin = opts.podium ? m.stone : m.glass;
  if (fitted > 0) g.add(at(new THREE.Mesh(box(w + 0.6, fitted * storey, d + 0.6, 9, storey * 4), opts.podium ? m.stone : m.glassLit), 0, (fitted * storey) / 2, 0));
  if (glazed > fitted) g.add(at(new THREE.Mesh(box(w + 0.6, (glazed - fitted) * storey, d + 0.6, 9, storey * 4), skin), 0, fitted * storey + ((glazed - fitted) * storey) / 2, 0));
  if (opts.podium && glazed > 0) {
    // retail shopfronts: a glass band round the ground floor
    g.add(at(new THREE.Mesh(box(w + 0.8, storey * 0.72, d + 0.8, 9, storey * 4), m.glassLit), 0, storey * 0.36 + 0.2, 0));
  }
  // core + jump-form (towers only)
  if (!opts.podium && !opts.club && floors > 5) {
    const cw = Math.min(w * 0.3, 26), cd = Math.min(d * 0.34, 28);
    const coreTop = Math.min(floors * storey + storey, top + (s.topped ? storey : storey * 2));
    if (coreTop > 1) g.add(at(new THREE.Mesh(box(cw, coreTop, cd, 6, 6), m.core), 0, coreTop / 2, 0));
    if (!s.topped && s.built > 0) {
      const jf = at(new THREE.Mesh(box(cw + 2.4, storey * 1.2, cd + 2.4, 4, 4), m.formwork), 0, coreTop + storey * 0.6 - 0.4, 0);
      g.add(jf);
    }
  }
  // the deck being cast: rebar mat + edge formwork, pulsing orange
  if (s.active > 0 && s.built < floors) {
    const y = top + storey - 0.2;
    const deck = new THREE.Mesh(box(w, 0.3, d, 6, 6), m.deck.clone());
    at(deck, 0, y, 0); g.add(deck); pulse.push(deck.material as THREE.MeshStandardMaterial);
    const edge = new THREE.Mesh(walls(w + 0.4, d + 0.4, 0.9, 6, 0.9), m.formwork.clone());
    at(edge, 0, y - 0.1, 0); g.add(edge); pulse.push(edge.material as THREE.MeshStandardMaterial);
  }
  // branded climbing screen round the top three storeys while the frame goes up
  if (!opts.podium && !opts.club && !s.topped && s.built >= 3) {
    const h = storey * 3;
    g.add(at(new THREE.Mesh(walls(w + 2.4, d + 2.4, h, h * 2, h), m.screen), 0, top - storey * 2 + 0.3, 0));
  }
  // roof: parapet, plant and BMU track once topped out
  if (s.topped && s.built > 0) {
    g.add(at(new THREE.Mesh(walls(w + 0.6, d + 0.6, 1.4, 6, 1.4), m.slabEdge), 0, top, 0));
    if (!opts.podium) {
      const R = rng(id.length * 7);
      for (let i = 0; i < 4; i++) g.add(at(new THREE.Mesh(box(4 + R() * 5, 2.2 + R() * 1.5, 3 + R() * 4), m.white), (R() - 0.5) * w * 0.55, top + 1.4, (R() - 0.5) * d * 0.55));
      if (floors > 10) g.add(at(new THREE.Mesh(box(w * 0.7, 0.6, 0.6), m.dark), 0, top + 2.2, d * 0.38));
    }
  }
  // podium atrium: steel grid, then glass
  if (opts.podium && s.built >= 4) {
    const sk = new THREE.Mesh(box(w * 0.34, 1.2, d * 0.42, 4, 4), s.glazed >= 3.9 ? m.skylight : m.lattice);
    g.add(at(sk, 0, top + 0.6, 0));
  }
  // ghost of the finished massing above what is built
  if (s.built < floors) {
    const h = (floors - s.built) * storey;
    const ghost = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(w, h, d)), m.ghost);
    ghost.computeLineDistances();
    at(ghost, 0, top + h / 2, 0); ghost.userData.ghost = true; g.add(ghost);
    const fill = at(new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m.ghostFill), 0, top + h / 2, 0);
    fill.userData.ghost = true; g.add(fill);
  }
  shadow(g); g.traverse((c) => { if (c.userData.ghost) { c.castShadow = false; c.receiveShadow = false; } });
  return { group: tag(g, id), top: Math.max(top, 1) + (s.active > 0 ? storey : 0), pulse };
}

function villaModel(m: Mats, id: string, r: { x: number; z: number; w: number; d: number }, v: VillaState, night: boolean): Built {
  const g = new THREE.Group();
  const w = r.w * 0.82, d = r.d * 0.62, cx = r.x + r.w / 2, cz = r.z + r.d * 0.42;
  g.position.set(cx, 0, cz);
  g.add(at(new THREE.Mesh(box(w + 3, 0.5, d + 3), m.concrete), 0, 0.25, 0));
  const skin = v.finished ? (v.handedOver && night ? m.renderLit : m.render) : v.enclosed ? m.block : null;
  for (let f = 0; f < v.built; f++) {
    const fw = f === 1 ? w * 0.72 : w, fx = f === 1 ? -w * 0.14 : 0;
    g.add(at(new THREE.Mesh(box(fw, 0.3, d), m.concrete), fx, (f + 1) * STOREY, 0));
    if (skin) g.add(at(new THREE.Mesh(box(fw - 0.4, STOREY - 0.3, d - 0.4), skin), fx, f * STOREY + STOREY / 2 + 0.1, 0));
    else for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1], [0, -1], [0, 1]] as const) g.add(at(new THREE.Mesh(box(0.5, STOREY - 0.3, 0.5), m.concrete), fx + (x * (fw - 1)) / 2, f * STOREY + STOREY / 2, (z * (d - 1)) / 2));
    if (v.finished) {
      // windows and a dark glazing band, a pergola on the roof terrace
      g.add(at(new THREE.Mesh(box(fw * 0.6, STOREY * 0.48, 0.1), v.handedOver && night ? m.glassLit : m.dark), fx, f * STOREY + STOREY * 0.55, d / 2 - 0.15));
    }
  }
  if (v.active > 0 && v.built < 2) { const deck = new THREE.Mesh(box(w * 0.95, 0.25, d * 0.95, 6, 6), m.deck.clone()); deck.userData.keep = true; at(deck, 0, (v.built + 1) * STOREY - 0.1, 0); g.add(deck); }
  if (v.finished) {
    g.add(at(new THREE.Mesh(walls(w * 0.72, d, 1, 4, 1), m.render), -w * 0.14, 2 * STOREY, 0));
    g.add(at(new THREE.Mesh(box(w * 0.26, 0.2, d * 0.7), m.dark), w * 0.36, STOREY + 2.8, 0));
    // pool and garden wall
    g.add(at(new THREE.Mesh(box(r.w * 0.5, 0.15, r.d * 0.18), m.water), 0, 0.1, d / 2 + r.d * 0.16));
  }
  shadow(g);
  const pulse: THREE.MeshStandardMaterial[] = [];
  g.traverse((c) => { const mm = (c as THREE.Mesh).material as THREE.MeshStandardMaterial; if (mm?.map && mm.emissive && mm.emissive.getHex() === ORANGE && mm !== m.deck) pulse.push(mm); });
  return { group: tag(mergeStatic(g), id), top: Math.max(1, v.built * STOREY), pulse };
}

// ------------------------------------------------------------------ cranes
interface Crane { id: string; root: THREE.Group; mast: THREE.Mesh; slew: THREE.Group; trolley: THREE.Group; cable: THREE.Mesh; hook: THREE.Group; light: THREE.Mesh; h: number; r: number;
  ang: number; target: number; tr: number; trTarget: number; cab: number; cabTarget: number; phase: "slew" | "trolley" | "lower" | "hold" | "raise"; wait: number; rand: () => number; floors: number; up: boolean }
function craneModel(m: Mats, id: string): Crane {
  const c = CRANE_AT[id];
  const root = new THREE.Group(); root.position.set(c.x, 0, c.z);
  const mast = new THREE.Mesh(box(2.2, 1, 2.2, 2.2, 2.2), m.lattice); root.add(mast);
  root.add(at(new THREE.Mesh(box(6, 1.4, 6), m.concrete), 0, 0.7, 0));
  const slew = new THREE.Group(); root.add(slew);
  const R = c.r, cj = R * 0.3;
  slew.add(at(new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 1.1, 16), m.steel), 0, 0.55, 0));
  slew.add(at(new THREE.Mesh(box(2.6, 2.4, 2.4), m.white), 1.6, 2.2, 1.6));
  slew.add(at(new THREE.Mesh(box(0.1, 1.2, 2), m.dark), 2.95, 2.5, 1.6));
  slew.add(at(new THREE.Mesh(box(R, 1.8, 1.6, 2, 1.8), m.lattice), R / 2, 2, 0));
  slew.add(at(new THREE.Mesh(box(cj, 1.4, 1.6, 2, 1.4), m.lattice), -cj / 2, 2, 0));
  for (let i = 0; i < 4; i++) slew.add(at(new THREE.Mesh(box(1.1, 2.6, 2.2), m.weight), -cj + 1 + i * 1.2, 0.9, 0));
  slew.add(at(new THREE.Mesh(box(0.4, 0.4, 0.4), m.dark), 0, 3.2, 0));
  const light = at(new THREE.Mesh(new THREE.SphereGeometry(0.45, 10, 8), m.aviation), R, 3.1, 0); slew.add(light);
  const trolley = new THREE.Group(); slew.add(trolley);
  trolley.add(at(new THREE.Mesh(box(2, 0.6, 1.8), m.dark), 0, 0.9, 0));
  const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 1, 4), m.dark); trolley.add(cable);
  const hook = new THREE.Group(); trolley.add(hook);
  hook.add(at(new THREE.Mesh(box(0.9, 1.2, 0.6), m.steel), 0, 0, 0));
  // the load: a bundle of rebar or a concrete skip
  const load = new THREE.Group(); hook.add(load);
  if (id === "tc2") load.add(at(new THREE.Mesh(new THREE.CylinderGeometry(1, 0.6, 1.8, 10), m.weight), 0, -2.4, 0));
  else for (let i = 0; i < 5; i++) load.add(at(new THREE.Mesh(box(0.25, 0.25, 9), m.rust), (i - 2) * 0.28, -2, 0));
  shadow(root);
  const rand = rng(id.charCodeAt(2) * 97);
  const ang = rand() * Math.PI * 2;
  return { id, root: tag(root, id) as THREE.Group, mast, slew, trolley, cable, hook, light, h: 0, r: R, ang, target: ang, tr: R * 0.5, trTarget: R * 0.6, cab: 8, cabTarget: 8, phase: "slew", wait: 0, rand, floors: 0, up: false };
}
function setCraneHeight(c: Crane, h: number) {
  if (Math.abs(c.h - h) < 0.01) return;
  c.h = h;
  c.mast.geometry.dispose(); c.mast.geometry = box(2.2, h, 2.2, 2.2, 2.2); c.mast.position.y = h / 2;
  c.slew.position.y = h;
}
function stepCrane(c: Crane, dt: number, time: number, groundAt: (x: number, z: number) => number) {
  const ease = (cur: number, tgt: number, speed: number) => { const dlt = tgt - cur; const s = Math.sign(dlt) * Math.min(Math.abs(dlt), speed * dt * Math.min(1, 0.25 + Math.abs(dlt))); return cur + s; };
  if (c.phase === "slew") {
    let dlt = ((c.target - c.ang + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
    const step = Math.sign(dlt) * Math.min(Math.abs(dlt), 0.22 * dt * Math.min(1, 0.2 + Math.abs(dlt) * 1.5));
    c.ang += step; dlt -= step;
    if (Math.abs(dlt) < 0.002) c.phase = "trolley";
  } else if (c.phase === "trolley") { c.tr = ease(c.tr, c.trTarget, 4); if (Math.abs(c.tr - c.trTarget) < 0.05) c.phase = "lower"; }
  else if (c.phase === "lower") { c.cab = ease(c.cab, c.cabTarget, 6); if (Math.abs(c.cab - c.cabTarget) < 0.05) { c.phase = "hold"; c.wait = 2 + c.rand() * 2; } }
  else if (c.phase === "hold") { c.wait -= dt; if (c.wait <= 0) c.phase = "raise"; }
  else if (c.phase === "raise") {
    c.cab = ease(c.cab, 6, 6);
    if (Math.abs(c.cab - 6) < 0.05) {
      c.phase = "slew"; c.target = c.rand() * Math.PI * 2; c.trTarget = c.r * (0.25 + c.rand() * 0.7);
      const wx = c.root.position.x + Math.cos(c.target) * c.trTarget, wz = c.root.position.z - Math.sin(c.target) * c.trTarget;
      c.cabTarget = Math.max(6, c.h + 2 - groundAt(wx, wz) - 3);
    }
  }
  c.slew.rotation.y = c.ang;
  c.trolley.position.x = c.tr;
  c.cable.scale.y = c.cab; c.cable.position.y = 0.6 - c.cab / 2;
  c.hook.position.y = 0.6 - c.cab;
  c.hook.rotation.z = Math.sin(time * 1.1 + c.r) * 0.03; c.hook.rotation.x = Math.cos(time * 0.9) * 0.02;
}

// ------------------------------------------------------------------ trucks
const RING: [number, number][] = [[104, 104], [104, 894], [1486, 894], [1486, 104]];
const HAUL: [number, number][] = [[1153, 924], [1153, 564], [443, 564], [443, 894], [1153, 894]];
function pathOf(pts: [number, number][], closed: boolean) {
  const P = pts.map(([x, y]) => new THREE.Vector2(x * M, y * M));
  if (closed) P.push(P[0].clone());
  const seg = P.slice(1).map((p, i) => p.distanceTo(P[i]));
  return { P, seg, len: seg.reduce((a, b) => a + b, 0) };
}
interface Truck { g: THREE.Group; drum?: THREE.Mesh; path: ReturnType<typeof pathOf>; s: number; speed: number }
function truckModel(m: Mats, kind: number): THREE.Group {
  const g = new THREE.Group();
  const cab = new THREE.MeshStandardMaterial({ color: [0xf4f4f2, 0xf15a22, 0x2e2e2f][kind % 3], roughness: 0.5 });
  g.add(at(new THREE.Mesh(box(2.5, 2.6, 2.4), cab), 4.1, 1.9, 0));
  g.add(at(new THREE.Mesh(box(0.1, 1, 2), m.dark), 5.36, 2.3, 0));
  g.add(at(new THREE.Mesh(box(9, 0.5, 2.4), m.dark), 0.5, 0.9, 0));
  for (const x of [-2.6, -1.2, 3.8]) for (const z of [-1.1, 1.1]) g.add(at(new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.45, 12).rotateX(Math.PI / 2), m.dark), x, 0.55, z));
  if (kind % 3 === 0) {
    const drum = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.35, 5.4, 14).rotateZ(Math.PI / 2 - 0.18), new THREE.MeshStandardMaterial({ color: 0xe8e6e1, roughness: 0.45 }));
    at(drum, -0.4, 2.6, 0); g.add(drum); g.userData.drum = drum;
  } else if (kind % 3 === 1) {
    for (let i = 0; i < 4; i++) g.add(at(new THREE.Mesh(box(6.5, 0.22, 0.22), m.rust), -0.6, 1.35, (i - 1.5) * 0.4));
  } else g.add(at(new THREE.Mesh(box(5.6, 1.6, 2.4), new THREE.MeshStandardMaterial({ color: 0x9c8f78, roughness: 0.8 })), -0.6, 1.95, 0));
  return shadow(g, true, false);
}
function placeTruck(t: Truck) {
  let s = t.s % t.path.len, i = 0;
  while (s > t.path.seg[i]) { s -= t.path.seg[i]; i++; }
  const a = t.path.P[i], b = t.path.P[i + 1], dir = b.clone().sub(a).normalize();
  const p = a.clone().add(dir.clone().multiplyScalar(s));
  const side = new THREE.Vector2(-dir.y, dir.x).multiplyScalar(-3.2); // keep right
  t.g.position.set(p.x + side.x, 0, p.y + side.y);
  t.g.rotation.y = -Math.atan2(dir.y, dir.x);
}

// ------------------------------------------------------------------ the scene
export interface SiteSceneApi {
  scene: THREE.Scene; sun: THREE.DirectionalLight;
  setState(s: SiteState): void; setNight(n: boolean): void; setLayers(l: Record<Layer, boolean>): void; setSelected(id?: string): void;
  tick(dt: number, time: number, animate: boolean): void;
  pickables(): THREE.Object3D[]; topOf(id: string): number; heightOf(id: string): number | null;
  dispose(): void;
}

export function createSiteScene(renderer: THREE.WebGLRenderer, opts: { textureSize: number; night: boolean; layers: Record<Layer, boolean> }): SiteSceneApi {
  const scene = new THREE.Scene();
  const m = materials();
  let night = opts.night, layers = opts.layers;
  const pm = new THREE.PMREMGenerator(renderer);
  const envTex = pm.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = envTex;

  // sky, fog, light
  const skyMat = new THREE.MeshBasicMaterial({ map: sky(night), side: THREE.BackSide, fog: false, depthWrite: false });
  const skyDome = new THREE.Mesh(new THREE.SphereGeometry(3000, 32, 16), skyMat); skyDome.position.set(400, 0, 250); scene.add(skyDome);
  scene.fog = new THREE.Fog(0xe9dcc4, 900, 2600);
  const hemi = new THREE.HemisphereLight(0xdfe9f5, 0xa88c66, 0.7); scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff1dc, 2.6);
  // late-afternoon Riyadh sun from the south-west: long shadows towards the north-east
  sun.position.set(400 - 470, 270, 250 + 150); sun.target.position.set(400, 0, 250);
  sun.castShadow = true;
  const sc = sun.shadow.camera as THREE.OrthographicCamera;
  sc.left = -520; sc.right = 520; sc.top = 380; sc.bottom = -380; sc.near = 10; sc.far = 1500;
  sun.shadow.mapSize.set(opts.textureSize >= 4096 ? 4096 : 2048, opts.textureSize >= 4096 ? 4096 : 2048);
  sun.shadow.bias = -0.0003; sun.shadow.normalBias = 0.8;
  scene.add(sun, sun.target);

  // ground: desert, then the plot drawn from the plan with a hole for the basement pit
  let groundTex = drawGround({ layers, night, roads: 0, landscape: 0, size: opts.textureSize });
  const groundMat = new THREE.MeshStandardMaterial({ map: groundTex, roughness: 0.95 });
  const bas = SHAPES.find((s) => s.cls === "basement")!;
  const B = W(bas);
  const V = (x: number, z: number) => new THREE.Vector2(x, -z);
  const shape = new THREE.Shape([V(0, 0), V(PLAN.w * M, 0), V(PLAN.w * M, PLAN.h * M), V(0, PLAN.h * M)]);
  shape.holes.push(new THREE.Path([V(B.x, B.z), V(B.x, B.z + B.d), V(B.x + B.w, B.z + B.d), V(B.x + B.w, B.z)]));
  const uvByWorld = (geo: THREE.BufferGeometry) => { const p = geo.attributes.position, uv = new Float32Array(p.count * 2); for (let i = 0; i < p.count; i++) { uv[i * 2] = p.getX(i) / (PLAN.w * M); uv[i * 2 + 1] = 1 - p.getZ(i) / (PLAN.h * M); } geo.setAttribute("uv", new THREE.BufferAttribute(uv, 2)); return geo; };
  const groundGeo = uvByWorld(new THREE.ShapeGeometry(shape).rotateX(-Math.PI / 2));
  const dShape = new THREE.Shape([V(-3000, -3000), V(3800, -3000), V(3800, 3500), V(-3000, 3500)]);
  dShape.holes.push(new THREE.Path([V(B.x, B.z), V(B.x, B.z + B.d), V(B.x + B.w, B.z + B.d), V(B.x + B.w, B.z)]));
  const desert = new THREE.Mesh(new THREE.ShapeGeometry(dShape).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xd2bd98, roughness: 1 }));
  desert.position.y = -0.06; desert.receiveShadow = true; scene.add(desert);
  const ground = new THREE.Mesh(groundGeo, groundMat); ground.receiveShadow = true; scene.add(ground);
  const cover = new THREE.Mesh(uvByWorld(new THREE.PlaneGeometry(B.w, B.d).rotateX(-Math.PI / 2).translate(B.x + B.w / 2, 0, B.z + B.d / 2)), groundMat);
  cover.receiveShadow = true; scene.add(cover);
  // pit: walls of secant piles, floor, basement slabs filling it
  const pit = new THREE.Group(); scene.add(pit);
  const pitWallMat = new THREE.MeshStandardMaterial({ map: concrete(31, 150), roughness: 1, side: THREE.BackSide });
  const pitWalls = new THREE.Mesh(walls(B.w, B.d, 15, 6, 15), pitWallMat); at(pitWalls, B.x + B.w / 2, -15, B.z + B.d / 2); pit.add(pitWalls);
  const pitFloor = new THREE.Mesh(new THREE.PlaneGeometry(B.w, B.d).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xa48a66, roughness: 1 }));
  at(pitFloor, B.x + B.w / 2, -14.5, B.z + B.d / 2); pit.add(pitFloor);
  const basSlabs = new THREE.InstancedMesh(box(B.w - 0.4, 0.4, B.d - 0.4, 8, 8), m.concrete, 3); at(basSlabs, B.x + B.w / 2, 0, B.z + B.d / 2); pit.add(basSlabs);
  shadow(pit, false, true);

  // hoarding round the plot, branded
  const fence = SHAPES.find((s) => s.cls === "fence")!.pts!;
  const hoard = new THREE.Group(); scene.add(hoard);
  for (let i = 0; i < fence.length - 1; i++) {
    const a = new THREE.Vector2(fence[i][0] * M, fence[i][1] * M), b = new THREE.Vector2(fence[i + 1][0] * M, fence[i + 1][1] * M);
    const len = a.distanceTo(b), mid = a.clone().add(b).multiplyScalar(0.5);
    const p = new THREE.Mesh(box(len, 2.8, 0.2, 2.8 * 8, 2.8), m.hoard);
    p.position.set(mid.x, 1.4, mid.y); p.rotation.y = -Math.atan2(b.y - a.y, b.x - a.x);
    hoard.add(p);
  }
  mergeStatic(hoard); shadow(hoard, true, false);

  // palms
  const trees = SHAPES.filter((s) => s.t === "circle" && s.cls === "tree");
  const frond = (() => { const parts: THREE.BufferGeometry[] = []; for (let i = 0; i < 9; i++) { const p = new THREE.PlaneGeometry(1.2, 5.2, 1, 4); const pos = p.attributes.position; for (let k = 0; k < pos.count; k++) { const y = pos.getY(k) + 2.6; pos.setY(k, 0); pos.setZ(k, y); pos.setY(k, -0.09 * y * y + 0.5 * y); } p.rotateY((i / 9) * Math.PI * 2); parts.push(p); } return mergeGeometries(parts)!; })();
  frond.computeVertexNormals();
  const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.22, 0.38, 9, 6).translate(0, 4.5, 0), m.trunk, trees.length);
  const crowns = new THREE.InstancedMesh(frond.translate(0, 9, 0), m.palm, trees.length);
  { const mx = new THREE.Matrix4(), R = rng(3); trees.forEach((t, i) => { const s = 0.8 + R() * 0.45; mx.compose(new THREE.Vector3(t.cx! * M, 0, t.cy! * M), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, R() * 6, (R() - 0.5) * 0.12)), new THREE.Vector3(s, s, s)); trunks.setMatrixAt(i, mx); crowns.setMatrixAt(i, mx); }); }
  const palms = new THREE.Group(); palms.add(trunks, crowns); shadow(palms, true, false); scene.add(palms);

  // floodlights (night)
  const glowTex = glow();
  const lights = new THREE.Group(); scene.add(lights);
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x55575c, roughness: 0.6 });
  const spriteMat = new THREE.SpriteMaterial({ map: glowTex, color: 0xffe2b0, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
  for (const [x, y] of [[140, 130], [140, 520], [880, 130], [880, 520], [140, 600], [1130, 600], [1130, 890], [140, 890], [1500, 130], [1500, 520], [620, 600], [880, 890]] as const) {
    const pole = at(new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.3, 18, 6), poleMat), x * M, 9, y * M); pole.castShadow = true; lights.add(pole);
    const sp = new THREE.Sprite(spriteMat); sp.scale.set(14, 14, 1); at(sp, x * M, 18.4, y * M); sp.userData.flood = true; lights.add(sp);
  }

  // static temp works and services
  const temp = new THREE.Group(); scene.add(temp);
  const services = new THREE.Group(); scene.add(services);
  const tempParts: Record<string, THREE.Group> = {};
  const addTemp = (loc: string, g: THREE.Group) => { tempParts[loc] = tag(shadow(loc === "labour-camp" ? g : mergeStatic(g)), loc) as THREE.Group; temp.add(tempParts[loc]); };
  {
    const R = rng(17);
    for (const loc of ["site-office", "store", "testing-lab"]) {
      const r = rectOf(loc); if (!r) continue; const q = W(r); const g = new THREE.Group();
      const n = Math.max(1, Math.floor(q.w / 13)), rows = Math.max(1, Math.floor(q.d / 7)), lv = loc === "site-office" ? 2 : 1;
      for (let i = 0; i < n; i++) for (let j = 0; j < rows; j++) for (let k = 0; k < lv; k++) g.add(at(new THREE.Mesh(box(12, 2.9, 3.2, 12, 2.9), m.cabin), q.x + 6.6 + i * 13, 1.45 + k * 3, q.z + 2 + j * 6.4));
      addTemp(loc, g);
    }
    // labour camp: cabins from the plan (phase 1 then phase 2)
    const camp = new THREE.Group();
    SHAPES.filter((s) => s.t === "rect" && s.cls === "cabin").forEach((s, i) => { const q = W(s); const b = at(new THREE.Mesh(box(q.w, 3, q.d, 12, 3), m.cabin), q.x + q.w / 2, 1.5, q.z + q.d / 2); b.userData.phase = i < 6 ? 1 : 2; b.userData.idx = i; camp.add(b); });
    addTemp("labour-camp", camp);
    // batching plant: silos, mixer tower, conveyor, aggregate piles
    const bp = new THREE.Group(), br = W(rectOf("batching")!);
    SHAPES.filter((s) => s.t === "circle" && s.cls === "silo").forEach((s) => { bp.add(at(new THREE.Mesh(new THREE.CylinderGeometry(4.2, 4.2, 16, 18), m.white), s.cx! * M, 8 + 5, s.cy! * M)); bp.add(at(new THREE.Mesh(new THREE.ConeGeometry(4.2, 5, 18).rotateX(Math.PI), m.white), s.cx! * M, 2.5, s.cy! * M)); });
    bp.add(at(new THREE.Mesh(box(8, 20, 8, 4, 4), m.cabin), br.x + br.w * 0.62, 10, br.z + br.d * 0.4));
    const conv = at(new THREE.Mesh(box(30, 1.2, 1.6), m.steel), br.x + br.w * 0.62 - 12, 8, br.z + br.d * 0.75); conv.rotation.z = 0.45; conv.rotation.y = 0.5; bp.add(conv);
    for (let i = 0; i < 3; i++) bp.add(at(new THREE.Mesh(new THREE.ConeGeometry(5.5, 4.5, 12), new THREE.MeshStandardMaterial({ color: [0xb7a88d, 0x8f8778, 0xd0c4a8][i], roughness: 1 })), br.x + 8 + i * 12, 2.25, br.z + br.d - 8));
    addTemp("batching", bp);
    // yards: rebar bundles, formwork stacks, MEP crates and façade units, precast panels, skips
    const yard = (loc: string, n: number, mk: (i: number) => THREE.Object3D) => { const r = rectOf(loc); if (!r) return; const q = W(r), g = new THREE.Group(); for (let i = 0; i < n; i++) { const o = mk(i); o.position.x += q.x + 4 + R() * (q.w - 8); o.position.z += q.z + 4 + R() * (q.d - 8); o.rotation.y = R() < 0.5 ? 0 : Math.PI / 2; g.add(o); } addTemp(loc, g); };
    yard("rebar-yard", 22, () => at(new THREE.Mesh(box(12, 0.5 + R() * 0.6, 1.4), m.rust), 0, 0.5, 0));
    yard("laydown-1", 26, () => at(new THREE.Mesh(box(4.8, 0.6 + R() * 1.6, 2.4), m.ply), 0, 0.8, 0));
    yard("laydown-2", 30, (i) => at(new THREE.Mesh(box(3 + R() * 3, 1.4 + R() * 1.2, 2.2), i % 3 === 0 ? m.glass : new THREE.MeshStandardMaterial({ color: [0x3a6ea5, 0x8a8f96, 0xdad6cc][i % 3], roughness: 0.7 })), 0, 1.2, 0));
    yard("laydown-3", 18, () => at(new THREE.Mesh(box(8, 0.8 + R() * 1.6, 3.2, 8, 3.2), m.concrete), 0, 1, 0));
    yard("waste-yard", 9, (i) => at(new THREE.Mesh(box(5.5, 1.8, 2.4), new THREE.MeshStandardMaterial({ color: [0x2e7d32, 0x1f5fd1, 0xd99400][i % 3], roughness: 0.6 })), 0, 0.9, 0));
    // guard huts
    SHAPES.filter((s) => s.t === "rect" && s.cls === "guard").forEach((s) => { const q = W(s); temp.add(shadow(at(new THREE.Mesh(box(q.w, 2.8, q.d, 6, 2.8), m.cabin), q.x + q.w / 2, 1.4, q.z + q.d / 2))); });
    // services
    const svc = (loc: string, mk: (q: ReturnType<typeof W>) => THREE.Group) => { const r = rectOf(loc); if (!r) return; const g = mergeStatic(mk(W(r))); tag(shadow(g), loc); g.userData.svc = loc; services.add(g); };
    svc("substation", (q) => { const g = new THREE.Group(); g.add(at(new THREE.Mesh(box(q.w, 7, q.d * 0.6, 6, 7), m.stone), q.x + q.w / 2, 3.5, q.z + q.d * 0.3)); for (let i = 0; i < 2; i++) g.add(at(new THREE.Mesh(box(6, 4.5, 5), m.dark), q.x + 10 + i * 16, 2.25, q.z + q.d * 0.8)); return g; });
    svc("stp", (q) => { const g = new THREE.Group(); for (let i = 0; i < 3; i++) g.add(at(new THREE.Mesh(new THREE.CylinderGeometry(8, 8, 6, 24), m.concrete), q.x + 12 + i * 18, 3, q.z + 14)); g.add(at(new THREE.Mesh(box(q.w * 0.8, 6, 16, 6, 6), m.stone), q.x + q.w / 2, 3, q.z + q.d - 12)); return g; });
    svc("water-tank", (q) => { const g = new THREE.Group(); g.add(at(new THREE.Mesh(new THREE.CylinderGeometry(Math.min(q.w, q.d) * 0.42, Math.min(q.w, q.d) * 0.42, 12, 32), m.white), q.x + q.w / 2, 6, q.z + q.d / 2)); return g; });
    svc("mosque", (q) => { const g = new THREE.Group(); g.add(at(new THREE.Mesh(box(q.w * 0.9, 9, q.d * 0.9, 6, 9), m.render), q.x + q.w / 2, 4.5, q.z + q.d / 2)); g.add(at(new THREE.Mesh(new THREE.SphereGeometry(Math.min(q.w, q.d) * 0.26, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), m.white), q.x + q.w / 2, 9, q.z + q.d / 2)); const min = new THREE.Group(); min.add(at(new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.8, 30, 12), m.render), 0, 15, 0)); min.add(at(new THREE.Mesh(new THREE.ConeGeometry(1.8, 5, 12), m.white), 0, 32.5, 0)); at(min, q.x + q.w - 4, 0, q.z + 4); g.add(min); return g; });
  }

  // dynamic: structures, cranes, hoists, trucks
  const structs = new THREE.Group(); scene.add(structs);
  const built: Record<string, Built & { key: string }> = {};
  const cranes = Object.keys(CRANE_AT).map((id) => craneModel(m, id));
  const craneGroup = new THREE.Group(); cranes.forEach((c) => craneGroup.add(c.root)); scene.add(craneGroup);
  const hoists = new THREE.Group(); scene.add(hoists);
  const hoistCages: { cage: THREE.Mesh; top: number; ph: number }[] = [];
  const trucks: Truck[] = [];
  const truckGroup = new THREE.Group(); scene.add(truckGroup);
  { const ring = pathOf(RING, true), haul = pathOf(HAUL, true); for (let i = 0; i < 7; i++) { const g = truckModel(m, i); const path = i < 3 ? ring : haul; const t: Truck = { g, drum: g.userData.drum, path, s: (path.len * i) / (i < 3 ? 3 : 4), speed: 7 + (i % 3) }; trucks.push(t); truckGroup.add(g); placeTruck(t); } }
  const sel = new THREE.Group(); scene.add(sel);
  let selId: string | undefined;
  let state: SiteState | null = null;
  const pulseMats: THREE.MeshStandardMaterial[] = [];

  const footprint = (id: string) => { const b = BUILDINGS.find((x) => x.id === id); return b ? W(b) : null; };
  const rebuildPulse = () => { pulseMats.length = 0; for (const b of Object.values(built)) pulseMats.push(...b.pulse); };

  function setState(s: SiteState) {
    const first = !state;
    state = s;
    // structures
    for (const b of BUILDINGS) {
      const st = s.struct[b.id]; if (!st) continue;
      const key = structKey(st) + (night ? "n" : "d") + (b.id === "podium" ? String(s.groundSlab) : "");
      if (built[b.id]?.key === key) continue;
      if (built[b.id]) { structs.remove(built[b.id].group); disposeTree(built[b.id].group); }
      const r = footprint(b.id)!;
      const mdl = b.id === "podium" ? towerModel(m, b.id, r, 4, st, PODIUM_STOREY, { podium: true, raft: s.groundSlab }) : b.id === "club-e" ? towerModel(m, b.id, r, 3, st, 4.6, { club: true }) : towerModel(m, b.id, r, b.floors, st);
      built[b.id] = { ...mdl, key }; structs.add(mdl.group);
    }
    for (const v of VILLAS) {
      const vs = s.villas[v.id]; if (!vs) continue;
      const key = `${vs.built}|${Math.round(vs.active * 3)}|${vs.enclosed}|${vs.finished}|${vs.handedOver}|${night}`;
      if (built[v.id]?.key === key) continue;
      if (built[v.id]) { structs.remove(built[v.id].group); disposeTree(built[v.id].group); }
      const mdl = villaModel(m, v.id, W(v), vs, night);
      built[v.id] = { ...mdl, key }; structs.add(mdl.group);
    }
    rebuildPulse();
    // pit
    const open = s.excavation > 0 && !s.groundSlab;
    cover.visible = !open; pit.visible = open;
    pitFloor.position.y = -Math.max(0.6, 14.5 * s.excavation);
    pitWalls.position.y = pitFloor.position.y; pitWalls.scale.y = -pitFloor.position.y / 15;
    const sink = open ? pitFloor.position.y + 3.6 * s.basementLevels : 0;
    for (const id of ["tower-a", "tower-b", "podium"]) if (built[id]) built[id].group.position.y = sink;
    basSlabs.count = s.basementLevels;
    { const mx = new THREE.Matrix4(); for (let i = 0; i < 3; i++) basSlabs.setMatrixAt(i, mx.makeTranslation(0, -14.5 + 3.6 * (i + 1), 0)); basSlabs.instanceMatrix.needsUpdate = true; }
    // cranes
    for (const c of cranes) {
      const cs = s.cranes[c.id]; c.up = !!cs?.up; c.root.visible = c.up && layers.cranes;
      if (!cs?.up) continue;
      const h = cs.erect < 1 ? Math.max(8, 60 * cs.erect) : Math.max(40, cs.floors * STOREY + 10);
      setCraneHeight(c, h); c.slew.visible = cs.erect >= 1;
      if (first) c.cab = c.cabTarget = Math.max(6, h * 0.4);
    }
    // hoists ride up the tower faces
    for (const h of [...hoists.children]) { hoists.remove(h); disposeTree(h); }
    hoistCages.length = 0;
    if (s.hoists && layers.cranes) for (const id of ["hoist-a", "hoist-b"]) {
      const r = rectOf(id); if (!r) continue;
      const tower = id === "hoist-a" ? "tower-a" : "tower-b", top = Math.max(10, (s.struct[tower]?.built ?? 0) * STOREY + 4);
      const q = W(r);
      const g = new THREE.Group();
      g.add(at(new THREE.Mesh(box(1.4, top, 1.4, 1.4, 1.4), m.lattice), q.x + q.w / 2, top / 2, q.z + q.d / 2));
      const cage = at(new THREE.Mesh(box(3.2, 2.6, 2.4), m.steel), q.x + q.w / 2 + (id === "hoist-a" ? -2.2 : 2.2), 2, q.z + q.d / 2);
      g.add(cage); hoistCages.push({ cage, top, ph: id === "hoist-a" ? 0 : 2.4 });
      hoists.add(tag(shadow(g), id));
    }
    // temp works appear with mobilisation; camp grows in two phases; batching after installation
    for (const [loc, g] of Object.entries(tempParts)) {
      if (loc === "labour-camp") g.children.forEach((c) => { c.visible = c.userData.phase === 1 ? c.userData.idx < Math.round(6 * s.temp.camp1) : s.temp.camp2 > (c.userData.idx - 5) / 3; });
      else if (loc === "batching") g.visible = s.temp.batching > 0.2;
      else g.visible = s.temp.offices > 0.3;
    }
    for (const g of services.children) { const f = s.services[g.userData.svc as string] ?? 1; g.visible = f > 0.05; g.scale.y = Math.max(0.05, Math.min(1, f * 1.4)); }
    truckGroup.visible = s.mobilised > 0.5;
    hoard.visible = s.mobilised > 0.2;
    // ground: redraw only when the road surface or landscaping changes state
    const gk = `${s.roads > 0.99}|${Math.round(s.landscape * 5)}`;
    if (groundKey !== gk) { groundKey = gk; redrawGround(); }
    setSelected(selId);
  }
  let groundKey = "";
  function redrawGround() {
    const old = groundTex;
    groundTex = drawGround({ layers, night, roads: state?.roads ?? 0, landscape: state?.landscape ?? 0, size: opts.textureSize });
    groundMat.map = groundTex; groundMat.needsUpdate = true; old.dispose();
  }

  function setNight(n: boolean) {
    if (n === night && state) return;
    night = n;
    skyMat.map?.dispose(); skyMat.map = sky(n); skyMat.needsUpdate = true;
    (scene.fog as THREE.Fog).color.set(n ? 0x161a26 : 0xe9dcc4);
    hemi.intensity = n ? 0.32 : 0.7; hemi.color.set(n ? 0x7d8fb8 : 0xdfe9f5); hemi.groundColor.set(n ? 0x2a2420 : 0xa88c66);
    sun.intensity = n ? 0.55 : 3.2; sun.color.set(n ? 0x9fb2ff : 0xfff0d8);
    scene.environmentIntensity = n ? 0.25 : 0.7;
    m.glassLit.emissiveIntensity = n ? 0.95 : 0;
    m.renderLit.emissiveIntensity = n ? 0.55 : 0;
    (desert.material as THREE.MeshStandardMaterial).color.set(n ? 0x2f2a22 : 0xd2bd98);
    m.ghost.color.set(n ? 0xffffff : 0x2e2e2f); m.ghostFill.color.set(n ? 0xffffff : 0x2e2e2f);
    lights.children.forEach((c) => { if (c.userData.flood) c.visible = n; });
    redrawGround();
    if (state) { for (const k of Object.keys(built)) built[k].key = ""; setState(state); }
  }
  setNight(night);

  function setLayers(l: Record<Layer, boolean>) {
    const gk = `${l.grid}|${l.utilities}|${l.cranes}`, ok = `${layers.grid}|${layers.utilities}|${layers.cranes}`;
    layers = l;
    structs.visible = l.buildings; services.visible = l.buildings;
    temp.visible = l.temp; palms.visible = l.landscape;
    if (gk !== ok) redrawGround();
    if (state) setState(state);
  }
  setLayers(layers);

  function boundsOf(id: string) {
    const objs: THREE.Object3D[] = [];
    scene.traverse((o) => { if (o.userData.loc === id && (o as THREE.Mesh).isMesh && !o.userData.ghost && o.visible) objs.push(o); });
    if (!objs.length) return null;
    const b = new THREE.Box3();
    for (const o of objs) b.expandByObject(o);
    return b;
  }
  function setSelected(id?: string) {
    selId = id;
    sel.clear();
    if (!id) return;
    const b = boundsOf(id); if (!b) return;
    b.expandByScalar(1.2);
    const helper = new THREE.Box3Helper(b, ORANGE); (helper.material as THREE.LineBasicMaterial).depthTest = false; (helper.material as THREE.LineBasicMaterial).transparent = true; helper.renderOrder = 10;
    sel.add(helper);
    const c = b.getCenter(new THREE.Vector3()), size = b.getSize(new THREE.Vector3());
    const ring = new THREE.Mesh(new THREE.RingGeometry(Math.max(size.x, size.z) * 0.62, Math.max(size.x, size.z) * 0.62 + 2.2, 64).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: ORANGE, transparent: true, opacity: 0.75, depthWrite: false }));
    at(ring, c.x, 0.15, c.z); ring.userData.ring = true; sel.add(ring);
  }

  function tick(dt: number, time: number, animate: boolean) {
    const p = 0.5 + 0.5 * Math.sin(time * 3.2);
    for (const mm of pulseMats) mm.emissiveIntensity = 0.15 + p * (night ? 1.4 : 0.75);
    m.formwork.emissiveIntensity = night ? 0.25 : 0;
    for (const o of sel.children) if (o.userData.ring) { const s = 1 + 0.05 * Math.sin(time * 2.4); o.scale.set(s, 1, s); }
    for (const c of cranes) { c.light.visible = !night || Math.sin(time * 4 + c.r) > 0; if (c.up && c.slew.visible && animate) stepCrane(c, dt, time, (x, z) => groundAt(x, z)); else if (c.up) { c.slew.rotation.y = c.ang; c.trolley.position.x = c.tr; c.cable.scale.y = c.cab; c.cable.position.y = 0.6 - c.cab / 2; c.hook.position.y = 0.6 - c.cab; } }
    if (animate) {
      for (const h of hoistCages) h.cage.position.y = 2 + (h.top - 4) * (0.5 - 0.5 * Math.cos(time * 0.18 + h.ph));
      for (const t of trucks) { t.s += t.speed * dt; placeTruck(t); if (t.drum) t.drum.rotation.x += dt * 2.4; }
    }
  }
  function groundAt(x: number, z: number) {
    for (const [id, b] of Object.entries(built)) {
      const r = footprint(id); if (!r) continue;
      if (x >= r.x && x <= r.x + r.w && z >= r.z && z <= r.z + r.d) return b.top;
    }
    return 0;
  }
  function pickables() {
    const out: THREE.Object3D[] = [];
    scene.traverse((o) => { if (o.userData.loc && (o as THREE.Mesh).isMesh && !o.userData.ghost && o.visible) out.push(o); });
    return out;
  }
  const heightOf = (id: string) => { const b = boundsOf(id); return b ? b.max.y : null; };
  const topOf = (id: string) => built[id]?.top ?? heightOf(id) ?? 0;

  function disposeTree(o: THREE.Object3D) {
    o.traverse((c) => {
      const mesh = c as THREE.Mesh;
      mesh.geometry?.dispose();
      const mats = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : [];
      for (const mm of mats) if (!Object.values(m).includes(mm as never)) mm.dispose();
    });
  }
  function dispose() {
    scene.traverse((c) => { const mesh = c as THREE.Mesh; mesh.geometry?.dispose(); });
    for (const mm of Object.values(m)) { const tx = (mm as THREE.MeshStandardMaterial).map; tx?.dispose(); (mm as THREE.MeshStandardMaterial).emissiveMap?.dispose(); mm.dispose(); }
    groundTex.dispose(); skyMat.map?.dispose(); skyMat.dispose(); glowTex.dispose(); envTex.dispose(); pm.dispose();
  }
  return { scene, sun, setState, setNight, setLayers, setSelected, tick, pickables, topOf, heightOf, dispose };
}
