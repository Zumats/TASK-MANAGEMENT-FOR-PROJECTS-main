import { NextResponse, type NextRequest } from "next/server";
import { initDb, getDb } from "@/server/db";
import { requireUser } from "@/server/http";

export async function GET(req: NextRequest) {
  initDb();
  const u = requireUser(req);
  if (!u) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = u.id;

  const db = getDb();
  const rows = db
    .prepare("select id, title, message, task_id, created_at, read from notifications where user_id = ? order by created_at desc limit 50")
    .all(userId);

  return NextResponse.json({ items: rows });
}

// POST /api/notifications — admin sends a notification to a user
export async function POST(req: NextRequest) {
  initDb();
  const u = requireUser(req);
  if (!u) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userRole = u.role;

  if (userRole !== "admin" && userRole !== "manager") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const targetUserId = Number(body.user_id);
  const title = String(body.title ?? "Notification");
  const message = String(body.message ?? "");
  const taskId = body.task_id != null && Number.isFinite(Number(body.task_id)) ? Number(body.task_id) : null;

  if (!Number.isFinite(targetUserId) || targetUserId <= 0) {
    return NextResponse.json({ error: "Invalid user_id" }, { status: 400 });
  }

  const db = getDb();
  const now = Date.now();
  db.prepare("insert into notifications (user_id, title, message, task_id, created_at, read) values (?, ?, ?, ?, ?, 0)")
    .run(targetUserId, title, message, taskId, now);

  return NextResponse.json({ ok: true });
}

// PATCH /api/notifications — mark one as read
export async function PATCH(req: NextRequest) {
  initDb();
  const u = requireUser(req);
  if (!u) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { id?: number } | null;
  if (!body?.id) return NextResponse.json({ error: "Invalid ID" }, { status: 400 });

  const db = getDb();
  db.prepare("update notifications set read = 1 where id = ? and user_id = ?").run(body.id, u.id);

  return NextResponse.json({ ok: true });
}

// PUT /api/notifications — mark all as read for current user
export async function PUT(req: NextRequest) {
  initDb();
  const u = requireUser(req);
  if (!u) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = getDb();
  db.prepare("update notifications set read = 1 where user_id = ?").run(u.id);

  return NextResponse.json({ ok: true });
}
