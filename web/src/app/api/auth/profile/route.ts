import { NextResponse, type NextRequest } from "next/server";
import { initDb, getDb } from "@/server/db";
import { getTokenFromRequest, verifyToken } from "@/server/auth";

export async function PATCH(req: NextRequest) {
  initDb();
  const token = getTokenFromRequest(req);
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const jwtUser = verifyToken(token);
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;

    const name = body?.name == null ? undefined : String(body.name).trim() || null;
    const ageRaw = body?.age == null ? undefined : Number(body.age);
    const age = ageRaw !== undefined && Number.isFinite(ageRaw) && ageRaw > 0 ? Math.floor(ageRaw) : null;
    const bio = body?.bio == null ? undefined : String(body.bio).trim() || null;
    const avatarUrl = body?.avatarUrl == null ? undefined : String(body.avatarUrl).trim() || null;
    const position = body?.position == null ? undefined : String(body.position).trim() || null;

    const db = getDb();
    const now = Date.now();

    db.prepare(
      "update users set name = coalesce(?, name), age = coalesce(?, age), bio = coalesce(?, bio), avatar_url = coalesce(?, avatar_url), position = coalesce(?, position), updated_at = ? where id = ?",
    ).run(name ?? null, age ?? null, bio ?? null, avatarUrl ?? null, position ?? null, now, jwtUser.id);

    const row = db
      .prepare("select id, email, role, department, name, age, bio, avatar_url, position from users where id = ?")
      .get(jwtUser.id) as { id: number; email: string; role: "admin" | "manager" | "user"; department: string; name: string | null; age: number | null; bio: string | null; avatar_url: string | null; position: string | null };

    return NextResponse.json({ user: row }, { status: 200 });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
