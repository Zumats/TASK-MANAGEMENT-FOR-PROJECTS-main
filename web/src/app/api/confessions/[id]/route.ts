import { NextResponse, type NextRequest } from "next/server";
import { initDb, getDb } from "@/server/db";
import { requireUser } from "@/server/http";

export async function GET(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  try {
    initDb();
    const user = requireUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await props.params;
    const db = getDb();
    const row = db.prepare(`
      SELECT 
        c.*, 
        ca.alias as alias_name, 
        ca.avatar_color 
      FROM confessions c
      JOIN confession_aliases ca ON c.alias_id = ca.id
      WHERE c.id = ?
    `).get(id) as any;

    if (!row) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json({
      item: {
        id: row.id,
        body: row.body,
        aliasId: row.alias_id,
        isPinned: Boolean(row.is_pinned),
        isManualPin: Boolean(row.is_manual_pin),
        isHidden: Boolean(row.is_hidden),
        flagCount: row.flag_count,
        replyToId: row.reply_to_id,
        totalReacts: row.total_reacts,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        alias: {
          name: row.alias_name,
          color: row.avatar_color
        }
      }
    });
  } catch (error) {
    console.error("[GET /api/confessions/[id]]", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  try {
    initDb();
    const user = requireUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await props.params;
    const db = getDb();

    // Check if it's the user's message or admin
    const confession = db.prepare(`
      SELECT c.alias_id, a.user_id 
      FROM confessions c
      JOIN confession_aliases a ON c.alias_id = a.id
      WHERE c.id = ?
    `).get(id) as any;

    if (!confession) return NextResponse.json({ error: "Not found" }, { status: 404 });
    
    if (user.role !== "admin" && confession.user_id !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    db.prepare("DELETE FROM confessions WHERE id = ?").run(id);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[DELETE /api/confessions/[id]]", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
