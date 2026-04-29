import { NextResponse, type NextRequest } from "next/server";
import path from "path";
import fs from "fs";
import { initDb, getDb } from "@/server/db";
import { requireUser } from "@/server/http";

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  initDb();
  const user = requireUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await ctx.params;
  const attId = Number(id);
  if (!Number.isFinite(attId) || attId <= 0) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const db = getDb();
  const att = db
    .prepare(
      "select a.id, a.task_id, a.name, a.path, a.content_type, a.size, t.assigned_to from attachments a join tasks t on t.id = a.task_id where a.id = ?",
    )
    .get(attId) as
    | { id: number; task_id: number; name: string; path: string; content_type: string; size: number; assigned_to: number }
    | undefined;

  if (!att) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const isAdmin = user.role === "admin";
  const isManager = user.role === "manager";
  const isOwner = att.assigned_to === user.id;
  if (!(isAdmin || isManager || isOwner)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const uploadsDir = path.join(process.cwd(), ".data", "uploads");
  const filePath = path.join(uploadsDir, att.path);
  if (!fs.existsSync(filePath)) return NextResponse.json({ error: "File missing" }, { status: 404 });

  const data = fs.readFileSync(filePath);
  const download = req.nextUrl.searchParams.get("download") === "1";
  const disposition = download
    ? `attachment; filename="${encodeURIComponent(att.name)}"`
    : `inline; filename="${encodeURIComponent(att.name)}"`;
  return new NextResponse(data, {
    status: 200,
    headers: {
      "content-type": att.content_type || "application/octet-stream",
      "content-length": String(att.size ?? data.length),
      "content-disposition": disposition,
    },
  });
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  initDb();
  const user = requireUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await ctx.params;
  const attId = Number(id);
  if (!Number.isFinite(attId) || attId <= 0) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const db = getDb();
  const att = db
    .prepare(
      "select a.id, a.task_id, a.path, a.uploaded_by, t.assigned_to from attachments a join tasks t on t.id = a.task_id where a.id = ?",
    )
    .get(attId) as | { id: number; task_id: number; path: string; uploaded_by: number; assigned_to: number } | undefined;

  if (!att) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const isAdmin = user.role === "admin";
  const isManager = user.role === "manager";
  const uploadedByMe = att.uploaded_by === user.id;
  // Rule: admin/manager can remove any attachment; regular users can remove only their own uploads.
  if (!(isAdmin || isManager || uploadedByMe)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const uploadsDir = path.join(process.cwd(), ".data", "uploads");
  const filePath = path.join(uploadsDir, att.path);

  // Delete DB row first (so attachment disappears immediately even if file missing)
  db.prepare("delete from attachments where id = ?").run(attId);

  // Best-effort file delete
  try {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch {
    // ignore
  }

  return NextResponse.json({ ok: true });
}
