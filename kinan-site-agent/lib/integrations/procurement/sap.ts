import type { MaterialRequest } from "../../types";
import { basicAuth, deriveStatus, getJson, num, toDate, type ExternalPo, type ProcurementAdapter } from "./types";

/**
 * SAP S/4HANA (Cloud or on-prem) via the standard OData v2 services
 *   API_PURCHASEORDER_PROCESS_SRV (read POs + items)
 *   API_PURCHASEREQ_PROCESS_SRV   (create purchase requisitions — optional)
 * Field names follow the standard API; tenant-specific mandatory fields for
 * requisitions (plant, material group, account assignment…) come from SAP_PR_DEFAULTS.
 */
export function sapAdapter(env: NodeJS.ProcessEnv): ProcurementAdapter {
  const base = (env.SAP_BASE_URL ?? "").replace(/\/$/, "");
  const auth = env.SAP_BEARER_TOKEN ? { authorization: `Bearer ${env.SAP_BEARER_TOKEN}` } : basicAuth(env.SAP_USERNAME, env.SAP_PASSWORD);
  const client = env.SAP_CLIENT ? `&sap-client=${encodeURIComponent(env.SAP_CLIENT)}` : "";
  const poPath = env.SAP_PO_PATH ?? "/sap/opu/odata/sap/API_PURCHASEORDER_PROCESS_SRV/A_PurchaseOrder";
  const prPath = env.SAP_PR_PATH ?? "/sap/opu/odata/sap/API_PURCHASEREQ_PROCESS_SRV/A_PurchaseRequisitionHeader";

  return {
    name: "sap",
    async pull() {
      const filter = env.SAP_PO_FILTER ? `&$filter=${encodeURIComponent(env.SAP_PO_FILTER)}` : "";
      const url = `${base}${poPath}?$format=json&$top=${Number(env.SAP_PO_TOP) || 500}&$expand=to_PurchaseOrderItem${filter}${client}`;
      const j = await getJson(url, auth);
      const rows: any[] = j?.d?.results ?? j?.value ?? [];
      const pos: ExternalPo[] = rows.map((h) => {
        const items: any[] = h.to_PurchaseOrderItem?.results ?? h.to_PurchaseOrderItem ?? [];
        const lines = items.map((i) => {
          const qty = num(i.OrderQuantity);
          return { line: num(i.PurchaseOrderItem), item: String(i.PurchaseOrderItemText || i.Material || "Item"), qty, unit: String(i.PurchaseOrderQuantityUnit ?? ""), unitPrice: num(i.NetPriceAmount) / (num(i.NetPriceQuantity) || 1), delivered: i.IsCompletelyDelivered ? qty : 0 };
        });
        return {
          po: String(h.PurchaseOrder), externalId: String(h.PurchaseOrder), supplierName: String(h.SupplierName ?? h.Supplier ?? "Unknown supplier"),
          date: toDate(h.PurchaseOrderDate ?? h.CreationDate), currency: String(h.DocumentCurrency ?? "SAR"),
          status: deriveStatus(lines, h.PurchasingCompletenessStatus === true ? "" : String(h.PurchasingProcessingStatus ?? "")), lines,
        };
      });
      return { pos };
    },
    async pushRequisition(mr: MaterialRequest) {
      if ((env.SAP_PR_ENABLED ?? "false") !== "true") throw new Error("SAP requisition push disabled (set SAP_PR_ENABLED=true)");
      // OData v2 writes need a CSRF token + session cookie from a prior GET.
      const head = await fetch(`${base}${prPath}?$top=1&$format=json${client}`, { headers: { ...auth, "x-csrf-token": "Fetch", accept: "application/json" } });
      const token = head.headers.get("x-csrf-token") ?? "";
      const cookie = (head.headers.get("set-cookie") ?? "").split(/,(?=[^;]+?=)/).map((c) => c.split(";")[0]).join("; ");
      const defaults = JSON.parse(env.SAP_PR_DEFAULTS ?? "{}");
      const body = {
        PurReqnDescription: `Site MR ${mr.id}`.slice(0, 40),
        to_PurchaseReqnItem: { results: [{ PurchaseRequisitionItemText: mr.item.slice(0, 40), RequestedQuantity: String(mr.qty), BaseUnit: mr.unit, DeliveryDate: `/Date(${Date.parse(mr.neededBy)})/`, ...defaults }] },
      };
      const r = await fetch(`${base}${prPath}?${client.slice(1)}`, { method: "POST", headers: { ...auth, "x-csrf-token": token, cookie, "content-type": "application/json", accept: "application/json" }, body: JSON.stringify(body) });
      const txt = await r.text();
      if (!r.ok) throw new Error(`SAP PR create failed: HTTP ${r.status} ${txt.slice(0, 200)}`);
      const j = JSON.parse(txt);
      const ref = j?.d?.PurchaseRequisition;
      return { externalRef: ref ? `SAP PR ${ref}` : undefined, message: "Created as purchase requisition in SAP" };
    },
  };
}
