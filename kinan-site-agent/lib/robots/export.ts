// A designed route (routes.ts) in the formats the machines themselves load — so a sortie goes straight into the
// robot, the drone or the underwater vehicle:
//   dji_kmz    DJI WPML wayline (KMZ: wpmz/template.kml + wpmz/waylines.wpml) — DJI Dock (Cloud API flight task),
//              DJI Pilot 2 and FlightHub 2
//   qgc_plan   QGroundControl .plan (MAVLink mission) — PX4 and ArduPilot drones, and ArduSub underwater vehicles
//              (depth as negative altitude)
//   vda5050    VDA 5050 v2 order with each node's position on the robot's map — AGVs, AMRs and ground robots
//   rmf_task   Open-RMF "compose" task request: go to each place, perform the inspection there
//   bohio_json the route itself: every waypoint with its place, height or depth, heading, camera angle and checks
// Written to each format's published specification; check the first file of each kind on the machine's own
// software (simulator, ground station, DJI Pilot 2) before it flies or dives. No libraries: runs in the browser too.
import type { RobotRoute, RoutePoint, SiteFrame, Sortie } from "./routes";
import type { Capability } from "./types";

export interface ExportFile { filename: string; mime: string; data: string | Uint8Array }
const enc = (s: string) => new TextEncoder().encode(s);
const esc = (s: string) => s.replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[c]!);
const slug = (r: RobotRoute, s: Sortie) => `${r.name.replace(/[^A-Za-z0-9-]+/g, "_")}-sortie${s.n}`;
const inspect = (s: Sortie) => s.points.filter((p) => p.kind !== "dock");
const photoLens = (cs: Capability[]) => (cs.includes("thermal") ? "wide,ir" : "wide");

