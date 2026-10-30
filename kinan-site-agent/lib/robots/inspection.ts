// What inspection engineering knows about robots in oil and gas, so the orchestrator sends the right robot with the
// right sensor to the right surface — and says what that sensor can't see. From two reviews:
//   [Y] L. Yu, E. Yang, P. Ren et al., "Inspection Robots in Oil and Gas Industry: a Review of Current Solutions and
//       Future Trends", 25th Int. Conf. on Automation & Computing (ICAC), Lancaster, 2019.
//   [S] A. Shukla, H. Karki, "A Review of Robotics in Onshore Oil-Gas Industry", IEEE Int. Conf. on Mechatronics and
//       Automation (ICMA), Takamatsu, 2013.
// Three parts: the test methods (what each finds, on what material, and its blind spots); how robots move and hold on
// (which surfaces and pipes each can reach); and, for a facility, the inspection plan — each surface that needs
// inspecting, the damage expected there, the method and the robot in the fleet that can do it, or the gap.
import type { Capability, MissionKind, Robot } from "./types";

export type Source = "Y" | "S";
export const SOURCES: Record<Source, string> = {
  Y: "Yu et al., Inspection Robots in Oil and Gas Industry (ICAC 2019)",
  S: "Shukla & Karki, A Review of Robotics in Onshore Oil-Gas Industry (IEEE ICMA 2013)",
};

// ------------------------------------------------------------------ test methods (NDT)
export type Method = "visual" | "ut" | "mfl" | "ect" | "radiography" | "thermal" | "sonar";
export interface MethodInfo { name: string; capability?: Capability; finds: string; materials: "any" | "ferromagnetic" | "conductive"; good: string[]; limits: string[]; src: Source[] }
export const METHODS: Record<Method, MethodInfo> = {
  visual: { name: "Visual (camera)", capability: "visual", finds: "surface corrosion, coating damage, leaks, visible cracks", materials: "any",
    good: ["the simplest and easiest inspection", "images can be read by AI defect detection (deep-learning crack detection reaches about 90 % average precision)"],
    limits: ["surface damage only", "quality depends on the light — LEDs needed in dark spaces"], src: ["Y", "S"] },
  ut: { name: "Ultrasonic (UT)", capability: "ut_thickness", finds: "wall thickness, internal and external corrosion, cracks (location and size)", materials: "any",
    good: ["high accuracy and sensitivity", "deep penetration", "works on every material", "early corrosion shows as wall thinning before it is visible"],
    limits: ["the probe must touch the surface", "misses a crack lying along the sound's path", "needs a trained operator"], src: ["Y", "S"] },
  mfl: { name: "Magnetic flux leakage (MFL)", capability: "mfl", finds: "metal loss and pitting", materials: "ferromagnetic",
    good: ["fast", "very sensitive to pitting", "circumferential MFL works better than axial"],
    limits: ["ferromagnetic steel only", "qualitative — it says where, UT says how much", "impurities in the steel give false indications", "limited defect sizes"], src: ["Y", "S"] },
  ect: { name: "Eddy current (ECT, RFEC)", capability: "eddy_current", finds: "surface cracks, multilayer structures", materials: "conductive",
    good: ["small, light probes", "wide temperature range", "low cost"],
    limits: ["metal only", "sensitive to lift-off and permeability changes", "misses defects parallel to the surface", "less sensitive than UT"], src: ["Y", "S"] },
  radiography: { name: "Radiography (X-ray)", finds: "a picture of the defect, the material and its density", materials: "any",
    good: ["shows the defect as an image", "almost any material"],
    limits: ["expensive", "needs a skilled analyst", "misses closed cracks", "radiation safety — an NDT contractor's job, not a robot's"], src: ["S"] },
  thermal: { name: "Thermal camera", capability: "thermal", finds: "hot spots, flare pilots, insulation loss, hot leaks", materials: "any",
    good: ["from a distance, in any light"], limits: ["surface temperature only"], src: ["Y"] },
  sonar: { name: "Sonar", capability: "sonar", finds: "free spans, burial and damage under water", materials: "any",
    good: ["sees where cameras can't (turbid water)"], limits: ["under water only"], src: ["Y"] },
};
export const methodFor = (c: Capability) => (Object.keys(METHODS) as Method[]).find((m) => METHODS[m].capability === c);

