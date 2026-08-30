import { NextResponse } from "next/server";
import { getContact, addInteraction } from "@/lib/crm";
import { parseInteractionNote } from "@/lib/claude";

export const runtime = "nodejs";
export const maxDuration = 60;

// POST → log an interaction.
// Two modes:
//   { note }                              → Claude parses the freeform note into a
//                                           structured entry, then files it.
//   { channel, summary, sentiment, ... }  → file the structured entry directly.
export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const contact = await getContact(params.id);
    if (!contact) {
      return NextResponse.json({ error: "Contact not found." }, { status: 404 });
    }

    const body = await req.json();

    if (body.note && typeof body.note === "string") {
      const parsed = await parseInteractionNote({
        note: body.note,
        contactName: contact.name,
        company: contact.company,
      });
      const followUpOn =
        parsed.followUpInDays != null
          ? new Date(Date.now() + parsed.followUpInDays * 24 * 60 * 60 * 1000)
          : null;
      const interaction = await addInteraction(params.id, {
        channel: parsed.channel,
        summary: parsed.summary,
        sentiment: parsed.sentiment,
        nextStep: parsed.nextStep,
        followUpOn,
      });
      return NextResponse.json({ interaction, parsed }, { status: 201 });
    }

    const interaction = await addInteraction(params.id, {
      channel: body.channel,
      summary: body.summary,
      sentiment: body.sentiment,
      nextStep: body.nextStep,
      followUpOn: body.followUpOn,
      date: body.date,
    });
    return NextResponse.json({ interaction }, { status: 201 });
  } catch (err: any) {
    console.error("log interaction error", err);
    const message =
      err?.status === 401
        ? "Authentication failed — check ANTHROPIC_API_KEY."
        : err?.message ?? "Could not log the interaction.";
    return NextResponse.json({ error: message }, { status: err?.status ?? 400 });
  }
}
