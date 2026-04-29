import { NextResponse, type NextRequest } from "next/server";
import { initDb, getDb } from "@/server/db";
import { getTokenFromRequest, verifyToken } from "@/server/auth";

export async function GET(req: NextRequest) {
  initDb();
  const token = getTokenFromRequest(req);
  if (!token) return NextResponse.json({ user: null }, { status: 200 });

  try {
    const jwtUser = verifyToken(token);
    const db = getDb();
    const row = db
      .prepare("select id, email, role, department, name, age, bio, avatar_url, position from users where id = ?")
      .get(jwtUser.id) as { id: number; email: string; role: "admin" | "manager" | "user"; department: string; name: string | null; age: number | null; bio: string | null; avatar_url: string | null; position: string | null } | undefined;

    if (!row) return NextResponse.json({ user: null }, { status: 200 });
    return NextResponse.json({ user: { ...row, avatarUrl: row.avatar_url } }, { status: 200 });
  } catch {
    return NextResponse.json({ user: null }, { status: 200 });
  }
}
