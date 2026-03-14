import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { getDb } from "@/lib/db";
import { compileWeeklyDigest, formatDigestEmail } from "@/lib/digest";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  // Verify this is a Vercel cron or authorised request
  const isVercelCron = req.headers.get("x-vercel-cron") === "true";
  if (!isVercelCron) {
    const cronSecret = process.env.CRON_SECRET;
    const secret = req.nextUrl.searchParams.get("secret") || req.headers.get("authorization")?.replace("Bearer ", "");
    if (secret !== cronSecret) {
      return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
    }
  }

  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) {
    return NextResponse.json({ error: "RESEND_API_KEY not configured" }, { status: 503 });
  }

  const resend = new Resend(resendKey);
  const sql = getDb();

  // Get all verified subscribers
  const subs = await sql`
    SELECT DISTINCT email FROM alert_subscriptions WHERE verified = TRUE
  `;

  if (subs.length === 0) {
    return NextResponse.json({ message: "No subscribers" });
  }

  // Compile digest
  const data = await compileWeeklyDigest();
  const { subject, text } = formatDigestEmail(data);

  let sent = 0;
  for (const sub of subs) {
    try {
      await resend.emails.send({
        from: "Melbourne Pulse <digest@melbourne-pulse.vercel.app>",
        to: String(sub.email),
        subject,
        text,
      });
      sent++;
    } catch (err) {
      console.error(`Failed to send digest to ${sub.email}:`, err);
    }
  }

  return NextResponse.json({
    message: "Digest sent",
    subscribers: subs.length,
    sent,
    totalCount: data.totalCount,
    anomalyCount: data.anomalyCount,
  });
}
