import { NextResponse } from "next/server";
import { getContact } from "@/lib/crm";
import { draftFollowUpEmail } from "@/lib/claude";

export const runtime = "nodejs";
export const maxDuration = 60;

// POST → draft a follow-up email to this contact from their history.
// Optional body: { instruction, senderName }.
export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const contact = await getContact(params.id);
    if (!contact) {
      return NextResponse.json({ error: "Contact not found." }, { status: 404 });
    }

    const body = await req.json().catch(() => ({}));

    const email = await draftFollowUpEmail({
      contact: {
        name: contact.name,
        title: contact.title,
        company: contact.company,
        category: contact.category,
        stage: contact.stage,
      },
      interactions: contact.interactions.map((i) => ({
        date: i.date.toISOString().slice(0, 10),
        channel: i.channel,
        summary: i.summary,
        nextStep: i.nextStep,
      })),
      instruction: body.instruction ?? null,
      senderName: body.senderName ?? null,
    });

    return NextResponse.json({ email });
  } catch (err: any) {
    console.error("followup draft error", err);
    const message =
      err?.status === 401
        ? "Authentication failed — check ANTHROPIC_API_KEY."
        : err?.message ?? "Could not draft the follow-up.";
    return NextResponse.json({ error: message }, { status: err?.status ?? 500 });
  }
}
