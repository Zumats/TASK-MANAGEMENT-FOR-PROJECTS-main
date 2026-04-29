import { NextResponse, type NextRequest } from "next/server";
import { initDb, getDb } from "@/server/db";
import { requireUser } from "@/server/http";

/** PATCH /api/admin/activity/[id]/read — marks a single activity log entry as read */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  initDb();
  const user = requireUser(req);
  if (!user || user.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const logId = Number(id);
  if (!Number.isFinite(logId)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  const db = getDb();
  try {
    db.prepare("UPDATE activity_logs SET is_read = 1 WHERE id = ?").run(logId);
  } catch {
    // best-effort
  }
  return NextResponse.json({ ok: true });
}
