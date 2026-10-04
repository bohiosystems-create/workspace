/**
 * The life of the site: workers, plant and traffic, street furniture, and the small things that make a model read as
 * a real construction site. Everything repeated is instanced (one draw call per kind), so detail costs little on phones.
 */
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { PLAN, SHAPES } from "@/lib/siteplan";
import type { SiteState } from "@/lib/scene/progress4d";
import { M, glow, rng } from "./textures";
import { ORANGE, W, at, box, mergeStatic, rectOf, shadow, tag, type Mats } from "./common";

export interface Deck { id: string; x: number; z: number; w: number; d: number; y: number }
export interface DetailsCtx { pitDepth: number; pitOpen: boolean; decks: Deck[]; topOf: (id: string) => number }
export interface DetailsApi { group: THREE.Group; setState(s: SiteState, ctx: DetailsCtx): void; setNight(n: boolean): void; tick(dt: number, time: number, animate: boolean): void }

const V3 = THREE.Vector3;
const mx = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3(1, 1, 1);
const place = (im: THREE.InstancedMesh, i: number, x: number, y: number, z: number, ry = 0, s = 1) => { q.setFromAxisAngle(new V3(0, 1, 0), ry); sc.set(s, s, s); v.set(x, y, z); im.setMatrixAt(i, mx.compose(v, q, sc)); };
const S = (p: THREE.MeshStandardMaterialParameters) => new THREE.MeshStandardMaterial(p);

// ------------------------------------------------------------------ workers
interface Worker { kind: "walk" | "deck" | "stand"; a: THREE.Vector3; b: THREE.Vector3; s: number; speed: number; deck?: number; u: number; w: number; phase: number; dir: number }
const VESTS = [0xff6a00, 0xffd400, 0xff6a00, 0xffd400, 0xf15a22, 0x1f5fd1];
const HATS = [0xffffff, 0xffd400, 0xffffff, 0x1f5fd1, 0xd03b3b, 0xffffff];

