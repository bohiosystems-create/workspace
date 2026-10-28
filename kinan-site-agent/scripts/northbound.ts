// Northbound integrations against stand-ins on localhost: Maximo (OSLC), SAP PM (OData with its CSRF token), a CAFM
// webhook (signed), Teams, and webhook subscribers (one of them failing). Run: npx tsx scripts/northbound.ts
import http from "node:http";
import { createHmac } from "node:crypto";
import { seedDb } from "../lib/seed";
import { act } from "../lib/fm/api";
import { publish } from "../lib/integrations/outbound";
const got: string[] = [];
const srv = http.createServer((req, res) => {
  let b = ""; req.on("data", (c) => (b += c)); req.on("end", () => {
    const u = req.url!;
    if (u.startsWith("/sap/") && req.method === "GET") { got.push(`SAP csrf ${req.headers["x-csrf-token"]}`); res.writeHead(200, { "x-csrf-token": "TOK123", "set-cookie": "SAP_SESSIONID=abc; path=/" }); return res.end("{}"); }
    if (u.startsWith("/sap/")) { got.push(`SAP POST token=${req.headers["x-csrf-token"]} cookie=${req.headers.cookie} ${b.slice(0, 120)}`); res.writeHead(201, { "content-type": "application/json" }); return res.end(JSON.stringify({ d: { MaintenanceOrder: "4000123" } })); }
    if (u.startsWith("/maximo/oslc/os/mxwo")) { got.push(`MAXIMO create apikey=${req.headers.apikey} ${b.slice(0, 100)}`); res.writeHead(201, { "content-type": "application/json" }); return res.end(JSON.stringify({ wonum: "1042", href: "http://127.0.0.1:18990/maximo/oslc/os/mxwo/_MTA0Mi9LR1BQ" })); }
    if (u.startsWith("/maximo/")) { got.push(`MAXIMO ${u} ${b}`); res.writeHead(204); return res.end(); }
    if (u === "/cafm") { const [t, v] = String(req.headers["x-bohio-signature"]).split(",").map((x) => x.split("=")[1]); const ok = createHmac("sha256", "cafmsecret").update(`${t}.${b}`).digest("hex") === v; got.push(`CAFM ${req.headers["x-bohio-event"]} sig=${ok}`); res.writeHead(200, { "content-type": "application/json" }); return res.end(JSON.stringify({ id: "CAFM-77" })); }
    if (u === "/teams") { got.push(`TEAMS ${JSON.parse(b).attachments[0].content.body[0].text}`); res.writeHead(202); return res.end(); }
    if (u === "/hook") { got.push(`HOOK ${req.headers["x-bohio-event"]}`); res.writeHead(200); return res.end(); }
    if (u === "/down") { res.writeHead(500); return res.end("boom"); }
    res.writeHead(404); res.end();
  });
});
srv.listen(18990, async () => {
  const B = "http://127.0.0.1:18990";
  process.env.CMMS = JSON.stringify([{ kind: "maximo", url: `${B}/maximo`, apiKey: "k", siteId: "KGPP", facilities: ["kgpp"] }, { kind: "sap", url: B, user: "u", password: "p", plant: "1000", facilities: ["kgpp"] }, { kind: "cafm", url: `${B}/cafm`, secret: "cafmsecret" }]);
  process.env.TEAMS_WEBHOOK_URL = `${B}/teams`;
  process.env.WEBHOOKS = JSON.stringify([{ url: `${B}/hook`, events: ["work_order.*", "notification"] }, { url: `${B}/down`, events: ["work_order.created"] }]);
  const db = seedDb();
  await publish(db); // first run
  const r = act(db, { action: "wo_create", facilityId: "kgpp", asset: "K-201B", title: "Seal leak on K-201B", priority: "P2" } as never, "Test", "web", null);
  const id = (r.events.find((e) => e.kind === "wo_create") as any).wo.id;
  act(db, { action: "wo_update", woId: id, status: "in_progress" } as never, "Test", "web", null);
  (db.fmLog ??= []).push({ id: "EV-N1", at: new Date().toISOString(), by: "Orchestrator", channel: "orchestrator", kind: "notify", facilityId: "kgpp", via: "teams", title: "Gas read in Compression", text: "22 % LEL", summary: "x" } as never);
  const n = await publish(db), again = await publish(db);
  const log = (db.integrationLog ?? []).map((x) => `${x.ok ? "ok " : "ERR"} ${x.target}: ${x.what} — ${x.note}${x.ref ? ` [${x.ref}]` : ""}`);
  console.log(log.join("\n"));
  const expect: [string, boolean][] = [
    ["Maximo created the work order", log.some((l) => /^ok  Maximo: .* created — Created in Maximo as 1042/.test(l))],
    ["Maximo got the status change", got.some((l) => l.includes('"status":"INPRG"'))],
    ["SAP was asked for a CSRF token first and the order sent with it", got[got.findIndex((l) => l.startsWith("SAP csrf")) + 1]?.startsWith("SAP POST token=TOK123 cookie=SAP_SESSIONID=abc")],
    ["SAP returned its order number", log.some((l) => /SAP PM: .* as order 4000123/.test(l))],
    ["the CAFM got both changes, signed", got.filter((l) => /^CAFM .* sig=true$/.test(l)).length === 2],
    ["Teams got the rule's message", got.includes("TEAMS Gas read in Compression")],
    ["the failing subscriber is logged as failed", log.some((l) => /^ERR Webhook .*500: boom/.test(l))],
    ["each change is sent once", n === 10 && again === 0],
  ];
  for (const [what, ok] of expect) console.log(`${ok ? "PASS" : "FAIL"} ${what}`);
  srv.close();
  process.exit(expect.every(([, ok]) => ok) ? 0 : 1);
});
