import { NextRequest, NextResponse } from "next/server";
import { initDb, getDb } from "@/server/db";
import { requireUser } from "@/server/http";

export async function GET(req: NextRequest) {
  initDb();
  const user = requireUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = getDb();
  const polls = db.prepare(
    `select p.id, p.question, p.options_json, p.created_at, p.is_active, u.email as created_by_email
     from community_polls p
     join users u on u.id = p.created_by
     order by p.created_at desc
     limit 100`
  ).all() as Array<{
    id: number;
    question: string;
    options_json: string;
    created_at: number;
    is_active: number;
    created_by_email: string;
  }>;

  const pollIds = polls.map((p) => p.id);
  const votes = pollIds.length
    ? (db.prepare(
        `select poll_id, option_index, user_id, feedback from community_poll_votes where poll_id in (${pollIds.map(() => "?").join(",")})`
      ).all(...pollIds) as Array<{ poll_id: number; option_index: number; user_id: number; feedback: string | null }>)
    : [];

  const myVotes = pollIds.length
    ? (db.prepare(
        `select poll_id, option_index, feedback from community_poll_votes where user_id = ? and poll_id in (${pollIds.map(() => "?").join(",")})`
      ).all(user.id, ...pollIds) as Array<{ poll_id: number; option_index: number; feedback: string | null }>)
    : [];

  const votesByPoll = new Map<number, Array<{ option_index: number; user_id: number; feedback: string | null }>>();
  for (const v of votes) {
    const arr = votesByPoll.get(v.poll_id) ?? [];
    arr.push(v);
    votesByPoll.set(v.poll_id, arr);
  }
  const myVoteByPoll = new Map<number, { option_index: number; feedback: string | null }>();
  for (const mv of myVotes) myVoteByPoll.set(mv.poll_id, { option_index: mv.option_index, feedback: mv.feedback });

  const items = polls.map((p) => {
    let options: string[] = [];
    try {
      const parsed = JSON.parse(p.options_json);
      if (Array.isArray(parsed)) options = parsed.map((x) => String(x));
    } catch {}
    const voteRows = votesByPoll.get(p.id) ?? [];
    const counts = options.map((_, i) => voteRows.filter((v) => v.option_index === i).length);
    return {
      id: p.id,
      question: p.question,
      options,
      counts,
      totalVotes: voteRows.length,
      createdAt: p.created_at,
      isActive: Boolean(p.is_active),
      createdByEmail: p.created_by_email,
      myVote: myVoteByPoll.get(p.id) ?? null,
    };
  });

  return NextResponse.json({ items });
}

export async function POST(req: NextRequest) {
  initDb();
  const user = requireUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(user.role === "admin" || user.role === "manager")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const question = String(body.question ?? "").trim();
  const options = Array.isArray(body.options)
    ? body.options.map((x: unknown) => String(x).trim()).filter(Boolean).slice(0, 8)
    : [];
  if (!question) return NextResponse.json({ error: "Question is required" }, { status: 400 });
  if (options.length < 2) return NextResponse.json({ error: "At least 2 options are required" }, { status: 400 });

  const db = getDb();
  const now = Date.now();
  const r = db.prepare(
    `insert into community_polls (question, options_json, created_by, created_at, is_active)
     values (?, ?, ?, ?, 1)`
  ).run(question, JSON.stringify(options), user.id, now);

  return NextResponse.json({ id: Number(r.lastInsertRowid) });
}

