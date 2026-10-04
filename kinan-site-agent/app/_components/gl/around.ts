/**
 * Everything at the foot of a building, driven by its 4D state.
 *
 * While it is being built: a mesh-fence work zone, stockpiles (rebar, formwork, blocks, pipe, MEP crates, glass on
 * A-frames), welfare cabins, a generator and lighting tower, a telehandler, a forklift, mixer trucks queuing for the
 * pour, a scaffold stair tower, a waste chute with its skip during fit-out, a façade cradle where the curtain wall is
 * going in, scissor lifts and full scaffolding on the low-rise blocks, safety signs and site workers.
 *
 * Once it is finished: a raised paved plaza, planters with palms, benches, bollards, lamp posts, an entrance
 * canopy, a branded signage monolith, cars at the drop-off.
 *
 * Every item is placed only where the ground is free (not on another building or a road). All meshes are merged
 * per material, so a building's kit costs a handful of draw calls.
 */
import * as THREE from "three";
import { BUILDINGS, SHAPES, VILLAS } from "@/lib/siteplan";
import { M, rng } from "./textures";
import { ORANGE, W, at, box, mergeStatic, shadow, walls, type Mats } from "./common";

type Rect = { x: number; z: number; w: number; d: number };
const ROADS: Rect[] = SHAPES.filter((s) => s.t === "rect" && (s.cls === "road" || s.cls === "public-road")).map((s) => W(s));
const FOOTPRINTS: { id: string; r: Rect }[] = [...BUILDINGS.map((b) => ({ id: b.id, r: W(b) })), ...VILLAS.map((v) => ({ id: v.id, r: W(v) })),
  ...SHAPES.filter((s) => s.t === "rect" && s.loc && /bld (util|civic)|tmp /.test(s.cls)).map((s) => ({ id: s.loc!, r: W(s) }))];
const inside = (r: Rect, x: number, z: number, pad = 0) => x > r.x - pad && x < r.x + r.w + pad && z > r.z - pad && z < r.z + r.d + pad;

export interface AroundState { built: number; floors: number; glazed: number; fitted: number; topped: boolean; active: number }
export type Kind = "tower" | "podium" | "club" | "villa";

const S = (p: THREE.MeshStandardMaterialParameters) => new THREE.MeshStandardMaterial(p);
let shared: Record<string, THREE.MeshStandardMaterial> | null = null;
const mats = () => (shared ??= {
  blue: S({ color: 0x2f6db5, roughness: 0.6 }), grey: S({ color: 0x8d9298, roughness: 0.6, metalness: 0.3 }), green: S({ color: 0x2e7d32, roughness: 0.6 }),
  block: S({ color: 0xc9c2b2, roughness: 0.95 }), drum: S({ color: 0xe8e6e1, roughness: 0.45 }), stone: S({ color: 0xd8cfbf, roughness: 0.8 }),
  bench: S({ color: 0x8a6a48, roughness: 0.8 }), leaf: S({ color: 0x4f7d39, roughness: 0.85 }), trunk: S({ color: 0x8a6a48, roughness: 0.95 }),
  carW: S({ color: 0xf4f4f2, roughness: 0.3, metalness: 0.4 }), carK: S({ color: 0x2e2e2f, roughness: 0.3, metalness: 0.4 }), carS: S({ color: 0xb9bec4, roughness: 0.3, metalness: 0.5 }),
  red: S({ color: 0xd03b3b, roughness: 0.6 }), white: S({ color: 0xf4f4f2, roughness: 0.5 }),
});

