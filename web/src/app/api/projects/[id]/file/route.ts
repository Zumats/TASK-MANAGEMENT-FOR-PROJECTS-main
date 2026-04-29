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

  if (!(user.role === "admin" || user.role === "manager")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await ctx.params;
  const projectId = Number(id);
  if (!Number.isFinite(projectId)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const db = getDb();
  const row = db
    .prepare(
      "select id, file_path, file_name, file_content_type, file_size from projects where id = ?",
    )
    .get(projectId) as
    | { id: number; file_path: string | null; file_name: string | null; file_content_type: string | null; file_size: number | null }
    | undefined;

  if (!row?.file_path) return NextResponse.json({ error: "No file" }, { status: 404 });

  const uploadsDir = path.join(process.cwd(), ".data", "uploads");
  const filePath = path.join(uploadsDir, row.file_path);
  if (!fs.existsSync(filePath)) return NextResponse.json({ error: "File missing" }, { status: 404 });

  const data = fs.readFileSync(filePath);
  const name = row.file_name || "download";
  const download = req.nextUrl.searchParams.get("download") === "1";
  const disposition = download
    ? `attachment; filename="${encodeURIComponent(name)}"`
    : `inline; filename="${encodeURIComponent(name)}"`;

  return new NextResponse(data, {
    status: 200,
    headers: {
      "content-type": row.file_content_type || "application/octet-stream",
      "content-length": String(row.file_size ?? data.length),
      "content-disposition": disposition,
    },
  });
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  initDb();
  const user = requireUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!(user.role === "admin" || user.role === "manager")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await ctx.params;
  const projectId = Number(id);
  if (!Number.isFinite(projectId)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const db = getDb();
  const project = db.prepare("select id, file_path from projects where id = ?").get(projectId) as
    | { id: number; file_path: string | null }
    | undefined;
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "Invalid form data" }, { status: 400 });

  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Missing file" }, { status: 400 });

  const uploadsDir = path.join(process.cwd(), ".data", "uploads");
  if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

  if (project.file_path) {
    const oldPath = path.join(uploadsDir, project.file_path);
    try {
      if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
    } catch {
      /* ignore */
    }
  }

  const buf = Buffer.from(await file.arrayBuffer());
  const safeName = String(file.name || "file").replace(/[^a-zA-Z0-9._-]/g, "_");
  const storedName = `proj_${projectId}_${Date.now()}_${Math.random().toString(16).slice(2)}_${safeName}`;
  const storedPath = path.join(uploadsDir, storedName);
  fs.writeFileSync(storedPath, buf);

  const now = Date.now();
  const contentType = file.type || "application/octet-stream";
  const size = buf.length;

  db.prepare(
    "update projects set file_path = ?, file_name = ?, file_content_type = ?, file_size = ?, updated_at = ? where id = ?",
  ).run(storedName, file.name || safeName, contentType, size, now, projectId);

  return NextResponse.json({ ok: true, fileName: file.name || safeName });
}
