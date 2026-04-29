import { NextResponse, type NextRequest } from "next/server";
import { initDb, getDb } from "@/server/db";
import { requireUser } from "@/server/http";
import { logActivity, ACTIONS } from "@/lib/activity";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  initDb();
  const user = requireUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const taskId = Number(id);
  if (!Number.isFinite(taskId)) {
    return NextResponse.json({ error: "Invalid task ID" }, { status: 400 });
  }

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const toUserId = Number(body?.to_user_id);

  if (!Number.isFinite(toUserId) || toUserId <= 0) {
    return NextResponse.json({ error: "Missing to_user_id" }, { status: 400 });
  }

  const db = getDb();
  
  // Verify task exists
  const task = db.prepare("select assigned_to, assigned_by, title, status from tasks where id = ?").get(taskId) as { assigned_to: number; assigned_by: number; title: string; status: string } | undefined;
  if (!task) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }
  const isAdmin = user.role === "admin" || user.role === "manager";
  if (!isAdmin && String(task.status) === "blocked") {
    return NextResponse.json({ error: "Task is blocked; sharing is disabled." }, { status: 403 });
  }

  // Check if already shared
  const existing = db.prepare("select id from task_shares where task_id = ? and to_user_id = ?").get(taskId, toUserId);
  if (existing) {
    return NextResponse.json({ message: "Task already shared with this user" });
  }

  // Look up the sharer's display name
  const sharerUser = db.prepare("select name, email from users where id = ?").get(user.id) as { name: string | null; email: string } | undefined;
  const sharerLabel = sharerUser?.name?.trim() || user.email;

  const now = Date.now();
  db.prepare(
    "insert into task_shares (task_id, from_user_id, to_user_id, created_at) values (?, ?, ?, ?)"
  ).run(taskId, user.id, toUserId, now);

  // Send notification to the recipient with task title
  db.prepare(
    "insert into notifications (user_id, title, message, task_id, created_at) values (?, ?, ?, ?, ?)"
  ).run(
    toUserId,
    "Task shared with you",
    `${sharerLabel} shared a task with you: ${task.title || `Task #${taskId}`}`,
    taskId,
    now
  );

  logActivity({
    actor_id: user.id,
    actor_name: sharerLabel,
    actor_role: user.role,
    action: ACTIONS.TASK_ASSIGNED,
    entity_type: "task",
    entity_id: taskId,
    entity_title: task.title,
    meta: { shareRecipient: toUserId },
    route_path: `/app/tasks/${taskId}`,
  });

  return NextResponse.json({ success: true });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  initDb();
  const user = requireUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const taskId = Number(id);
  const { searchParams } = new URL(req.url);
  const toUserId = Number(searchParams.get("to_user_id"));

  if (!Number.isFinite(taskId) || !Number.isFinite(toUserId)) {
    return NextResponse.json({ error: "Invalid parameters" }, { status: 400 });
  }

  const db = getDb();
  const task = db.prepare("select status from tasks where id = ?").get(taskId) as { status: string } | undefined;
  const isAdmin = user.role === "admin" || user.role === "manager";
  if (!task) return NextResponse.json({ error: "Task not found" }, { status: 404 });
  if (!isAdmin && String(task.status) === "blocked") {
    return NextResponse.json({ error: "Task is blocked; sharing is disabled." }, { status: 403 });
  }
  db.prepare("delete from task_shares where task_id = ? and to_user_id = ?").run(taskId, toUserId);

  return NextResponse.json({ success: true });
}
