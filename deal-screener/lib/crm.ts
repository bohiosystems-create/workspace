import { prisma } from "./prisma";

// Internal CRM — data helpers, portfolio stats and an idempotent seed.
// Claude does the language work (parsing notes, drafting follow-ups) in
// lib/claude.ts; everything here is deterministic.

export const CATEGORIES = [
  "LP",
  "Broker",
  "Lender",
  "Seller",
  "Advisor",
  "Tenant",
  "Other",
] as const;

export const STAGES = ["Prospect", "Active", "Committed", "Dormant"] as const;

export const CHANNELS = ["Call", "Email", "Meeting", "Note"] as const;

export type Category = (typeof CATEGORIES)[number];
export type Stage = (typeof STAGES)[number];
export type Channel = (typeof CHANNELS)[number];

// ----- Reads ---------------------------------------------------------------

export async function listContacts(filter?: {
  category?: string;
  stage?: string;
  q?: string;
}) {
  await ensureContactsSeeded();

  const where: any = {};
  if (filter?.category && (CATEGORIES as readonly string[]).includes(filter.category)) {
    where.category = filter.category;
  }
  if (filter?.stage && (STAGES as readonly string[]).includes(filter.stage)) {
    where.stage = filter.stage;
  }
  if (filter?.q) {
    const q = filter.q.trim();
    where.OR = [
      { name: { contains: q } },
      { company: { contains: q } },
      { email: { contains: q } },
      { title: { contains: q } },
    ];
  }

  const contacts = await prisma.contact.findMany({
    where,
    orderBy: [{ lastContactAt: "desc" }, { name: "asc" }],
    include: { _count: { select: { interactions: true } } },
  });
  return contacts;
}

export async function getContact(id: string) {
  return prisma.contact.findUnique({
    where: { id },
    include: { interactions: { orderBy: { date: "desc" } } },
  });
}

// ----- Portfolio stats for the CRM header ----------------------------------

export async function crmStats() {
  await ensureContactsSeeded();
  const contacts = await prisma.contact.findMany({
    select: { category: true, stage: true, lastContactAt: true },
  });

  const now = Date.now();
  const STALE_DAYS = 45;
  const staleCutoff = now - STALE_DAYS * 24 * 60 * 60 * 1000;

  const byCategory: Record<string, number> = {};
  const byStage: Record<string, number> = {};
  let stale = 0;
  for (const c of contacts) {
    byCategory[c.category] = (byCategory[c.category] ?? 0) + 1;
    byStage[c.stage] = (byStage[c.stage] ?? 0) + 1;
    if (c.stage !== "Dormant") {
      const last = c.lastContactAt ? c.lastContactAt.getTime() : 0;
      if (last < staleCutoff) stale += 1;
    }
  }

  // Upcoming follow-ups flagged on interactions (next 30 days or overdue).
  const soon = new Date(now + 30 * 24 * 60 * 60 * 1000);
  const followUps = await prisma.interaction.findMany({
    where: { followUpOn: { not: null, lte: soon } },
    orderBy: { followUpOn: "asc" },
    include: { contact: { select: { id: true, name: true, company: true } } },
    take: 8,
  });

  return {
    total: contacts.length,
    byCategory,
    byStage,
    stale,
    followUps: followUps.map((f) => ({
      id: f.id,
      contactId: f.contact.id,
      name: f.contact.name,
      company: f.contact.company,
      nextStep: f.nextStep,
      followUpOn: f.followUpOn,
      overdue: f.followUpOn ? f.followUpOn.getTime() < now : false,
    })),
  };
}

// ----- Writes --------------------------------------------------------------

export async function createContact(input: {
  name: string;
  title?: string | null;
  company?: string | null;
  email?: string | null;
  phone?: string | null;
  category?: string | null;
  stage?: string | null;
  owner?: string | null;
  location?: string | null;
  notes?: string | null;
}) {
  const name = (input.name ?? "").trim();
  if (!name) throw new Error("A contact name is required.");

  const category = (CATEGORIES as readonly string[]).includes(input.category ?? "")
    ? (input.category as string)
    : "Other";
  const stage = (STAGES as readonly string[]).includes(input.stage ?? "")
    ? (input.stage as string)
    : "Prospect";

  return prisma.contact.create({
    data: {
      name,
      title: clean(input.title),
      company: clean(input.company),
      email: clean(input.email),
      phone: clean(input.phone),
      category,
      stage,
      owner: clean(input.owner),
      location: clean(input.location),
      notes: clean(input.notes),
    },
  });
}

