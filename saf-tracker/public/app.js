const $ = (id) => document.getElementById(id);
const usd = (n) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
const num = (n, d = 1) => new Intl.NumberFormat("en-US", { maximumFractionDigits: d }).format(n);
let cfg = { pricePerCert: 0, co2PerCert: 0 };

function toast(msg, err) {
  const t = $("toast"); t.textContent = msg; t.className = "toast" + (err ? " err" : ""); t.hidden = false;
}

async function refresh() {
  const d = await (await fetch("/api/summary")).json();
  cfg = d; $("demo").hidden = !d.demo; $("factor").textContent = d.co2PerCert;
  $("co2").textContent = num(d.totals.co2e);
  $("cars").textContent = num(d.totals.co2e / 4.6);
  $("certs").textContent = num(d.totals.certificates, 0);
  $("saf").textContent = num(d.totals.certificates, 0) + " t";
  $("spend").textContent = usd(d.totals.spend);
  $("count").textContent = d.certificates.length + " purchases";
  $("rows").innerHTML = d.certificates.map((c) => `
    <tr><td class="id">${c.id}</td><td>${c.date}</td>
    <td>${c.supplier}<small>${c.route}</small></td>
    <td class="r">${c.quantity}</td><td class="r">${num(c.co2e)}</td><td class="r">${usd(c.amountUsd)}</td></tr>`).join("")
    || `<tr><td colspan="6" class="muted">No certificates yet — buy your first below.</td></tr>`;
  quote();
}

function qty() { return Math.max(1, Math.min(1000, Math.floor(Number($("qty").value)) || 1)); }
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
  try {
    const r = await fetch("/api/checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ quantity: qty() }) });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error);
    location.href = d.url;
  } catch (e) { toast("Checkout failed: " + e.message, true); $("buy").disabled = false; }
};

(async function init() {
  const p = new URLSearchParams(location.search);
  if (p.get("session_id")) {
    const r = await fetch("/api/confirm?session_id=" + encodeURIComponent(p.get("session_id")));
    const d = await r.json();
    toast(r.ok ? `Payment received — ${d.quantity} certificates added to your ledger.` : "Could not confirm payment: " + d.error, !r.ok);
  } else if (p.get("purchased")) toast(`Demo purchase — ${p.get("purchased")} certificates added (no real payment).`);
  else if (p.get("canceled")) toast("Checkout canceled. Nothing was charged.", true);
  if (p.toString()) history.replaceState({}, "", "/");
  refresh();
})();
