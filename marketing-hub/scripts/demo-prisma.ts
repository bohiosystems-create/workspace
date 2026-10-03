// In-memory stand-in for the Prisma client, covering only what lib/marketing.ts uses.
import raw from "./demo-data.json";

const revive = (o: any): any =>
  JSON.parse(JSON.stringify(o), (k, v) => (/(Date|End|Start|At)$/.test(k) && typeof v === "string" ? new Date(v) : v));

const data: any = revive(raw);
const actions: any[] = [];
const byId = (id: string) => data.campaigns.find((c: any) => c.id === id) ?? null;

// Minimal generic table for the Oracle-synced models (starts empty; filled by the mock sync).
function table(rows: any[], defaults: Record<string, unknown> = {}) {
  return {
    findMany: async (a: any = {}) => {
      const r = [...rows];
      if (a.orderBy?.createdAt === "desc") r.sort((x, y) => y.createdAt - x.createdAt);
      return a.take ? r.slice(0, a.take) : r;
    },
    count: async () => rows.length,
    create: async ({ data: d }: any) => {
      const row = { id: "r" + Math.random().toString(36).slice(2), createdAt: new Date(), decision: "PENDING", decisionNote: null, decidedAt: null, approvedBy: null, approvedAt: null, sentAt: null, delivery: null, providerRef: null, error: null, ...defaults, ...d };
      rows.push(row);
      return row;
    },
    createMany: async ({ data: ds }: any) => {
      for (const d of ds) rows.push({ id: "r" + Math.random().toString(36).slice(2), ...d });
    },
    update: async ({ where, data: d }: any) => Object.assign(rows.find((r) => (where.id ? r.id === where.id : r.key === where.key)), d),
    delete: async ({ where }: any) => {
      const i = rows.findIndex((r) => r.key === where.key || r.id === where.id);
      if (i >= 0) rows.splice(i, 1);
    },
  };
}

export const prisma = {
  supplierInvoice: table([]),
  chatMiss: table([]),
  purchaseOrder: table([]),
  integrationSync: table([]),
  recommendationState: table([]),
  outboundEmail: table([]),
  crmLead: table([]),
  crmSync: table([]),
  pastCampaign: table([]),
  dailyRecommendation: table([], { status: "OPEN", decidedBy: null, decidedAt: null, note: null }),
  dailyNote: table([]),
  signalScan: table([]),
  campaignIdea: table([], { status: "NEW", score: null, decidedBy: null, decidedAt: null, note: null }),
  vendor: {
    findMany: async () => data.vendors, count: async () => data.vendors.length,
    create: async ({ data: d }: any) => { const row = { id: "v" + Math.random().toString(36).slice(2), ...d }; data.vendors.push(row); return row; },
    update: async ({ where, data: d }: any) => Object.assign(data.vendors.find((v: any) => v.id === where.id), d),
  },
  asset: table(data.assets ?? []),
  deliverable: table(data.deliverables ?? []),
  trial: table(data.trials ?? []),
  experiment: table(data.experiments ?? []),
  channelWeek: table(data.channelWeeks ?? []),
  salesWeek: table(data.salesWeeks ?? []),
  adPlatformWeek: table([]),
  sourceSync: table([]),
  salesTarget: table([]),
  budgetPlan: table([]),
  directorTask: table([], { status: "PROPOSED", eventId: null, titleAr: null, detailAr: null }),
  kinanEvent: table([], { status: "PENDING", attempts: 0, lastError: null, deliveredAt: null, mode: null }),
  kinanFeedback: table([]),
  reportSchedule: table([]),
  reportLayout: table([]),
  reportLayoutChange: table([]),
  metaAdAccount: table([]),
  metaCampaign: table([], { kind: "UNRESOLVED", confidence: "LOW", review: "AUTO", reviewedBy: null, reviewedAt: null, vendorId: null, campaignCode: null }),
  metaIdentity: table([], { vendorId: null, inHouse: false }),
  report: table([], { kind: "DAILY", recipients: "", delivery: null, error: null, sentAt: null, kinanEventId: null }),
  workOrder: table([], { status: "PROPOSED", routine: false, payload: null, issuedAt: null, doneAt: null }),
  campaign: {
    findMany: async () => data.campaigns,
    findUnique: async ({ where }: any) => byId(where.id),
    update: async ({ where, data: d }: any) => {
      const c = byId(where.id);
      for (const [k, v] of Object.entries<any>(d)) {
        if (v && typeof v === "object" && "decrement" in v) c[k] -= v.decrement;
        else if (v && typeof v === "object" && "increment" in v) c[k] += v.increment;
        else c[k] = v;
      }
      return c;
    },
  },
  campaignMonth: {
    aggregate: async ({ where }: any) => ({
      _sum: { spendK: byId(where.campaignId).months.reduce((s: number, m: any) => s + m.spendK, 0) },
    }),
    update: async ({ where, data: d }: any) => {
      const m = data.campaigns.flatMap((c: any) => c.months).find((x: any) => x.id === where.id);
      return Object.assign(m, d);
    },
    create: async ({ data: d }: any) => {
      const row = { id: "m" + Math.random().toString(36).slice(2), ...d };
      byId(d.campaignId).months.push(row);
      return row;
    },
  },
  marketingAction: {
    findMany: async ({ take }: any) => actions.slice(0, take),
    create: async ({ data: d }: any) => {
      const row = { id: `a${actions.length + 1}`, createdAt: new Date(), ...d };
      actions.unshift(row);
      return row;
    },
  },
  $transaction: async (ops: Promise<any>[]) => Promise.all(ops),
};
