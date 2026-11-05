import { api } from "./api.js";
import { AIRPORTS, CO2_PER_CERT, buildEntry } from "./emissions.js";

const $ = (id) => document.getElementById(id);
const usd = (n) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
const num = (n, d = 1) => new Intl.NumberFormat("en-US", { maximumFractionDigits: d }).format(n);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
let cfg = { pricePerCert: 2400, co2PerCert: CO2_PER_CERT, totals: { co2e: 0 } };
let kind = "travel";

function toast(msg, err) { const t = $("toast"); t.textContent = msg; t.className = "toast" + (err ? " err" : ""); t.hidden = false; }

/* ---------- navigation ---------- */
function show() {
  const v = location.hash === "#aviation" ? "aviation" : "dashboard";
  $("view-dashboard").hidden = v !== "dashboard";
  $("view-aviation").hidden = v !== "aviation";
  document.querySelectorAll(".links a").forEach((a) => (a.dataset.view === v ? a.setAttribute("aria-current", "page") : a.removeAttribute("aria-current")));
  if (v === "aviation") refreshAviation();
}
window.addEventListener("hashchange", () => { $("toast").hidden = true; show(); });

/* ---------- SAF dashboard ---------- */
async function refresh() {
  const d = await api.summary();
  cfg = d; $("demo").hidden = !d.demo; $("factor").textContent = d.co2PerCert;
  $("co2").textContent = num(d.totals.co2e);
  $("cars").textContent = num(d.totals.co2e / 4.6);
  $("certs").textContent = num(d.totals.certificates, 0);
  $("saf").textContent = num(d.totals.certificates, 0) + " t";
  $("spend").textContent = usd(d.totals.spend);
  $("count").textContent = d.certificates.length + " purchases";
  $("rows").innerHTML = d.certificates.map((c) => `
    <tr><td class="id">${c.id}</td><td>${c.date}</td>
    <td>${esc(c.supplier)}<small>${esc(c.route)}</small></td>
    <td class="r">${c.quantity}</td><td class="r">${num(c.co2e)}</td><td class="r">${usd(c.amountUsd)}</td></tr>`).join("")
    || `<tr><td colspan="6" class="muted">No certificates yet. Buy your first below.</td></tr>`;
  quote();
}
const qty = () => Math.max(1, Math.min(1000, Math.floor(Number($("qty").value)) || 1));
function quote() {
  const q = qty();
  $("unit").textContent = usd(cfg.pricePerCert);
  $("q-co2").textContent = num(q * cfg.co2PerCert) + " tCO₂e";
  $("q-total").textContent = usd(q * cfg.pricePerCert);
}
const setQty = (v) => { $("qty").value = Math.max(1, Math.min(1000, v)); quote(); };
$("qty").addEventListener("input", quote);
$("minus").onclick = () => setQty(qty() - 1);
$("plus").onclick = () => setQty(qty() + 1);
document.querySelectorAll(".chips button").forEach((b) => (b.onclick = () => setQty(+b.dataset.q)));
$("buy").onclick = async () => {
  $("buy").disabled = true;
  try { const d = await api.checkout(qty()); if (d.local) { toast(d.message); await refresh(); $("buy").disabled = false; } else location.href = d.url; }
  catch (e) { toast("Checkout failed: " + e.message, true); $("buy").disabled = false; }
};

/* ---------- aviation emissions ---------- */
$("airports").innerHTML = Object.entries(AIRPORTS).map(([k, v]) => `<option value="${k}">${esc(v[0])}</option>`).join("");
$("f-date").value = new Date().toISOString().slice(0, 10);
try { $("f-rf").checked = localStorage.getItem("saf-rf") !== "0"; } catch (e) {}

function setKind(k) {
  kind = k;
  $("t-travel").setAttribute("aria-selected", k === "travel"); $("t-freight").setAttribute("aria-selected", k === "freight");
  document.querySelector('[data-for="travel"]').hidden = k !== "travel";
  document.querySelector('[data-for="freight"]').hidden = k !== "freight";
  preview();
}
$("t-travel").onclick = () => setKind("travel");
$("t-freight").onclick = () => setKind("freight");

