const j = async (r) => { const d = await r.json(); if (!r.ok) throw new Error(d.error || "Request failed"); return d; };
export const api = {
  demo: false,
  summary: () => fetch("/api/summary").then(j),
  flights: () => fetch("/api/flights").then(j),
  addFlight: (b) => fetch("/api/flights", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) }).then(j),
  delFlight: (id) => fetch("/api/flights/" + id, { method: "DELETE" }).then(j),
  checkout: (quantity) => fetch("/api/checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ quantity }) }).then(j),
  confirm: (sid) => fetch("/api/confirm?session_id=" + encodeURIComponent(sid)).then(j),
};
