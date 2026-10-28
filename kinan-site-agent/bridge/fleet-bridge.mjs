#!/usr/bin/env node
// The fleet bridge: the part of the platform that sits on the robots' network and speaks their message bus (MQTT).
// The core runs in the cloud and can't hold an MQTT connection; the bridge does, and carries messages both ways:
//   core → machines   collects the commands waiting for it (GET /api/fm/robots?outbox=1) — VDA 5050 orders and
//                     instant actions, DJI flight tasks — publishes them on the broker and acknowledges each one
//                     (DJI: when the dock replies; VDA 5050: when published, the robot's state then reports progress)
//   machines → core   VDA 5050 state and connection, DJI telemetry (osd) and flight-task progress, posted to
//                     POST /api/fm/robots in the machines' own shape (the core reads them, lib/robots/protocols)
// It also answers what DJI docks expect from their cloud (status and events that ask for a reply).
//
// Run:  cd bridge && npm install && node fleet-bridge.mjs     (Node 18+; see README.md for every setting)
import mqtt from "mqtt";

const env = process.env;
const json = (s, d) => { try { return s ? JSON.parse(s) : d; } catch { return d; } };
const CORE = String(env.CORE_URL ?? "").replace(/\/+$/, "");
const TOKEN = env.FLEET_BRIDGE_TOKEN ?? "";
const VDA_IF = env.VDA_INTERFACE ?? "uagv";
const VDA_ROBOTS = json(env.VDA_ROBOTS, {});   // {"Manufacturer/Serial": "robot name in the core"}
const DJI_DOCKS = json(env.DJI_DOCKS, {});     // {"dock serial": "robot name in the core"}
const POLL_MS = Math.max(1000, Number(env.POLL_MS) || 3000);
const REPORT_EVERY_MS = Math.max(5000, Number(env.REPORT_EVERY_MS) || 30000);
if (!CORE || TOKEN.length < 16 || !env.MQTT_URL) { console.error("Set CORE_URL, FLEET_BRIDGE_TOKEN (16+ characters) and MQTT_URL. See README.md."); process.exit(2); }

const log = (...a) => console.log(new Date().toISOString(), ...a);
const core = async (path, init = {}) => {
  const res = await fetch(`${CORE}${path}`, { ...init, headers: { authorization: `Bearer ${TOKEN}`, "content-type": "application/json", ...(init.headers ?? {}) } });
  const text = await res.text();
  if (!res.ok && res.status !== 207) throw new Error(`core ${res.status}: ${text.slice(0, 200)}`);
  return text ? JSON.parse(text) : {};
};
const post = (body, q = "") => core(`/api/fm/robots${q}`, { method: "POST", body: JSON.stringify(body) }).catch((e) => log("report failed:", e.message));

const client = mqtt.connect(env.MQTT_URL, { username: env.MQTT_USERNAME, password: env.MQTT_PASSWORD, clientId: env.MQTT_CLIENT_ID ?? `bohio-bridge-${Math.random().toString(16).slice(2, 8)}`, reconnectPeriod: 3000 });
const publish = (topic, payload) => new Promise((ok, no) => client.publish(topic, JSON.stringify(payload), { qos: 1 }, (e) => (e ? no(e) : ok())));

// ---------------------------------------------------------------- machines → core
const last = new Map(); // robot → { at, key } so a robot that keeps saying the same thing is reported every REPORT_EVERY_MS
const changed = (robot, key) => { const p = last.get(robot), now = Date.now(); if (p && p.key === key && now - p.at < REPORT_EVERY_MS) return false; last.set(robot, { at: now, key }); return true; };
const pendingDji = new Map(); // DJI message tid → { commandId, left }

client.on("connect", () => {
  log("connected to", env.MQTT_URL);
  client.subscribe([`${VDA_IF}/v2/+/+/state`, `${VDA_IF}/v2/+/+/connection`, "thing/product/+/osd", "thing/product/+/events", "thing/product/+/services_reply", "sys/product/+/status"], { qos: 1 });
});
client.on("error", (e) => log("mqtt:", e.message));

