import { NextResponse, type NextRequest } from "next/server";
import { initDb, getDb } from "@/server/db";
import { requireUser } from "@/server/http";

export async function GET(req: NextRequest) {
  initDb();
  const user = requireUser(req);
  if (!user || user.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const limit = Math.min(Number(searchParams.get("limit")) || 50, 200);

  const db = getDb();
  const rows = db.prepare(`
    SELECT * FROM activity_logs 
    ORDER BY created_at DESC 
    LIMIT ?
  `).all(limit) as Array<Record<string, unknown>>;

  const items = rows.map(r => ({
    id: r.id,
    actor: {
      id: r.actor_id,
      name: r.actor_name,
      role: r.actor_role,
    },
    action: r.action,
    entity: {
      type: r.entity_type,
      id: r.entity_id,
      title: r.entity_title,
    },
    meta: (() => {
      try {
        return r.meta ? JSON.parse(String(r.meta)) : null;
      } catch {
        return { raw: r.meta };
      }
    })(),
    routePath: String(r.route_path),
    isRead: Boolean(r.is_read),
    createdAt: r.created_at,
  }));

  return NextResponse.json({ items });
}
