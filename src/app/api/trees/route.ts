import { NextRequest, NextResponse } from "next/server";
import { getTreesForMap } from "@/lib/tree-queries";

export const revalidate = 3600; // Cache for 1 hour

export async function GET(req: NextRequest) {
  const precinct = req.nextUrl.searchParams.get("precinct") ?? undefined;

  try {
    const trees = await getTreesForMap(precinct);
    return NextResponse.json(trees);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
