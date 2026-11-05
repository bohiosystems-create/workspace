import express from "express";
import Stripe from "stripe";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildEntry } from "./public/emissions.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;

// Pricing & conversion (all overridable via env).
// 1 certificate = 1 tonne of neat SAF. Jet fuel emits ~3.16 tCO2 per tonne burned;
// SAF cuts lifecycle emissions ~80% => ~2.53 tCO2e avoided per tonne.
const PRICE_PER_CERT_USD = Number(process.env.PRICE_PER_CERT_USD || 2400);
const CO2_PER_CERT = Number(process.env.CO2_PER_CERT || 2.53);

const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null;
const DEMO = !stripe;

// --- storage (JSON file) ---
const DATA_FILE = process.env.DATA_FILE || path.join(__dirname, "data", "certificates.json");
fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
const load = () => (fs.existsSync(DATA_FILE) ? JSON.parse(fs.readFileSync(DATA_FILE, "utf8")) : null);
const save = (rows) => fs.writeFileSync(DATA_FILE, JSON.stringify(rows, null, 2));

function seed() {
  const mk = (n, date, qty, supplier, route) => ({
    id: `SAF-${String(n).padStart(5, "0")}`, date, quantity: qty, supplier, route,
    co2e: +(qty * CO2_PER_CERT).toFixed(2), amountUsd: qty * PRICE_PER_CERT_USD, source: "sample",
  });
  return [
    mk(1, "2026-01-14", 12, "Neste", "HEFA · used cooking oil"),
    mk(2, "2026-03-02", 8, "World Energy", "HEFA · tallow"),
    mk(3, "2026-05-21", 20, "Shell Aviation", "HEFA · waste fats"),
    mk(4, "2026-08-09", 15, "Neste", "HEFA · used cooking oil"),
  ];
}
let rows = load();
if (!rows) { rows = DEMO ? seed() : []; save(rows); }

function record(sessionId, qty, amountUsd) {
  if (rows.some((r) => r.sessionId === sessionId)) return false; // idempotent
  const n = rows.length + 1;
  rows.push({
    id: `SAF-${String(n).padStart(5, "0")}`, sessionId,
    date: new Date().toISOString().slice(0, 10), quantity: qty,
    supplier: "SAF Registry", route: "HEFA · waste feedstock",
    co2e: +(qty * CO2_PER_CERT).toFixed(2), amountUsd, source: "stripe",
  });
  save(rows);
  return true;
}

const app = express();

// Stripe webhook needs the raw body, so mount before express.json().
app.post("/api/webhook", express.raw({ type: "application/json" }), (req, res) => {
  if (!stripe || !process.env.STRIPE_WEBHOOK_SECRET) return res.status(501).end();
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, req.headers["stripe-signature"], process.env.STRIPE_WEBHOOK_SECRET);
  } catch (e) {
    return res.status(400).send(`Webhook error: ${e.message}`);
  }
  if (event.type === "checkout.session.completed" && event.data.object.payment_status === "paid") {
    const s = event.data.object;
    record(s.id, Number(s.metadata.quantity), s.amount_total / 100);
  }
  res.json({ received: true });
});

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

app.get("/api/summary", (_req, res) => {
  const totalCerts = rows.reduce((a, r) => a + r.quantity, 0);
  const totalCo2e = rows.reduce((a, r) => a + r.co2e, 0);
  const totalSpend = rows.reduce((a, r) => a + r.amountUsd, 0);
  res.json({
    demo: DEMO, pricePerCert: PRICE_PER_CERT_USD, co2PerCert: CO2_PER_CERT,
    totals: { certificates: totalCerts, co2e: +totalCo2e.toFixed(2), spend: totalSpend },
    certificates: [...rows].reverse(),
  });
});

app.post("/api/checkout", async (req, res) => {
  const qty = Math.floor(Number(req.body?.quantity));
  if (!Number.isFinite(qty) || qty < 1 || qty > 1000) return res.status(400).json({ error: "Quantity must be 1–1000." });

  if (DEMO) { // no Stripe key: simulate a paid session so the flow can be tried end to end
    const id = `demo_${Date.now()}`;
    record(id, qty, qty * PRICE_PER_CERT_USD);
    return res.json({ url: `${BASE_URL}/?purchased=${qty}` });
  }
  try {
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [{
        quantity: qty,
        price_data: {
          currency: "usd",
          unit_amount: Math.round(PRICE_PER_CERT_USD * 100),
          product_data: {
            name: "SAF certificate (1 tonne SAF)",
            description: `≈ ${CO2_PER_CERT} tCO2e avoided per certificate`,
          },
        },
      }],
      metadata: { quantity: String(qty) },
      success_url: `${BASE_URL}/?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${BASE_URL}/?canceled=1`,
    });
    res.json({ url: session.url });
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

// Landing after Stripe: verify payment server-side, then record (webhook may also do this).
app.get("/api/confirm", async (req, res) => {
  if (!stripe) return res.status(400).json({ error: "Demo mode" });
  try {
    const s = await stripe.checkout.sessions.retrieve(String(req.query.session_id));
    if (s.payment_status !== "paid") return res.status(402).json({ error: "Payment not completed" });
    const added = record(s.id, Number(s.metadata.quantity), s.amount_total / 100);
    res.json({ ok: true, added, quantity: Number(s.metadata.quantity) });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// --- aviation emissions log (business travel + air freight) ---
const FLIGHTS_FILE = path.join(path.dirname(DATA_FILE), "flights.json");
let flights = fs.existsSync(FLIGHTS_FILE) ? JSON.parse(fs.readFileSync(FLIGHTS_FILE, "utf8")) : null;
if (!flights) {
  flights = DEMO ? [
    { kind: "travel", date: "2026-02-10", from: "RUH", to: "LHR", rf: true, cabin: "business", pax: 2, trip: "return" },
    { kind: "travel", date: "2026-04-18", from: "JED", to: "DXB", rf: true, cabin: "economy", pax: 4, trip: "return" },
    { kind: "freight", date: "2026-06-03", from: "DMM", to: "FRA", rf: true, kg: 3200, unit: "kg" },
    { kind: "travel", date: "2026-09-22", from: "RUH", to: "SIN", rf: true, cabin: "economy", pax: 3, trip: "return" },
  ].map((b, i) => ({ id: `AV-${String(i + 1).padStart(4, "0")}`, source: "sample", ...buildEntry(b) })) : [];
  fs.writeFileSync(FLIGHTS_FILE, JSON.stringify(flights, null, 2));
}
const saveFlights = () => fs.writeFileSync(FLIGHTS_FILE, JSON.stringify(flights, null, 2));
app.get("/api/flights", (_req, res) => res.json([...flights].reverse()));
app.post("/api/flights", (req, res) => {
  try {
    const next = Math.max(0, ...flights.map((f) => Number(f.id.slice(3)))) + 1;
    const e = { id: `AV-${String(next).padStart(4, "0")}`, ...buildEntry(req.body || {}) };
    flights.push(e); saveFlights(); res.json(e);
  } catch (err) { res.status(400).json({ error: err.message }); }
});
app.delete("/api/flights/:id", (req, res) => { flights = flights.filter((f) => f.id !== req.params.id); saveFlights(); res.json({ ok: true }); });

app.listen(PORT, () => console.log(`SAF tracker on ${BASE_URL} ${DEMO ? "(demo mode — set STRIPE_SECRET_KEY for real checkout)" : ""}`));
