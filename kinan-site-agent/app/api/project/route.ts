import { NextResponse } from "next/server";
import { getRepo } from "@/lib/store";

export const dynamic = "force-dynamic";

/** Project dataset for the Project tab. */
export async function GET() {
  return NextResponse.json((await getRepo()).db.data);
}
