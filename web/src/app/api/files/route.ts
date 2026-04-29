import { NextResponse, type NextRequest } from "next/server";
import path from "path";
import fs from "fs";
import { initDb, getDb } from "@/server/db";
import { requireUser } from "@/server/http";

export async function POST(req: NextRequest) {
  initDb();
  const user = requireUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "Invalid form data" }, { status: 400 });

  const taskIdRaw = String(form.get("taskId") ?? "");
  const taskId = Number(taskIdRaw);
  if (!Number.isFinite(taskId) || taskId <= 0) return NextResponse.json({ error: "Invalid taskId" }, { status: 400 });

  const checklistItemIdRaw = form.get("checklistItemId");
  const checklistItemId = checklistItemIdRaw ? Number(checklistItemIdRaw) : null;

  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Missing file" }, { status: 400 });

  const db = getDb();
  const task = db.prepare("select id, assigned_to, assigned_by from tasks where id = ?").get(taskId) as
    | { id: number; assigned_to: number; assigned_by: number }
    | undefined;
  if (!task) return NextResponse.json({ error: "Task not found" }, { status: 404 });

  const isAdmin = user.role === "admin";
  const isManager = user.role === "manager";
  const isOwner = task.assigned_to === user.id;

  let isShared = false;
  if (!isAdmin && !isManager && !isOwner) {
    const share = db.prepare("select id from task_shares where task_id = ? and to_user_id = ?").get(taskId, user.id);
    if (share) isShared = true;
  }

  if (!(isAdmin || isManager || isOwner || isShared)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const uploadsDir = path.join(process.cwd(), ".data", "uploads");
  if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

  const buf = Buffer.from(await file.arrayBuffer());
  const safeName = String(file.name || "file").replace(/[^a-zA-Z0-9._-]/g, "_");
  const storedName = `${Date.now()}_${Math.random().toString(16).slice(2)}_${safeName}`;
  const storedPath = path.join(uploadsDir, storedName);
  fs.writeFileSync(storedPath, buf);

  const now = Date.now();
  const contentType = file.type || "application/octet-stream";
  const size = buf.length;

  const r = db
    .prepare(
      "insert into attachments (task_id, checklist_item_id, uploaded_by, name, path, content_type, size, created_at) values (?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .run(taskId, checklistItemId, user.id, file.name || safeName, storedName, contentType, size, now);

  const id = Number(r.lastInsertRowid);
  return NextResponse.json({ id, checklistItemId });
}
