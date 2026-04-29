import { NextResponse, type NextRequest } from "next/server";
import { getTokenFromRequest, verifyToken, type JwtUser } from "./auth";

export function json(data: unknown, init?: ResponseInit): NextResponse {
  return NextResponse.json(data, init);
}

export function badRequest(message: string, extra?: Record<string, unknown>): NextResponse {
  return json({ error: message, ...extra }, { status: 400 });
}

export function unauthorized(message = "Unauthorized"): NextResponse {
  return json({ error: message }, { status: 401 });
}

export function forbidden(message = "Forbidden"): NextResponse {
  return json({ error: message }, { status: 403 });
}

import { getDb, initDb } from "./db";

export function requireUser(req: NextRequest): JwtUser | null {
  const token = getTokenFromRequest(req);
  if (!token) return null;
  try {
    const user = verifyToken(token);
    try {
      initDb();
      const db = getDb();
      const row = db.prepare("select role from users where id = ?").get(user.id) as { role: string } | undefined;
      if (row && typeof row.role === 'string') {
        const r = row.role.trim().toLowerCase();
        if (r === "admin" || r === "manager" || r === "user") {
          user.role = r as any;
        }
      }
      // Presence: best-effort heartbeat (throttled per user)
      try {
        const now = Date.now();
        const seen = db.prepare("select last_seen_at from users where id = ?").get(user.id) as { last_seen_at?: number | null } | undefined;
        const last = seen?.last_seen_at ?? null;
        if (!last || now - Number(last) > 60_000) {
          db.prepare("update users set last_seen_at = ?, updated_at = ? where id = ?").run(now, now, user.id);
        }
      } catch {
        // ignore
      }
    } catch {
      // db not initialized or another error, fallback to token role
    }
    return user;
  } catch {
    return null;
  }
}

export function requireAdmin(user: JwtUser | null): void {
  if (!user || user.role !== "admin") throw new Error("FORBIDDEN");
}
