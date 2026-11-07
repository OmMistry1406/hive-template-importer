import { NextResponse } from "next/server";
import { getDb } from "@/lib/db/client";

// Called daily by Vercel Cron. A real query counts as database activity, so
// Supabase's free tier does not pause the project for inactivity.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  try {
    const db = await getDb();
    const { rows } = await db.query<{ templates: number }>("select count(*)::int as templates from templates");
    return NextResponse.json({ ok: true, templates: rows[0].templates, at: new Date().toISOString() });
  } catch (error) {
    console.error("Health check failed", error);
    return NextResponse.json({ ok: false }, { status: 503 });
  }
}
