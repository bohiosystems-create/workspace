import { NextResponse } from "next/server";
import { dbStamp } from "@/lib/store";
import { latestChange } from "@/lib/live";

export const dynamic = "force-dynamic";

// GET -> { v, last }: the database's change stamp (polled every few seconds by open pages, so WhatsApp updates appear
// without a refresh) and the newest change in words, for the "updated" toast.
export async function GET() {
  const { v, repo } = await dbStamp();
  return NextResponse.json({ v, last: latestChange(repo.db) }, { headers: { "Cache-Control": "no-store" } });
}
