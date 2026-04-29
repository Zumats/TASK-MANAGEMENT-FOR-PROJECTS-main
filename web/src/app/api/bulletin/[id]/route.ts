import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/server/db";
import { UpdateAnnouncementSchema } from "@/lib/schemas/bulletin";
import { logActivity } from "@/lib/activity";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const userIdHeader = req.headers.get("x-user-id");
    if (!userIdHeader) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const authorId = parseInt(userIdHeader, 10);

    const body = await req.json();
    const parsed = UpdateAnnouncementSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid data", details: parsed.error }, { status: 400 });
    }

    const data = parsed.data;
    const db = getDb();
    const now = Date.now();

    const updates = [];
    const values = [];

    if (data.title !== undefined) { updates.push("title = ?"); values.push(data.title); }
    if (data.body !== undefined) { updates.push("body = ?"); values.push(data.body); }
    if (data.type !== undefined) { updates.push("type = ?"); values.push(data.type); }
    if (data.isPinned !== undefined) { updates.push("is_pinned = ?"); values.push(data.isPinned ? 1 : 0); }
    if (data.isPublished !== undefined) { updates.push("is_published = ?"); values.push(data.isPublished ? 1 : 0); }
    if (data.coverImage !== undefined) { updates.push("cover_image = ?"); values.push(data.coverImage); }
    if (data.eventStart !== undefined) { updates.push("event_start = ?"); values.push(data.eventStart); }
    if (data.eventEnd !== undefined) { updates.push("event_end = ?"); values.push(data.eventEnd); }

    if (updates.length === 0) return NextResponse.json({ success: true });

    updates.push("updated_at = ?");
    values.push(now);

    values.push(id);

    db.prepare(`UPDATE announcements SET ${updates.join(", ")} WHERE id = ?`).run(...values);

    logActivity({
      actor_id: authorId,
      actor_name: "Admin",
      actor_role: "admin",
      action: "task.updated", // placeholder
      entity_type: "system",
      entity_id: 0,
      entity_title: `Announcement ${id} updated`,
      route_path: "/app/bulletin",
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("PATCH /api/bulletin/[id] error:", error);
    return NextResponse.json({ error: "Failed to update announcement" }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const userIdHeader = req.headers.get("x-user-id");
    if (!userIdHeader) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const authorId = parseInt(userIdHeader, 10);

    const db = getDb();
    db.prepare(`DELETE FROM announcements WHERE id = ?`).run(id);

    logActivity({
      actor_id: authorId,
      actor_name: "Admin",
      actor_role: "admin",
      action: "task.deleted", // placeholder
      entity_type: "system",
      entity_id: 0,
      entity_title: `Announcement ${id} deleted`,
      route_path: "/app/bulletin",
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/bulletin/[id] error:", error);
    return NextResponse.json({ error: "Failed to delete announcement" }, { status: 500 });
  }
}
