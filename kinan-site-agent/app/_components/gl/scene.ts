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
import { phaseOf, phaseT, structKey, type SiteState, type StructState, type VillaState } from "@/lib/scene/progress4d";
import { M, concrete, drawGround, glow, rng, sky } from "./textures";
import { ORANGE, STOREY, W, at, box, materials, mergeStatic, perim, rectOf, shadow, tag, walls, type Mats } from "./common";
import { constructionKit, createDetails, roofKit, type Deck } from "./details";
import { aroundKit } from "./around";
import { createGrounds } from "./grounds";

export { STOREY };
const PODIUM_STOREY = 5.4;
const CRANE_AT: Record<string, { x: number; z: number; r: number; tower: string }> = {};
for (const s of SHAPES) if (s.layer === "cranes" && s.t === "circle" && s.cls === "crane" && s.loc) {
  const ring = SHAPES.find((q) => q.cls === "crane-r" && q.cx === s.cx && q.cy === s.cy);
  CRANE_AT[s.loc] = { x: s.cx! * M, z: s.cy! * M, r: (ring?.r ?? 100) * M, tower: s.loc === "tc3" ? "hotel-c" : s.loc === "tc2" ? "tower-b" : "tower-a" };
}

// ------------------------------------------------------------------ structures
export interface Built { group: THREE.Group; top: number; pulse: THREE.MeshStandardMaterial[] }

