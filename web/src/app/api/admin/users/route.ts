import { NextResponse, type NextRequest } from "next/server";
import { initDb, getDb } from "@/server/db";
import { requireUser, requireAdmin } from "@/server/http";

const ONLINE_THRESHOLD_MS = 2 * 60 * 1000; // 2 minutes

export async function GET(req: NextRequest) {
  initDb();
  const user = requireUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    requireAdmin(user);
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const db = getDb();
  const now = Date.now();
  const rows = db.prepare("select id, email, role, department, name, age, bio, avatar_url, status, created_at, updated_at, last_seen_at, last_login_at from users order by email asc").all() as Array<{
    id: number; email: string; role: string; department: string; name: string | null; age: number | null; bio: string | null; avatar_url: string | null; status: string; created_at: number; updated_at: number; last_seen_at: number | null; last_login_at: number | null
  }>;
  const items = rows.map((r) => ({
    ...r,
    avatarUrl: r.avatar_url,
    status: r.status ?? "approved",
    isOnline: r.last_seen_at ? (now - r.last_seen_at) < ONLINE_THRESHOLD_MS : false,
    lastSeenAt: r.last_seen_at,
  }));
  return NextResponse.json({ items });
}

