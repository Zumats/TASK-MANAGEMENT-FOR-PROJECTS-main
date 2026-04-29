import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { initDb, getDb } from "@/server/db";
import { requireUser } from "@/server/http";

const CreateProjectSchema = z.object({
  name: z.string().min(1, "Name is required").max(100).trim(),
  description: z.string().max(1000).trim().optional().default(""),
  link_url: z.string().max(2000).trim().optional().default(""),
  linkUrl: z.string().max(2000).trim().optional(),
});

export async function GET(req: NextRequest) {
  initDb();
  const user = requireUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = getDb();
  const rows = db.prepare(`
    SELECT 
      p.id, 
      p.name, 
      p.description, 
      p.created_at as createdAt, 
      p.updated_at as updatedAt,
      p.link_url as linkUrl,
      p.file_name as fileName,
      CASE WHEN p.file_path IS NOT NULL AND length(trim(p.file_path)) > 0 THEN 1 ELSE 0 END as hasFile,
      COUNT(t.id) as taskCount
    FROM projects p
    LEFT JOIN tasks t ON p.id = t.project_id
    GROUP BY p.id
    ORDER BY p.created_at DESC
  `).all() as Array<Record<string, unknown> & { id: number }>;

  const assigneeRows = db
    .prepare(
      `
    SELECT DISTINCT t.project_id as projectId, u.id as userId, u.email as email, u.name as name, u.avatar_url as avatarUrl
    FROM tasks t
    JOIN users u ON u.id = t.assigned_to
    WHERE t.project_id IS NOT NULL
    UNION
    SELECT DISTINCT t.project_id as projectId, u.id as userId, u.email as email, u.name as name, u.avatar_url as avatarUrl
    FROM task_shares ts
    JOIN tasks t ON t.id = ts.task_id
    JOIN users u ON u.id = ts.to_user_id
    WHERE t.project_id IS NOT NULL
  `,
    )
    .all() as Array<{
      projectId: number;
      userId: number;
      email: string;
      name: string | null;
      avatarUrl: string | null;
    }>;

  const byProject = new Map<
    string,
    Map<number, { id: string; email: string; name: string | null; avatarUrl: string | null }>
  >();
  for (const r of assigneeRows) {
    const pid = String(r.projectId);
    if (!byProject.has(pid)) byProject.set(pid, new Map());
    const m = byProject.get(pid)!;
    if (!m.has(r.userId)) {
      m.set(r.userId, {
        id: String(r.userId),
        email: r.email,
        name: r.name,
        avatarUrl: r.avatarUrl,
      });
    }
  }

  const items = rows.map((row) => {
    const pid = String(row.id);
    const assignees = Array.from((byProject.get(pid) ?? new Map()).values());
    return { ...row, assignees };
  });

  return NextResponse.json({ items });
}

export async function POST(req: NextRequest) {
  initDb();
  const user = requireUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!(user.role === "admin" || user.role === "manager")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const rawBody = await req.json().catch(() => null);
  const parsed = CreateProjectSchema.safeParse(rawBody);
  if (!parsed.success) {
    const messages = parsed.error.issues.map((e) => `${e.path.join(".")}: ${e.message}`).join("; ");
    return NextResponse.json({ error: messages }, { status: 400 });
  }

  const { name, description } = parsed.data;
  const linkUrl = (parsed.data.linkUrl ?? parsed.data.link_url ?? "").trim() || null;
  const db = getDb();
  const now = Date.now();

  const r = db
    .prepare(
      "insert into projects (name, description, link_url, created_at, updated_at) values (?, ?, ?, ?, ?)",
    )
    .run(name, description, linkUrl, now, now);

  const projectId = Number(r.lastInsertRowid);
  
  return NextResponse.json({
    id: projectId,
    name,
    description,
    linkUrl: linkUrl ?? "",
    fileName: null,
    hasFile: 0,
    createdAt: now,
    updatedAt: now,
  });
}