// ------------------------------------------------------------------ how robots move and hold on
/** The surfaces a robot may have to reach. */
export type Surface = "external_steel" | "pipe_inside" | "tank_inside" | "vessel_inside" | "subsea" | "aerial" | "ground";
export const SURFACE_LABEL: Record<Surface, string> = { external_steel: "outside wall (climbing)", pipe_inside: "inside a pipe", tank_inside: "inside a tank in service", vessel_inside: "inside a vessel", subsea: "under water", aerial: "from the air", ground: "from the ground" };
export type Locomotion = "magnetic_crawler" | "vacuum_crawler" | "pig" | "wheeled_in_pipe" | "tracked_in_pipe" | "legged_in_pipe" | "inchworm" | "snake" | "screw" | "multirotor" | "caged_drone" | "fixed_wing" | "rov" | "auv" | "tank_submersible" | "legged" | "wheeled";
export interface LocoInfo { name: string; reaches: Surface[]; good: string[]; limits: string[]; ferromagneticOnly?: boolean; bends?: boolean; vertical?: boolean; smallBore?: boolean; src: Source[] }
export const LOCOMOTION: Record<Locomotion, LocoInfo> = {
  magnetic_crawler: { name: "Magnetic climbing crawler", reaches: ["external_steel"], ferromagneticOnly: true, src: ["Y", "S"],
    good: ["holds on to carbon steel tanks, vessels and stacks", "permanent magnets need no power to hold on"], limits: ["ferromagnetic steel only (not stainless, aluminium or composite)", "a heavy crawler can dent thin walls"] },
  vacuum_crawler: { name: "Vacuum (suction) climbing crawler", reaches: ["external_steel"], src: ["Y", "S"],
    good: ["any smooth material — stainless, aluminium, coated, composite"], limits: ["needs power for its pump", "rough or strongly curved surfaces lose suction"] },
  pig: { name: "Intelligent pig (in-line inspection tool)", reaches: ["pipe_inside"], src: ["Y", "S"],
    good: ["travels the whole line with the product flow — no motor", "MFL or UT sensors and an odometer locate each defect"], limits: ["needs a launcher, a receiver and steady flow", "poor at low pressure, in branches and vertical sections"] },
  wheeled_in_pipe: { name: "Wheeled in-pipe crawler (wall-press)", reaches: ["pipe_inside"], bends: true, src: ["S", "Y"],
    good: ["controlled speed and direction", "springs press the wheels to the wall and adapt to the diameter"], limits: ["gets stuck at sharp corners, steps and sudden diameter changes", "complex steering"] },
  tracked_in_pipe: { name: "Tracked in-pipe crawler", reaches: ["pipe_inside"], bends: true, vertical: true, src: ["S", "Y"],
    good: ["more contact with the wall, less slipping", "can climb vertical sections and pass T-, Y- and L-joints"], limits: ["heavier and slower than wheels"] },
  legged_in_pipe: { name: "Legged in-pipe robot", reaches: ["pipe_inside"], bends: true, src: ["S", "Y"], good: ["steps over obstacles, turns at joints and corners"], limits: ["complex mechanism"] },
  inchworm: { name: "Inchworm in-pipe robot", reaches: ["pipe_inside"], smallBore: true, src: ["S", "Y"],
    good: ["small-diameter pipes", "no electric motors — safer in explosion-risk areas", "light and cheap"], limits: ["slow", "less reliable"] },
  snake: { name: "Snake robot", reaches: ["pipe_inside"], bends: true, vertical: true, src: ["S", "Y"], good: ["complex pipework: bends, branches, vertical runs"], limits: ["expensive", "uses a lot of energy"] },
  screw: { name: "Screw-drive in-pipe robot", reaches: ["pipe_inside"], smallBore: true, vertical: true, src: ["S", "Y"], good: ["precise motion in small vertical pipes"], limits: ["very low payload", "not for complex pipework"] },
  multirotor: { name: "Multirotor drone", reaches: ["aerial", "external_steel"], src: ["Y"],
    good: ["about twenty times faster and half the cost of conventional inspection (Cyberhawk survey)", "RGB and thermal cameras"], limits: ["camera and thermal only — no contact methods", "flown by hand it takes a pilot and an inspection engineer", "wind limits"] },
  caged_drone: { name: "Collision-tolerant caged drone", reaches: ["vessel_inside"], src: ["Y"],
    good: ["flies inside vessels and confined spaces, bouncing off obstacles", "its own lights: works in the dark", "a look inside before anyone enters"], limits: ["camera and thermal only", "the vessel must be open and out of service"] },
  fixed_wing: { name: "Fixed-wing drone", reaches: ["aerial"], src: ["Y"], good: ["long linear assets: pipelines, right of way"], limits: ["camera, thermal and gas only"] },
  rov: { name: "Remotely operated vehicle (ROV)", reaches: ["subsea"], src: ["Y", "S"], good: ["works around the clock where divers can't", "tethered: power and video through the cable"], limits: ["piloted by a person — the pilot is most of its cost"] },
  auv: { name: "Autonomous underwater vehicle (AUV)", reaches: ["subsea"], src: ["Y"], good: ["follows a pipeline by itself — cheaper than an ROV"], limits: ["needs reliable navigation and localisation"] },
  tank_submersible: { name: "In-service tank robot (submersible)", reaches: ["tank_inside"], src: ["S"],
    good: ["inspects the floor while the tank is full and in service", "UT thickness map of the floor and a visual record of every weld", "no one exposed to H₂S; no emptying"], limits: ["above-ground storage tanks", "slow: a floor survey takes days"] },
  legged: { name: "Legged ground robot", reaches: ["ground"], src: ["Y"], good: ["stairs, gratings, process areas"], limits: ["inspects from the ground — no climbing, no contact methods at height"] },
  wheeled: { name: "Wheeled or tracked ground robot", reaches: ["ground"], src: ["Y"], good: ["long rounds, heavy payloads"], limits: ["inspects from the ground"] },
};

