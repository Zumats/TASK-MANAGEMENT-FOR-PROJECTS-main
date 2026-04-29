import { NextResponse, type NextRequest } from "next/server";
import path from "path";
import fs from "fs";
import { z } from "zod";
import { initDb, getDb } from "@/server/db";
import { requireUser } from "@/server/http";

const PatchProjectSchema = z.object({
  name: z.string().min(1).max(100).trim().optional(),
  description: z.string().max(1000).trim().optional(),
  link_url: z.string().max(2000).trim().optional(),
  linkUrl: z.string().max(2000).trim().optional(),
  clear_file: z.boolean().optional(),
  clearFile: z.boolean().optional(),
});

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
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

  const rawBody = await req.json().catch(() => null);
  const parsed = PatchProjectSchema.safeParse(rawBody);
  if (!parsed.success) {
    const messages = parsed.error.issues.map((e) => `${e.path.join(".")}: ${e.message}`).join("; ");
    return NextResponse.json({ error: messages }, { status: 400 });
  }

  const body = parsed.data;
  const db = getDb();
  
  const project = db
    .prepare("select id, file_path from projects where id = ?")
    .get(projectId) as { id: number; file_path: string | null } | undefined;
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const next: Record<string, unknown> = {};
  if (body.name != null) next.name = body.name;
  if (body.description != null) next.description = body.description;
  const linkVal = body.linkUrl ?? body.link_url;
  if (linkVal !== undefined) {
    const t = String(linkVal).trim();
    next.link_url = t.length ? t : null;
  }

  const clearFile = Boolean(body.clearFile ?? body.clear_file);
  if (clearFile && project.file_path) {
    const uploadsDir = path.join(process.cwd(), ".data", "uploads");
    const oldPath = path.join(uploadsDir, project.file_path);
    try {
      if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
    } catch {
      /* ignore */
    }
    next.file_path = null;
    next.file_name = null;
    next.file_content_type = null;
    next.file_size = null;
  }

  const keys = Object.keys(next);
  if (!keys.length) return NextResponse.json({ ok: true });

  next.updated_at = Date.now();
  const sets = [...keys, "updated_at"].map((k) => `${k} = ?`).join(", ");
  const values = [...keys.map((k) => next[k]), next.updated_at, projectId];
  db.prepare(`update projects set ${sets} where id = ?`).run(...values);

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  initDb();
  const user = requireUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (user.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await ctx.params;
  const projectId = Number(id);
  if (!Number.isFinite(projectId)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const db = getDb();
  const row = db.prepare("select file_path from projects where id = ?").get(projectId) as
    | { file_path: string | null }
    | undefined;
  if (row?.file_path) {
    const uploadsDir = path.join(process.cwd(), ".data", "uploads");
    const fp = path.join(uploadsDir, row.file_path);
    try {
      if (fs.existsSync(fp)) fs.unlinkSync(fp);
    } catch {
      /* ignore */
    }
  }
  db.prepare("delete from projects where id = ?").run(projectId);
  
  return NextResponse.json({ ok: true });
}
