import { NextResponse, type NextRequest } from "next/server";
import { initDb, getDb } from "@/server/db";
import { requireUser } from "@/server/http";

export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  try {
    initDb();
    const user = requireUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { emoji } = await req.json();
    if (!emoji) return NextResponse.json({ error: "Emoji required" }, { status: 400 });

    const { id: confessionId } = await props.params;
    const db = getDb();

    // Get user's alias
    const alias = db.prepare("SELECT id FROM confession_aliases WHERE user_id = ?").get(user.id) as any;
    if (!alias) return NextResponse.json({ error: "Alias not found" }, { status: 400 });

    const reactionId = Math.random().toString(36).substring(2, 15);
    
    try {
      db.prepare(`
        INSERT INTO confession_reactions (id, confession_id, alias_id, emoji, created_at)
        VALUES (?, ?, ?, ?, ?)
      `).run(reactionId, confessionId, alias.id, emoji, Date.now());
      
      // Update total reacts
      db.prepare("UPDATE confessions SET total_reacts = total_reacts + 1 WHERE id = ?").run(confessionId);
    } catch (e: any) {
      if (e.message.includes("UNIQUE")) {
        // Toggle: remove reaction
        db.prepare("DELETE FROM confession_reactions WHERE confession_id = ? AND alias_id = ? AND emoji = ?")
          .run(confessionId, alias.id, emoji);
        db.prepare("UPDATE confessions SET total_reacts = MAX(0, total_reacts - 1) WHERE id = ?").run(confessionId);
      } else {
        throw e;
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[POST /api/confessions/[id]/react]", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
