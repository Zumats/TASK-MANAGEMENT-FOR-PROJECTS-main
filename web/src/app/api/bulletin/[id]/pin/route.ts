import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/server/db";
import { logActivity } from "@/lib/activity";
import { requireUser } from "@/server/http";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = requireUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (user.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const authorId = user.id;

    const { id } = await params;

    const body = await req.json();
    const isPinned = body.isPinned ? 1 : 0;
    const db = getDb();

    if (isPinned === 1) {
      // Admin can have max 3 pinned announcements at once.
      // Pinning a 4th automatically unpins the oldest pinned.
      const pinned = db.prepare(`SELECT id, created_at FROM announcements WHERE is_pinned = 1 ORDER BY created_at ASC`).all() as { id: string, created_at: number }[];
      
      if (pinned.length >= 3) {
        // Enforce max 3 logic
        const oldest = pinned[0];
        db.prepare(`UPDATE announcements SET is_pinned = 0 WHERE id = ?`).run(oldest.id);
      }
    }

    db.prepare(`UPDATE announcements SET is_pinned = ?, updated_at = ? WHERE id = ?`).run(
      isPinned,
      Date.now(),
      id
    );

    logActivity({
      actor_id: authorId,
      actor_name: "Admin",
      actor_role: "admin",
      action: "task.updated", // placeholder
      entity_type: "system",
      entity_id: 0,
      entity_title: `Announcement ${id} ${isPinned ? "pinned" : "unpinned"}`,
      route_path: "/app/bulletin",
    });

    return NextResponse.json({ success: true, isPinned: isPinned === 1 });
  } catch (error) {
    console.error("PATCH /api/bulletin/[id]/pin error:", error);
    return NextResponse.json({ error: "Failed to pin announcement" }, { status: 500 });
  }
}
