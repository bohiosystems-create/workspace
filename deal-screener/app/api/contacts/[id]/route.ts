import { NextResponse } from "next/server";
import { getContact } from "@/lib/crm";

export const runtime = "nodejs";

// GET → one contact with its full interaction timeline.
export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const contact = await getContact(params.id);
  if (!contact) {
    return NextResponse.json({ error: "Contact not found." }, { status: 404 });
  }
  return NextResponse.json({ contact });
}
