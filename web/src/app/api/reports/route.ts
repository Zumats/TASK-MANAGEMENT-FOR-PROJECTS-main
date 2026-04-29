import { NextRequest, NextResponse } from "next/server";
import { initDb, getDb } from "@/server/db";
import { requireUser } from "@/server/http";

export async function GET(req: NextRequest) {
  initDb();
  const user = requireUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const db = getDb();

  const rows = (user.role === "admin" || user.role === "manager"
    ? db.prepare(
        `select r.id, r.user_id, r.title, r.description, r.file_name, r.file_data_url, r.created_at, u.email as user_email
         from user_reports r
         join users u on u.id = r.user_id
         order by r.created_at desc
         limit 200`
      ).all()
    : db.prepare(
        `select r.id, r.user_id, r.title, r.description, r.file_name, r.file_data_url, r.created_at, u.email as user_email
         from user_reports r
         join users u on u.id = r.user_id
         where r.user_id = ?
         order by r.created_at desc
         limit 200`
      ).all(user.id)) as Array<Record<string, unknown>>;

  return NextResponse.json({ items: rows });
}

export async function POST(req: NextRequest) {
  initDb();
  const user = requireUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const db = getDb();

  const body = await req.json().catch(() => ({}));
  const title = String(body.title ?? "").trim();
  const description = String(body.description ?? "").trim();
  const fileName = String(body.fileName ?? "").trim();
  const fileDataUrl = String(body.fileDataUrl ?? "").trim();
  if (!title) return NextResponse.json({ error: "Title is required" }, { status: 400 });

  // Keep payload bounded when using data URLs.
  if (fileDataUrl.length > 3_000_000) {
    return NextResponse.json({ error: "File is too large" }, { status: 400 });
  }

  const now = Date.now();
  const r = db.prepare(
    `insert into user_reports (user_id, title, description, file_name, file_data_url, created_at)
     values (?, ?, ?, ?, ?, ?)`
  ).run(user.id, title, description || null, fileName || null, fileDataUrl || null, now);

  return NextResponse.json({ id: Number(r.lastInsertRowid) });
}

