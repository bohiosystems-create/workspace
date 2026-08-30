import { NextResponse } from "next/server";
import { listContacts, createContact, crmStats } from "@/lib/crm";

export const runtime = "nodejs";

// GET → contact list (with optional filters) + CRM stats for the header.
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const category = searchParams.get("category") ?? undefined;
  const stage = searchParams.get("stage") ?? undefined;
  const q = searchParams.get("q") ?? undefined;

  const [contacts, stats] = await Promise.all([
    listContacts({ category, stage, q }),
    crmStats(),
  ]);
  return NextResponse.json({ contacts, stats });
}

// POST → create a contact.
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const contact = await createContact(body);
    return NextResponse.json({ contact }, { status: 201 });
  } catch (err: any) {
    console.error("create contact error", err);
    return NextResponse.json(
      { error: err?.message ?? "Could not create the contact." },
      { status: 400 }
    );
  }
}
