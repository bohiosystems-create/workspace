import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET() {
  const deals = await prisma.deal.findMany({
    orderBy: { createdAt: "desc" },
    take: 50,
    select: {
      id: true,
      createdAt: true,
      assetName: true,
      assetType: true,
      location: true,
      fund: true,
      verdict: true,
    },
  });
  return NextResponse.json({ deals });
}