export function towerModel(m: Mats, id: string, r: { x: number; z: number; w: number; d: number }, floors: number, s: StructState, storey = STOREY, opts: { podium?: boolean; club?: boolean; raft?: boolean; night?: boolean } = {}): Built {
  const g = new THREE.Group();
  const inset = opts.podium ? 0.6 : opts.club ? 1 : Math.min(r.w, r.d) * 0.08;
  const w = r.w - inset * 2, d = r.d - inset * 2, cx = r.x + r.w / 2, cz = r.z + r.d / 2;
  g.position.set(cx, 0, cz);
  const pulse: THREE.MeshStandardMaterial[] = [];
  const top = s.built * storey;
  const tower = !opts.podium && !opts.club;
  const started = s.built > 0 || s.active > 0;
  const ph = phaseOf(s.active), pt = phaseT(s.active);
  // the floors the façade covers: every finished zone, plus the zone going in panel by panel below
  const glazed = Math.min(s.facadeZone ? s.facadeZone.from - 1 : Math.floor(s.glazed + 1e-6), s.built), fitted = Math.min(s.fitted, glazed);
  const colGrid = () => {
    const nx = Math.max(3, Math.round(w / 9)), nz = Math.max(3, Math.round(d / 9));
    const pos: [number, number][] = [];
    for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) if (i === 0 || j === 0 || i === nx - 1 || j === nz - 1 || (i % 2 === 0 && j % 2 === 0)) pos.push([-w / 2 + 0.6 + (i * (w - 1.2)) / (nx - 1), -d / 2 + 0.6 + (j * (d - 1.2)) / (nz - 1)]);
    return pos;
  };
  const mx = new THREE.Matrix4();

  // ---- before the frame: the piling rig working across the footprint, then the raft poured in one sweep
  if (!started && opts.raft !== false) {
    const rh = tower ? 3 : 0.8;
    if (s.piles > 0) {
      const nx = Math.max(3, Math.round(w / 5.5)), nz = Math.max(3, Math.round(d / 5.5)), total = nx * nz, done = Math.floor(total * s.piles + 1e-6);
      if (done > 0) {
        const im = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.62, 0.62, 1.1, 10), m.pile, done);
        let n = 0; for (let j = 0; j < nz && n < done; j++) for (let i = 0; i < nx && n < done; i++) im.setMatrixAt(n++, mx.makeTranslation(-w / 2 + 2 + (i * (w - 4)) / (nx - 1), 0.55, -d / 2 + 2 + (j * (d - 4)) / (nz - 1)));
        g.add(im);
      }
      if (s.piles < 1 && s.raft <= 0) {
        // the rig at the next pile: tracked base, 28 m mast, auger
        const i = done % nx, j = Math.floor(done / nx), px = -w / 2 + 2 + (i * (w - 4)) / (nx - 1), pz = -d / 2 + 2 + (j * (d - 4)) / (nz - 1);
        const rig = new THREE.Group(); rig.position.set(px + 3.5, 0, pz); g.add(rig);
        for (const z of [-1.6, 1.6]) rig.add(at(new THREE.Mesh(box(6, 1.1, 1), m.dark), 0, 0.55, z));
        rig.add(at(new THREE.Mesh(box(5, 2.2, 3), m.yellow), -0.4, 2.2, 0));
        rig.add(at(new THREE.Mesh(box(1.4, 28, 1.4, 1.4, 1.4), m.lattice), -3.5, 15, 0));
        rig.add(at(new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 9, 10), m.dark), -3.5, 5, 0));
        rig.add(at(new THREE.Mesh(new THREE.ConeGeometry(2.2, 1.6, 10), new THREE.MeshStandardMaterial({ color: 0x8a6a48, roughness: 1 })), -3.5 + 4, 0.8, 2.6)); // spoil
      }
    }
    if (s.raft > 0) {
      const W2 = w + 4, D2 = d + 4;
      if (s.raft < 1) { const edge = new THREE.Mesh(walls(W2, D2, rh, 6, rh), m.formwork.clone()); g.add(edge); pulse.push(edge.material as THREE.MeshStandardMaterial); }
      g.add(at(new THREE.Mesh(box(W2 - 0.2, 0.4, D2 - 0.2, 6, 6), m.deck), 0, rh - 0.5, 0)); // rebar cage
      const done = Math.max(0.5, W2 * s.raft);
      g.add(at(new THREE.Mesh(box(done, rh - 0.08, D2 - 0.3, 8, 8), s.raft < 1 ? m.wet : m.concrete), -W2 / 2 + done / 2, (rh - 0.08) / 2, 0));
      if (s.raft < 1) {
        // the pump's boom over the pour front
        const bx = -W2 / 2 + done, boom = new THREE.Group(); boom.position.set(bx, 0, D2 / 2 + 7); g.add(boom);
        boom.add(at(new THREE.Mesh(box(9, 1.2, 2.5), m.dark), 0, 0.9, 0)); boom.add(at(new THREE.Mesh(box(2.4, 2.4, 2.4), m.steel), 4, 2.2, 0));
        const arm = at(new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.28, 22, 8), m.steel), 0, 9, -6); arm.rotation.x = 0.9; boom.add(arm);
        boom.add(at(new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 6, 6), m.dark), 0, 6, -14));
      }
    }
  } else if (opts.raft !== false) g.add(at(new THREE.Mesh(box(w + 4, 0.8, d + 4, 8, 8), m.concrete), 0, 0.4, 0));

  // ---- cast slabs (instanced); the one just stripped is lighter for a while
  if (s.built > 0) {
    const slab = new THREE.InstancedMesh(box(w, 0.35, d, 8, 8), m.concrete, s.built);
    for (let i = 0; i < s.built; i++) slab.setMatrixAt(i, mx.makeTranslation(0, (i + 1) * storey - 0.175, 0));
    g.add(slab);
  }
  // ---- columns on exposed floors (above the curtain wall)
  const exposed = s.built - glazed;
  const pos = colGrid();
  if (exposed > 0) {
    const col = new THREE.InstancedMesh(box(0.9, storey - 0.35, 0.9), m.concrete, pos.length * exposed);
    let n = 0;
    for (let f = glazed; f < s.built; f++) for (const [x, z] of pos) col.setMatrixAt(n++, mx.makeTranslation(x, f * storey + (storey - 0.35) / 2, z));
    g.add(col);
  }
  // ---- blockwork partitions and MEP on the open floors behind the edge protection (seen where the façade isn't on yet)
  if (s.blk > fitted && s.blk > glazed) {
    const from = Math.max(fitted, glazed), n = Math.min(s.built, s.blk) - from;
    if (n > 0) { const pw = new THREE.InstancedMesh(box(w * 0.42, storey - 0.4, 0.25, 4, 4), m.block, n * 3); let k = 0; for (let f = from; f < from + n; f++) for (const [x, z] of [[-w * 0.22, -d * 0.18], [w * 0.2, 0], [-w * 0.1, d * 0.22]] as const) pw.setMatrixAt(k++, mx.makeTranslation(x, f * storey + (storey - 0.4) / 2 + 0.1, z)); g.add(pw); }
  }
  // ---- curtain wall in bands: fitted floors (lit at night), floors in MEP first fix (work lights at night), the rest
  const skin = opts.podium ? m.stone : m.glass, skinLit = opts.podium ? m.stone : m.glassLit, skinWork = opts.podium ? m.stone : m.glassWork;
  if (glazed > 0) {
    const bands: [number, number, THREE.Material][] = [];
    const mepFrom = Math.min(glazed, Math.max(fitted, s.mep)), mepTo = Math.min(glazed, s.mep + s.mepActive);
    if (fitted > 0) bands.push([0, fitted, skinLit]);
    if (mepFrom > fitted) bands.push([fitted, mepFrom, skin]);
    if (mepTo > mepFrom) bands.push([mepFrom, mepTo, skinWork]);
    if (glazed > Math.max(mepTo, fitted)) bands.push([Math.max(mepTo, fitted), glazed, skin]);
    for (const [a, b, mat] of bands) if (b > a) g.add(at(new THREE.Mesh(walls(w + 0.6, d + 0.6, (b - a) * storey, 9, storey * 4), mat), 0, a * storey, 0));
    g.add(at(new THREE.Mesh(box(w + 0.6, 0.12, d + 0.6), m.slabEdge), 0, glazed * storey + 0.06, 0));
  }
  // ---- the façade zone going in: unitised panels landed one by one round each level, from the bottom
  if (s.facadeZone && tower) {
    const z = s.facadeZone, levels = Math.min(z.to, s.built) - z.from + 1;
    if (levels > 0) {
      const PW = w + 0.6, PD = d + 0.6, per = Math.max(8, Math.round((2 * (PW + PD)) / 1.5)), total = levels * per, n = Math.floor(total * z.f);
      if (n > 0) {
        const im = new THREE.InstancedMesh(box(1.42, storey - 0.06, 0.1), m.glass, n);
        const q = new THREE.Quaternion(), v = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1);
        for (let k = 0; k < n; k++) {
          const lv = z.from - 1 + Math.floor(k / per), tt = ((k % per) + 0.5) / per, [x, zz] = perim(PW, PD, tt);
          const sPer = tt * 2 * (PW + PD), side = sPer < PW ? 0 : sPer < PW + PD ? 1 : sPer < 2 * PW + PD ? 2 : 3;
          q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), side % 2 ? Math.PI / 2 : 0); v.set(x, lv * storey + storey / 2, zz);
          im.setMatrixAt(k, mx.compose(v, q, one));
        }
        g.add(im);
        // the next panel on its way up on the monorail hoist, and the installers' cradle
        const k = n, lv = z.from - 1 + Math.floor(k / per), tt = ((k % per) + 0.5) / per, [x, zz] = perim(PW + 2.2, PD + 2.2, tt);
        g.add(at(new THREE.Mesh(box(1.42, storey - 0.06, 0.1), m.glass), x, lv * storey + storey * 0.3, zz));
        g.add(at(new THREE.Mesh(box(2.4, 0.9, 1.2), m.steel), x, lv * storey + 0.6, zz));
      }
    }
  }
  if (opts.podium && glazed > 0) {
    // retail shopfronts: a glass band round the ground floor
    g.add(at(new THREE.Mesh(box(w + 0.8, storey * 0.72, d + 0.8, 9, storey * 4), m.glassLit), 0, storey * 0.36 + 0.2, 0));
  }
  // ---- core + jump-form (towers only): the core runs two levels ahead of the slabs
  if (tower && floors > 5 && started) {
    const cw = Math.min(w * 0.3, 26), cd = Math.min(d * 0.34, 28);
    const coreTop = Math.max(0.6, Math.min(floors * storey + storey, s.core * storey));
    g.add(at(new THREE.Mesh(box(cw, coreTop, cd, 6, 6), m.core), 0, coreTop / 2, 0));
    if (!s.topped) {
      const jf = at(new THREE.Mesh(box(cw + 2.4, storey * 1.2, cd + 2.4, 4, 4), m.formwork), 0, coreTop + storey * 0.6 - 0.4, 0);
      g.add(jf);
      // the core's own placing boom and the hoist cage on the jump-form platform
      g.add(at(new THREE.Mesh(box(cw + 4, 0.25, cd + 4), m.ply), 0, coreTop + storey * 1.2 - 0.3, 0));
      g.add(at(new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.22, 12, 8).rotateZ(Math.PI / 2), m.steel), -cw * 0.25, coreTop + storey * 1.2 + 3, cd * 0.2));
    }
  }
  // ---- the level being cast: columns rise, falsework and soffit go in, rebar and PT ducts, the pour sweeps across, cure and strip
  if (s.active > 0 && s.built < floors) {
    const y0 = top, deckY = top + storey - 0.2, nx = Math.max(2, Math.floor(w / 2.4)), nz = Math.max(2, Math.floor(d / 2.4)), ph2 = storey - 0.62;
    const sweep = (f: number) => Math.max(0.4, w * f);
    // columns and walls of this storey
    const colH = ph === "columns" ? Math.max(0.25, (storey - 0.35) * pt) : storey - 0.35;
    const col = new THREE.InstancedMesh(box(0.9, colH, 0.9), ph === "columns" ? m.cured : m.concrete, pos.length);
    pos.forEach(([x, z], i) => col.setMatrixAt(i, mx.makeTranslation(x, y0 + colH / 2, z))); g.add(col);
    if (ph === "columns") { const fw = new THREE.InstancedMesh(box(1.3, colH + 0.3, 1.3), m.formwork, Math.ceil(pos.length * (1 - pt))); let k = 0; for (const [x, z] of pos.slice(Math.floor(pos.length * pt))) fw.setMatrixAt(k++, mx.makeTranslation(x, y0 + colH / 2, z)); g.add(fw); }
    if (ph !== "columns") {
      // falsework props (stripped progressively during cure) and the plywood soffit sweeping across
      const keep = ph === "cure" ? Math.max(1, Math.round(nx * nz * (1 - pt * 0.8))) : nx * nz;
      const props = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.06, 0.06, ph2, 6).translate(0, ph2 / 2, 0), m.steel, keep);
      let n = 0; for (let i = 0; i < nx && n < keep; i++) for (let j = 0; j < nz && n < keep; j++) props.setMatrixAt(n++, mx.makeTranslation(-w / 2 + 1.2 + i * ((w - 2.4) / (nx - 1)), y0, -d / 2 + 1.2 + j * ((d - 2.4) / (nz - 1))));
      g.add(props);
      const sw = sweep(ph === "formwork" ? pt : 1);
      g.add(at(new THREE.Mesh(box(sw, 0.08, d), m.ply), -w / 2 + sw / 2, deckY - 0.44, 0));
      if (ph === "formwork" && pt < 1) for (let i = 0; i < 5; i++) g.add(at(new THREE.Mesh(box(2.4, 0.5, 1.2), m.ply), -w / 2 + sw + 2 + i * 3, deckY - 0.2, -d / 2 + 1 + (i % 2) * (d - 2)));
    }
    if (ph === "rebar" || ph === "pour" || ph === "cure") {
      const rw = sweep(ph === "rebar" ? pt : 1);
      const deck = new THREE.Mesh(box(rw, 0.3, d, 6, 6), m.deck.clone()); at(deck, -w / 2 + rw / 2, deckY, 0); g.add(deck); pulse.push(deck.material as THREE.MeshStandardMaterial);
      // PT ducts laid across the mat
      const ducts = Math.floor((rw / 2.4) * (ph === "rebar" ? pt : 1));
      if (ducts > 0) { const im = new THREE.InstancedMesh(box(0.07, 0.07, d * 0.96), m.dark, ducts); for (let i = 0; i < ducts; i++) im.setMatrixAt(i, mx.makeTranslation(-w / 2 + 1.2 + i * 2.4, deckY + 0.2, 0)); g.add(im); }
    }
    if (ph !== "columns" && ph !== "cure") { const edge = new THREE.Mesh(walls(w + 0.4, d + 0.4, 0.9, 6, 0.9), m.formwork.clone()); at(edge, 0, deckY - 0.1, 0); g.add(edge); pulse.push(edge.material as THREE.MeshStandardMaterial); }
    if (ph === "pour") { const pw = sweep(pt); g.add(at(new THREE.Mesh(box(pw, 0.36, d - 0.1, 6, 6), m.wet), -w / 2 + pw / 2, deckY + 0.05, 0)); }
    if (ph === "cure") { g.add(at(new THREE.Mesh(box(w, 0.35, d, 8, 8), m.cured), 0, deckY + 0.02, 0)); }
  }
  // ---- branded climbing screen round the top three storeys while the frame goes up
  if (tower && !s.topped && s.built >= 3) {
    const h = storey * 3;
    g.add(at(new THREE.Mesh(walls(w + 2.4, d + 2.4, h, h * 2, h), m.screen), 0, top - storey * 2 + 0.3 + (ph === "cure" ? storey * pt : 0), 0));
  }
  // ---- roof: parapet when topped; plant, BMU and lift motor room as their activities run
  if (s.topped && s.built > 0) {
    g.add(at(new THREE.Mesh(walls(w + 0.8, d + 0.8, 1.4, 6, 1.4), m.slabEdge), 0, top + 0.12, 0));
    if (tower && floors > 10) g.add(at(new THREE.Mesh(box(w * 0.7, 0.6, 0.6), m.dark), 0, top + 2.2, d * 0.38));
    if (tower && s.lifts > 0.55) g.add(at(new THREE.Mesh(box(Math.min(w * 0.3, 24), 3.2, Math.min(d * 0.34, 26), 6, 3.2), m.render), 0, top + 1.6, 0));
    if (tower && s.roof > 0.2 && s.roof < 1) { for (let i = 0; i < 3; i++) g.add(at(new THREE.Mesh(box(3.2, 0.9, 2.2), m.ply), -w * 0.3 + i * 4, top + 0.6, d * 0.25)); }
  }
  // ---- podium atrium: steel grid, then glass
  if (opts.podium && s.built >= 4 && s.roof > 0.2) {
    const sk = new THREE.Mesh(box(w * 0.34, 1.2, d * 0.42, 4, 4), s.glazed >= 3.9 ? m.skylight : m.lattice);
    g.add(at(sk, 0, top + 0.6, 0));
  }
  // ---- edge protection, the pour's plant; rooftop equipment once the roof works start
  { const kit = constructionKit(m, { w, d, storey, built: s.built, glazed, floors, active: s.active, topped: s.topped, podium: !!opts.podium, id }); g.add(kit.group); pulse.push(...kit.pulse); }
  if (s.topped && s.built > 0 && s.roof > 0.25) g.add(roofKit(m, id, w, d, top));
  // ---- ghost of the finished massing above what is built
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