export async function addInteraction(
  contactId: string,
  input: {
    channel?: string | null;
    summary: string;
    sentiment?: string | null;
    nextStep?: string | null;
    followUpOn?: string | Date | null;
    date?: string | Date | null;
  }
) {
  const summary = (input.summary ?? "").trim();
  if (!summary) throw new Error("An interaction summary is required.");

  const channel = (CHANNELS as readonly string[]).includes(input.channel ?? "")
    ? (input.channel as string)
    : "Note";

  const date = input.date ? new Date(input.date) : new Date();
  const followUpOn = input.followUpOn ? new Date(input.followUpOn) : null;

  const interaction = await prisma.interaction.create({
    data: {
      contactId,
      channel,
      summary,
      sentiment: clean(input.sentiment),
      nextStep: clean(input.nextStep),
      followUpOn: followUpOn && !isNaN(followUpOn.getTime()) ? followUpOn : null,
      date: isNaN(date.getTime()) ? new Date() : date,
    },
  });

  // Keep the denormalised lastContactAt in step with the newest interaction.
  const newest = await prisma.interaction.findFirst({
    where: { contactId },
    orderBy: { date: "desc" },
    select: { date: true },
  });
  await prisma.contact.update({
    where: { id: contactId },
    data: { lastContactAt: newest?.date ?? interaction.date },
  });

  return interaction;
}

function clean(v: string | null | undefined): string | null {
  if (v == null) return null;
  const t = String(v).trim();
  return t.length ? t : null;
}

// ----- Seed ----------------------------------------------------------------
// Idempotent: if any Contact exists, does nothing. Called lazily by the CRM
// routes, mirroring lib/seed.ts. Contacts mirror the demo's KSA portfolio.

// Concurrency guard: several reads (listContacts + crmStats) can fire in the
// same request, each wanting a seeded table. Share one seeding promise so they
// don't race into a double-seed. Reset on failure so a later call can retry.
let seedPromise: Promise<void> | null = null;

export function ensureContactsSeeded(): Promise<void> {
  if (!seedPromise) {
    seedPromise = doSeed().catch((err) => {
      seedPromise = null;
      throw err;
    });
  }
  return seedPromise;
}

