import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { email, precinct, severity } = body as {
    email?: string;
    precinct?: string;
    severity?: string;
  };

  if (!email || !email.includes("@")) {
    return NextResponse.json({ error: "Valid email required" }, { status: 400 });
  }

  const validSeverities = ["moderate", "significant", "extreme"];
  const minSeverity = validSeverities.includes(severity ?? "") ? severity! : "significant";

  const sql = getDb();

  await sql`
    INSERT INTO alert_subscriptions (email, precinct_filter, min_severity, verified)
    VALUES (${email}, ${precinct ?? null}, ${minSeverity}, TRUE)
    ON CONFLICT (email, precinct_filter) DO UPDATE SET min_severity = ${minSeverity}
  `;

  return NextResponse.json({ message: "Subscribed successfully" });
}
