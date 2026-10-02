import type { Delivery, MaterialRequest } from "../../types";
import { deriveStatus, getJson, getPath, num, toDate, type ExternalPo, type ProcurementAdapter } from "./types";

/**
 * Generic REST adapter for any purchasing system or middleware (Odoo, Dynamics,
 * Ariba via CPI, Procore, Power Automate, n8n…). By default it expects our own
 * JSON shape; PROCUREMENT_REST_MAP remaps field paths, e.g.
 *   {"list":"data.orders","po":"number","supplier":"vendor.name","date":"order_date",
 *    "status":"state","currency":"currency","lines":"order_lines","line.item":"name",
 *    "line.qty":"product_qty","line.unit":"uom","line.unitPrice":"price_unit","line.delivered":"qty_received"}
 */
export function restAdapter(env: NodeJS.ProcessEnv): ProcurementAdapter {
  const url = env.PROCUREMENT_REST_URL ?? "";
  const headers: Record<string, string> = env.PROCUREMENT_REST_TOKEN ? { [env.PROCUREMENT_REST_AUTH_HEADER ?? "authorization"]: `${env.PROCUREMENT_REST_AUTH_HEADER ? "" : "Bearer "}${env.PROCUREMENT_REST_TOKEN}` } : {};
  const M: Record<string, string> = {
    list: "", po: "po", supplier: "supplier", date: "date", status: "status", currency: "currency", lines: "lines",
    "line.item": "item", "line.qty": "qty", "line.unit": "unit", "line.unitPrice": "unitPrice", "line.delivered": "delivered", package: "packageId",
    ...JSON.parse(env.PROCUREMENT_REST_MAP ?? "{}"),
  };
  const listOf = (j: any) => (M.list ? getPath(j, M.list) : Array.isArray(j) ? j : j.items ?? j.data ?? j.purchaseOrders ?? []) as any[];
  return {
    name: "rest",
    async pull() {
      const j = await getJson(url, headers);
      const pos: ExternalPo[] = listOf(j).map((h) => {
        const lines = ((getPath(h, M.lines) ?? []) as any[]).map((l, i) => ({
          line: (i + 1) * 10, item: String(getPath(l, M["line.item"]) ?? "Item"), qty: num(getPath(l, M["line.qty"])), unit: String(getPath(l, M["line.unit"]) ?? ""),
          unitPrice: num(getPath(l, M["line.unitPrice"])), delivered: num(getPath(l, M["line.delivered"])),
        }));
        return {
          po: String(getPath(h, M.po)), supplierName: String(getPath(h, M.supplier) ?? "Unknown supplier"), date: toDate(getPath(h, M.date)),
          currency: String(getPath(h, M.currency) ?? "SAR"), status: deriveStatus(lines, String(getPath(h, M.status) ?? "")), lines, packageId: getPath(h, M.package),
        };
      }).filter((p) => p.po && p.po !== "undefined");
      let deliveries: Delivery[] | undefined;
      if (env.PROCUREMENT_REST_DELIVERIES_URL) {
        const d = await getJson(env.PROCUREMENT_REST_DELIVERIES_URL, headers);
        deliveries = (Array.isArray(d) ? d : d.items ?? d.data ?? []) as Delivery[];
      }
      return { pos, deliveries };
    },
    async pushRequisition(mr: MaterialRequest) {
      if (!env.PROCUREMENT_REST_MR_URL) throw new Error("PROCUREMENT_REST_MR_URL not set");
      const r = await fetch(env.PROCUREMENT_REST_MR_URL, { method: "POST", headers: { ...headers, "content-type": "application/json" }, body: JSON.stringify(mr) });
      const txt = await r.text();
      if (!r.ok) throw new Error(`HTTP ${r.status}: ${txt.slice(0, 200)}`);
      let ref: string | undefined;
      try { const j = JSON.parse(txt); ref = j.id ?? j.reference ?? j.number; } catch { /* plain text */ }
      return { externalRef: ref ? String(ref) : undefined, message: "Sent to purchasing system" };
    },
  };
}
