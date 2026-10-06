import type { Delivery, MaterialRequest, PurchaseOrder } from "../../types";

/** A purchasing system the onsite agent can read POs/deliveries from and push material requests to. */
export interface ProcurementAdapter {
  name: string;
  /** Pull the current POs (and deliveries if the system exposes them). */
  pull(): Promise<{ pos: ExternalPo[]; deliveries?: Delivery[] }>;
  /** Push a site material request as a purchase requisition. Optional. */
  pushRequisition?(mr: MaterialRequest): Promise<{ externalRef?: string; message?: string }>;
}
/** PO as received from an external system: supplier by name, package optional. */
export type ExternalPo = Omit<PurchaseOrder, "supplierId" | "packageId" | "source"> & { supplierName: string; packageId?: string };

export const getPath = (o: unknown, p: string): any =>
  p.split(".").reduce<any>((a, k) => (a == null ? undefined : a[k]), o);

export function basicAuth(user?: string, pass?: string): Record<string, string> {
  return user ? { authorization: "Basic " + Buffer.from(`${user}:${pass ?? ""}`).toString("base64") } : {};
}

export async function getJson(url: string, headers: Record<string, string>, timeoutMs = 20_000): Promise<any> {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const r = await fetch(url, { headers: { accept: "application/json", ...headers }, signal: ac.signal });
    const txt = await r.text();
    if (!r.ok) throw new Error(`HTTP ${r.status} from ${new URL(url).host}: ${txt.slice(0, 200)}`);
    return JSON.parse(txt);
  } finally { clearTimeout(t); }
}

/** "/Date(1727740800000)/" (OData v2) or ISO → YYYY-MM-DD */
export function toDate(v: unknown): string {
  if (typeof v === "string") {
    const m = v.match(/\/Date\((-?\d+)/);
    if (m) return new Date(Number(m[1])).toISOString().slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10);
  }
  if (typeof v === "number") return new Date(v).toISOString().slice(0, 10);
  return new Date().toISOString().slice(0, 10);
}
export const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

export function deriveStatus(lines: { qty: number; delivered: number }[], raw?: string): PurchaseOrder["status"] {
  const s = (raw ?? "").toLowerCase();
  if (/cancel/.test(s)) return "Cancelled";
  if (/clos|finally/.test(s)) return "Closed";
  if (lines.length && lines.every((l) => l.delivered >= l.qty)) return "Delivered";
  if (lines.some((l) => l.delivered > 0)) return "Partially Delivered";
  return "Open";
}
