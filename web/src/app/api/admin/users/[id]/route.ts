import { NextResponse, type NextRequest } from "next/server";
import { initDb, getDb } from "@/server/db";
import { requireUser, requireAdmin } from "@/server/http";

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  initDb();
  const user = requireUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    requireAdmin(user);
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await ctx.params;
  const targetId = Number(id);
  if (!Number.isFinite(targetId)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const db = getDb();

  // Handle approval workflow actions
  const action = body?.action == null ? null : String(body.action);
  if (action === "approve" || action === "reject" || action === "restore") {
    const newStatus = action === "approve" || action === "restore" ? "approved" : "rejected";
    db.prepare("update users set status = ?, updated_at = ? where id = ?").run(newStatus, Date.now(), targetId);
    // Notify the user
    const notifTitle = action === "approve" ? "Account approved" : action === "restore" ? "Account restored" : "Account rejected";
    const notifMsg = action === "approve"
      ? "Your account has been approved. You can now log in."
      : action === "restore"
      ? "Your account has been restored. You can now log in again."
      : "Your account registration was rejected. Please contact an administrator.";
    try {
      db.prepare("insert into notifications (user_id, title, message, task_id, created_at, read) values (?, ?, ?, null, ?, 0)").run(
        targetId, notifTitle, notifMsg, Date.now(),
      );
    } catch { /* non-critical */ }
    return NextResponse.json({ ok: true, status: newStatus });
  }

  const role = body?.role == null ? null : String(body.role);
  const department = body?.department == null ? null : String(body.department);

  if (role != null && role !== "admin" && role !== "manager" && role !== "user") {
    return NextResponse.json({ error: "Invalid role" }, { status: 400 });
  }

  const next: Record<string, unknown> = {};
  if (role != null) next.role = role;
  if (department != null) next.department = department;
  const keys = Object.keys(next);
  if (!keys.length) return NextResponse.json({ ok: true });

  next.updated_at = Date.now();
  const sets = [...keys, "updated_at"].map((k) => `${k} = ?`).join(", ");
  const values = [...keys.map((k) => next[k]), next.updated_at, targetId];

  db.prepare(`update users set ${sets} where id = ?`).run(...values);
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  initDb();
  const user = requireUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    requireAdmin(user);
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await ctx.params;
  const targetId = Number(id);
  if (!Number.isFinite(targetId)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const db = getDb();
  db.prepare("update users set status = 'deleted', updated_at = ? where id = ?").run(Date.now(), targetId);
  return NextResponse.json({ ok: true, status: "deleted" });
}