/** How a robot moves, when its record doesn't say: from its kind. */
export function locomotionOf(r: Pick<Robot, "kind" | "locomotion">): Locomotion {
  if (r.locomotion) return r.locomotion;
  switch (r.kind) {
    case "quadruped": return "legged";
    case "drone": return "multirotor";
    case "fixed_wing": return "fixed_wing";
    case "crawler": return "magnetic_crawler";
    case "rov": return "rov";
    case "in_pipe": return "wheeled_in_pipe";
    case "tank_crawler": return "tank_submersible";
    default: return "wheeled";
  }
}

/** Autonomy as the reviews grade it, against how a robot is controlled here. Both conclude that, with flammable
 *  products, semi-autonomous robots under continuous human supervision are the right choice for now [S]. */
export const AUTONOMY_LEVEL: Record<Robot["autonomy"], { level: string; note: string }> = {
  remote: { level: "manual (teleoperated)", note: "an operator drives every step — most commercial inspection robots today [S]" },
  supervised: { level: "semi-autonomous", note: "the operator sets start and end; the robot navigates and a person watches — the reviews' recommendation for oil and gas [S]" },
  policy: { level: "autonomous, within a signed policy", note: "runs approved routine missions by itself; the reviews advise keeping a person supervising in hazardous areas [S]" },
};

// ------------------------------------------------------------------ what to inspect on each kind of asset
export interface Target {
  assetId: string; tag: string; name: string; zone: string;
  part: string; surface: Surface; material: "carbon steel" | "stainless steel";
  damage: string; methods: Method[];
  /** inside a pipe: its size (inches) */
  boreIn?: number;
  /** the kind of robot that reaches it, when the fleet has none */
  platform: Locomotion; alternative?: string; src: Source[];
}
type AssetLike = { id: string; tag: string; name: string; class: string; zone: string };
const T = (a: AssetLike, part: string, surface: Surface, damage: string, methods: Method[], platform: Locomotion, src: Source[], extra: Partial<Target> = {}): Target =>
  ({ assetId: a.id, tag: a.tag, name: a.name, zone: a.zone, part, surface, material: "carbon steel", damage, methods, platform, src, ...extra });