async function doSeed() {
  const count = await prisma.contact.count();
  if (count > 0) return;

  const daysAgo = (n: number) => new Date(Date.now() - n * 24 * 60 * 60 * 1000);
  const daysAhead = (n: number) => new Date(Date.now() + n * 24 * 60 * 60 * 1000);

  const seed: Array<{
    name: string;
    title?: string;
    company?: string;
    email?: string;
    phone?: string;
    category: string;
    stage: string;
    owner?: string;
    location?: string;
    notes?: string;
    interactions?: Array<{
      channel: string;
      summary: string;
      sentiment?: string;
      nextStep?: string;
      daysAgo: number;
      followUpInDays?: number;
    }>;
  }> = [
    {
      name: "Faisal Al-Rasheed",
      title: "Head of Real Assets",
      company: "Rasheed Family Office",
      email: "f.alrasheed@rasheedfo.sa",
      phone: "+966 55 120 4471",
      category: "LP",
      stage: "Committed",
      owner: "Matteo Bevilacqua",
      location: "Riyadh",
      notes: "Anchor LP in the GP Portfolio. Prefers quarterly in-person updates.",
      interactions: [
        {
          channel: "Meeting",
          summary:
            "Q1 performance review at their Olaya office. Pleased with 18.2% net IRR; asked for more detail on the Andalus concept-stage timeline.",
          sentiment: "Positive",
          nextStep: "Send Andalus Quarter development schedule and revised drawdown plan.",
          daysAgo: 12,
          followUpInDays: 9,
        },
        {
          channel: "Email",
          summary: "Forwarded the Q4 2025 distribution notice; confirmed receipt of SAR 14.2m.",
          sentiment: "Neutral",
          daysAgo: 40,
        },
      ],
    },
    {
      name: "Layla Nassar",
      title: "Investment Director",
      company: "Meridian Capital Partners",
      email: "layla.nassar@meridiancap.com",
      phone: "+971 50 998 2201",
      category: "LP",
      stage: "Active",
      owner: "Matteo Bevilacqua",
      location: "Dubai",
      notes: "Co-investor on the JV/LP vehicle. Focused on logistics exposure.",
      interactions: [
        {
          channel: "Call",
          summary:
            "Discussed appetite for a follow-on logistics allocation. Wants to see Nahdah Logistics occupancy trend before committing.",
          sentiment: "Positive",
          nextStep: "Share Nahdah Logistics rent roll and 24-month occupancy history.",
          daysAgo: 5,
          followUpInDays: 5,
        },
      ],
    },
    {
      name: "Omar Khaled",
      title: "Managing Partner",
      company: "Gulf Bridge Advisors",
      email: "omar@gulfbridge.sa",
      phone: "+966 54 771 3390",
      category: "Broker",
      stage: "Active",
      owner: "Sara Haddad",
      location: "Jeddah",
      notes: "Sourced Marina Tower. Reliable on Corniche mixed-use deal flow.",
      interactions: [
        {
          channel: "Meeting",
          summary:
            "Walked through two off-market Corniche retail assets. One fits the core-plus mandate at a ~7.3% NIY.",
          sentiment: "Positive",
          nextStep: "Request teasers for both assets to run through Deal Screening.",
          daysAgo: 3,
          followUpInDays: 4,
        },
      ],
    },
    {
      name: "Nadia Farouk",
      title: "Director, Real Estate Finance",
      company: "Saudi National Bank (SNB)",
      email: "n.farouk@snb.com.sa",
      phone: "+966 11 402 8890",
      category: "Lender",
      stage: "Active",
      owner: "Matteo Bevilacqua",
      location: "Riyadh",
      notes: "Relationship lender on Marina Tower and Nahdah Logistics facilities.",
      interactions: [
        {
          channel: "Email",
          summary:
            "Opened refinancing conversation for the Rawdah Plaza facility maturing Sep 2026. Indicative margin ~300bps.",
          sentiment: "Neutral",
          nextStep: "Model refi scenarios and send updated DSCR pack.",
          daysAgo: 20,
          followUpInDays: 14,
        },
      ],
    },
    {
      name: "Tariq Al-Mutairi",
      title: "Owner",
      company: "Al-Mutairi Holdings",
      email: "tariq@almutairih.sa",
      phone: "+966 50 330 7712",
      category: "Seller",
      stage: "Prospect",
      owner: "Sara Haddad",
      location: "Riyadh",
      notes: "Considering a partial sale of an Olaya office block. Early stage.",
      interactions: [
        {
          channel: "Note",
          summary:
            "Introduced by Gulf Bridge. Values expectations look full; monitor and revisit next quarter.",
          sentiment: "Neutral",
          daysAgo: 55,
        },
      ],
    },
    {
      name: "Huda Zahran",
      title: "Partner, Real Estate",
      company: "Zahran & Co Legal",
      email: "huda.zahran@zahranlegal.sa",
      phone: "+966 12 660 1120",
      category: "Advisor",
      stage: "Active",
      owner: "Matteo Bevilacqua",
      location: "Jeddah",
      notes: "External counsel on acquisitions and JV structuring.",
      interactions: [
        {
          channel: "Call",
          summary: "Aligned on the SPA timeline for the next acquisition; flagged a title diligence item.",
          sentiment: "Neutral",
          nextStep: "Send the target's title documents for review.",
          daysAgo: 8,
        },
      ],
    },
    {
      name: "Yousef Bin Saleh",
      title: "Head of Leasing",
      company: "Rawdah Retail Tenants Assoc.",
      email: "yousef@rawdaharetail.sa",
      phone: "+966 55 889 2043",
      category: "Tenant",
      stage: "Active",
      owner: "Sara Haddad",
      location: "Jeddah",
      notes: "Anchor tenant representative at Rawdah Plaza.",
      interactions: [
        {
          channel: "Meeting",
          summary: "Renewal discussion for the anchor lease; open to a 5-year extension with a CPI-linked review.",
          sentiment: "Positive",
          nextStep: "Draft renewal heads of terms.",
          daysAgo: 30,
          followUpInDays: 20,
        },
      ],
    },
    {
      name: "Reem Al-Dossari",
      title: "Portfolio Manager",
      company: "Falcon Pension Fund",
      email: "reem.aldossari@falconpf.sa",
      phone: "+966 11 559 4432",
      category: "LP",
      stage: "Prospect",
      owner: "Matteo Bevilacqua",
      location: "Riyadh",
      notes: "Institutional prospect for the next vintage. Long sales cycle.",
      interactions: [
        {
          channel: "Email",
          summary: "Sent the fund overview deck after an intro at the Riyadh real assets forum. Awaiting feedback.",
          sentiment: "Neutral",
          nextStep: "Follow up if no reply within two weeks.",
          daysAgo: 18,
          followUpInDays: -3,
        },
      ],
    },
  ];

  for (const c of seed) {
    const interactions = c.interactions ?? [];
    const lastDate = interactions.length
      ? daysAgo(Math.min(...interactions.map((i) => i.daysAgo)))
      : null;

    await prisma.contact.create({
      data: {
        name: c.name,
        title: c.title ?? null,
        company: c.company ?? null,
        email: c.email ?? null,
        phone: c.phone ?? null,
        category: c.category,
        stage: c.stage,
        owner: c.owner ?? null,
        location: c.location ?? null,
        notes: c.notes ?? null,
        lastContactAt: lastDate,
        interactions: {
          create: interactions.map((i) => ({
            channel: i.channel,
            summary: i.summary,
            sentiment: i.sentiment ?? null,
            nextStep: i.nextStep ?? null,
            date: daysAgo(i.daysAgo),
            followUpOn: i.followUpInDays != null ? daysAhead(i.followUpInDays) : null,
          })),
        },
      },
    });
  }
}
