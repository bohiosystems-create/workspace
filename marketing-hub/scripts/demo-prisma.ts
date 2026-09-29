// In-memory stand-in for the Prisma client, covering only what lib/marketing.ts uses.
import raw from "./demo-data.json";

const revive = (o: any): any =>
  JSON.parse(JSON.stringify(o), (k, v) => (/(Date|End|Start)$/.test(k) && typeof v === "string" ? new Date(v) : v));

const data: any = revive(raw);
const actions: any[] = [];
const byId = (id: string) => data.campaigns.find((c: any) => c.id === id) ?? null;

export const prisma = {
  vendor: { findMany: async () => data.vendors },
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