export function villaModel(m: Mats, id: string, r: { x: number; z: number; w: number; d: number }, v: VillaState, night: boolean): Built {
  const g = new THREE.Group();
  const w = r.w * 0.82, d = r.d * 0.62, cx = r.x + r.w / 2, cz = r.z + r.d * 0.42;
  g.position.set(cx, 0, cz);
  g.add(at(new THREE.Mesh(box(w + 3, 0.5, d + 3), m.concrete), 0, 0.25, 0));
  // blockwork rises floor by floor with the MEP & blockwork activity, render follows with the finishes
  const skinFor = (f: number) => (v.finished || f < v.fin * 2 ? (v.handedOver && night ? m.renderLit : m.render) : v.enclosed || f < v.mep * 2 ? m.block : null);
  for (let f = 0; f < v.built; f++) {
    const fw = f === 1 ? w * 0.72 : w, fx = f === 1 ? -w * 0.14 : 0, skin = skinFor(f);
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
    // pool, garden wall, planting, and the owner's car once handed over
    g.add(at(new THREE.Mesh(box(r.w * 0.5, 0.15, r.d * 0.18), m.water), 0, 0.1, d / 2 + r.d * 0.16));
    g.add(at(new THREE.Mesh(walls(r.w * 0.96, r.d * 1.3, 1.8, 4, 1.8), m.render), 0, 0, r.d * 0.08));
    const R2 = rng(id.length * 31 + r.x);
    for (let i = 0; i < 4; i++) g.add(at(new THREE.Mesh(new THREE.SphereGeometry(0.9 + R2() * 0.6, 8, 6), m.palm), -r.w * 0.42 + R2() * r.w * 0.84, 0.9, d / 2 + r.d * 0.3 + R2() * r.d * 0.2));
    if (v.handedOver) { g.add(at(new THREE.Mesh(box(4.4, 1.3, 1.9), new THREE.MeshStandardMaterial({ color: id.endsWith("3") || id.endsWith("7") ? 0x2e2e2f : 0xf4f4f2, roughness: 0.35, metalness: 0.4 })), -r.w * 0.3, 0.75, -d / 2 - 2)); g.add(at(new THREE.Mesh(box(2.3, 0.8, 1.7), m.dark), -r.w * 0.3 - 0.2, 1.75, -d / 2 - 2)); }
  }
  shadow(g);
  const pulse: THREE.MeshStandardMaterial[] = [];
  g.traverse((c) => { const mm = (c as THREE.Mesh).material as THREE.MeshStandardMaterial; if (mm?.map && mm.emissive && mm.emissive.getHex() === ORANGE && mm !== m.deck) pulse.push(mm); });
  return { group: tag(mergeStatic(g), id), top: Math.max(1, v.built * STOREY), pulse };
}

