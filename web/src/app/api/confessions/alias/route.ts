import { NextResponse, type NextRequest } from "next/server";
import { initDb, getDb } from "@/server/db";
import { requireUser } from "@/server/http";

export async function GET(req: NextRequest) {
  try {
    initDb();
    const user = requireUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const db = getDb();
    const row = db.prepare("SELECT id, alias as name, alias, avatar_color as color FROM confession_aliases WHERE user_id = ?").get(user.id) as any;

    return NextResponse.json({ alias: row || null });
  } catch (error) {
    console.error("[GET /api/confessions/alias]", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    initDb();
    const user = requireUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const db = getDb();
    
    // Check if exists
    let row = db.prepare("SELECT id, alias as name, alias, avatar_color as color FROM confession_aliases WHERE user_id = ?").get(user.id) as any;
    
    if (!row) {
      const aliasId = Math.random().toString(36).substring(2, 15);
      const randomAlias = "Anonymous " + Math.floor(Math.random() * 10000);
      const colors = ["#ef4444", "#3b82f6", "#10b981", "#f59e0b", "#8b5cf6", "#ec4899"];
      const color = colors[Math.floor(Math.random() * colors.length)];
      
      db.prepare(`
        INSERT INTO confession_aliases (id, user_id, alias, avatar_color, created_at)
        VALUES (?, ?, ?, ?, ?)
      `).run(aliasId, user.id, randomAlias, color, Date.now());
      
      row = { id: aliasId, name: randomAlias, alias: randomAlias, color: color };
    }

    return NextResponse.json({ alias: row });
  } catch (error) {
    console.error("[POST /api/confessions/alias]", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
