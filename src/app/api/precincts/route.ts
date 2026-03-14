import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export const revalidate = 300;

export async function GET() {
  try {
    const sql = getDb();
    const rows = await sql`SELECT * FROM precinct_current_activity ORDER BY total_count DESC`;
    return NextResponse.json(rows);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
