import { NextResponse, type NextRequest } from "next/server";
import { initDb, getDb } from "@/server/db";
import { requireUser } from "@/server/http";

export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  try {
    initDb();
    const user = requireUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await props.params;
    const db = getDb();

    // Increment flag count
    db.prepare("UPDATE confessions SET flag_count = flag_count + 1, updated_at = ? WHERE id = ?")
      .run(Date.now(), id);

    // Auto-hide if flags reach a threshold
    const row = db.prepare("SELECT flag_count FROM confessions WHERE id = ?").get(id) as { flag_count: number } | undefined;
    if (row && row.flag_count >= 5) {
      db.prepare("UPDATE confessions SET is_hidden = 1 WHERE id = ?").run(id);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[POST /api/confessions/[id]/flag]", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