// ------------------------------------------------------------------ DJI WPML (KMZ)
function wpml(r: RobotRoute, s: Sortie, f: SiteFrame, template: boolean): string {
  const pts = inspect(s);
  const head = `<?xml version="1.0" encoding="UTF-8"?>\n<kml xmlns="http://www.opengis.net/kml/2.2" xmlns:wpml="http://www.dji.com/wpmz/1.0.2">\n<Document>\n`;
  const meta = template ? `  <wpml:author>Bohio orchestrator</wpml:author>\n  <wpml:createTime>${Date.parse(s.start)}</wpml:createTime>\n  <wpml:updateTime>${Date.parse(s.start)}</wpml:updateTime>\n` : "";
  const cfg = `  <wpml:missionConfig>
    <wpml:flyToWaylineMode>safely</wpml:flyToWaylineMode>
    <wpml:finishAction>goHome</wpml:finishAction>
    <wpml:exitOnRCLost>executeLostAction</wpml:exitOnRCLost>
    <wpml:executeRCLostAction>goBack</wpml:executeRCLostAction>
    <wpml:takeOffSecurityHeight>20</wpml:takeOffSecurityHeight>
    <wpml:globalTransitionalSpeed>8</wpml:globalTransitionalSpeed>
    <wpml:globalRTHHeight>80</wpml:globalRTHHeight>
    <wpml:droneInfo><wpml:droneEnumValue>67</wpml:droneEnumValue><wpml:droneSubEnumValue>1</wpml:droneSubEnumValue></wpml:droneInfo>
  </wpml:missionConfig>\n`;
  const folderHead = template
    ? `  <Folder>\n    <wpml:templateType>waypoint</wpml:templateType>\n    <wpml:templateId>0</wpml:templateId>\n    <wpml:waylineCoordinateSysParam><wpml:coordinateMode>WGS84</wpml:coordinateMode><wpml:heightMode>relativeToStartPoint</wpml:heightMode></wpml:waylineCoordinateSysParam>\n    <wpml:autoFlightSpeed>7</wpml:autoFlightSpeed>\n    <wpml:globalHeight>40</wpml:globalHeight>\n    <wpml:gimbalPitchMode>usePointSetting</wpml:gimbalPitchMode>\n`
    : `  <Folder>\n    <wpml:templateId>0</wpml:templateId>\n    <wpml:executeHeightMode>relativeToStartPoint</wpml:executeHeightMode>\n    <wpml:waylineId>0</wpml:waylineId>\n    <wpml:distance>${s.distanceM}</wpml:distance>\n    <wpml:duration>${s.durationMin * 60}</wpml:duration>\n    <wpml:autoFlightSpeed>7</wpml:autoFlightSpeed>\n`;
  let aid = 0;
  const marks = pts.map((p, i) => {
    const acts = p.checks.length ? `      <wpml:actionGroup>
        <wpml:actionGroupId>${i}</wpml:actionGroupId><wpml:actionGroupStartIndex>${i}</wpml:actionGroupStartIndex><wpml:actionGroupEndIndex>${i}</wpml:actionGroupEndIndex>
        <wpml:actionGroupMode>sequence</wpml:actionGroupMode>
        <wpml:actionTrigger><wpml:actionTriggerType>reachPoint</wpml:actionTriggerType></wpml:actionTrigger>
        <wpml:action><wpml:actionId>${aid++}</wpml:actionId><wpml:actionActuatorFunc>gimbalRotate</wpml:actionActuatorFunc><wpml:actionActuatorFuncParam><wpml:gimbalRotateMode>absoluteAngle</wpml:gimbalRotateMode><wpml:gimbalPitchRotateEnable>1</wpml:gimbalPitchRotateEnable><wpml:gimbalPitchRotateAngle>${p.gimbalPitchDeg ?? -45}</wpml:gimbalPitchRotateAngle><wpml:gimbalRollRotateEnable>0</wpml:gimbalRollRotateEnable><wpml:gimbalRollRotateAngle>0</wpml:gimbalRollRotateAngle><wpml:gimbalYawRotateEnable>0</wpml:gimbalYawRotateEnable><wpml:gimbalYawRotateAngle>0</wpml:gimbalYawRotateAngle><wpml:gimbalRotateTimeEnable>0</wpml:gimbalRotateTimeEnable><wpml:gimbalRotateTime>0</wpml:gimbalRotateTime><wpml:payloadPositionIndex>0</wpml:payloadPositionIndex></wpml:actionActuatorFuncParam></wpml:action>
        <wpml:action><wpml:actionId>${aid++}</wpml:actionId><wpml:actionActuatorFunc>hover</wpml:actionActuatorFunc><wpml:actionActuatorFuncParam><wpml:hoverTime>${Math.max(3, Math.min(60, p.dwellS))}</wpml:hoverTime></wpml:actionActuatorFuncParam></wpml:action>
        <wpml:action><wpml:actionId>${aid++}</wpml:actionId><wpml:actionActuatorFunc>takePhoto</wpml:actionActuatorFunc><wpml:actionActuatorFuncParam><wpml:payloadPositionIndex>0</wpml:payloadPositionIndex><wpml:fileSuffix>${esc(p.tag ?? `wp${i}`)}</wpml:fileSuffix><wpml:useGlobalPayloadLensIndex>0</wpml:useGlobalPayloadLensIndex><wpml:payloadLensIndex>${photoLens(p.checks)}</wpml:payloadLensIndex></wpml:actionActuatorFuncParam></wpml:action>
      </wpml:actionGroup>\n` : "";
    const h = template ? `      <wpml:height>${p.altM ?? 40}</wpml:height>\n      <wpml:useGlobalHeight>0</wpml:useGlobalHeight>\n      <wpml:useGlobalSpeed>1</wpml:useGlobalSpeed>\n      <wpml:useGlobalHeadingParam>0</wpml:useGlobalHeadingParam>\n      <wpml:useGlobalTurnParam>1</wpml:useGlobalTurnParam>\n      <wpml:gimbalPitchAngle>${p.gimbalPitchDeg ?? -45}</wpml:gimbalPitchAngle>\n`
      : `      <wpml:executeHeight>${p.altM ?? 40}</wpml:executeHeight>\n      <wpml:waypointSpeed>7</wpml:waypointSpeed>\n      <wpml:waypointTurnParam><wpml:waypointTurnMode>toPointAndStopWithDiscontinuityCurvature</wpml:waypointTurnMode><wpml:waypointTurnDampingDist>0</wpml:waypointTurnDampingDist></wpml:waypointTurnParam>\n`;
    return `    <Placemark>\n      <name>${esc(p.label)}</name>\n      <Point><coordinates>${p.lon},${p.lat}</coordinates></Point>\n      <wpml:index>${i}</wpml:index>\n${h}      <wpml:waypointHeadingParam><wpml:waypointHeadingMode>fixed</wpml:waypointHeadingMode><wpml:waypointHeadingAngle>${toHeading180(p.headingDeg ?? 0)}</wpml:waypointHeadingAngle></wpml:waypointHeadingParam>\n${acts}    </Placemark>\n`;
  }).join("");
  void f;
  return `${head}${meta}${cfg}${folderHead}${marks}  </Folder>\n</Document>\n</kml>\n`;
}
const toHeading180 = (h: number) => ((((h + 180) % 360) + 360) % 360) - 180;

