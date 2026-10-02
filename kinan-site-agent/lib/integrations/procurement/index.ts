import type { Db, Delivery, MaterialRequest, PurchaseOrder, StockItem } from "../../types";
import type { Repo } from "../../core/tools";
import { oracleAdapter } from "./oracle";
import { restAdapter } from "./rest";
import { sapAdapter } from "./sap";
import type { ExternalPo, ProcurementAdapter } from "./types";

export function adapterFromEnv(env = process.env): ProcurementAdapter | null {
  switch ((env.PROCUREMENT_PROVIDER ?? "demo").toLowerCase()) {
    case "sap": return env.SAP_BASE_URL ? sapAdapter(env) : null;
    case "oracle": return env.ORACLE_BASE_URL ? oracleAdapter(env) : null;
    case "rest": return env.PROCUREMENT_REST_URL ? restAdapter(env) : null;
    default: return null; // demo / webhook-only: data lives in db.json
  }
}

function supplierId(db: Db, name: string): string {
  const S = db.data.procurement.suppliers;
  const hit = S.find((s) => s.name.toLowerCase() === name.toLowerCase() || s.id === name);
  if (hit) return hit.id;
  const id = `SUP-X${String(S.length + 1).padStart(3, "0")}`;
  S.push({ id, name, category: "External", contact: "", phone: "", rating: 0, prequalified: true });
  return id;
}
function packageFor(db: Db, supId: string, hint?: string): string {
  const P = db.data.procurement.packages;
  if (hint && P.some((p) => p.id === hint)) return hint;
  return P.find((p) => p.supplierId === supId)?.id ?? "UNMAPPED";
}
function toPo(db: Db, x: ExternalPo, source: string): PurchaseOrder {
  const sid = supplierId(db, x.supplierName);
  const { supplierName: _n, packageId, ...rest } = x;
  return { ...rest, supplierId: sid, packageId: packageFor(db, sid, packageId), source };
}

/** Pull from the configured system. Pulled data replaces earlier pulled + demo POs; webhook-pushed POs are kept. */
export async function syncNow(r: Repo, adapter = adapterFromEnv()): Promise<{ ok: boolean; source: string; pos?: number; deliveries?: number; error?: string }> {
  if (!adapter) return { ok: false, source: "demo", error: "No purchasing system configured (PROCUREMENT_PROVIDER)." };
  const P = r.db.data.procurement;
  try {
    const { pos, deliveries } = await adapter.pull();
    const kept = P.pos.filter((p) => p.source === "webhook");
    const keptIds = new Set(kept.map((p) => p.po));
    P.pos = [...pos.filter((p) => !keptIds.has(p.po)).map((p) => toPo(r.db, p, adapter.name)), ...kept];
    if (deliveries) P.deliveries = deliveries;
    else if (P.source === "demo") P.deliveries = P.deliveries.filter((d) => P.pos.some((p) => p.po === d.po));
    P.source = adapter.name;
    P.lastSync = new Date().toISOString();
    await r.save();
    return { ok: true, source: adapter.name, pos: P.pos.length, deliveries: P.deliveries.length };
  } catch (e) {
    return { ok: false, source: adapter.name, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Wire sync-on-demand and requisition push into the repo used by the agent tools. */
export function attachProcurement(r: Repo) {
  let inflight: Promise<unknown> | null = null;
  r.syncProcurement = async () => {
    const adapter = adapterFromEnv();
    if (!adapter) return;
    const ageMin = (Date.now() - Date.parse(r.db.data.procurement.lastSync ?? "1970-01-01")) / 60000;
    if (r.db.data.procurement.source === adapter.name && ageMin < (Number(process.env.PROCUREMENT_SYNC_MINUTES) || 15)) return;
    inflight ??= syncNow(r, adapter).finally(() => { inflight = null; });
    // Don't keep the user waiting more than 8 s — answer from cache if slow.
    await Promise.race([inflight, new Promise((res) => setTimeout(res, 8000))]);
  };
  r.createRequisition = async (mr: MaterialRequest) => {
    const adapter = adapterFromEnv();
    if (!adapter?.pushRequisition) return { message: "Recorded in the site agent; procurement team notified via the MR list (no requisition API configured)." };
    return adapter.pushRequisition(mr);
  };
}

/** Webhook push from any system: upsert POs, deliveries, MR status updates or stock. */
export function applyPush(db: Db, type: string, data: any): { upserted: number } {
  const P = db.data.procurement;
  const rows: any[] = Array.isArray(data) ? data : [data];
  let n = 0;
  for (const x of rows) {
    if (type === "purchase_order") {
      if (!x?.po) continue;
      const po = toPo(db, { po: String(x.po), supplierName: String(x.supplier ?? x.supplierName ?? "Unknown supplier"), date: String(x.date ?? new Date().toISOString().slice(0, 10)), currency: String(x.currency ?? "SAR"), status: x.status ?? "Open", lines: Array.isArray(x.lines) ? x.lines : [], packageId: x.packageId, externalId: x.externalId }, "webhook");
      const i = P.pos.findIndex((p) => p.po === po.po);
      if (i >= 0) P.pos[i] = po; else P.pos.unshift(po);
      n++;
    } else if (type === "delivery") {
      if (!x?.id) continue;
      const d: Delivery = { slot: "", gate: "Gate 2", locationId: "laydown-2", vehicle: "", items: "", status: "Scheduled", po: "", date: new Date().toISOString().slice(0, 10), ...x };
      const i = P.deliveries.findIndex((y) => y.id === d.id);
      if (i >= 0) P.deliveries[i] = { ...P.deliveries[i], ...d }; else P.deliveries.push(d);
      n++;
    } else if (type === "material_request_status") {
      const mr = P.requests.find((m) => m.id === x?.id || (x?.externalRef && m.externalRef === x.externalRef));
      if (mr) { if (x.status) mr.status = x.status; if (x.externalRef) mr.externalRef = x.externalRef; n++; }
    } else if (type === "stock") {
      if (!x?.item) continue;
      const s: StockItem = { qty: 0, unit: "", locationId: "store", min: 0, updated: new Date().toISOString().slice(0, 10), ...x };
      const i = P.stock.findIndex((y) => y.item === s.item && y.locationId === s.locationId);
      if (i >= 0) P.stock[i] = s; else P.stock.push(s);
      n++;
    }
  }
  P.deliveries.sort((a, b) => a.date.localeCompare(b.date));
  P.lastSync = new Date().toISOString();
  return { upserted: n };
}