/** The surfaces of an asset that need inspecting, the damage expected there and the methods that find it. */
export function targetsOf(a: AssetLike): Target[] {
  switch (a.class) {
    case "tank": return [
      T(a, "roof", "external_steel", "corrosion from H₂S bubbling out of the product — worse on the roof than the floor", ["ut", "visual"], "magnetic_crawler", ["S"]),
      T(a, "shell and welded joints", "external_steel", "welded joints leaking from corrosion and wear", ["ut", "visual"], "magnetic_crawler", ["S", "Y"]),
      T(a, "floor", "tank_inside", "pitting under sludge (microbial corrosion) and from reactions with the product", ["ut", "mfl"], "tank_submersible", ["S"],
        { alternative: "otherwise the tank is emptied, cleaned and gas-freed — weeks out of service — for a floor scan" }),
    ];
    case "pipeline": return [
      T(a, "internal wall (in-line)", "pipe_inside", "corrosion, erosion, pitting, cracks and joint failure — early corrosion is not visible from outside", ["mfl", "ut"], "pig", ["S", "Y"],
        { boreIn: 48, alternative: "otherwise excavation and manual checks at a few spots" }),
      T(a, "right of way", "aerial", "leaks, encroachment, exposed pipe", ["visual", "thermal"], "fixed_wing", ["Y"]),
      T(a, "subsea section", "subsea", "free spans, loss of burial, corrosion", ["sonar", "visual"], "rov", ["Y"]),
    ];
    case "separator": case "amine": case "teg": return [
      T(a, "internals", "vessel_inside", "internal corrosion, coating breakdown, damaged internals", ["visual", "thermal"], "caged_drone", ["Y"],
        { alternative: "otherwise a confined-space entry, after gas-freeing" }),
      T(a, "shell", "external_steel", "wall thinning", ["ut"], "magnetic_crawler", ["Y"]),
      T(a, "inlet and outlet piping", "pipe_inside", "erosion at bends and corrosion under deposits — not visible from outside", ["ut", "visual"], "tracked_in_pipe", ["S"],
        { boreIn: a.class === "separator" ? 24 : 16, alternative: "otherwise cutting into the line or spot UT from scaffolding" }),
    ];
    case "flare": return [
      T(a, "tip and pilots", "aerial", "pilots out, tip damage", ["visual", "thermal"], "multirotor", ["Y"]),
      T(a, "stack", "external_steel", "corrosion of the stack wall", ["ut", "visual"], "magnetic_crawler", ["Y"]),
    ];
    default: return [];
  }
}

// ------------------------------------------------------------------ can this robot do this
export interface Fit { ok: boolean; why: string; method?: Method; cautions: string[] }

/** Can this robot inspect this surface — does it reach it, hold on to it, and carry a method that finds the damage? */
export function fit(r: Robot, t: Target): Fit {
  const lo = locomotionOf(r), info = LOCOMOTION[lo];
  if (!info.reaches.includes(t.surface)) return { ok: false, why: `${r.name} is a ${info.name.toLowerCase()}: it can't reach the ${t.part} of ${t.tag} (${SURFACE_LABEL[t.surface]})`, cautions: [] };
  if (info.ferromagneticOnly && t.material !== "carbon steel") return { ok: false, why: `${r.name} holds on with magnets — it can't climb ${t.material} (a vacuum crawler can)`, cautions: [] };
  if (t.boreIn && r.pipeBoreIn && (t.boreIn < r.pipeBoreIn[0] || t.boreIn > r.pipeBoreIn[1])) return { ok: false, why: `${r.name} is built for ${r.pipeBoreIn[0] === r.pipeBoreIn[1] ? `${r.pipeBoreIn[0]}-inch` : `${r.pipeBoreIn[0]}–${r.pipeBoreIn[1]}-inch`} pipe — the ${t.part} of ${t.tag} is ${t.boreIn} inch`, cautions: [] };
  const method = t.methods.find((m) => METHODS[m].capability && r.capabilities.includes(METHODS[m].capability!) && (METHODS[m].materials !== "ferromagnetic" || t.material === "carbon steel"));
  if (!method) return { ok: false, why: `${r.name} has none of the methods that find ${t.damage.split(" — ")[0]} on the ${t.part}: ${t.methods.map((m) => METHODS[m].name).join(", ")}`, cautions: [] };
  return { ok: true, why: `${info.name} with ${METHODS[method].name}`, method, cautions: cautions(r, t, method) };
}

function cautions(r: Robot, t: Target, m: Method): string[] {
  const out: string[] = [];
  const first = t.methods[0];
  if (m !== first) out.push(`${METHODS[m].name} instead of ${METHODS[first].name}: ${METHODS[m].limits[0]}`);
  if (m === "mfl") out.push("MFL says where metal is lost; follow up the worst spots with UT for how much");
  if (m === "ut") out.push("UT misses cracks lying along the sound's path");
  if (m === "visual") out.push("a camera sees surface damage only");
  if (t.surface === "vessel_inside" || (t.surface === "pipe_inside" && locomotionOf(r) !== "pig")) out.push("out of service: the line or vessel is isolated, drained and gas-freed first");
  if (!r.exRated && (t.surface === "vessel_inside" || t.surface === "pipe_inside") && locomotionOf(r) !== "pig") out.push(`${r.name} isn't Ex-certified: only after a clear gas test, under the job's permit`);
  if (r.tetherM) out.push(`tethered: ${r.tetherM} m of cable — it reaches that far, and the cable's drag grows with distance`);
  if (locomotionOf(r) !== "pig" && DOMAIN_IN_PIPE.has(r.kind) && !r.tetherM) out.push("radio doesn't pass through steel pipe: its data is stored on board and read when it comes out");
  return out;
}
const DOMAIN_IN_PIPE = new Set<Robot["kind"]>(["in_pipe"]);

