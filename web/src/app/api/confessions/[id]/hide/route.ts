import { NextResponse, type NextRequest } from "next/server";
import { initDb, getDb } from "@/server/db";
import { requireUser, requireAdmin } from "@/server/http";

export async function PATCH(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  try {
    initDb();
    const user = requireUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    try { requireAdmin(user); } catch { return NextResponse.json({ error: "Forbidden" }, { status: 403 }); }

    const { id } = await props.params;
    const { action } = await req.json(); // "hide" or "unhide"
    const db = getDb();

    db.prepare("UPDATE confessions SET is_hidden = ?, updated_at = ? WHERE id = ?")
      .run(action === "hide" ? 1 : 0, Date.now(), id);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[PATCH /api/confessions/[id]/hide]", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
