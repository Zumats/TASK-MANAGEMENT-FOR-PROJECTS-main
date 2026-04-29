import { NextRequest, NextResponse } from "next/server";
import { initDb, getDb } from "@/server/db";
import { requireUser } from "@/server/http";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  initDb();
  const user = requireUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const pollId = Number(id);
  if (!Number.isFinite(pollId)) return NextResponse.json({ error: "Invalid poll id" }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const optionIndex = Number(body.optionIndex);
  const feedback = String(body.feedback ?? "").trim().slice(0, 1000);
  if (!Number.isFinite(optionIndex) || optionIndex < 0) {
    return NextResponse.json({ error: "Invalid option index" }, { status: 400 });
  }

  const db = getDb();
  const poll = db.prepare(`select options_json, is_active from community_polls where id = ?`).get(pollId) as
    | { options_json: string; is_active: number }
    | undefined;
  if (!poll) return NextResponse.json({ error: "Poll not found" }, { status: 404 });
  if (!poll.is_active) return NextResponse.json({ error: "Poll is closed" }, { status: 400 });

  let options: string[] = [];
  try {
    const parsed = JSON.parse(poll.options_json);
    if (Array.isArray(parsed)) options = parsed.map((x) => String(x));
  } catch {}
  if (optionIndex >= options.length) {
    return NextResponse.json({ error: "Option out of range" }, { status: 400 });
  }

  const now = Date.now();
  db.prepare(
    `insert into community_poll_votes (poll_id, user_id, option_index, feedback, created_at, updated_at)
     values (?, ?, ?, ?, ?, ?)
     on conflict(poll_id, user_id) do update set
       option_index = excluded.option_index,
       feedback = excluded.feedback,
       updated_at = excluded.updated_at`
  ).run(pollId, user.id, optionIndex, feedback || null, now, now);

  return NextResponse.json({ success: true });
}

