import { NextResponse, type NextRequest } from "next/server";
import path from "path";
import fs from "fs";
import { initDb, getDb } from "@/server/db";
import { requireUser } from "@/server/http";

// POST /api/tasks/[id]/comments/[commentId]/attachments
// Upload a file attached to a specific comment
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; commentId: string }> }
) {
  initDb();
  const user = requireUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: taskIdStr, commentId: commentIdStr } = await params;
  const taskId = Number(taskIdStr);
  const commentId = Number(commentIdStr);

  if (!Number.isFinite(taskId) || taskId <= 0) return NextResponse.json({ error: "Invalid taskId" }, { status: 400 });
  if (!Number.isFinite(commentId) || commentId <= 0) return NextResponse.json({ error: "Invalid commentId" }, { status: 400 });

  const db = getDb();

  // Verify comment belongs to this task and user has access
  const comment = db.prepare("select id, task_id, user_id from task_comments where id = ? and task_id = ?").get(commentId, taskId) as
    | { id: number; task_id: number; user_id: number }
    | undefined;
  if (!comment) return NextResponse.json({ error: "Comment not found" }, { status: 404 });

  const isAdmin = user!.role === "admin" || user!.role === "manager";
  if (!isAdmin && comment.user_id !== user!.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "Invalid form data" }, { status: 400 });

  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Missing file" }, { status: 400 });

  const uploadsDir = path.join(process.cwd(), ".data", "uploads");
  if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

  const buf = Buffer.from(await file.arrayBuffer());
  const safeName = String(file.name || "file").replace(/[^a-zA-Z0-9._-]/g, "_");
  const storedName = `ca_${Date.now()}_${Math.random().toString(16).slice(2)}_${safeName}`;
  const storedPath = path.join(uploadsDir, storedName);
  fs.writeFileSync(storedPath, buf);

  const now = Date.now();
  const contentType = file.type || "application/octet-stream";
  const size = buf.length;

  const r = db
    .prepare(
      "insert into comment_attachments (comment_id, task_id, uploaded_by, name, path, content_type, size, created_at) values (?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .run(commentId, taskId, user!.id, file.name || safeName, storedName, contentType, size, now);

  const attachId = Number(r.lastInsertRowid);
  return NextResponse.json({ id: attachId, name: file.name || safeName, url: `/api/comment-files/${attachId}`, contentType, size });
}

// GET /api/tasks/[id]/comments/[commentId]/attachments
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; commentId: string }> }
) {
  initDb();
  const user = requireUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: taskIdStr, commentId: commentIdStr } = await params;
  const taskId = Number(taskIdStr);
  const commentId = Number(commentIdStr);

  const db = getDb();
  const rows = db.prepare(
    "select id, name, content_type, size, created_at from comment_attachments where comment_id = ? and task_id = ? order by created_at asc"
  ).all(commentId, taskId) as Array<{ id: number; name: string; content_type: string; size: number; created_at: number }>;

  const items = rows.map(r => ({
    id: r.id,
    name: r.name,
    contentType: r.content_type,
    size: r.size,
    createdAt: r.created_at,
    url: `/api/comment-files/${r.id}`,
  }));

  return NextResponse.json({ items });
}