export function aroundKit(m: Mats, id: string, kind: Kind, r: Rect, st: AroundState, storey: number, seed = 1): THREE.Group {
  const k = mats();
  const g = new THREE.Group();
  const R = rng(seed * 977 + id.length * 31);
  const cx = r.x + r.w / 2, cz = r.z + r.d / 2;
  /** is world point (x, z) on open ground (not a road, not another footprint, not this building)? */
  const free = (x: number, z: number, pad = 1.5) => !inside(r, x, z, 0.8) && !ROADS.some((q) => inside(q, x, z, pad)) && !FOOTPRINTS.some((f) => f.id !== id && inside(f.r, x, z, pad));
  /** add a mesh at world position, local to the building group */
  const put = (mesh: THREE.Object3D, x: number, y: number, z: number, ry = 0) => { mesh.position.set(x - cx, y, z - cz); mesh.rotation.y = ry; g.add(mesh); return mesh; };
  /** spot on a ring round the building at distance off, walking the perimeter from t, tried until free */
  const ringSpot = (off: number, tries = 18): [number, number, number] | null => {
    for (let i = 0; i < tries; i++) {
      const t = R(), P = 2 * (r.w + r.d) + 8 * off, s = t * P;
      const W2 = r.w + 2 * off, D2 = r.d + 2 * off;
      let x: number, z: number, ry: number;
      if (s < W2) { x = r.x - off + s; z = r.z - off; ry = 0; }
      else if (s < W2 + D2) { x = r.x + r.w + off; z = r.z - off + (s - W2); ry = Math.PI / 2; }
      else if (s < 2 * W2 + D2) { x = r.x + r.w + off - (s - W2 - D2); z = r.z + r.d + off; ry = 0; }
      else { x = r.x - off; z = r.z + r.d + off - (s - 2 * W2 - D2); ry = Math.PI / 2; }
      if (free(x, z)) return [x, z, ry];
    }
    return null;
  };
  const glazedF = Math.min(Math.floor(st.glazed + 1e-6), st.built);
  const complete = st.topped && st.glazed >= st.floors - 0.01 && st.fitted >= st.floors;
  const building = (st.built > 0 || st.active > 0) && !complete;
  const top = st.built * storey;

  if (building) {
    // ---- mesh-fence work zone round the building, panels only on free ground
    const off = kind === "tower" ? 4.5 : kind === "villa" ? 3 : 4;
    const fx = r.x - off, fz = r.z - off, fw = r.w + 2 * off, fd = r.d + 2 * off;
    const panel = 3.5;
    for (const [x0, z0, len, ry] of [[fx, fz, fw, 0], [fx + fw, fz, fd, -Math.PI / 2], [fx + fw, fz + fd, fw, Math.PI], [fx, fz + fd, fd, Math.PI / 2]] as const) {
      const n = Math.floor(len / panel);
      for (let i = 0; i < n; i++) {
        if (i % 9 === 4) continue; // gates
        const t = (i + 0.5) * panel, x = x0 + Math.cos(-ry) * t, z = z0 + Math.sin(-ry) * t;
        if (!free(x, z, 0.4)) continue;
        put(new THREE.Mesh(new THREE.PlaneGeometry(panel - 0.05, 2), m.fence), x, 1.05, z, ry);
        put(new THREE.Mesh(box(0.6, 0.18, 0.3), k.block), x - Math.cos(-ry) * panel / 2, 0.09, z - Math.sin(-ry) * panel / 2, ry);
      }
    }
    // ---- stockpiles
    const piles = kind === "villa" ? 3 : kind === "tower" ? 16 : 12;
    for (let i = 0; i < piles; i++) {
      const sp = ringSpot(kind === "villa" ? 6 : 8 + R() * 6); if (!sp) continue;
      const [x, z, ry] = sp, kindN = Math.floor(R() * 6);
      if (kindN === 0) for (let j = 0; j < 4; j++) put(new THREE.Mesh(box(9, 0.35, 0.9), m.rust), x, 0.2 + j * 0.36, z + (j % 2) * 0.2, ry);
      else if (kindN === 1) for (let j = 0; j < 3; j++) put(new THREE.Mesh(box(2.4, 0.5, 1.2), m.ply), x, 0.25 + j * 0.5, z, ry);
      else if (kindN === 2) for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) put(new THREE.Mesh(box(1.2, 1.2, 1.2), k.block), x + a * 1.35, 0.6, z + b * 1.35, ry);
      else if (kindN === 3) for (let j = 0; j < 6; j++) put(new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 6, 8).rotateZ(Math.PI / 2), j % 2 ? k.blue : k.grey), x, 0.3 + Math.floor(j / 3) * 0.55, z + (j % 3) * 0.62, ry);
      else if (kindN === 4) put(new THREE.Mesh(box(2.2, 1.6, 1.6), R() < 0.5 ? k.blue : k.grey), x, 0.8, z, ry);
      else if (st.built > 2 && kind !== "villa") { // glass panels on an A-frame
        const a = put(new THREE.Mesh(box(3.2, 0.12, 2.6), m.glass), x, 1.3, z, ry); a.rotation.z = 0.25;
        put(new THREE.Mesh(box(3.4, 0.2, 0.2), k.grey), x, 0.1, z, ry);
      } else put(new THREE.Mesh(new THREE.ConeGeometry(2.4, 1.8, 10), k.block), x, 0.9, z);
    }
    if (kind !== "villa") {
      // ---- welfare cabins, generator, lighting tower
      for (let i = 0; i < 2; i++) { const sp = ringSpot(12); if (sp) put(new THREE.Mesh(box(6, 2.6, 2.4, 6, 2.6), m.cabin), sp[0], 1.3, sp[1], sp[2]); }
      const gsp = ringSpot(9); if (gsp) { put(new THREE.Mesh(box(3.2, 1.9, 1.5), m.yellow), gsp[0], 0.95, gsp[1], gsp[2]); put(new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 1, 6), m.dark), gsp[0] + 1, 2.3, gsp[1]); }
      const lsp = ringSpot(10); if (lsp) {
        put(new THREE.Mesh(box(2.4, 1.2, 1.4), m.yellow), lsp[0], 0.8, lsp[1], lsp[2]);
        put(new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 8, 6), k.grey), lsp[0], 5.2, lsp[1]);
        put(new THREE.Mesh(box(2, 0.7, 0.3), k.white), lsp[0], 9.2, lsp[1], lsp[2]);
      }
      // ---- telehandler and forklift
      const tsp = ringSpot(9); if (tsp) {
        const [x, z, ry] = tsp;
        put(new THREE.Mesh(box(5.2, 1.4, 2.3), m.yellow), x, 1.3, z, ry);
        put(new THREE.Mesh(box(1.4, 1.5, 1.1), m.dark), x - 0.6, 2.6, z + 0.4, ry);
        const boom = put(new THREE.Mesh(box(6.5, 0.5, 0.5), m.yellow), x + 2.2, 3.4, z, ry); boom.rotation.z = 0.5;
        for (const a of [-1.7, 1.7]) for (const b of [-1.15, 1.15]) put(new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 0.5, 12).rotateX(Math.PI / 2), m.dark), x + a * Math.cos(ry) - b * Math.sin(ry) * 0, 0.62, z + b, ry);
      }
      const fsp = ringSpot(7); if (fsp) {
        const [x, z, ry] = fsp;
        put(new THREE.Mesh(box(2.2, 1.3, 1.2), m.steel), x, 0.9, z, ry);
        put(new THREE.Mesh(box(0.15, 2.6, 1), m.dark), x + 1.2, 1.4, z, ry);
        put(new THREE.Mesh(box(1.1, 0.1, 1), m.dark), x + 1.7, 0.2, z, ry);
      }
      // ---- mixer trucks queuing for the pour
      if (st.active > 0) for (let i = 0; i < 2; i++) {
        const sp = ringSpot(16 + i * 4); if (!sp) continue; const [x, z, ry] = sp;
        put(new THREE.Mesh(box(2.4, 2.4, 2.4), m.white), x + 3.6 * Math.cos(ry), 1.9, z - 3.6 * Math.sin(ry), ry);
        put(new THREE.Mesh(box(8.4, 0.5, 2.4), m.dark), x, 0.9, z, ry);
        const drum = put(new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.35, 5.2, 14).rotateZ(Math.PI / 2 - 0.18), k.drum), x - 0.6 * Math.cos(ry), 2.6, z + 0.6 * Math.sin(ry), ry); void drum;
      }
      // ---- safety signs at the fence gates
      for (let i = 0; i < 3; i++) { const sp = ringSpot(off + 0.6); if (sp) { put(new THREE.Mesh(box(1.4, 1, 0.06, 1.4, 1), m.hoard), sp[0], 1.6, sp[1], sp[2]); put(new THREE.Mesh(box(0.06, 1.1, 0.06), m.dark), sp[0], 0.55, sp[1]); } }
    }
    // ---- scaffold stair tower up a tower face
    if (kind === "tower" && st.built > 1) {
      const sx = r.x - 2.4, sz = r.z + r.d * 0.7;
      if (free(sx, sz, 0.2) || true) put(new THREE.Mesh(walls(3, 3, top + 2, 3, 3), m.scaffold), sx, 0, sz);
    }
    // ---- waste chute and skip during fit-out
    if (kind === "tower" && st.fitted > 0 && !complete) {
      const h = Math.min(top, (st.fitted + 2) * storey);
      put(new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.5, h, 10), m.yellow), r.x + r.w * 0.8, h / 2, r.z + r.d + 1.2);
      for (let y = 4; y < h; y += 3.6) put(new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.25, 10), m.dark), r.x + r.w * 0.8, y, r.z + r.d + 1.2);
      put(new THREE.Mesh(box(5.6, 1.8, 2.4), k.green), r.x + r.w * 0.8, 0.9, r.z + r.d + 3);
    }
    // ---- façade cradle hanging where the curtain wall is going in
    if (kind === "tower" && glazedF > 0 && glazedF < st.built) {
      const y = glazedF * storey + 1.2, face = r.x + r.w * 0.08;
      const cradle = put(new THREE.Mesh(box(8, 1.1, 1), m.steel), r.x + r.w / 2 - 6, y, r.z - 0.9); void face; void cradle;
      for (const dx of [-3.6, 3.6]) put(new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, top - y + 2, 4), m.dark), r.x + r.w / 2 - 6 + dx, y + (top - y + 2) / 2, r.z - 0.9);
      put(new THREE.Mesh(box(1.4, 1.6, 0.1), m.glass), r.x + r.w / 2 - 6, y + 1.1, r.z - 0.5);
    }
    // ---- low-rise: full scaffold round the frame, scissor lifts along the façade
    if ((kind === "club" || kind === "podium" || kind === "villa") && st.built > 0 && glazedF < st.built) {
      put(new THREE.Mesh(walls(r.w + (kind === "villa" ? 2.4 : 3), r.d + (kind === "villa" ? 2.4 : 3), Math.max(storey, top) + 1, 3.2, 3.2), m.scaffold), cx, 0, cz);
    }
    if ((kind === "club" || kind === "podium") && st.built > 0) for (let i = 0; i < 3; i++) {
      const sp = ringSpot(3.2); if (!sp) continue; const [x, z, ry] = sp;
      put(new THREE.Mesh(box(2.5, 0.8, 1.2), m.yellow), x, 0.5, z, ry);
      put(new THREE.Mesh(box(2.3, 4, 0.1, 2, 2), m.lattice), x, 2.9, z, ry);
      put(new THREE.Mesh(walls(2.5, 1.2, 1, 2, 1), m.steel), x, 4.9, z, ry);
    }
  }

  if (complete && kind !== "villa") {
    // ---- raised paved plaza (15 cm, never coplanar with the ground)
    const pad = kind === "tower" ? 7 : 6;
    for (const [x, z, w, d] of [[r.x - pad, r.z - pad, r.w + 2 * pad, pad], [r.x - pad, r.z + r.d, r.w + 2 * pad, pad], [r.x - pad, r.z, pad, r.d], [r.x + r.w, r.z, pad, r.d]] as const) {
      // split into 6 m tiles so pieces over a road or another building can be dropped
      for (let a = 0; a < w; a += 6) for (let b = 0; b < d; b += 6) {
        const tw = Math.min(6, w - a), td = Math.min(6, d - b), px = x + a + tw / 2, pz = z + b + td / 2;
        if (!free(px, pz, 0) && !inside(r, px, pz, pad + 0.5)) continue;
        if (ROADS.some((q) => inside(q, px, pz, 0.5)) || FOOTPRINTS.some((f) => f.id !== id && inside(f.r, px, pz, 0.5))) continue;
        put(new THREE.Mesh(box(tw, 0.15, td, 4, 4), m.paving), px, 0.075, pz);
      }
    }
    // ---- planters with palms, benches, bollards, lamp posts
    for (let i = 0; i < (kind === "tower" ? 8 : 10); i++) {
      const sp = ringSpot(pad * 0.55, 24); if (!sp) continue; const [x, z] = sp;
      put(new THREE.Mesh(box(2.4, 0.7, 2.4), k.stone), x, 0.5, z);
      put(new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.3, 6, 6), k.trunk), x, 3.8, z);
      for (let f = 0; f < 7; f++) { const leaf = put(new THREE.Mesh(box(0.5, 0.08, 3), k.leaf), x + Math.sin((f / 7) * 6.28) * 1.2, 6.6, z + Math.cos((f / 7) * 6.28) * 1.2, (f / 7) * 6.28); leaf.rotation.x = 0.45; }
    }
    for (let i = 0; i < 6; i++) { const sp = ringSpot(pad * 0.4); if (sp) put(new THREE.Mesh(box(2, 0.45, 0.6), k.bench), sp[0], 0.45, sp[1], sp[2]); }
    for (let i = 0; i < 10; i++) { const sp = ringSpot(pad - 0.6); if (sp) put(new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.9, 8), k.grey), sp[0], 0.6, sp[1]); }
    for (let i = 0; i < 6; i++) { const sp = ringSpot(pad - 1); if (!sp) continue; put(new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 5, 6), m.dark), sp[0], 2.65, sp[1]); put(new THREE.Mesh(box(0.7, 0.2, 0.3), k.white), sp[0], 5.2, sp[1]); }
    // ---- entrance canopy, signage monolith, cars at the drop-off (south face, where the roads are)
    put(new THREE.Mesh(box(Math.min(16, r.w * 0.4), 0.45, 5), m.dark), cx, kind === "podium" ? 6 : 4.6, r.z + r.d + 2.5);
    put(new THREE.Mesh(box(1.2, 4.2, 0.5, 1.2, 4.2), m.hoard), r.x + r.w * 0.15, 2.25, r.z + r.d + pad - 1.5);
    const cars = [k.carW, k.carK, k.carS];
    for (let i = 0; i < 3; i++) { const x = cx - 8 + i * 6.5, z = r.z + r.d + pad + 3; if (!free(x, z, 0) ) continue; put(new THREE.Mesh(box(4.4, 1.3, 1.9), cars[i % 3]), x, 0.8, z); put(new THREE.Mesh(box(2.3, 0.8, 1.7), m.dark), x - 0.2, 1.8, z); }
  }

  return shadow(mergeStatic(g), true, true);
}
void ORANGE; void M;