// ------------------------------------------------------------------ cranes
export interface Crane { id: string; root: THREE.Group; mast: THREE.Mesh; slew: THREE.Group; trolley: THREE.Group; cable: THREE.Mesh; hook: THREE.Group; light: THREE.Mesh; h: number; r: number;
  ang: number; target: number; tr: number; trTarget: number; cab: number; cabTarget: number; phase: "slew" | "trolley" | "lower" | "hold" | "raise"; wait: number; rand: () => number; floors: number; up: boolean }
export function craneModel(m: Mats, id: string, pos?: { x: number; z: number; r: number; skip?: boolean }): Crane {
  const c = pos ?? CRANE_AT[id];
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
  if (pos ? pos.skip : id === "tc2") load.add(at(new THREE.Mesh(new THREE.CylinderGeometry(1, 0.6, 1.8, 10), m.weight), 0, -2.4, 0));
  else for (let i = 0; i < 5; i++) load.add(at(new THREE.Mesh(box(0.25, 0.25, 9), m.rust), (i - 2) * 0.28, -2, 0));
  shadow(root);
  const rand = rng((id.charCodeAt(2) || id.charCodeAt(id.length - 1) || 7) * 97);
  const ang = rand() * Math.PI * 2;
  return { id, root: tag(root, id) as THREE.Group, mast, slew, trolley, cable, hook, light, h: 0, r: R, ang, target: ang, tr: R * 0.5, trTarget: R * 0.6, cab: 8, cabTarget: 8, phase: "slew", wait: 0, rand, floors: 0, up: false };
}
/** A mobile crane (carrier, outriggers, telescopic boom) that stands by a tower crane while it is erected or dismantled. */
export function mobileCrane(m: Mats): THREE.Group {
  const g = new THREE.Group();
  g.add(at(new THREE.Mesh(box(11, 1.3, 2.8), m.yellow), 0, 1.1, 0));
  g.add(at(new THREE.Mesh(box(2.6, 2.2, 2.6), m.white), 4.2, 2.6, 0));
  for (const x of [-3.5, 3.5]) for (const z of [-2.4, 2.4]) g.add(at(new THREE.Mesh(box(0.5, 0.5, 2), m.dark), x, 0.5, z));
  for (const x of [-3.8, -1.8, 1.8, 3.8]) for (const z of [-1.4, 1.4]) g.add(at(new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 0.5, 10).rotateX(Math.PI / 2), m.dark), x, 0.6, z));
  g.add(at(new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 1, 12), m.dark), -1.5, 2.2, 0));
  const boom = at(new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.6, 46, 8), m.yellow), -1.5, 2.6 + 20, 0); boom.rotation.z = -0.55; boom.position.x = -1.5 + 12; g.add(boom);
  return shadow(mergeStatic(g), true, false);
}
export function setCraneHeight(c: Crane, h: number) {
  if (Math.abs(c.h - h) < 0.01) return;
  c.h = h;
  c.mast.geometry.dispose(); c.mast.geometry = box(2.2, h, 2.2, 2.2, 2.2); c.mast.position.y = h / 2;
  c.slew.position.y = h;
}
export function stepCrane(c: Crane, dt: number, time: number, groundAt: (x: number, z: number) => number) {
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
export function truckModel(m: Mats, kind: number): THREE.Group {
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

  // sky (upper hemisphere, horizon in the fog colour), fog, light — the desert stays inside the dome so nothing fogged shows against open sky
  const skyMat = new THREE.MeshBasicMaterial({ map: sky(night), side: THREE.BackSide, fog: false, depthWrite: false });
  const skyDome = new THREE.Mesh(new THREE.SphereGeometry(2300, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), skyMat); skyDome.position.set(400, -2, 250); scene.add(skyDome);
  scene.fog = new THREE.Fog(0xe9dcc4, 700, 2100);
  scene.background = new THREE.Color(0xe9dcc4);
  // sun disc
  const sunDisc = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow(), color: 0xfff3d0, transparent: true, depthWrite: false, fog: false }));
  sunDisc.scale.set(260, 260, 1); scene.add(sunDisc);
  const hemi = new THREE.HemisphereLight(0xdfe9f5, 0xa88c66, 0.7); scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff1dc, 2.6);
  // late-afternoon Riyadh sun from the south-west: long shadows towards the north-east
  sun.position.set(400 - 470, 270, 250 + 150); sun.target.position.set(400, 0, 250);
  sun.castShadow = true;
  const sc = sun.shadow.camera as THREE.OrthographicCamera;
  sc.left = -520; sc.right = 520; sc.top = 380; sc.bottom = -380; sc.near = 10; sc.far = 1500;
  sun.shadow.mapSize.set(opts.textureSize >= 4096 ? 4096 : 2048, opts.textureSize >= 4096 ? 4096 : 2048);
  sun.shadow.bias = -0.00015; sun.shadow.normalBias = 0.35; sun.shadow.radius = 3;
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
  const dShape = new THREE.Shape([V(-1200, -1350), V(2000, -1350), V(2000, 1850), V(-1200, 1850)]);
  dShape.holes.push(new THREE.Path([V(B.x, B.z), V(B.x, B.z + B.d), V(B.x + B.w, B.z + B.d), V(B.x + B.w, B.z)]));
  const desert = new THREE.Mesh(new THREE.ShapeGeometry(dShape).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xd2bd98, roughness: 1 }));
  desert.position.y = -0.45; desert.receiveShadow = true; scene.add(desert);
  // the plot's kerb
  const kerb = new THREE.Mesh(walls(PLAN.w * M, PLAN.h * M, 0.45, 4, 0.45), new THREE.MeshStandardMaterial({ color: 0xd8d2c4, roughness: 0.9 }));
  kerb.position.set(PLAN.w * M / 2, -0.45, PLAN.h * M / 2); scene.add(kerb);
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
  // secant-pile heads round the pit as the shoring wall is bored, the haul ramp into the pit, dewatering pumps, dumpers
  const shoringHeads = (() => { const P = 2 * (B.w + B.d), n = Math.floor(P / 1.3); const im = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.55, 0.55, 0.5, 8), m.pile, n); const mx = new THREE.Matrix4(); for (let i = 0; i < n; i++) { const [x, z] = perim(B.w + 1.2, B.d + 1.2, i / n); im.setMatrixAt(i, mx.makeTranslation(B.x + B.w / 2 + x, 0.25, B.z + B.d / 2 + z)); } im.userData.total = n; im.count = 0; im.visible = false; scene.add(im); return im; })();
  const ramp = new THREE.Mesh(box(B.w * 0.3, 14.5, 9).translate(0, -7.25, 0), new THREE.MeshStandardMaterial({ color: 0xb49a74, roughness: 1 }));
  { const pp = ramp.geometry.attributes.position; for (let i = 0; i < pp.count; i++) if (pp.getY(i) > -1) pp.setX(i, pp.getX(i) + B.w * 0.3); ramp.geometry.computeVertexNormals(); } // sheared: a slope from the pit floor up to the ground
  at(ramp, B.x + B.w * 0.18, 0, B.z + B.d - 6); ramp.visible = false; pit.add(ramp);
  const pumps = new THREE.Group(); pit.add(pumps); pumps.visible = false;
  for (let i = 0; i < 3; i++) { const x = B.x + 6 + i * (B.w - 12) / 2, z = B.z + 4; pumps.add(at(new THREE.Mesh(box(1.6, 1.1, 1.2), new THREE.MeshStandardMaterial({ color: 0x2f6db5, roughness: 0.6 })), x, 0.55, z)); pumps.add(at(new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 15, 6), m.dark), x, 7.5, z - 1)); }
  const dumperGroup = new THREE.Group(); pit.add(dumperGroup); dumperGroup.visible = false;
  const dumpers: Truck[] = [];
  { const pts: [number, number][] = [[B.x + 10, B.z + 10], [B.x + 10, B.z + B.d - 14], [B.x + B.w - 10, B.z + B.d - 14], [B.x + B.w - 10, B.z + 10]].map(([x, z]) => [x / M, z / M]); const path = pathOf(pts, true); for (let i = 0; i < 3; i++) { const g = truckModel(m, 2); const t: Truck = { g, path, s: (path.len * i) / 3, speed: 5 + i }; dumpers.push(t); dumperGroup.add(g); placeTruck(t); } }
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
  const mobiles: Record<string, THREE.Group> = {};
  for (const c of cranes) { const mc = mobileCrane(m); mc.position.set(c.root.position.x + 14, 0, c.root.position.z + 9); mc.rotation.y = 0.4; mc.visible = false; mobiles[c.id] = mc; craneGroup.add(mc); }
  const hoists = new THREE.Group(); scene.add(hoists);
  const hoistCages: { cage: THREE.Mesh; top: number; ph: number }[] = [];
  const trucks: Truck[] = [];
  const truckGroup = new THREE.Group(); scene.add(truckGroup);
  { const ring = pathOf(RING, true), haul = pathOf(HAUL, true); for (let i = 0; i < 7; i++) { const g = truckModel(m, i); const path = i < 3 ? ring : haul; const t: Truck = { g, drum: g.userData.drum, path, s: (path.len * i) / (i < 3 ? 3 : 4), speed: 7 + (i % 3) }; trucks.push(t); truckGroup.add(g); placeTruck(t); } }
  const details = createDetails(m); scene.add(details.group);
  const grounds = createGrounds(m); scene.add(grounds.group);
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
      const inPit = s.excavation > 0 && !s.groundSlab && ["tower-a", "tower-b", "podium"].includes(b.id);
      const key = structKey(st) + (night ? "n" : "d") + (b.id === "podium" ? String(s.groundSlab) : "") + inPit;
      if (built[b.id]?.key === key) continue;
      if (built[b.id]) { structs.remove(built[b.id].group); disposeTree(built[b.id].group); }
      const r = footprint(b.id)!;
      const mdl = b.id === "podium" ? towerModel(m, b.id, r, 4, st, PODIUM_STOREY, { podium: true, raft: s.groundSlab, night }) : b.id === "club-e" ? towerModel(m, b.id, r, 3, st, 4.6, { club: true }) : towerModel(m, b.id, r, b.floors, st);
      // the work zone / finished landscaping at the building's foot (not while it stands in the open pit)
      if (!inPit) mdl.group.add(aroundKit(m, b.id, b.id === "podium" ? "podium" : b.id === "club-e" ? "club" : "tower", r, { built: st.built, floors: b.id === "podium" ? 4 : b.id === "club-e" ? 3 : b.floors, glazed: st.glazed, fitted: st.fitted, topped: st.topped, active: st.active }, b.id === "podium" ? PODIUM_STOREY : b.id === "club-e" ? 4.6 : STOREY));
      built[b.id] = { ...mdl, key }; structs.add(mdl.group);
    }
    for (const v of VILLAS) {
      const vs = s.villas[v.id]; if (!vs) continue;
      const key = `${vs.built}|${Math.round(vs.active * 3)}|${vs.enclosed}|${vs.finished}|${vs.handedOver}|${night}`;
      if (built[v.id]?.key === key) continue;
      if (built[v.id]) { structs.remove(built[v.id].group); disposeTree(built[v.id].group); }
      const mdl = villaModel(m, v.id, W(v), vs, night);
      if (vs.built > 0 && !vs.finished) mdl.group.add(aroundKit(m, v.id, "villa", W(v), { built: vs.built, floors: 2, glazed: vs.enclosed ? 2 : 0, fitted: 0, topped: vs.built >= 2, active: vs.active }, STOREY, Number(v.id.split("-")[1])));
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
      const mob = mobiles[c.id]; mob.visible = layers.cranes && !!cs && ((cs.erect > 0 && cs.erect < 1) || (cs.down > 0 && cs.down < 1));
      if (!cs?.up) continue;
      // erection: base, then mast sections, then the slew unit and jib; climbing with the frame; dismantled in reverse
      const full = Math.max(40, cs.floors * STOREY + 10);
      const h = cs.erect < 1 ? Math.max(6, Math.min(full, 60) * Math.min(1, cs.erect / 0.8)) : cs.down > 0 ? Math.max(6, full * (1 - Math.max(0, (cs.down - 0.3) / 0.7))) : full;
      setCraneHeight(c, h); c.slew.visible = cs.erect >= 0.8 && cs.down < 0.3;
      // ties to the building every ten floors
      c.root.children.filter((o) => o.userData.tie).forEach((o) => c.root.remove(o));
      const tw = s.struct[CRANE_AT[c.id].tower]; const fp = footprint(CRANE_AT[c.id].tower);
      if (tw && fp && tw.built >= 10) { const cx = fp.x + fp.w / 2, cz = fp.z + fp.d / 2; const dx = cx - c.root.position.x, dz = cz - c.root.position.z; const ex = Math.abs(dx) > Math.abs(dz) ? Math.sign(dx) * (Math.abs(dx) - fp.w / 2) : 0, ez = ex ? 0 : Math.sign(dz) * (Math.abs(dz) - fp.d / 2); const len = Math.hypot(ex, ez); for (let f = 10; f <= tw.built; f += 10) { const t = at(new THREE.Mesh(box(len, 0.35, 0.35), m.steel), ex / 2, f * STOREY + 1, ez / 2); t.rotation.y = -Math.atan2(ez, ex); t.userData.tie = true; c.root.add(t); } }
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
      const lv = s.struct[tower]?.built ?? 0;
      if (lv > 0) { const plat = new THREE.InstancedMesh(box(3, 0.25, 1.6), m.steel, lv); const mm = new THREE.Matrix4(); for (let i = 0; i < lv; i++) plat.setMatrixAt(i, mm.makeTranslation(q.x + q.w / 2 + (id === "hoist-a" ? 2.6 : -2.6), (i + 1) * STOREY + 0.2, q.z + q.d / 2)); g.add(plat); }
      hoists.add(tag(shadow(g), id));
    }
    // temp works appear with mobilisation; camp grows in two phases; batching after installation
    for (const [loc, g] of Object.entries(tempParts)) {
      if (loc === "labour-camp") g.children.forEach((c) => { c.visible = c.userData.phase === 1 ? c.userData.idx < Math.round(6 * s.temp.camp1) : s.temp.camp2 > (c.userData.idx - 5) / 3; });
      else if (loc === "batching") g.visible = s.temp.batching > 0.2;
      else g.visible = s.temp.offices > 0.3;
    }
    for (const g of services.children) { const f = s.services[g.userData.svc as string] ?? 1; g.visible = f > 0.05; g.scale.y = Math.max(0.05, Math.min(1, f * 1.4)); }
    truckGroup.visible = s.mobilised > 0.5 && !s.handedOver;
    { const n = 1 + Math.round(s.manpower / 180); trucks.forEach((t, i) => { t.g.visible = i < n; }); }
    hoard.visible = s.mobilised > 0.2 && !s.handedOver;
    // palms are planted as the landscaping runs; the pit's shoring wall, ramp, dumpers and pumps
    { const n = s.landscape >= 1 ? trees.length : Math.round(trees.length * s.landscape); trunks.count = n; crowns.count = n; }
    shoringHeads.count = Math.round(shoringHeads.userData.total * Math.min(1, s.shoring)); shoringHeads.visible = s.shoring > 0 && !s.groundSlab;
    ramp.visible = open && s.excavation > 0.15; ramp.scale.y = Math.max(0.05, -pitFloor.position.y / 14.5);
    pumps.visible = open && s.excavation > 0.4 && s.basementLevels < 2; pumps.position.y = pitFloor.position.y;
    dumperGroup.visible = open && s.excavation < 1; dumperGroup.position.y = pitFloor.position.y;
    const decks: Deck[] = [];
    for (const b of BUILDINGS) { const st = s.struct[b.id]; if (!st || st.active <= 0 || st.built >= b.floors) continue; const r = footprint(b.id)!, sy = b.id === "podium" ? PODIUM_STOREY : b.id === "club-e" ? 4.6 : STOREY; decks.push({ id: b.id, x: r.x + r.w / 2, z: r.z + r.d / 2, w: r.w * 0.84, d: r.d * 0.84, y: st.built * sy + sy - 0.05 + (open && ["tower-a", "tower-b", "podium"].includes(b.id) ? pitFloor.position.y + 3.6 * s.basementLevels : 0) }); }
    details.setState(s, { pitDepth: pitFloor.position.y, pitOpen: open, decks, topOf });
    grounds.setState(s);
    // ground: redraw only when the road surface or landscaping changes state
    const gk = `${s.roads > 0.99 ? 2 : s.roadsBase > 0.5 ? 1 : 0}|${Math.round(s.landscape * 5)}`;
    if (groundKey !== gk) { groundKey = gk; redrawGround(); }
    setSelected(selId);
  }
  let groundKey = "";
  function redrawGround() {
    const old = groundTex;
    groundTex = drawGround({ layers, night, roads: !state ? 0 : state.roads > 0.99 ? 1 : state.roadsBase > 0.5 ? 0.5 : 0, landscape: state?.landscape ?? 0, size: opts.textureSize });
    groundMat.map = groundTex; groundMat.needsUpdate = true; old.dispose();
  }

  function setNight(n: boolean) {
    if (n === night && state) return;
    night = n;
    skyMat.map?.dispose(); skyMat.map = sky(n); skyMat.needsUpdate = true;
    (scene.fog as THREE.Fog).color.set(n ? 0x161a26 : 0xe9dcc4); (scene.background as THREE.Color).set(n ? 0x161a26 : 0xe9dcc4);
    sunDisc.visible = !n; sunDisc.position.copy(sun.position).sub(sun.target.position).normalize().multiplyScalar(2100).add(sun.target.position);
    hemi.intensity = n ? 0.32 : 0.7; hemi.color.set(n ? 0x7d8fb8 : 0xdfe9f5); hemi.groundColor.set(n ? 0x2a2420 : 0xa88c66);
    sun.intensity = n ? 0.55 : 3.2; sun.color.set(n ? 0x9fb2ff : 0xfff0d8);
    scene.environmentIntensity = n ? 0.25 : 0.7;
    m.glassLit.emissiveIntensity = n ? 0.95 : 0;
    m.renderLit.emissiveIntensity = n ? 0.55 : 0;
    m.glassWork.emissiveIntensity = n ? 0.4 : 0; m.worklight.emissiveIntensity = n ? 0.9 : 0;
    (desert.material as THREE.MeshStandardMaterial).color.set(n ? 0x2f2a22 : 0xd2bd98);
    m.ghost.color.set(n ? 0xffffff : 0x2e2e2f); m.ghostFill.color.set(n ? 0xffffff : 0x2e2e2f);
    lights.children.forEach((c) => { if (c.userData.flood) c.visible = n; });
    details.setNight(n);
    redrawGround();
    if (state) { for (const k of Object.keys(built)) built[k].key = ""; setState(state); }
  }
  setNight(night);

  function setLayers(l: Record<Layer, boolean>) {
    const gk = `${l.grid}|${l.utilities}|${l.cranes}`, ok = `${layers.grid}|${layers.utilities}|${layers.cranes}`;
    layers = l;
    structs.visible = l.buildings; services.visible = l.buildings;
    temp.visible = l.temp; palms.visible = l.landscape; details.group.visible = l.temp; grounds.group.visible = l.roads;
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
    details.tick(dt, time, animate);
    for (const c of cranes) { c.light.visible = !night || Math.sin(time * 4 + c.r) > 0; if (c.up && c.slew.visible && animate) stepCrane(c, dt, time, (x, z) => groundAt(x, z)); else if (c.up) { c.slew.rotation.y = c.ang; c.trolley.position.x = c.tr; c.cable.scale.y = c.cab; c.cable.position.y = 0.6 - c.cab / 2; c.hook.position.y = 0.6 - c.cab; } }
    if (animate) {
      for (const h of hoistCages) h.cage.position.y = 2 + (h.top - 4) * (0.5 - 0.5 * Math.cos(time * 0.18 + h.ph));
      for (const t of trucks) if (t.g.visible) { t.s += t.speed * dt; placeTruck(t); if (t.drum) t.drum.rotation.x += dt * 2.4; }
      if (dumperGroup.visible) for (const t of dumpers) { t.s += t.speed * dt; placeTruck(t); }
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
    grounds.dispose();
    groundTex.dispose(); skyMat.map?.dispose(); skyMat.dispose(); glowTex.dispose(); envTex.dispose(); pm.dispose();
  }
  return { scene, sun, setState, setNight, setLayers, setSelected, tick, pickables, topOf, heightOf, dispose };
}