export function djiKmz(r: RobotRoute, s: Sortie, f: SiteFrame): ExportFile {
  return { filename: `${slug(r, s)}.kmz`, mime: "application/vnd.google-earth.kmz", data: zip([{ name: "wpmz/template.kml", data: enc(wpml(r, s, f, true)) }, { name: "wpmz/waylines.wpml", data: enc(wpml(r, s, f, false)) }]) };
}

// ------------------------------------------------------------------ QGroundControl .plan (MAVLink)
export function qgcPlan(r: RobotRoute, s: Sortie, f: SiteFrame): ExportFile {
  const sub = r.kind === "rov";
  const home = s.points[0];
  let id = 1;
  const item = (command: number, params: (number | null)[], frame = 3, altitude?: number) => ({ autoContinue: true, command, doJumpId: id++, frame, params, type: "SimpleItem", ...(altitude !== undefined ? { Altitude: altitude, AltitudeMode: 1, AMSLAltAboveTerrain: null } : {}) });
  const items: unknown[] = [];
  const first = inspect(s)[0];
  if (!sub) items.push(item(22, [0, 0, 0, null, first?.lat ?? home.lat, first?.lon ?? home.lon, first?.altM ?? 30], 3, first?.altM ?? 30)); // MAV_CMD_NAV_TAKEOFF
  for (const p of inspect(s)) {
    const alt = sub ? -(p.depthM ?? 5) : p.altM ?? 30;
    items.push(item(16, [p.checks.length ? Math.min(60, p.dwellS) : 0, 2, 0, p.headingDeg ?? null, p.lat, p.lon, alt], 3, alt)); // MAV_CMD_NAV_WAYPOINT: hold, acceptance radius, pass, yaw
    if (p.checks.length) {
      items.push(item(205, [p.gimbalPitchDeg ?? -45, 0, p.headingDeg ?? 0, 0, 0, 0, 2], 2)); // MAV_CMD_DO_MOUNT_CONTROL (pitch, roll, yaw; MAVLink targeting)
      items.push(item(2000, [0, 0, 1, 0, null, null, null], 2)); // MAV_CMD_IMAGE_START_CAPTURE: one image
    }
  }
  items.push(item(20, [0, 0, 0, 0, 0, 0, 0], 2)); // MAV_CMD_NAV_RETURN_TO_LAUNCH
  const plan = {
    fileType: "Plan", version: 1, groundStation: "QGroundControl",
    mission: { version: 2, firmwareType: sub ? 3 : 12, vehicleType: sub ? 12 : r.kind === "fixed_wing" ? 1 : 2, cruiseSpeed: sub ? 0.7 : 15, hoverSpeed: sub ? 0.7 : 7,
      plannedHomePosition: [home.lat, home.lon, f.elevM], items },
    geoFence: { circles: [], polygons: [], version: 2 }, rallyPoints: { points: [], version: 2 },
  };
  return { filename: `${slug(r, s)}.plan`, mime: "application/json", data: JSON.stringify(plan, null, 2) };
}

