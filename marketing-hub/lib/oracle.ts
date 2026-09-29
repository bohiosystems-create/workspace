// Oracle Fusion Cloud (Procurement / Payables) client — READ-ONLY.
//
//   live: GET {ORACLE_BASE_URL}/fscmRestApi/resources/{version}/invoices | purchaseOrders
//         (HTTP Basic auth, paged with limit/offset, onlyData=true)
//   mock: deterministic sample data in the same shape as the Oracle payloads, so
//         everything downstream (mapping, reconciliation, UI) is identical.
//
// NOTE: field names below follow the Fusion REST docs as best known; they have
// not been verified against a live instance. Any tenant-specific differences
// (custom DFFs, status names) are contained in the mappers at the bottom of the
// file — adjust `mapInvoice` / `mapPurchaseOrder` there.

export type OracleInvoice = Record<string, any>;
export type OraclePO = Record<string, any>;

export type OracleContext = {
  vendors: { oracleSupplierNumber: string | null; name: string }[];
  campaigns: { name: string; vendor: string; budgetK: number; months: { month: string; spendK: number }[] }[];
  today: Date;
};

export const oracleMode = () => (process.env.ORACLE_MODE === "live" ? "live" : "mock");

// ---------------------------------------------------------------- live client
async function getAll(resource: string, q?: string): Promise<Record<string, any>[]> {
  const base = process.env.ORACLE_BASE_URL;
  const user = process.env.ORACLE_USER;
  const pass = process.env.ORACLE_PASSWORD;
  if (!base || !user || !pass) throw new Error("Oracle live mode needs ORACLE_BASE_URL, ORACLE_USER and ORACLE_PASSWORD.");
  const version = process.env.ORACLE_API_VERSION || "11.13.18.05";
  const auth = "Basic " + Buffer.from(`${user}:${pass}`).toString("base64");
  const out: Record<string, any>[] = [];
  for (let offset = 0; ; offset += 200) {
    const url = new URL(`${base.replace(/\/$/, "")}/fscmRestApi/resources/${version}/${resource}`);
    url.searchParams.set("limit", "200");
    url.searchParams.set("offset", String(offset));
    url.searchParams.set("onlyData", "true");
    if (q) url.searchParams.set("q", q);
    const res = await fetch(url, { headers: { Authorization: auth, Accept: "application/json" } });
    if (res.status === 401 || res.status === 403) throw new Error(`Oracle rejected the credentials (${res.status}).`);
    if (!res.ok) throw new Error(`Oracle ${resource} request failed (${res.status}).`);
    const body = await res.json();
    out.push(...(body.items ?? []));
    if (!body.hasMore) break;
  }
  return out;
}

export async function fetchOracle(ctx: OracleContext): Promise<{ invoices: OracleInvoice[]; purchaseOrders: OraclePO[] }> {
  if (oracleMode() === "mock") return mockOracle(ctx);
  const bu = process.env.ORACLE_BUSINESS_UNIT;
  const known = new Set(ctx.vendors.map((v) => v.oracleSupplierNumber));
  const invQ = [`InvoiceDate>=2026-01-01`, bu ? `BusinessUnit='${bu}'` : ""].filter(Boolean).join(";");
  const [invoices, purchaseOrders] = await Promise.all([getAll("invoices", invQ), getAll("purchaseOrders", bu ? `ProcurementBU='${bu}'` : undefined)]);
  const ours = (r: Record<string, any>) => known.has(String(r.SupplierNumber ?? r.SupplierId ?? ""));
  return { invoices: invoices.filter(ours), purchaseOrders: purchaseOrders.filter(ours) };
}

// ----------------------------------------------------------------------- mock
function addDays(iso: string, n: number) {
  const t = new Date(iso);
  t.setUTCDate(t.getUTCDate() + n);
  return t.toISOString().slice(0, 10);
}
const nextMonthDay = (m: string, day: number) => {
  const [y, mo] = m.split("-").map(Number);
  return new Date(Date.UTC(y, mo, day)).toISOString().slice(0, 10);
};

const TERMS: Record<string, number> = {
  "Mubasher Brokerage Network": 45, "Tasweeq Digital": 30, "PropertyHub KSA": 30,
  "Nakhla Communications": 30, "Hajar Outdoor": 30, "Sada Influence": 30,
};

