import { NextResponse, type NextRequest } from "next/server";
import { initDb, getDb } from "@/server/db";
import { cookieName, hashPassword, signToken } from "@/server/auth";
import { logActivity, ACTIONS } from "@/lib/activity";

export async function POST(req: NextRequest) {
  initDb();
  const body = (await req.json().catch(() => null)) as
    | { email?: unknown; password?: unknown; role?: unknown }
    | null;
  const email = String(body?.email ?? "").trim().toLowerCase();
  const password = String(body?.password ?? "");
  const roleRaw = body?.role == null ? "user" : String(body.role);
  const role = roleRaw === "admin" || roleRaw === "user" ? roleRaw : "user";

  if (!email || !email.includes("@")) {
    return NextResponse.json({ error: "Invalid email" }, { status: 400 });
  }
  if (!password || password.length < 6) {
    return NextResponse.json({ error: "Password must be at least 6 characters" }, { status: 400 });
  }

  const db = getDb();
  const now = Date.now();
  const passwordHash = await hashPassword(password);

  // Determine initial status: admins are auto-approved, regular users need approval
  const initialStatus = role === "admin" ? "approved" : "pending";

  try {
    const r = db
      .prepare(
        "insert into users (email, password_hash, role, department, status, created_at, updated_at) values (?, ?, ?, 'other', ?, ?, ?)",
      )
      .run(email, passwordHash, role, initialStatus, now, now);

    const user = { id: Number(r.lastInsertRowid), email, role: role as "admin" | "user", department: "other" };

    logActivity({
      actor_id: user.id,
      actor_name: user.email.split("@")[0],
      actor_role: user.role,
      action: ACTIONS.USER_CREATED,
      entity_type: "user",
      entity_id: user.id,
      entity_title: user.email,
      meta: { status: initialStatus },
      route_path: "/register",
    });

    if (initialStatus === "pending") {
      // Notify all admins
      db.prepare(`
        insert into notifications (user_id, title, message, created_at, read)
        select id, 'New Registration', ?, ?, 0
        from users where role = 'admin'
      `).run(`${email} registered and awaits approval.`, now);
      // Return pending status without setting auth cookie - user must wait for approval
      return NextResponse.json({ user, pending: true });
    }

    const token = signToken(user);
    const res = NextResponse.json({ user, pending: false, token });
    res.cookies.set(cookieName(), token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });
    return res;
  } catch {
    return NextResponse.json({ error: "Email already registered" }, { status: 409 });
  }
}
