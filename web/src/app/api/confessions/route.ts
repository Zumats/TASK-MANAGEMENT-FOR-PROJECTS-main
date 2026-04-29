import { NextResponse, type NextRequest } from "next/server";
import { initDb, getDb } from "@/server/db";
import { requireUser } from "@/server/http";

export async function GET(req: NextRequest) {
  try {
    initDb();
    const user = requireUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const db = getDb();
    
    // Fetch confessions with alias info
    const rows = db.prepare(`
      SELECT 
        c.id, 
        c.body, 
        c.alias_id as aliasId, 
        c.is_pinned as isPinned, 
        c.is_manual_pin as isManualPin,
        c.is_hidden as isHidden,
        c.flag_count as flagCount,
        c.reply_to_id as replyToId,
        c.total_reacts as totalReacts, 
        c.created_at as createdAt, 
        c.updated_at as updatedAt,
        a.alias as aliasName,
        a.avatar_color as aliasColor
      FROM confessions c
      JOIN confession_aliases a ON c.alias_id = a.id
      WHERE c.is_hidden = 0
      ORDER BY c.is_pinned DESC, c.created_at DESC
      LIMIT 100
    `).all() as any[];

    // Structure for frontend: nest alias info and reactions
    const items = rows.map(r => {
      const reactions = db.prepare(`
        SELECT emoji, count(*) as count 
        FROM confession_reactions 
        WHERE confession_id = ? 
        GROUP BY emoji
      `).all(r.id);

      return {
        ...r,
        isPinned: Boolean(r.isPinned),
        isManualPin: Boolean(r.isManualPin),
        isHidden: Boolean(r.isHidden),
        alias: {
          name: r.aliasName,
          alias: r.aliasName, // Support both just in case
          color: r.aliasColor
        },
        reactions: reactions.map((re: any) => ({
          emoji: re.emoji,
          count: re.count,
          me: false
        }))
      };
    });

    return NextResponse.json({ items });
  } catch (error) {
    console.error("[GET /api/confessions]", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    initDb();
    const user = requireUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const content = body.body || body.content;
    const replyToId = body.replyToId;

    if (!content || !content.trim()) {
      return NextResponse.json({ error: "Content is required" }, { status: 400 });
    }

    const db = getDb();

    // 1. Get alias
    let aliasRow = db.prepare("SELECT id, alias FROM confession_aliases WHERE user_id = ?").get(user.id) as any;
    
    if (!aliasRow) {
      const aliasId = Math.random().toString(36).substring(2, 15);
      const randomAlias = "Anonymous " + Math.floor(Math.random() * 10000);
      const colors = ["#ef4444", "#3b82f6", "#10b981", "#f59e0b", "#8b5cf6", "#ec4899"];
      const color = colors[Math.floor(Math.random() * colors.length)];
      
      db.prepare(`
        INSERT INTO confession_aliases (id, user_id, alias, avatar_color, created_at)
        VALUES (?, ?, ?, ?, ?)
      `).run(aliasId, user.id, randomAlias, color, Date.now());
      
      aliasRow = { id: aliasId, alias: randomAlias };
    }

    // 2. Insert confession
    const confessionId = Math.random().toString(36).substring(2, 15);
    const now = Date.now();
    
    db.prepare(`
      INSERT INTO confessions (id, body, alias_id, is_pinned, is_manual_pin, is_hidden, flag_count, reply_to_id, total_reacts, created_at, updated_at)
      VALUES (?, ?, ?, 0, 0, 0, 0, ?, 0, ?, ?)
    `).run(confessionId, content, aliasRow.id, replyToId || null, now, now);

    return NextResponse.json({ 
      success: true, 
      id: confessionId,
      alias: aliasRow.alias 
    }, { status: 201 });
  } catch (error) {
    console.error("[POST /api/confessions]", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