function mockOracle(ctx: OracleContext) {
  const supplier = (name: string) => ctx.vendors.find((v) => v.name === name)!;
  const today = ctx.today.toISOString().slice(0, 10);
  const invoices: OracleInvoice[] = [];
  const purchaseOrders: OraclePO[] = [];
  let seq = 4000;

  ctx.campaigns.forEach((c, i) => {
    const v = supplier(c.vendor);
    const po = `PO-26-${String(1100 + i)}`;
    // One deliberately under-sized PO (Hajar) to trigger the over-PO check.
    const poTotal = c.name.includes("Billboards") ? 300_000 : c.budgetK * 1000;
    purchaseOrders.push({
      POHeaderId: 9000 + i, OrderNumber: po, Supplier: c.vendor, SupplierNumber: v.oracleSupplierNumber,
      Description: c.name, Status: "OPEN", Total: poTotal, CurrencyCode: "SAR",
    });

    for (const m of c.months) {
      if (!m.spendK) continue;
      const key = `${c.name}|${m.month}`;
      // Invoices that never arrive (unbilled accrual to chase).
      if (key === "Ash Shati — Broker Push|2026-05" || key === "Andalus — Launch PR & Media Relations|2026-05") continue;

      let amount = m.spendK * 1000;
      let number = `${v.oracleSupplierNumber}-${m.month.replace("-", "")}-${String(i + 1).padStart(2, "0")}`;
      let status = "Validated";
      let poRef: string | null = po;
      if (key === "Andalus — Off-plan Launch Funnel|2026-04") amount = Math.round(amount * 1.12); // overbilled
      if (key === "Marina Tower — Broker Push|2026-04") poRef = null; // no PO
      if (key === "Marina Tower — Retail & Residential Spotlight|2026-03") status = "Needs revalidation";
      if (key === "Ash Shati — Search & Social Always-On|2026-02") amount = Math.round(amount * 1.04); // small overrun

      const invoiceDate = nextMonthDay(m.month, 5);
      const dueDate = addDays(invoiceDate, TERMS[c.vendor] ?? 30);
      const paid = dueDate <= addDays(today, -3) && status === "Validated" && key !== "Marina Tower — Corniche Billboards|2026-03";
      invoices.push({
        InvoiceId: ++seq, InvoiceNumber: number, Supplier: c.vendor, SupplierNumber: v.oracleSupplierNumber,
        InvoiceAmount: amount, AmountPaid: paid ? amount : 0, InvoiceCurrency: "SAR", InvoiceDate: invoiceDate,
        PaymentDueDate: dueDate, ValidationStatus: status, PurchaseOrderNumber: poRef,
        Description: `${c.name} — ${m.month}`,
      });
      // Duplicate submission of the same invoice (different number suffix).
      if (key === "Ash Shati — Featured Listings|2026-03") {
        invoices.push({
          InvoiceId: ++seq, InvoiceNumber: number + "A", Supplier: c.vendor, SupplierNumber: v.oracleSupplierNumber,
          InvoiceAmount: amount, AmountPaid: 0, InvoiceCurrency: "SAR", InvoiceDate: addDays(invoiceDate, 9),
          PaymentDueDate: addDays(invoiceDate, 39), ValidationStatus: "Validated", PurchaseOrderNumber: po,
          Description: `${c.name} — ${m.month}`,
        });
      }
    }
  });

  // Invoice for a paused campaign with no delivery in the period.
  const paused = ctx.campaigns.find((c) => c.name === "Andalus — Creator Programme");
  if (paused) {
    const v = supplier(paused.vendor);
    invoices.push({
      InvoiceId: ++seq, InvoiceNumber: `${v.oracleSupplierNumber}-202605-RET`, Supplier: paused.vendor,
      SupplierNumber: v.oracleSupplierNumber, InvoiceAmount: 18_000, AmountPaid: 0, InvoiceCurrency: "SAR",
      InvoiceDate: "2026-06-02", PaymentDueDate: "2026-07-02", ValidationStatus: "Validated",
      PurchaseOrderNumber: `PO-26-${1100 + ctx.campaigns.indexOf(paused)}`, Description: `${paused.name} — 2026-05 retainer`,
    });
  }
  return { invoices, purchaseOrders };
}

// --------------------------------------------------------------------- mappers
const ymd = (s: any) => new Date(String(s).slice(0, 10) + "T00:00:00Z");

export function mapInvoice(r: OracleInvoice, invoiceTermsDays = 30) {
  const amount = Number(r.InvoiceAmount ?? 0);
  const paid =
    r.AmountPaid != null ? Number(r.AmountPaid) : String(r.PaymentStatus ?? "").toLowerCase() === "paid" ? amount : 0;
  const invoiceDate = ymd(r.InvoiceDate);
  const due = r.PaymentDueDate ? ymd(r.PaymentDueDate) : new Date(invoiceDate.getTime() + invoiceTermsDays * 86_400_000);
  const desc: string = r.Description ?? "";
  const per = desc.match(/(20\d\d)-(\d\d)/);
  const period = per
    ? `${per[1]}-${per[2]}`
    : new Date(Date.UTC(invoiceDate.getUTCFullYear(), invoiceDate.getUTCMonth() - 1, 1)).toISOString().slice(0, 7);
  return {
    oracleInvoiceId: String(r.InvoiceId),
    invoiceNumber: String(r.InvoiceNumber),
    supplierNumber: String(r.SupplierNumber ?? ""),
    poNumber: (r.PurchaseOrderNumber ?? r.PONumber ?? null) as string | null,
    period,
    invoiceDate,
    dueDate: due,
    amountK: amount / 1000,
    paidK: paid / 1000,
    currency: String(r.InvoiceCurrency ?? "SAR"),
    oracleStatus: String(r.ValidationStatus ?? r.InvoiceStatus ?? "Unvalidated"),
    description: desc || null,
  };
}

export function mapPurchaseOrder(r: OraclePO) {
  return {
    oraclePoId: String(r.POHeaderId ?? r.OrderNumber),
    poNumber: String(r.OrderNumber),
    supplierNumber: String(r.SupplierNumber ?? ""),
    amountK: Number(r.Total ?? r.TotalAmount ?? 0) / 1000,
    status: String(r.Status ?? "OPEN").toUpperCase(),
    description: (r.Description ?? null) as string | null,
  };
}
