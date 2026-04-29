import { NextResponse, type NextRequest } from "next/server";
import { initDb, getDb } from "@/server/db";
import { requireUser } from "@/server/http";

export type SearchHit = {
  type: "task" | "project" | "user" | "announcement" | "comment";
  id: string;
  title: string;
  snippet: string;
  /** For comment hits: open this task */
  taskId?: string;
};

function sanitizeLike(q: string): string {
  return q.replace(/[%_\\]/g, "").trim().slice(0, 120);
}

export async function GET(req: NextRequest) {
  initDb();
  const user = requireUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const rawQ = searchParams.get("q") ?? "";
  const q = sanitizeLike(rawQ);
  const limit = Math.min(25, Math.max(1, Number(searchParams.get("limit")) || 12));

  if (q.length < 2) {
    return NextResponse.json({ items: [] as SearchHit[] });
  }

  const db = getDb();
  const isAdmin = user.role === "admin" || user.role === "manager";
  const pattern = `%${q}%`;
  const hits: SearchHit[] = [];

  const taskRows = db
    .prepare(
      `select id, title, description from tasks 
       where title like ? or description like ? 
       order by updated_at desc limit ?`,
    )
    .all(pattern, pattern, limit) as Array<{ id: number; title: string; description: string }>;

  for (const t of taskRows) {
    const text = `${t.title} ${t.description || ""}`;
    const idx = text.toLowerCase().indexOf(q.toLowerCase());
    const snippet =
      idx >= 0
        ? text.slice(Math.max(0, idx - 40), idx + q.length + 60).trim()
        : (t.description || t.title).slice(0, 120);
    hits.push({
      type: "task",
      id: String(t.id),
      title: t.title,
      snippet: snippet || t.title,
    });
  }

  if (isAdmin) {
    const projRows = db
      .prepare(
        `select id, name, description, link_url from projects 
         where name like ? or description like ? or ifnull(link_url,'') like ? 
         order by updated_at desc limit ?`,
      )
      .all(pattern, pattern, pattern, Math.min(8, limit)) as Array<{
        id: number;
        name: string;
        description: string;
        link_url: string | null;
      }>;
    for (const p of projRows) {
      hits.push({
        type: "project",
        id: String(p.id),
        title: p.name,
        snippet: (p.description || p.name).slice(0, 140),
      });
    }
  }

  const userRows = db
    .prepare(
      `select id, email, name, bio from users 
       where email like ? or ifnull(name,'') like ? or ifnull(bio,'') like ? 
       order by email asc limit ?`,
    )
    .all(pattern, pattern, pattern, Math.min(8, limit)) as Array<{ id: number; email: string; name: string | null; bio: string | null }>;
  for (const u of userRows) {
    if (!isAdmin && u.id !== user.id) continue;
    const label = u.name?.trim() || u.email;
    hits.push({
      type: "user",
      id: String(u.id),
      title: label,
      snippet: u.email + (u.bio ? ` — ${u.bio.slice(0, 80)}` : ""),
    });
  }

  if (isAdmin) {
    try {
      const annRows = db
        .prepare(
          `select id, title, body from announcements 
           where title like ? or body like ? 
           order by created_at desc limit ?`,
        )
        .all(pattern, pattern, 6) as Array<{ id: string; title: string; body: string }>;
      for (const a of annRows) {
        hits.push({
          type: "announcement",
          id: a.id,
          title: a.title,
          snippet: a.body.slice(0, 140),
        });
      }
    } catch {
      /* announcements table missing */
    }

    const commentRows = db
      .prepare(
        `select tc.id, tc.message, t.title as task_title, t.id as task_id 
         from task_comments tc 
         join tasks t on t.id = tc.task_id 
         where tc.message like ? 
         order by tc.created_at desc limit ?`,
      )
      .all(pattern, 6) as Array<{ id: number; message: string; task_title: string; task_id: number }>;
    for (const c of commentRows) {
      hits.push({
        type: "comment",
        id: String(c.id),
        taskId: String(c.task_id),
        title: `Comment on “${c.task_title}”`,
        snippet: c.message.slice(0, 160),
      });
    }
  }

  hits.sort((a, b) => {
    const sa = a.title.toLowerCase().includes(q.toLowerCase()) ? 0 : 1;
    const sb = b.title.toLowerCase().includes(q.toLowerCase()) ? 0 : 1;
    return sa - sb;
  });

  return NextResponse.json({ items: hits.slice(0, limit), q });
}
