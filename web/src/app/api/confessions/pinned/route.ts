import { NextResponse, type NextRequest } from "next/server";
import { initDb, getDb } from "@/server/db";
import { requireUser } from "@/server/http";

export async function GET(req: NextRequest) {
  try {
    initDb();
    const user = requireUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const db = getDb();
    const row = db.prepare(`
      SELECT 
        c.*, 
        ca.alias as alias_name, 
        ca.avatar_color 
      FROM confessions c
      JOIN confession_aliases ca ON c.alias_id = ca.id
      WHERE c.is_pinned = 1
      ORDER BY c.updated_at DESC
      LIMIT 1
    `).get() as any;

    if (!row) {
      return NextResponse.json({ item: null });
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
    console.error("[GET /api/confessions/pinned]", error);
    return NextResponse.json({ item: null });
  }
}