const formBody = () => ({
  kind, from: $("f-from").value.trim().slice(0, 3), to: $("f-to").value.trim().slice(0, 3), km: $("f-km").value,
  trip: $("f-trip").value, pax: $("f-pax").value, cabin: $("f-cabin").value,
  kg: $("f-kg").value, unit: $("f-unit").value, date: $("f-date").value, rf: $("f-rf").checked,
});
function preview() {
  $("f-err").hidden = true;
  try { const e = buildEntry(formBody()); $("r-km").textContent = num(e.km, 0) + " km"; $("r-co2").textContent = num(e.tco2e, 2) + " tCO₂e"; }
  catch (e) { $("r-km").textContent = "—"; $("r-co2").textContent = "—"; }
}
$("av-form").addEventListener("input", () => { try { localStorage.setItem("saf-rf", $("f-rf").checked ? "1" : "0"); } catch (e) {} preview(); });
$("av-form").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  try { buildEntry(formBody()); await api.addFlight(formBody()); await refreshAviation(); }
  catch (e) { $("f-err").textContent = e.message; $("f-err").hidden = false; }
});

let gap = 0;
async function refreshAviation() {
  const [flights, d] = await Promise.all([api.flights(), api.summary()]);
  cfg = d;
  const sum = (k) => flights.filter((f) => f.kind === k).reduce((a, f) => a + f.tco2e, 0);
  const travel = sum("travel"), freight = sum("freight"), total = travel + freight;
  const avoided = d.totals.co2e;
  const pct = total ? Math.min(100, (avoided / total) * 100) : 0;
  gap = Math.max(0, total - avoided);
  $("av-total").textContent = num(total);
  $("av-travel").textContent = num(travel) + " t";
  $("av-freight").textContent = num(freight) + " t";
  $("av-pct").textContent = num(pct, 0) + "%";
  $("av-cover").textContent = total ? `Your SAF certificates avoid ${num(avoided)} tCO₂e against ${num(total)} tCO₂e flown.` : "Add a flight or shipment to start.";
  $("av-count").textContent = flights.length + " entries";
  $("av-rows").innerHTML = flights.map((f) => `
    <tr><td>${f.date}</td><td><span class="kind">${f.kind === "travel" ? "Travel" : "Freight"}</span></td>
    <td>${esc(f.from)} → ${esc(f.to)}<small>${esc(f.detail)}</small></td>
    <td class="r">${num(f.km, 0)}</td><td class="r">${num(f.tco2e, 2)}</td>
    <td class="r"><button class="del" data-id="${esc(f.id)}" aria-label="Delete ${esc(f.id)}">×</button></td></tr>`).join("")
    || `<tr><td colspan="6" class="muted">Nothing logged yet.</td></tr>`;
  document.querySelectorAll(".del").forEach((b) => (b.onclick = async () => { await api.delFlight(b.dataset.id); refreshAviation(); }));
  $("av-cta").hidden = gap <= 0;
  $("av-gap").textContent = num(gap);
  $("av-buy").textContent = `Buy ${Math.ceil(gap / cfg.co2PerCert)} certificates to cover it →`;
}
$("av-buy").onclick = () => { setQty(Math.ceil(gap / cfg.co2PerCert)); location.hash = "#dashboard"; window.scrollTo(0, 0); };

/* ---------- init ---------- */
(async function init() {
  const p = new URLSearchParams(location.search);
  if (p.get("session_id")) {
    try { const d = await api.confirm(p.get("session_id")); toast(`Payment received. ${d.quantity} certificates added to your ledger.`); }
    catch (e) { toast("Could not confirm payment: " + e.message, true); }
  } else if (p.get("purchased")) toast(`Demo purchase: ${p.get("purchased")} certificates added (no real payment).`);
  else if (p.get("canceled")) toast("Checkout canceled. Nothing was charged.", true);
  if (p.toString()) history.replaceState({}, "", location.pathname + location.hash);
  show(); preview(); refresh();
})();
