import { NextResponse } from "next/server";
import { getDb } from "@/server/db";
import { CreateAnnouncementSchema } from "@/lib/schemas/bulletin";
import { getTokenFromRequest, verifyToken } from "@/server/auth";
import { requireUser } from "@/server/http";
import crypto from "crypto";
import { logActivity, ACTIONS } from "@/lib/activity";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const type = url.searchParams.get("type");
    const isPinned = url.searchParams.get("pinned");
    const user = requireUser(req as any);
    const db = getDb();

    let query = `
      SELECT a.*, u.name as author_name, u.role as author_role
      FROM announcements a
      LEFT JOIN users u ON a.author_id = u.id
      WHERE 1=1
    `;
    const params: any[] = [];

    if (type) {
      query += ` AND a.type = ?`;
      params.push(type);
    }
    if (isPinned === "true") {
      query += ` AND a.is_pinned = 1`;
    }

    query += ` ORDER BY a.is_pinned DESC, a.created_at DESC LIMIT 50`;

    const items = db.prepare(query).all(...params);

    const formatted = items.map((i: any) => ({
      ...i,
      is_pinned: i.is_pinned === 1,
      is_published: i.is_published === 1,
      author: {
        id: i.author_id,
        name: i.author_name || "Admin",
        role: i.author_role || "admin",
      },
    }));

    return NextResponse.json({ items: formatted });
  } catch (error) {
    console.error("GET /api/bulletin error:", error);
    return NextResponse.json({ error: "Failed to fetch announcements" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const user = requireUser(req as any);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const authorId = user.id;

    const body = await req.json();
    const parsed = CreateAnnouncementSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid data", details: parsed.error }, { status: 400 });
    }

    const data = parsed.data;
    const db = getDb();
    const id = crypto.randomUUID();
    const now = Date.now();

    db.prepare(`
      INSERT INTO announcements (
        id, title, body, type, is_pinned, is_published,
        cover_image, event_start, event_end, author_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      data.title,
      data.body,
      data.type,
      data.isPinned ? 1 : 0,
      data.isPublished ? 1 : 0,
      data.coverImage || null,
      data.eventStart || null,
      data.eventEnd || null,
      authorId,
      now,
      now
    );

    logActivity({
      actor_id: user.id,
      actor_name: user.email.split("@")[0],
      actor_role: user.role,
      action: ACTIONS.TASK_CREATED, // Bulletin doesn't have its own action yet, so using this as a placeholder
      entity_type: "system",
      entity_id: 0,
      entity_title: data.title,
      route_path: "/app/bulletin",
    });

    return NextResponse.json({ id, ...data, authorId, createdAt: now, updatedAt: now });
  } catch (error) {
    console.error("POST /api/bulletin error:", error);
    return NextResponse.json({ error: "Failed to create announcement" }, { status: 500 });
  }
}
