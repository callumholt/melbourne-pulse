import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { format } from "date-fns";

export const revalidate = 300;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const sql = getDb();
    const today = format(new Date(), "yyyy-MM-dd");
    const rows = await sql`
      SELECT * FROM get_precinct_today_hourly(${today}::date)
      WHERE precinct_id = ${id}
    `;
    return NextResponse.json(rows);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
