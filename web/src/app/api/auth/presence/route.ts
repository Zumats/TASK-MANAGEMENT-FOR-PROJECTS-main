import { NextResponse, type NextRequest } from "next/server";
import { initDb, getDb } from "@/server/db";
import { requireUser } from "@/server/http";

// POST /api/auth/presence - Update user's last seen timestamp
export async function POST(req: NextRequest) {
  initDb();
  const user = requireUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = getDb();
  const now = Date.now();
  
  try {
    db.prepare("update users set last_seen_at = ? where id = ?").run(now, user.id);
    return NextResponse.json({ success: true, lastSeenAt: now });
  } catch (error) {
    return NextResponse.json({ error: "Failed to update presence" }, { status: 500 });
  }
}

// GET /api/auth/presence - Check if users are online (admin only)
export async function GET(req: NextRequest) {
  initDb();
  const user = requireUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Only admins can view all users' presence
  if (user.role !== "admin" && user.role !== "manager") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const db = getDb();
  const ONLINE_THRESHOLD_MS = 2 * 60 * 1000; // 2 minutes
  const now = Date.now();
  
  try {
    const rows = db.prepare(
      "select id, email, role, last_seen_at from users order by email asc"
    ).all() as Array<{
      id: number;
      email: string;
      role: string;
      last_seen_at: number | null;
    }>;
    
    const users = rows.map((r) => ({
      id: r.id,
      email: r.email,
      role: r.role,
      isOnline: r.last_seen_at ? (now - r.last_seen_at) < ONLINE_THRESHOLD_MS : false,
      lastSeenAt: r.last_seen_at,
    }));
    
    return NextResponse.json({ users });
  } catch (error) {
    return NextResponse.json({ error: "Failed to fetch presence" }, { status: 500 });
  }
}
