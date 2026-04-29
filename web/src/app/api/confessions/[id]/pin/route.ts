import { NextResponse, type NextRequest } from "next/server";
import { initDb, getDb } from "@/server/db";
import { requireUser, requireAdmin } from "@/server/http";

export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  try {
    initDb();
    const user = requireUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    try { requireAdmin(user); } catch { return NextResponse.json({ error: "Forbidden" }, { status: 403 }); }

    const { id } = await props.params;
    const { action } = await req.json(); // "pin" or "unpin"
    const db = getDb();

    db.prepare("UPDATE confessions SET is_pinned = ?, is_manual_pin = ?, updated_at = ? WHERE id = ?")
      .run(action === "pin" ? 1 : 0, action === "pin" ? 1 : 0, Date.now(), id);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[POST /api/confessions/[id]/pin]", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
