import { basicAuth, deriveStatus, getJson, num, toDate, type ExternalPo, type ProcurementAdapter } from "./types";

/**
 * Oracle Fusion Cloud Procurement REST API — purchaseOrders resource with lines.
 * Read-only here (requisitions in Fusion usually go through approval workflows
 * configured per tenant — push them via the generic REST/middleware instead).
 */
export function oracleAdapter(env: NodeJS.ProcessEnv): ProcurementAdapter {
  const base = (env.ORACLE_BASE_URL ?? "").replace(/\/$/, "");
  const auth = env.ORACLE_BEARER_TOKEN ? { authorization: `Bearer ${env.ORACLE_BEARER_TOKEN}` } : basicAuth(env.ORACLE_USERNAME, env.ORACLE_PASSWORD);
  const path = env.ORACLE_PO_PATH ?? "/fscmRestApi/resources/11.13.18.05/purchaseOrders";
  return {
    name: "oracle",
    async pull() {
      const pos: ExternalPo[] = [];
      let offset = 0;
      for (let page = 0; page < 20; page++) {
        const q = env.ORACLE_PO_QUERY ? `&q=${encodeURIComponent(env.ORACLE_PO_QUERY)}` : "";
        const j = await getJson(`${base}${path}?onlyData=true&expand=lines&limit=200&offset=${offset}${q}`, auth);
        for (const h of j.items ?? []) {
          const raw = Array.isArray(h.lines) ? h.lines : h.lines?.items ?? [];
          const lines = raw.map((l: any) => {
            const qty = num(l.Quantity);
            return { line: num(l.LineNumber), item: String(l.Description ?? l.ItemDescription ?? l.Item ?? "Item"), qty, unit: String(l.UOM ?? l.UOMCode ?? ""), unitPrice: num(l.Price ?? l.UnitPrice), delivered: num(l.QuantityReceived ?? l.QuantityDelivered ?? 0) };
          });
          pos.push({
            po: String(h.OrderNumber), externalId: String(h.POHeaderId ?? h.OrderNumber), supplierName: String(h.Supplier ?? "Unknown supplier"),
            date: toDate(h.CreationDate ?? h.OrderedDate), currency: String(h.CurrencyCode ?? h.Currency ?? "SAR"), status: deriveStatus(lines, String(h.StatusCode ?? h.Status ?? "")), lines,
          });
        }
        if (!j.hasMore) break;
        offset += j.limit ?? 200;
      }
      return { pos };
    },
  };
}
