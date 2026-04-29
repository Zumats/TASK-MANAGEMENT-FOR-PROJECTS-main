import { NextResponse, type NextRequest } from "next/server";
import { initDb, getDb } from "@/server/db";
import { requireUser } from "@/server/http";

// PATCH /api/notifications/read-all — mark all notifications as read
export async function PATCH(req: NextRequest) {
  initDb();
  const u = requireUser(req);
  if (!u) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = u.id;

  const db = getDb();
  db.prepare("update notifications set read = 1 where user_id = ?").run(userId);
  return NextResponse.json({ ok: true });
}
