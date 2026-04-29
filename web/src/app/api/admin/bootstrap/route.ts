import { NextResponse, type NextRequest } from "next/server";
import { initDb, getDb } from "@/server/db";
import { hashPassword } from "@/server/auth";

export async function POST(req: NextRequest) {
  initDb();
  const body = (await req.json().catch(() => null)) as { email?: unknown; password?: unknown } | null;
  const email = String(body?.email ?? "").trim().toLowerCase();
  const password = String(body?.password ?? "");

  if (!email || !email.includes("@")) return NextResponse.json({ error: "Invalid email" }, { status: 400 });
  if (!password || password.length < 6)
    return NextResponse.json({ error: "Password must be at least 6 characters" }, { status: 400 });

  const db = getDb();
  const existingAdmin = db.prepare("select 1 as ok from users where role = 'admin' limit 1").get() as { ok: 1 } | undefined;
  if (existingAdmin) return NextResponse.json({ error: "Admin already exists" }, { status: 409 });

  const now = Date.now();
  const passwordHash = await hashPassword(password);

  try {
    db.prepare(
      "insert into users (email, password_hash, role, department, created_at, updated_at) values (?, ?, 'admin', 'other', ?, ?)",
    ).run(email, passwordHash, now, now);
  } catch {
    // If user exists already, promote them to admin (still one-time guarded by existingAdmin check)
    db.prepare("update users set role='admin', updated_at=? where email=?").run(now, email);
  }

  return NextResponse.json({ ok: true });
}