// ------------------------------------------------------------------ VDA 5050 order with positions
export function vdaOrderWithPositions(r: RobotRoute, s: Sortie, f: SiteFrame, orderId = slug(r, s)): ExportFile {
  const M = f.mPerUnit;
  const theta = (h?: number) => Math.round((((90 - (h ?? 0)) * Math.PI) / 180) * 1000) / 1000; // VDA: radians, counter-clockwise from x
  const nodes = s.points.map((p, i) => ({
    nodeId: p.kind === "dock" ? `${r.name}-DOCK` : p.tag ?? `WP${p.seq}`, sequenceId: i * 2, released: true, nodeDescription: p.label,
    nodePosition: { x: Math.round(p.x * M * 100) / 100, y: Math.round(-p.y * M * 100) / 100, theta: theta(p.headingDeg), allowedDeviationXY: 0.5, allowedDeviationTheta: 0.35, mapId: s.points[0] ? `${r.robotId.split(":")[0]}-site` : "site" },
    actions: p.checks.length ? [{ actionType: "inspect", actionId: `${orderId}-${i}`, blockingType: "HARD", actionDescription: p.label, actionParameters: [{ key: "checks", value: p.checks }, { key: "durationSeconds", value: p.dwellS }, ...(p.tag ? [{ key: "asset", value: p.tag }] : [])] }] : [],
  }));
  const edges = nodes.slice(1).map((n, i) => ({ edgeId: `${nodes[i].nodeId}->${n.nodeId}`, sequenceId: i * 2 + 1, released: true, startNodeId: nodes[i].nodeId, endNodeId: n.nodeId, actions: [] }));
  const order = { headerId: 1, timestamp: s.start, version: "2.0.0", manufacturer: r.model.replace(/[^A-Za-z0-9_-]+/g, ""), serialNumber: r.name, orderId, orderUpdateId: 0, nodes, edges };
  return { filename: `${slug(r, s)}.vda5050.json`, mime: "application/json", data: JSON.stringify(order, null, 2) };
}

// ------------------------------------------------------------------ Open-RMF compose task
export function rmfTask(r: RobotRoute, s: Sortie): ExportFile {
  const activities = inspect(s).flatMap((p) => [{ category: "go_to_place", description: p.tag ?? p.label },
    ...(p.checks.length ? [{ category: "perform_action", description: { unix_millis_action_duration_estimate: p.dwellS * 1000, category: "inspect", description: { asset: p.tag, checks: p.checks } } }] : [])]);
  const req = { type: "dispatch_task_request", request: { unix_millis_earliest_start_time: Date.parse(s.start), category: "compose", requester: "Bohio orchestrator",
    description: { category: "inspection", phases: [{ activity: { category: "sequence", description: { activities: [...activities, { category: "go_to_place", description: `${r.name} dock` }] } } }] } } };
  return { filename: `${slug(r, s)}.rmf.json`, mime: "application/json", data: JSON.stringify(req, null, 2) };
}

export function bohioJson(r: RobotRoute, s: Sortie, f: SiteFrame): ExportFile {
  return { filename: `${slug(r, s)}.route.json`, mime: "application/json", data: JSON.stringify({ robot: { id: r.robotId, name: r.name, model: r.model, kind: r.kind, locomotion: r.locomotion }, frame: f, sortie: s }, null, 2) };
}

export function exportSortie(fmt: RobotRoute["formats"][number], r: RobotRoute, s: Sortie, f: SiteFrame): ExportFile {
  switch (fmt) {
    case "dji_kmz": return djiKmz(r, s, f);
    case "qgc_plan": return qgcPlan(r, s, f);
    case "vda5050": return vdaOrderWithPositions(r, s, f);
    case "rmf_task": return rmfTask(r, s);
    default: return bohioJson(r, s, f);
  }
}
export const FORMAT_LABEL: Record<RobotRoute["formats"][number], string> = { dji_kmz: "DJI wayline (KMZ)", qgc_plan: "MAVLink (.plan)", vda5050: "VDA 5050", rmf_task: "Open-RMF", bohio_json: "Route (JSON)" };
export type { RoutePoint };