export function createDetails(m: Mats): DetailsApi {
  const group = new THREE.Group();
  const R = rng(4242);
  const statics = new THREE.Group(); group.add(statics);
  const dyn = new THREE.Group(); group.add(dyn);
  const lampPos: number[] = [];

  // ---------------------------------------------------------------- street lights along the public road and the ring road
  {
    const pole = mergeGeometries([new THREE.CylinderGeometry(0.12, 0.2, 10, 8).translate(0, 5, 0), box(2.6, 0.18, 0.18).translate(1.3, 10, 0), box(1.1, 0.25, 0.5).translate(2.4, 10.05, 0)])!;
    const pts: [number, number, number][] = [];
    for (let x = 20; x < PLAN.w * M; x += 50) pts.push([x, 950 * M - 2.2, Math.PI / 2]);
    for (let x = 60; x < 1460 * M; x += 60) { pts.push([x, 88 * M - 1.5, Math.PI / 2]); pts.push([x, 912 * M + 1.5, -Math.PI / 2]); }
    for (let y = 150; y < 850 * M; y += 60) { pts.push([88 * M - 1.5, y, 0]); pts.push([1512 * M + 1.5, y, Math.PI]); }
    const im = new THREE.InstancedMesh(pole, S({ color: 0x5c5f66, roughness: 0.6, metalness: 0.3 }), pts.length);
    pts.forEach(([x, z, ry], i) => { place(im, i, x, 0, z, ry); lampPos.push(x + Math.cos(ry) * 2.4, 10.3, z - Math.sin(ry) * 2.4); });
    im.castShadow = true; statics.add(im);
  }
  // ---------------------------------------------------------------- concrete barriers both sides of the haul road, cones at the gates and hoists
  {
    const road = SHAPES.find((s) => s.t === "rect" && s.cls === "road" && s.loc === "r-main")!;
    const q0 = W(road), gaps = [[215, 230], [435, 452], [568, 585]];
    const spots: [number, number][] = [];
    for (let x = q0.x + 4; x < q0.x + q0.w - 4; x += 4.2) if (!gaps.some(([a, b]) => x > a - 3 && x < b + 3)) { spots.push([x, q0.z - 1.1]); spots.push([x, q0.z + q0.d + 1.1]); }
    const im = new THREE.InstancedMesh(box(3.9, 0.85, 0.55), S({ color: 0xd9d6cf, roughness: 0.95 }), spots.length);
    spots.forEach(([x, z], i) => place(im, i, x, 0.43, z));
    im.castShadow = true; im.receiveShadow = true; statics.add(im);
    const cones: [number, number][] = [];
    for (const [gx, gy] of [[600, 934], [1150, 934]]) for (let i = -3; i <= 3; i++) cones.push([gx * M + i * 2.2, gy * M - 9]);
    for (const h of ["hoist-a", "hoist-b"]) { const r = rectOf(h); if (r) { const qq = W(r); for (let i = 0; i < 5; i++) cones.push([qq.x - 3 + i * 2, qq.z + qq.d + 4]); } }
    const ci = new THREE.InstancedMesh(new THREE.ConeGeometry(0.28, 0.75, 8).translate(0, 0.375, 0), S({ color: 0xff6a00, roughness: 0.8 }), cones.length);
    cones.forEach(([x, z], i) => place(ci, i, x, 0, z));
    statics.add(ci);
  }
  // ---------------------------------------------------------------- gates: booms, turnstile, signboards; flags at the site office
  const flags: THREE.Mesh[] = [];
  {
    const g = new THREE.Group();
    for (const [gx, gy, turn] of [[600, 934, true], [1150, 934, false]] as const) {
      const x = gx * M, z = gy * M;
      g.add(at(new THREE.Mesh(box(0.5, 1.2, 0.5), m.dark), x - 11, 0.6, z - 4));
      const boom = at(new THREE.Mesh(box(10, 0.14, 0.14), S({ color: 0xffffff, roughness: 0.5 })), x - 6, 1.15, z - 4); g.add(boom);
      for (let i = 0; i < 5; i++) g.add(at(new THREE.Mesh(box(1, 0.16, 0.16), S({ color: 0xd03b3b, roughness: 0.5 })), x - 10 + i * 2, 1.15, z - 4));
      if (turn) for (let i = 0; i < 3; i++) g.add(at(new THREE.Mesh(box(0.9, 2.2, 0.9, 1, 1), m.lattice), x + 3 + i * 1.3, 1.1, z - 4));
      // branded signboard facing the public road
      const sign = at(new THREE.Mesh(box(8, 1.1, 0.12, 8, 1.1), m.hoard), x + 14, 3.2, z + 3); g.add(sign);
      for (const dx of [-3.5, 3.5]) g.add(at(new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 3.4, 6), m.dark), x + 14 + dx, 1.7, z + 3));
    }
    const off = rectOf("site-office"); if (off) { const qq = W(off); for (let i = 0; i < 3; i++) { const x = qq.x + 6 + i * 4, z = qq.z - 5; g.add(at(new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, 12, 6), S({ color: 0xe8e8e8, roughness: 0.4, metalness: 0.4 })), x, 6, z)); const f = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1.6, 8, 2), i === 1 ? m.steel : S({ color: 0xffffff, roughness: 0.7, side: THREE.DoubleSide })); f.material.side = THREE.DoubleSide; at(f, x + 1.3, 11, z); f.userData.keep = true; flags.push(f); g.add(f); } }
    statics.add(shadow(mergeStatic(g), true, false));
  }
  // ---------------------------------------------------------------- site compound furniture: toilets, generators, fuel tank, water tanks, AC units, canteen, skips
  const furniture = new THREE.Group();
  {
    const g = furniture;
    const off = rectOf("site-office"), camp = rectOf("labour-camp"), bat = rectOf("batching");
    if (off) {
      const qq = W(off);
      for (let i = 0; i < 6; i++) g.add(at(new THREE.Mesh(box(1.2, 2.3, 1.2), S({ color: 0x3a7bd5, roughness: 0.7 })), qq.x + qq.w + 2 + i * 1.5, 1.15, qq.z + 2));
      for (let i = 0; i < 5; i++) for (let j = 0; j < 2; j++) g.add(at(new THREE.Mesh(box(0.8, 0.5, 0.6), S({ color: 0xcfd2d6, roughness: 0.6 })), qq.x + 7 + i * 13, 6.3 + j * 0, qq.z + 2 + j * 6.4));
      g.add(at(new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 0.1, 16).rotateX(0.9), S({ color: 0xeeeeee, roughness: 0.5 })), qq.x + qq.w - 3, 6.8, qq.z + 3));
      const stair = at(new THREE.Mesh(box(1.2, 0.3, 6), m.steel), qq.x - 1.4, 1.6, qq.z + 4); stair.rotation.x = -0.46; g.add(stair);
      g.add(at(new THREE.Mesh(box(qq.w * 0.5, 0.12, 4, 4, 4), m.steel), qq.x + qq.w * 0.3, 3.1, qq.z + qq.d + 2)); // canopy
    }
    if (camp) {
      const qq = W(camp);
      g.add(at(new THREE.Mesh(box(26, 3.2, 8, 12, 3.2), m.cabin), qq.x + 30, 1.6, qq.z + qq.d - 6)); // canteen
      for (let i = 0; i < 3; i++) { g.add(at(new THREE.Mesh(new THREE.CylinderGeometry(1.8, 1.8, 3, 16), m.white), qq.x + qq.w - 6 - i * 5, 4.5, qq.z + 4)); g.add(at(new THREE.Mesh(box(0.3, 3, 0.3), m.dark), qq.x + qq.w - 6 - i * 5, 1.5, qq.z + 4)); }
      for (let i = 0; i < 2; i++) g.add(at(new THREE.Mesh(box(11, 3, 2.5), S({ color: i ? 0xf4f4f2 : 0xffd400, roughness: 0.5 })), qq.x + 8 + i * 13, 1.5, qq.z + qq.d - 14));
      for (let i = 0; i < 8; i++) g.add(at(new THREE.Mesh(box(1.2, 2.3, 1.2), S({ color: 0x3a7bd5, roughness: 0.7 })), qq.x + 2 + i * 1.5, 1.15, qq.z + qq.d - 3));
    }
    if (bat) {
      const qq = W(bat);
      for (let i = 0; i < 2; i++) g.add(at(new THREE.Mesh(box(3.2, 2, 1.8), S({ color: 0xffd400, roughness: 0.6 })), qq.x + qq.w + 3, 1, qq.z + 6 + i * 4));
      const tank = at(new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 5, 16).rotateZ(Math.PI / 2), S({ color: 0xe0e0e0, roughness: 0.5 })), qq.x + qq.w + 4, 1.7, qq.z + 16); g.add(tank);
      g.add(at(new THREE.Mesh(box(6, 0.4, 3), m.concrete), qq.x + qq.w + 4, 0.2, qq.z + 16));
      for (let i = 0; i < 2; i++) { const s = SHAPES.filter((x) => x.cls === "silo")[i]; if (s) g.add(at(new THREE.Mesh(box(0.4, 18, 0.5, 1, 1), m.lattice), s.cx! * M + 4.4, 9, s.cy! * M)); }
    }
    for (const loc of ["laydown-1", "laydown-2", "rebar-yard", "waste-yard"]) {
      const r = rectOf(loc); if (!r) continue; const qq = W(r);
      for (let i = 0; i < 3; i++) g.add(at(new THREE.Mesh(box(5.5, 1.8, 2.4), S({ color: [0x2e7d32, 0x1f5fd1, 0xd99400][i], roughness: 0.6 })), qq.x + 3 + i * 6.5, 0.9, qq.z + qq.d - 2.5));
      g.add(at(new THREE.Mesh(box(3, 2.4, 0.1, 3, 2.4), m.hoard), qq.x + qq.w / 2, 1.5, qq.z - 0.4));
    }
    statics.add(shadow(mergeStatic(g), true, false));
  }
  // ---------------------------------------------------------------- stock in the yards: scaffold tube bundles, block pallets, pipe stacks
  {
    const items: { geo: THREE.BufferGeometry; mat: THREE.Material; spots: [number, number, number][] }[] = [];
    const spotsIn = (loc: string, n: number) => { const r = rectOf(loc); if (!r) return [] as [number, number, number][]; const qq = W(r); return Array.from({ length: n }, () => [qq.x + 3 + R() * (qq.w - 6), qq.z + 3 + R() * (qq.d - 8), R() < 0.5 ? 0 : Math.PI / 2] as [number, number, number]); };
    items.push({ geo: box(0.7, 0.7, 6).translate(0, 0.35, 0), mat: S({ color: 0x8a8f96, roughness: 0.6, metalness: 0.4 }), spots: spotsIn("laydown-1", 18) });
    items.push({ geo: box(1.2, 1.3, 1.2).translate(0, 0.65, 0), mat: S({ color: 0xc9c2b2, roughness: 0.95 }), spots: spotsIn("laydown-2", 22) });
    items.push({ geo: new THREE.CylinderGeometry(0.3, 0.3, 6, 8).rotateX(Math.PI / 2).translate(0, 0.3, 0), mat: S({ color: 0x3a6ea5, roughness: 0.5 }), spots: spotsIn("laydown-2", 14) });
    items.push({ geo: box(1.1, 0.9, 1.1).translate(0, 0.45, 0), mat: S({ color: 0x9c7b5a, roughness: 0.9 }), spots: spotsIn("rebar-yard", 10) });
    for (const it of items) { const im = new THREE.InstancedMesh(it.geo, it.mat, it.spots.length); it.spots.forEach(([x, z, ry], i) => place(im, i, x, 0, z, ry)); im.castShadow = true; im.receiveShadow = true; statics.add(im); }
  }
  // ---------------------------------------------------------------- lamps (night): one Points cloud for every street light and lamp
  const lamps = new THREE.Points(new THREE.BufferGeometry().setAttribute("position", new THREE.Float32BufferAttribute(lampPos, 3)), new THREE.PointsMaterial({ map: glow(), size: 11, sizeAttenuation: true, color: 0xffe0b0, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  lamps.visible = false; group.add(lamps);

  // ---------------------------------------------------------------- public road traffic
  const cars = { body: new THREE.InstancedMesh(box(4.4, 1.25, 1.9).translate(0, 0.95, 0), S({ color: 0xffffff, roughness: 0.35, metalness: 0.4 }), 10), cab: new THREE.InstancedMesh(box(2.3, 0.85, 1.7).translate(-0.2, 1.95, 0), S({ color: 0x1d2a3a, roughness: 0.2, metalness: 0.5 }), 10), s: [] as number[] };
  { const cols = [0xf4f4f2, 0x2e2e2f, 0xbdc3c7, 0xf15a22, 0x8d6e63, 0xf4f4f2, 0x1f5fd1, 0x2e2e2f, 0xc0392b, 0xecf0f1]; for (let i = 0; i < 10; i++) { cars.body.setColorAt(i, new THREE.Color(cols[i])); cars.s.push(R() * 1000); } cars.body.castShadow = true; group.add(cars.body, cars.cab); }
  const placeCars = () => { for (let i = 0; i < 10; i++) { const east = i % 2 === 0, x = ((cars.s[i] % 1200) + 1200) % 1200 - 200, z = 975 * M + (east ? 6 : -6); place(cars.body, i, x, 0, z, east ? 0 : Math.PI); place(cars.cab, i, x, 0, z, east ? 0 : Math.PI); } cars.body.instanceMatrix.needsUpdate = true; cars.cab.instanceMatrix.needsUpdate = true; };
  placeCars();

  // ---------------------------------------------------------------- workers
  const N = 160;
  const bodies = new THREE.InstancedMesh(new THREE.CapsuleGeometry(0.22, 0.85, 2, 6).translate(0, 0.78, 0), S({ color: 0xffffff, roughness: 0.9 }), N);
  const hats = new THREE.InstancedMesh(new THREE.SphereGeometry(0.17, 8, 6).translate(0, 1.56, 0), S({ color: 0xffffff, roughness: 0.4 }), N);
  for (let i = 0; i < N; i++) { bodies.setColorAt(i, new THREE.Color(VESTS[i % VESTS.length])); hats.setColorAt(i, new THREE.Color(HATS[(i * 7) % HATS.length])); }
  bodies.castShadow = true; group.add(bodies, hats);
  const workers: Worker[] = [];
  const mk = (kind: Worker["kind"], a: THREE.Vector3, b: THREE.Vector3, deck?: number): Worker => ({ kind, a, b, s: R(), speed: 0.9 + R() * 0.6, deck, u: R(), w: R(), phase: R() * 6.3, dir: R() < 0.5 ? 1 : -1 });
  const haul = W(SHAPES.find((s) => s.cls === "road" && s.loc === "r-main")!);
  for (let i = 0; i < 26; i++) workers.push(mk("walk", new V3(haul.x + 8, 0, haul.z - 2.6 + (i % 2) * (haul.d + 5.2)), new V3(haul.x + haul.w - 8, 0, haul.z - 2.6 + (i % 2) * (haul.d + 5.2))));
  for (let i = 0; i < 10; i++) workers.push(mk("walk", new V3(300, 0, 460), new V3(300, 0, 300)));
  for (let i = 0; i < 8; i++) workers.push(mk("walk", new V3(885 * M, 0, 540 * M), new V3(885 * M, 0, 130 * M)));
  for (const loc of ["rebar-yard", "laydown-1", "laydown-2", "laydown-3", "batching", "site-office"]) { const r = rectOf(loc); if (!r) continue; const qq = W(r); for (let i = 0; i < 7; i++) { const p = new V3(qq.x + 3 + R() * (qq.w - 6), 0, qq.z + 3 + R() * (qq.d - 6)); workers.push(mk("stand", p, p)); } }
  for (let i = 0; i < 6; i++) { const p = new V3(600 * M - 6 + i * 2.5, 0, 934 * M - 6); workers.push(mk("stand", p, p)); }
  const deckWorkers = workers.length; // the rest live on the active decks
  for (let i = workers.length; i < N; i++) workers.push(mk("deck", new V3(), new V3(), i % 4));
  let decks: Deck[] = [];
  const face = new THREE.Vector3();
  const placeWorkers = (time: number, dt: number, animate: boolean) => {
    for (let i = 0; i < N; i++) {
      const wk = workers[i];
      let x = 0, y = 0, z = 0, ry = wk.phase;
      if (wk.kind === "walk") {
        if (animate) { wk.s += (wk.speed * wk.dir * dt) / wk.a.distanceTo(wk.b); if (wk.s > 1 || wk.s < 0) { wk.dir *= -1; wk.s = Math.max(0, Math.min(1, wk.s)); } }
        v.lerpVectors(wk.a, wk.b, wk.s); x = v.x; y = v.y; z = v.z;
        face.subVectors(wk.b, wk.a).multiplyScalar(wk.dir); ry = Math.atan2(face.x, face.z);
        y += 0.03 * Math.abs(Math.sin(time * 6 + wk.phase));
      } else if (wk.kind === "stand") { x = wk.a.x; z = wk.a.z; y = 0.01 * Math.sin(time * 1.3 + wk.phase); }
      else {
        const dk = decks.length ? decks[(wk.deck ?? 0) % decks.length] : null;
        if (!dk) { place(bodies, i, 0, -50, 0); place(hats, i, 0, -50, 0); continue; }
        x = dk.x - dk.w / 2 + 1.5 + wk.u * (dk.w - 3); z = dk.z - dk.d / 2 + 1.5 + wk.w * (dk.d - 3); y = dk.y + 0.01 * Math.sin(time * 1.1 + wk.phase);
        x += 0.6 * Math.sin(time * 0.4 + wk.phase);
      }
      place(bodies, i, x, y, z, ry); place(hats, i, x, y, z, ry);
    }
    bodies.instanceMatrix.needsUpdate = true; hats.instanceMatrix.needsUpdate = true;
  };

  // ---------------------------------------------------------------- plant: excavator in the pit, pump truck at the active low-rise deck
  const excavator = (() => {
    const g = new THREE.Group();
    const yellow = S({ color: 0xe8b400, roughness: 0.6 });
    for (const z of [-1.4, 1.4]) g.add(at(new THREE.Mesh(box(4.6, 1, 0.9), m.dark), 0, 0.5, z));
    g.add(at(new THREE.Mesh(box(3.6, 1.6, 2.8), yellow), -0.4, 1.8, 0));
    g.add(at(new THREE.Mesh(box(1.6, 1.5, 1.4), m.dark), 0.8, 3.3, -0.6));
    const boom = new THREE.Group(); boom.position.set(1.6, 2.6, 0); g.add(boom);
    boom.add(at(new THREE.Mesh(box(6, 0.7, 0.6), yellow), 2.8, 1.4, 0).rotateZ(0));
    const stick = new THREE.Group(); stick.position.set(5.6, 2.6, 0); boom.add(stick);
    stick.add(at(new THREE.Mesh(box(4, 0.5, 0.45), yellow), 2, -1.4, 0));
    stick.add(at(new THREE.Mesh(box(1.4, 1.1, 1.2), m.dark), 3.8, -3, 0));
    g.userData = { boom, stick }; shadow(g); return g;
  })();
  dyn.add(excavator);

  // trench along the utilities corridor while it is being laid
  const trench = (() => {
    const g = new THREE.Group();
    const spoil = S({ color: 0x9c7b5a, roughness: 1 });
    const runs: [number, number, number, number][] = [[600, 600, 830, 600], [885, 330, 885, 540]];
    for (const [x1, y1, x2, y2] of runs) {
      const a = new V3(x1 * M, 0, y1 * M), b = new V3(x2 * M, 0, y2 * M), len = a.distanceTo(b), mid = a.clone().add(b).multiplyScalar(0.5), ry = -Math.atan2(b.z - a.z, b.x - a.x);
      const t = at(new THREE.Mesh(box(len, 0.06, 3.2), S({ color: 0x5a4632, roughness: 1 })), mid.x, 0.03, mid.z); t.rotation.y = ry; g.add(t);
      const pipe = at(new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, len * 0.6, 10).rotateZ(Math.PI / 2), S({ color: 0x3b7fe0, roughness: 0.5 })), mid.x, 0.5, mid.z); pipe.rotation.y = ry; g.add(pipe);
      for (let i = 0; i < len / 12; i++) { const s = at(new THREE.Mesh(new THREE.ConeGeometry(2, 1.4, 8), spoil), a.x + (b.x - a.x) * (i / (len / 12)) + Math.sin(ry) * 3.5, 0.7, a.z + (b.z - a.z) * (i / (len / 12)) + Math.cos(ry) * 3.5); g.add(s); }
    }
    shadow(g); return g;
  })();
  dyn.add(trench);

  // ---------------------------------------------------------------- state
  let night = false;
  function setState(s: SiteState, ctx: DetailsCtx) {
    decks = ctx.decks;
    excavator.visible = ctx.pitOpen && s.excavation < 1;
    if (excavator.visible) { excavator.position.set(390 * M + 40, ctx.pitDepth, 330 * M + 30); }
    trench.visible = s.services.substation > 0.1 && s.roads < 0.5 && (s.date >= "2026-03-01" && s.date <= "2026-11-30");
    furniture.visible = s.temp.offices > 0.3;
    for (const im of statics.children) im.visible = s.mobilised > 0.3;
    cars.body.visible = cars.cab.visible = true;
    bodies.visible = hats.visible = s.mobilised > 0.5 && !(s.date > "2028-07-31");
  }
  function setNight(n: boolean) { night = n; lamps.visible = n; }
  function tick(dt: number, time: number, animate: boolean) {
    if (animate) { for (let i = 0; i < 10; i++) cars.s[i] += dt * (12 + (i % 3) * 3); placeCars(); }
    placeWorkers(time, dt, animate);
    if (excavator.visible && animate) { excavator.userData.boom.rotation.z = -0.25 + 0.25 * Math.sin(time * 0.7); excavator.userData.stick.rotation.z = -0.5 + 0.45 * Math.sin(time * 0.7 + 1); excavator.rotation.y = 0.6 * Math.sin(time * 0.25); }
    for (let i = 0; i < flags.length; i++) { const f = flags[i]; f.rotation.y = 0.25 * Math.sin(time * 1.7 + i); f.rotation.x = 0.06 * Math.sin(time * 3.1 + i); }
    void night;
  }
  return { group: tag(group), setState, setNight, tick };
}

