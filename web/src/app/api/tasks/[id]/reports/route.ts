import { NextResponse, type NextRequest } from "next/server";
import { initDb, getDb } from "@/server/db";
import { requireUser } from "@/server/http";

// GET /api/tasks/[id]/reports - Fetch timer stop reports
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    initDb();
    const user = requireUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await ctx.params;
    const taskId = Number(id);
    if (!Number.isFinite(taskId)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

    const db = getDb();
    const task = db.prepare("select assigned_to, status from tasks where id = ?").get(taskId) as { assigned_to: number; status: string } | undefined;
    if (!task) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const isAdmin = user.role === "admin" || user.role === "manager";
    const isOwner = task.assigned_to === user.id;
    const isShared = Boolean(
      db
        .prepare("select id from task_shares where task_id = ? and to_user_id = ?")
        .get(taskId, user.id),
    );
    if (!isAdmin && !isOwner && !isShared) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const reports = db.prepare(`
      SELECT r.id, r.task_id as taskId, r.user_id as userId, r.elapsed_seconds as elapsedSeconds,
             r.stop_note as stopNote, r.created_at as createdAt, u.email as userEmail, u.name as userName
      FROM timer_reports r
      JOIN users u ON r.user_id = u.id
      WHERE r.task_id = ?
      ORDER BY r.created_at DESC
    `).all(taskId);

    return NextResponse.json({ items: reports });
  } catch (err: unknown) {
    console.error("[reports GET] Unhandled error:", err);
    const message = err instanceof Error ? err.message : "Internal Server Error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// POST /api/tasks/[id]/reports - Create a timer stop report
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    initDb();
    const user = requireUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await ctx.params;
    const taskId = Number(id);
    if (!Number.isFinite(taskId)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

    const db = getDb();
    const task = db.prepare("select assigned_to, status from tasks where id = ?").get(taskId) as { assigned_to: number; status: string } | undefined;
    if (!task) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const isAdmin = user.role === "admin" || user.role === "manager";
    const isOwner = task.assigned_to === user.id;
    if (!isAdmin && String(task.status) === "blocked") {
      return NextResponse.json({ error: "Task is blocked; reports are disabled." }, { status: 403 });
    }
    if (!isOwner) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    const elapsedSeconds = Math.max(0, Number(body?.elapsed_seconds ?? body?.elapsedSeconds ?? 0));
    const stopNote = body?.stop_note != null ? String(body.stop_note).trim() : null;

    const now = Date.now();
    const result = db.prepare(
      "insert into timer_reports (task_id, user_id, elapsed_seconds, stop_note, created_at) values (?, ?, ?, ?, ?)"
    ).run(taskId, user.id, elapsedSeconds, stopNote, now);

    return NextResponse.json({ id: result.lastInsertRowid, ok: true });
  } catch (err: unknown) {
    console.error("[reports POST] Unhandled error:", err);
    const message = err instanceof Error ? err.message : "Internal Server Error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
