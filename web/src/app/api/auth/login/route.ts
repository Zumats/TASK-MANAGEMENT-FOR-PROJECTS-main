import { NextResponse, type NextRequest } from "next/server";
import { initDb, getDb } from "@/server/db";
import { cookieName, signToken, verifyPassword } from "@/server/auth";
import { logActivity, ACTIONS } from "@/lib/activity";

export async function POST(req: NextRequest) {
  initDb();
  const body = (await req.json().catch(() => null)) as { email?: unknown; password?: unknown } | null;
  const email = String(body?.email ?? "").trim().toLowerCase();
  const password = String(body?.password ?? "");

  if (!email || !password) {
    return NextResponse.json({ error: "Missing email or password" }, { status: 400 });
  }

  const db = getDb();
  const row = db
    .prepare("select id, email, password_hash, role, department, status from users where email = ?")
    .get(email) as
    | { id: number; email: string; password_hash: string; role: "admin" | "manager" | "user"; department: string; status: string }
    | undefined;

  if (!row) return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });

  const ok = await verifyPassword(password, row.password_hash);
  if (!ok) return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });

  // Check approval status
  const status = row.status ?? "approved";
  if (status === "pending") {
    return NextResponse.json({ error: "Your account is pending admin approval. Please wait for an admin to approve your registration.", pending: true }, { status: 403 });
  }
  if (status === "rejected") {
    return NextResponse.json({ error: "Your registration has been rejected. Please contact an administrator.", rejected: true }, { status: 403 });
  }

  const user = { id: row.id, email: row.email, role: row.role, department: row.department };
  const token = signToken(user);

  // Presence
  try {
    const now = Date.now();
    db.prepare("update users set last_login_at = ?, last_seen_at = ?, updated_at = ? where id = ?").run(now, now, now, row.id);
  } catch {
    // ignore
  }

  logActivity({
    actor_id: user.id,
    actor_name: user.email.split("@")[0],
    actor_role: user.role,
    action: ACTIONS.LOGIN,
    entity_type: "user",
    entity_id: user.id,
    entity_title: user.email,
    route_path: "/login",
  });

  const res = NextResponse.json({ user, token });
  res.cookies.set(cookieName(), token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return res;
}