// ------------------------------------------------------------------ zip (stored) and MD5, for the KMZ and its fingerprint
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(b: Uint8Array) { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
/** A zip archive of the files, stored without compression (what a KMZ needs). */
export function zip(files: { name: string; data: Uint8Array }[]): Uint8Array {
  const parts: Uint8Array[] = [], central: Uint8Array[] = [];
  let offset = 0;
  const le = (n: number, bytes: number) => { const a = new Uint8Array(bytes); for (let i = 0; i < bytes; i++) a[i] = (n >>> (8 * i)) & 0xff; return a; };
  const cat = (xs: Uint8Array[]) => { const out = new Uint8Array(xs.reduce((s, x) => s + x.length, 0)); let o = 0; for (const x of xs) { out.set(x, o); o += x.length; } return out; };
  for (const f of files) {
    const name = enc(f.name), crc = crc32(f.data), size = f.data.length;
    const local = cat([le(0x04034b50, 4), le(20, 2), le(0x0800, 2), le(0, 2), le(0, 2), le(0x21, 2), le(crc, 4), le(size, 4), le(size, 4), le(name.length, 2), le(0, 2), name]);
    parts.push(local, f.data);
    central.push(cat([le(0x02014b50, 4), le(20, 2), le(20, 2), le(0x0800, 2), le(0, 2), le(0, 2), le(0x21, 2), le(crc, 4), le(size, 4), le(size, 4), le(name.length, 2), le(0, 2), le(0, 2), le(0, 2), le(0, 2), le(0, 4), le(offset, 4), name]));
    offset += local.length + size;
  }
  const cd = cat(central);
  return cat([...parts, cd, cat([le(0x06054b50, 4), le(0, 2), le(0, 2), le(files.length, 2), le(files.length, 2), le(cd.length, 4), le(offset, 4), le(0, 2)])]);
}
/** MD5 (RFC 1321) as hex — the DJI Cloud API's wayline fingerprint. */
export function md5(data: Uint8Array): string {
  const K = Array.from({ length: 64 }, (_, i) => Math.floor(Math.abs(Math.sin(i + 1)) * 2 ** 32) >>> 0);
  const S = [7, 12, 17, 22, 5, 9, 14, 20, 4, 11, 16, 23, 6, 10, 15, 21];
  const len = data.length, n = (((len + 8) >>> 6) + 1) * 16, w = new Uint32Array(n);
  for (let i = 0; i < len; i++) w[i >> 2] |= data[i] << ((i % 4) * 8);
  w[len >> 2] |= 0x80 << ((len % 4) * 8);
  w[n - 2] = (len * 8) >>> 0; w[n - 1] = Math.floor((len * 8) / 2 ** 32);
  let a0 = 0x67452301, b0 = 0xefcdab89, c0 = 0x98badcfe, d0 = 0x10325476;
  for (let o = 0; o < n; o += 16) {
    let a = a0, b = b0, c = c0, d = d0;
    for (let i = 0; i < 64; i++) {
      const r = i >> 4;
      let F: number, g: number;
      if (r === 0) { F = (b & c) | (~b & d); g = i; } else if (r === 1) { F = (d & b) | (~d & c); g = (5 * i + 1) % 16; } else if (r === 2) { F = b ^ c ^ d; g = (3 * i + 5) % 16; } else { F = c ^ (b | ~d); g = (7 * i) % 16; }
      const tmp = d; d = c; c = b;
      const x = (a + F + K[i] + w[o + g]) >>> 0, sft = S[r * 4 + (i % 4)];
      b = (b + ((x << sft) | (x >>> (32 - sft)))) >>> 0; a = tmp;
    }
    a0 = (a0 + a) >>> 0; b0 = (b0 + b) >>> 0; c0 = (c0 + c) >>> 0; d0 = (d0 + d) >>> 0;
  }
  return [a0, b0, c0, d0].map((v) => Array.from({ length: 4 }, (_, i) => ((v >>> (8 * i)) & 0xff).toString(16).padStart(2, "0")).join("")).join("");
}
