/**
 * Shared geometry helpers and the material set for the 3D site (scene.ts and details.ts).
 */
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { SHAPES } from "@/lib/siteplan";
import { M, cabin, climbScreen, concrete, curtainWall, hoarding, lattice, rebar } from "./textures";

export const STOREY = 3.6;
export const ORANGE = 0xf15a22;
export const rectOf = (loc: string) => SHAPES.find((s) => s.t === "rect" && s.loc === loc && s.layer !== "base" && s.layer !== "roads");
export const W = (r: { x?: number; y?: number; w?: number; h?: number }) => ({ x: r.x! * M, z: r.y! * M, w: r.w! * M, d: r.h! * M });
/** A point on a rectangle's perimeter (t in 0..1, clockwise from the back-left corner), centred on the origin. */
export function perim(w: number, d: number, t: number): [number, number] {
  const P = 2 * (w + d), s = ((t % 1) + 1) % 1 * P;
  if (s < w) return [-w / 2 + s, -d / 2];
  if (s < w + d) return [w / 2, -d / 2 + (s - w)];
  if (s < 2 * w + d) return [w / 2 - (s - w - d), d / 2];
  return [-w / 2, d / 2 - (s - 2 * w - d)];
}

/** A box whose UVs repeat by face size (so one texture tiles at a fixed real-world module). */
export function box(w: number, h: number, d: number, modW = 0, modH = 0) {
  const g = new THREE.BoxGeometry(w, h, d);
  if (modW && modH) {
    const uv = g.attributes.uv as THREE.BufferAttribute;
    const faces: [number, number][] = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
    for (let f = 0; f < 6; f++) for (let v = 0; v < 4; v++) { const i = f * 4 + v; uv.setXY(i, uv.getX(i) * (faces[f][0] / modW), uv.getY(i) * (faces[f][1] / modH)); }
  }
  return g;
}
/** Four outward wall planes round a footprint (no top or bottom), UVs tiled by size. */
export function walls(w: number, d: number, h: number, modW: number, modH: number) {
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
export const at = <T extends THREE.Object3D>(o: T, x: number, y: number, z: number) => { o.position.set(x, y, z); return o; };
export function shadow<T extends THREE.Object3D>(o: T, cast = true, receive = true) { o.traverse((c) => { if ((c as THREE.Mesh).isMesh) { c.castShadow = cast; c.receiveShadow = receive; } }); return o; }
export function tag<T extends THREE.Object3D>(o: T, loc?: string): T { if (loc) o.traverse((c) => { c.userData.loc = loc; }); return o; }

export interface Mats {
  concrete: THREE.MeshStandardMaterial; core: THREE.MeshStandardMaterial; slabEdge: THREE.MeshStandardMaterial;
  glass: THREE.MeshStandardMaterial; glassLit: THREE.MeshStandardMaterial; formwork: THREE.MeshStandardMaterial; deck: THREE.MeshStandardMaterial;
  screen: THREE.MeshStandardMaterial; steel: THREE.MeshStandardMaterial; lattice: THREE.MeshStandardMaterial; weight: THREE.MeshStandardMaterial;
  render: THREE.MeshStandardMaterial; renderLit: THREE.MeshStandardMaterial; block: THREE.MeshStandardMaterial; water: THREE.MeshStandardMaterial; stone: THREE.MeshStandardMaterial;
  cabin: THREE.MeshStandardMaterial; hoard: THREE.MeshStandardMaterial; ghost: THREE.LineDashedMaterial; ghostFill: THREE.MeshBasicMaterial;
  white: THREE.MeshStandardMaterial; dark: THREE.MeshStandardMaterial; skylight: THREE.MeshStandardMaterial; palm: THREE.MeshStandardMaterial; trunk: THREE.MeshStandardMaterial;
  aviation: THREE.MeshBasicMaterial; rust: THREE.MeshStandardMaterial; ply: THREE.MeshStandardMaterial; sel: THREE.LineBasicMaterial;
}
export function materials(): Mats {
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
    lattice: S({ map: lattice("#f15a22"), alphaTest: 0.4, alphaToCoverage: true, side: THREE.DoubleSide, roughness: 0.55, metalness: 0.3 }),
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
export function mergeStatic<T extends THREE.Group>(g: T): T {
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