client.on("message", async (topic, buf) => {
  let m; try { m = JSON.parse(buf.toString()); } catch { return; }
  const p = topic.split("/");
  // VDA 5050: {interface}/v2/{manufacturer}/{serial}/state|connection
  if (p[0] === VDA_IF && p[1] === "v2") {
    const robot = VDA_ROBOTS[`${p[2]}/${p[3]}`]; if (!robot) return;
    if (p[4] === "connection") { if (m.connectionState && m.connectionState !== "ONLINE") post({ robot, source: "VDA 5050", status: "offline" }); return; }
    const key = JSON.stringify([m.orderId, m.lastNodeId, Math.round((m.batteryState?.batteryCharge ?? 0) / 5), (m.errors ?? []).length, m.safetyState?.eStop, m.driving, (m.nodeStates ?? []).length]);
    if (changed(robot, key)) post({ protocol: "vda5050", robot, state: m });
    return;
  }
  // DJI Cloud API: thing/product/{sn}/osd|events|services_reply, sys/product/{sn}/status
  if ((p[0] === "thing" || p[0] === "sys") && p[1] === "product") {
    const sn = p[2], robot = DJI_DOCKS[sn];
    if (p[0] === "sys" && p[3] === "status") { await publish(`sys/product/${sn}/status_reply`, { tid: m.tid, bid: m.bid, timestamp: Date.now(), method: m.method ?? "update_topo", data: { result: 0 } }).catch(() => {}); return; }
    if (p[3] === "services_reply") {
      const w = pendingDji.get(m.tid); if (!w) return;
      pendingDji.delete(m.tid);
      const result = m.data?.result ?? m.data?.output?.result;
      if (result !== 0) { w.done(false, `${m.method}: DJI result ${result}`); return; }
      if (--w.left === 0) w.done(true, "Accepted by the dock");
      return;
    }
    if (!robot) return;
    if (p[3] === "events") {
      if (m.need_reply === 1) await publish(`thing/product/${sn}/events_reply`, { tid: m.tid, bid: m.bid, timestamp: Date.now(), method: m.method, data: { result: 0 } }).catch(() => {});
      // a progress event repeated (QoS 1 redelivery, a second subscriber) is reported once
      if (m.method === "flighttask_progress" && changed(`${robot}:task`, JSON.stringify([m.data?.ext?.flight_id, m.data?.output?.status, m.data?.output?.progress?.percent]))) post({ protocol: "dji", robot, method: "flighttask_progress", data: m.data });
      return;
    }
    if (p[3] === "osd") {
      const d = m.data ?? {};
      const key = JSON.stringify([d.mode_code, d.drone_in_dock, Math.round((d.battery?.capacity_percent ?? d.drone_charge_state?.capacity_percent ?? 0) / 5)]);
      if (changed(robot, key)) post({ protocol: "dji", robot, method: "osd", data: d });
    }
  }
});

// ---------------------------------------------------------------- core → machines
const sent = new Set(); // commands published and acknowledged here (the core drops them from the outbox on our ack)
async function pump() {
  if (!client.connected) return;
  let commands = [];
  try { ({ commands = [] } = await core("/api/fm/robots?outbox=1")); } catch (e) { log("outbox:", e.message); return; }
  const acks = [];
  for (const c of commands) {
    if (sent.has(c.commandId)) continue;
    sent.add(c.commandId);
    try {
      if (c.protocol === "dji") {
        // each message is accepted when the dock replies with result 0 (or fails on the first non-zero result)
        const done = await new Promise((resolve) => {
          const w = { left: c.messages.length, done: (ok, note) => { clearTimeout(t); resolve({ ok, note }); } };
          const t = setTimeout(() => resolve({ ok: false, note: "No reply from the dock in 30 s" }), 30000);
          (async () => { for (const msg of c.messages) { pendingDji.set(msg.payload.tid, w); await publish(msg.topic, msg.payload); } })().catch((e) => w.done(false, e.message));
        });
        acks.push({ commandId: c.commandId, ...done });
      } else {
        for (const msg of c.messages) await publish(msg.topic, msg.payload);
        acks.push({ commandId: c.commandId, ok: true, note: "Published to the robot (its state reports progress)" });
      }
      log("sent", c.commandId, c.protocol, c.messages.map((x) => x.topic).join(", "));
    } catch (e) { acks.push({ commandId: c.commandId, ok: false, note: e.message }); }
  }
  if (acks.length) await core("/api/fm/robots", { method: "POST", body: JSON.stringify({ acks }) }).catch((e) => log("acks:", e.message));
}
setInterval(pump, POLL_MS);
log(`fleet bridge for ${CORE}: VDA 5050 robots ${Object.values(VDA_ROBOTS).join(", ") || "none"}, DJI docks ${Object.values(DJI_DOCKS).join(", ") || "none"}`);
