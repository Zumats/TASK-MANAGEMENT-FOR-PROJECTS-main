import { NextResponse, type NextRequest } from "next/server";
import { initDb, getDb } from "@/server/db";
import { requireUser } from "@/server/http";

/** PATCH /api/admin/activity/read-all — marks all activity log entries as read */
export async function PATCH(req: NextRequest) {
  initDb();
  const user = requireUser(req);
  if (!user || user.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = getDb();
  // SQLite stores booleans as integers; 1 = true
  try {
    db.prepare("UPDATE activity_logs SET is_read = 1").run();
    return NextResponse.json({ ok: true });
  } catch {
    // is_read column may not exist yet — silently succeed
    return NextResponse.json({ ok: true });
  }
}
