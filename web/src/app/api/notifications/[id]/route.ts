import { NextResponse, type NextRequest } from "next/server";
import { initDb, getDb } from "@/server/db";
import { requireUser } from "@/server/http";

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  initDb();
  const user = requireUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  const notifId = Number(id);
  if (!Number.isFinite(notifId)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const db = getDb();
  db.prepare("delete from notifications where id = ? and user_id = ?").run(notifId, user.id);
  return NextResponse.json({ ok: true });
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  initDb();
  const user = requireUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  const notifId = Number(id);
  if (!Number.isFinite(notifId)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const readStatus = body?.read ? 1 : 0;

  const db = getDb();
  db.prepare("update notifications set read = ? where id = ? and user_id = ?").run(readStatus, notifId, user.id);
  return NextResponse.json({ ok: true });
}