/** Before a robot is sent to an asset: the surfaces of the asset this mission is about, and whether it fits one. */
export function missionFit(r: Robot, a: AssetLike, kind: MissionKind): Fit | null {
  const surfaces: Partial<Record<MissionKind, Surface[]>> = { inline_inspection: ["pipe_inside"], internal_inspection: ["tank_inside", "vessel_inside"], thickness_survey: ["external_steel", "pipe_inside", "tank_inside"], subsea_inspection: ["subsea"] };
  const want = surfaces[kind];
  if (!want) return null; // rounds, surveys and patrols: from the ground or the air, no contact
  const ts = targetsOf(a).filter((t) => want.includes(t.surface));
  if (!ts.length) return null;
  const fits = ts.map((t) => ({ t, f: fit(r, t) }));
  const good = fits.find((x) => x.f.ok);
  if (good) return { ...good.f, why: `${good.t.part}: ${good.f.why}` };
  return { ok: false, why: fits[0].f.why, cautions: [] };
}

// ------------------------------------------------------------------ the facility's inspection plan
export interface PlanRow {
  target: Target;
  /** robots in the fleet that can do it (best first), with the method each would use */
  robots: { id: string; name: string; method: Method; autonomy: string; cautions: string[] }[];
  /** when it was last inspected by a robot (a finished mission at the asset with a method that applies) */
  last?: string;
  gap?: string;
}

type FleetLike = { robots: Robot[]; missions: { robotId: string; status: string; ended?: string; plannedStart: string; waypoints: { assetId?: string; checks: Capability[] }[] }[]; zones: { name: string; atex: 1 | 2 | null; facilityId: string }[] };

export function inspectionPlan(d: FleetLike & { assets: (AssetLike & { facilityId: string })[] }, facilityId: string): PlanRow[] {
  const robots = d.robots.filter((r) => r.facilityId === facilityId);
  const rows: PlanRow[] = [];
  for (const a of d.assets.filter((x) => x.facilityId === facilityId)) for (const t of targetsOf(a)) {
    const hazardous = !!d.zones.find((z) => z.facilityId === facilityId && z.name === t.zone)?.atex;
    const fits = robots.map((r) => ({ r, f: fit(r, t) })).filter((x) => x.f.ok && (!hazardous || x.r.exRated || DOMAIN_SAFE.has(locomotionOf(x.r)) || t.surface === "vessel_inside" || t.surface === "pipe_inside"))
      .sort((x, y) => t.methods.indexOf(x.f.method!) - t.methods.indexOf(y.f.method!));
    const caps = new Set(t.methods.map((m) => METHODS[m].capability).filter(Boolean));
    const done = d.missions.filter((m) => m.status === "done" && m.waypoints.some((w) => w.assetId === a.id && w.checks.some((c) => caps.has(c)))
      && robots.some((r) => r.id === m.robotId && LOCOMOTION[locomotionOf(r)].reaches.includes(t.surface)));
    const last = done.map((m) => m.ended ?? m.plannedStart).sort().pop();
    const info = LOCOMOTION[t.platform];
    rows.push({ target: t, robots: fits.map(({ r, f }) => ({ id: r.id, name: r.name, method: f.method!, autonomy: AUTONOMY_LEVEL[r.autonomy].level, cautions: f.cautions })), ...(last ? { last } : {}),
      ...(fits.length ? {} : { gap: `No robot in the fleet reaches it${hazardous ? " in this hazardous area" : ""}: a ${info.name.toLowerCase()} with ${METHODS[t.methods[0]].name} would (${info.good[0]})${t.alternative ? `; ${t.alternative}` : ""}.` }) });
  }
  return rows;
}
// robots that work outside the hazardous area's air (above it, under water, inside a pipe or a full tank) — the Ex
// rating applies to robots in the area's atmosphere
const DOMAIN_SAFE = new Set<Locomotion>(["fixed_wing", "multirotor", "rov", "auv", "pig"]);