/** Rooftop equipment for a topped-out building: antennas on towers, a helipad on the hotel, plant on the podium. */
export function roofKit(m: Mats, id: string, w: number, d: number, top: number): THREE.Group {
  const g = new THREE.Group();
  if (id === "hotel-c") {
    const ring = new THREE.Mesh(new THREE.RingGeometry(7, 8, 48).rotateX(-Math.PI / 2), S({ color: 0xffffff, roughness: 0.8 })); at(ring, 0, top + 0.08, d * 0.12); g.add(ring);
    for (const [x, z, bw, bd] of [[-2.2, 0, 0.9, 7], [2.2, 0, 0.9, 7], [0, 0, 3.6, 0.9]] as const) g.add(at(new THREE.Mesh(box(bw, 0.06, bd), S({ color: 0xffffff, roughness: 0.8 })), x, top + 0.08, z + d * 0.12));
    g.add(at(new THREE.Mesh(new THREE.CylinderGeometry(6, 6, 0.12, 48), S({ color: 0x3a3f46, roughness: 0.9 })), 0, top + 0.02, d * 0.12));
  } else if (id === "tower-a" || id === "tower-b") {
    for (const [x, z, h] of [[-w * 0.3, -d * 0.3, 14], [w * 0.32, d * 0.28, 9]] as const) { g.add(at(new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.25, h, 6), m.dark), x, top + h / 2, z)); g.add(at(new THREE.Mesh(new THREE.SphereGeometry(0.4, 8, 6), m.aviation), x, top + h + 0.3, z)); }
    g.add(at(new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.2, 2.6, 16), m.white), w * 0.25, top + 1.3, -d * 0.25)); // water tank
    g.add(at(new THREE.Mesh(box(w * 0.42, 2.4, 0.14, 4, 2.4), m.lattice), 0, top + 1.2, d * 0.1)); // plant screen
  } else if (id === "podium") {
    for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) g.add(at(new THREE.Mesh(box(3.6, 2, 2.6), m.white), -w * 0.36 + i * (w * 0.24), top + 1, -d * 0.36 + j * (d * 0.22) + (j === 1 ? 0 : 0)));
    for (const x of [-w * 0.3, 0, w * 0.3]) g.add(at(new THREE.Mesh(box(9, 0.4, 5), m.dark), x, 5.2, d / 2 + 2.6)); // entrance canopies
    g.add(at(new THREE.Mesh(box(w * 0.9, 1.2, 0.1, 8, 1.2), m.hoard), 0, 5.4 * 0.9, d / 2 + 0.55)); // retail signage band
  } else if (id === "club-e") {
    g.add(at(new THREE.Mesh(box(w * 0.5, 0.2, d * 0.5), m.water), -w * 0.15, 0.3, d / 2 + d * 0.4));
    for (let i = 0; i < 5; i++) { const x = -w * 0.4 + i * (w * 0.2), z = d / 2 + d * 0.78; g.add(at(new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.6, 6), m.dark), x, 1.3, z)); g.add(at(new THREE.Mesh(new THREE.ConeGeometry(1.4, 0.5, 10), S({ color: ORANGE, roughness: 0.8 })), x, 2.7, z)); }
  }
  return shadow(mergeStatic(g), true, true);
}

