import { NextResponse, type NextRequest } from "next/server";
import path from "path";
import fs from "fs";
import { initDb, getDb } from "@/server/db";
import { requireUser } from "@/server/http";

// GET /api/comment-files/[id] — serve a comment attachment file
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  initDb();
  const user = requireUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const fileId = Number(id);
  if (!Number.isFinite(fileId) || fileId <= 0) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  const db = getDb();
  const row = db.prepare("select id, name, path, content_type, size from comment_attachments where id = ?").get(fileId) as
    | { id: number; name: string; path: string; content_type: string; size: number }
    | undefined;

  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const uploadsDir = path.join(process.cwd(), ".data", "uploads");
  const filePath = path.join(uploadsDir, row.path);

  if (!fs.existsSync(filePath)) {
    return NextResponse.json({ error: "File not found on disk" }, { status: 404 });
  }

  const buf = fs.readFileSync(filePath);
  const download = req.nextUrl.searchParams.get("download") === "1";

  const headers = new Headers({
    "Content-Type": row.content_type || "application/octet-stream",
    "Content-Length": String(buf.length),
    "Cache-Control": "private, max-age=3600",
  });

  if (download) {
    headers.set("Content-Disposition", `attachment; filename="${row.name}"`);
  } else {
    headers.set("Content-Disposition", `inline; filename="${row.name}"`);
  }

  return new NextResponse(buf, { status: 200, headers });
}
