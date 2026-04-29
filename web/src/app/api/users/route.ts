import { NextResponse, type NextRequest } from "next/server";
import { initDb, getDb } from "@/server/db";
import { requireUser } from "@/server/http";

export async function GET(req: NextRequest) {
  initDb();
  const user = requireUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = getDb();
  // Return only basic info for sharing purposes
  const rows = db.prepare("select id, email, name, avatar_url from users where status = 'approved' order by email asc").all() as Array<{
    id: number; email: string; name: string | null; avatar_url: string | null;
  }>;
  const items = rows.map((r) => ({ id: String(r.id), email: r.email, name: r.name, avatarUrl: r.avatar_url }));
  return NextResponse.json({ items });
}