/** Edge protection, falsework and the pour on a structure under construction. */
export function constructionKit(m: Mats, o: { w: number; d: number; storey: number; built: number; glazed: number; floors: number; active: number; topped: boolean; podium: boolean; id: string }): { group: THREE.Group; pulse: THREE.MeshStandardMaterial[] } {
  const g = new THREE.Group(); const pulse: THREE.MeshStandardMaterial[] = [];
  const { w, d, storey, built, glazed, floors, active } = o;
  const exposed = built - Math.min(Math.floor(glazed + 1e-6), built);
  // orange posts + two rails round every exposed slab edge (instanced posts, merged rails)
  if (exposed > 0 && !o.podium) {
    const per = Math.max(8, Math.round(((w + d) * 2) / 2.4));
    const posts = new THREE.InstancedMesh(box(0.08, 1.1, 0.08).translate(0, 0.55, 0), m.steel, per * exposed);
    const rails: THREE.BufferGeometry[] = [];
    let n = 0;
    for (let f = built - exposed; f < built; f++) {
      const y = (f + 1) * storey;
      for (let i = 0; i < per; i++) { const P = 2 * (w + d), s = (i / per) * P; const [x, z] = s < w ? [-w / 2 + s, -d / 2] : s < w + d ? [w / 2, -d / 2 + (s - w)] : s < 2 * w + d ? [w / 2 - (s - w - d), d / 2] : [-w / 2, d / 2 - (s - 2 * w - d)]; place(posts, n++, x, y, z); }
      for (const ry of [0.5, 1.0]) rails.push(box(w, 0.05, 0.05).translate(0, y + ry, -d / 2), box(w, 0.05, 0.05).translate(0, y + ry, d / 2), box(0.05, 0.05, d).translate(-w / 2, y + ry, 0), box(0.05, 0.05, d).translate(w / 2, y + ry, 0));
    }
    g.add(posts); g.add(new THREE.Mesh(mergeGeometries(rails)!, m.steel));
    // debris netting on the two floors under the screen
    if (built >= 2 && !o.topped) { const net = new THREE.Mesh(new THREE.BoxGeometry(w + 1.2, storey * 2, d + 1.2), S({ color: ORANGE, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide })); at(net, 0, (built - 3) * storey + storey, 0); net.userData.keep = true; g.add(net); }
  }
  if (active > 0 && built < floors) {
    const top = built * storey, deckY = top + storey - 0.2;
    // falsework props and the plywood soffit under the deck being cast
    const nx = Math.max(2, Math.floor(w / 2.4)), nz = Math.max(2, Math.floor(d / 2.4)), h = storey - 0.62;
    const props = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.06, 0.06, h, 6).translate(0, h / 2, 0), m.steel, nx * nz);
    let n = 0; for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) place(props, n++, -w / 2 + 1.2 + i * ((w - 2.4) / (nx - 1)), top, -d / 2 + 1.2 + j * ((d - 2.4) / (nz - 1)));
    g.add(props); g.add(at(new THREE.Mesh(box(w, 0.08, d), m.ply), 0, deckY - 0.44, 0));
    // rebar stacks, a concrete skip and workers' huts on the deck
    const R = rng(o.id.length * 13 + built);
    for (let i = 0; i < 6; i++) { const b = at(new THREE.Mesh(box(6, 0.3, 0.7), m.rust), -w * 0.35 + R() * w * 0.7, deckY + 0.3, -d * 0.35 + R() * d * 0.7); b.rotation.y = R() < 0.5 ? 0 : Math.PI / 2; g.add(b); }
    // placing boom on the deck (tall buildings) or a pump truck at the base
    if (top > 40) {
      const mast = at(new THREE.Mesh(box(1, 14, 1, 1, 1), m.lattice), w * 0.2, deckY + 7, -d * 0.15); g.add(mast);
      const arm = at(new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.3, Math.min(w, 32), 8).rotateZ(Math.PI / 2), S({ color: ORANGE, roughness: 0.5 })), w * 0.2 - Math.min(w, 32) / 2 + 2, deckY + 13.5, -d * 0.15); arm.rotation.y = 0.5; g.add(arm);
      g.add(at(new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, deckY + 2, 6), m.dark), w / 2 + 0.9, (deckY + 2) / 2, d * 0.1)); // concrete line up the face
    } else {
      const truck = new THREE.Group(); truck.position.set(0, 0, d / 2 + 9);
      truck.add(at(new THREE.Mesh(box(9, 1.2, 2.5), m.dark), 0, 0.9, 0)); truck.add(at(new THREE.Mesh(box(2.4, 2.4, 2.4), S({ color: ORANGE, roughness: 0.5 })), 4, 2.2, 0));
      for (const x of [-3, -1, 3.5]) for (const z of [-1.2, 1.2]) truck.add(at(new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.45, 10).rotateX(Math.PI / 2), m.dark), x, 0.55, z));
      const boom1 = at(new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.3, deckY + 8, 8), S({ color: ORANGE, roughness: 0.5 })), -1, (deckY + 8) / 2 + 1, 0); truck.add(boom1);
      const reach = d / 2 + 9 - d * 0.2, boom2 = at(new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, reach, 8).rotateX(Math.PI / 2), S({ color: ORANGE, roughness: 0.5 })), -1, deckY + 8.6, -reach / 2); truck.add(boom2);
      truck.add(at(new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 6, 6), m.dark), -1, deckY + 5.5, -reach)); g.add(truck);
    }
  }
  const merged = mergeStatic(g);
  merged.traverse((c) => { const mm = (c as THREE.Mesh).material as THREE.MeshStandardMaterial; if (mm?.emissive && mm.emissive.getHex() === ORANGE && mm !== m.formwork && mm !== m.deck) pulse.push(mm); });
  return { group: shadow(merged, true, true), pulse };
}
