import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { initDb, getDb } from "@/server/db";
import { requireUser } from "@/server/http";
import { logActivity, ACTIONS } from "@/lib/activity";

// ── Zod schemas ─────────────────────────────────────────────────────────────
const PriorityEnum = z.enum(["easy", "medium", "high", "very_high", "critical"]);

const CreateTaskSchema = z.object({
  title: z.string().min(1, "Title is required").max(255).trim(),
  description: z.string().max(5000).trim().optional().default(""),
  assigned_to: z.number().int().positive().optional(),
  assignedTo: z.union([z.number(), z.string()]).optional(),
  priority: PriorityEnum.optional().default("medium"),
  department: z.string().max(100).optional().default("other"),
  start_date: z.number().nullable().optional().default(null),
  due_date: z.number().nullable().optional().default(null),
  startDate: z.string().nullable().optional(),
  dueDate: z.string().nullable().optional(),
  progress: z.number().min(0).max(100).optional().default(0),
  checklist: z
    .union([
      z.array(z.object({ text: z.string().min(1).max(500).trim(), done: z.boolean().optional().default(false) })),
      z.string().max(10000),
    ])
    .optional()
    .default([]),
  project_id: z.number().int().positive().nullable().optional(),
  projectId: z.union([z.number(), z.string()]).nullable().optional(),
  shared_with: z.array(z.number().int().positive()).max(25).optional(),
  sharedWith: z.array(z.union([z.number(), z.string()])).max(25).optional(),
});

export async function GET(req: NextRequest) {
  initDb();
  const user = requireUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const filter = searchParams.get("filter");

  const db = getDb();
  let query = "";
  let params: (string | number)[] = [];

  if (user.role === "admin" || user.role === "manager") {
    query =
      "select t.*, u1.email as assigned_to_email, u1.name as assigned_to_name, u1.avatar_url as assigned_to_avatar, u2.email as assigned_by_email, p.name as project_name from tasks t join users u1 on u1.id=t.assigned_to join users u2 on u2.id=t.assigned_by left join projects p on p.id=t.project_id";
  } else {
    // Regular users see tasks assigned to them OR shared with them
    query = `
      select distinct t.*, u1.email as assigned_to_email, u1.name as assigned_to_name, u1.avatar_url as assigned_to_avatar, u2.email as assigned_by_email, p.name as project_name 
      from tasks t 
      join users u1 on u1.id=t.assigned_to 
      join users u2 on u2.id=t.assigned_by
      left join projects p on p.id=t.project_id
      left join task_shares ts on ts.task_id = t.id
      where (t.assigned_to = ? or ts.to_user_id = ?)
    `;
    params = [user.id, user.id];
  }

  // Apply filters
  if (filter === "all_open") {
    query += (params.length ? " and" : " where") + " t.status != 'complete'";
  } else if (filter === "overdue") {
    const now = Date.now();
    query += (params.length ? " and" : " where") + " t.status != 'complete' and t.due_date < ?";
    params.push(now);
  } else if (filter === "recently_created") {
    query += " order by t.created_at desc limit 50";
  } else if (filter === "assigned_to_me") {
    query += (params.length ? " and" : " where") + " t.assigned_to = ?";
    params.push(user.id);
  } else if (filter === "shared_with_me") {
    if (user.role !== "admin" && user.role !== "manager") {
      query = `
        select t.*, u1.email as assigned_to_email, u1.name as assigned_to_name, u1.avatar_url as assigned_to_avatar, u2.email as assigned_by_email, p.name as project_name 
        from tasks t 
        join users u1 on u1.id=t.assigned_to 
        join users u2 on u2.id=t.assigned_by
        left join projects p on p.id=t.project_id
        join task_shares ts on ts.task_id = t.id
        where ts.to_user_id = ?
      `;
      params = [user.id];
    }
  } else if (filter === "shared_with_users") {
    if (user.role === "admin" || user.role === "manager") {
      query = `
        select distinct t.*, u1.email as assigned_to_email, u1.name as assigned_to_name, u1.avatar_url as assigned_to_avatar, u2.email as assigned_by_email, p.name as project_name 
        from tasks t 
        join users u1 on u1.id=t.assigned_to 
        join users u2 on u2.id=t.assigned_by
        left join projects p on p.id=t.project_id
        join task_shares ts on ts.task_id = t.id
      `;
    } else {
      query = `
        select distinct t.*, u1.email as assigned_to_email, u1.name as assigned_to_name, u1.avatar_url as assigned_to_avatar, u2.email as assigned_by_email, p.name as project_name 
        from tasks t 
        join users u1 on u1.id=t.assigned_to 
        join users u2 on u2.id=t.assigned_by
        left join projects p on p.id=t.project_id
        join task_shares ts on ts.task_id = t.id
        where ts.from_user_id = ?
      `;
      params = [user.id];
    }
  }

  if (!query.includes("order by")) {
    query += " order by t.created_at desc limit 200";
  }

  const rows = db.prepare(query).all(...params);

  const taskIds = (rows as Array<{ id: number }>).map((r) => Number(r.id)).filter((x) => Number.isFinite(x));
  const attRows = taskIds.length
    ? (db
      .prepare(
        `select id, task_id, checklist_item_id, uploaded_by, name, content_type, size, created_at from attachments where task_id in (${taskIds
          .map(() => "?")
          .join(",")}) order by created_at asc`,
      )
      .all(...taskIds) as Array<{
        id: number;
        task_id: number;
        checklist_item_id: number | null;
        uploaded_by: number;
        name: string;
        content_type: string;
        size: number;
        created_at: number;
      }>)
    : [];

  const checklistRows = taskIds.length
    ? (db
      .prepare(
        `select id, task_id, text, done, created_at from task_checklist where task_id in (${taskIds
          .map(() => "?")
          .join(",")}) order by created_at asc`,
      )
      .all(...taskIds) as Array<{ id: number; task_id: number; text: string; done: number; created_at: number }>)
    : [];

  // Fetch comments for all tasks with parent_id
  const commentRows = taskIds.length
    ? (db
      .prepare(
        `select c.id, c.task_id, c.message as text, c.created_at, c.user_id as created_by, c.parent_id, u.email as created_by_email 
         from task_comments c 
         join users u on c.user_id = u.id 
         where c.task_id in (${taskIds.map(() => "?").join(",")})
         order by c.created_at asc`,
      )
      .all(...taskIds) as Array<{
        id: number;
        task_id: number;
        text: string;
        created_at: number;
        created_by: number;
        parent_id: number | null;
        created_by_email: string;
      }>)
    : [];

  const attsByTask = new Map<number, unknown[]>();
  for (const a of attRows) {
    const arr = attsByTask.get(a.task_id) ?? [];
    arr.push({
      id: a.id,
      name: a.name,
      contentType: a.content_type,
      size: a.size,
      createdAt: a.created_at,
      uploadedBy: a.uploaded_by,
      checklistItemId: a.checklist_item_id,
      url: `/api/files/${a.id}`,
    });
    attsByTask.set(a.task_id, arr);
  }

  const checklistByTask = new Map<number, unknown[]>();
  for (const c of checklistRows) {
    const arr = checklistByTask.get(c.task_id) ?? [];
    arr.push({ id: String(c.id), text: c.text, done: Boolean(c.done) });
    checklistByTask.set(c.task_id, arr);
  }

  // Fetch comment attachments for all comments in these tasks
  const commentIds = commentRows.map((c) => c.id).filter((x) => Number.isFinite(x));
  const commentAttRows = commentIds.length
    ? (db
      .prepare(
        `select ca.id, ca.comment_id, ca.name, ca.content_type, ca.size, ca.created_at
         from comment_attachments ca
         where ca.comment_id in (${commentIds.map(() => "?").join(",")})
         order by ca.created_at asc`,
      )
      .all(...commentIds) as Array<{
        id: number;
        comment_id: number;
        name: string;
        content_type: string;
        size: number;
        created_at: number;
      }>)
    : [];
  const commentAttsByComment = new Map<number, unknown[]>();
  for (const ca of commentAttRows) {
    const arr = commentAttsByComment.get(ca.comment_id) ?? [];
    arr.push({
      id: ca.id,
      name: ca.name,
      contentType: ca.content_type,
      size: ca.size,
      createdAt: ca.created_at,
      url: `/api/comment-files/${ca.id}`,
    });
    commentAttsByComment.set(ca.comment_id, arr);
  }

  // Group comments by task_id with parent_id and attachments
  const commentsByTask = new Map<number, unknown[]>();
  for (const c of commentRows) {
    const list = commentsByTask.get(c.task_id) || [];
    list.push({
      id: String(c.id),
      taskId: String(c.task_id),
      text: c.text,
      createdAt: c.created_at,
      createdBy: String(c.created_by),
      createdByEmail: c.created_by_email,
      parentId: c.parent_id ? String(c.parent_id) : null,
      attachments: commentAttsByComment.get(c.id) ?? [],
    });
    commentsByTask.set(c.task_id, list);
  }

  // Fetch sharedWith users for all tasks
  const shareRows = taskIds.length
    ? (db
      .prepare(
        `select ts.task_id, ts.to_user_id as id, u.email, u.avatar_url as avatarUrl 
         from task_shares ts 
         join users u on ts.to_user_id = u.id 
         where ts.task_id in (${taskIds.map(() => "?").join(",")})`,
      )
      .all(...taskIds) as Array<{ task_id: number; id: number; email: string; avatarUrl: string | null }>)
    : [];
  const sharesByTask = new Map<number, unknown[]>();
  for (const s of shareRows) {
    const list = sharesByTask.get(s.task_id) || [];
    list.push({
      id: String(s.id),
      email: s.email,
      avatarUrl: s.avatarUrl ? String(s.avatarUrl) : undefined,
    });
    sharesByTask.set(s.task_id, list);
  }

  const items = (rows as Array<Record<string, unknown>>).map((r) => {
    const timerRunning = Boolean(r.timer_running);
    const elapsedSeconds = Number(r.elapsed_seconds) || 0;
    const adminApproved = Boolean(r.admin_approved);
    return {
      ...r,
      projectId: r.project_id ? String(r.project_id) : null,
      projectName: r.project_name ? String(r.project_name) : null,
      timerRunning,
      elapsedSeconds,
      adminApproved,
      attachments: attsByTask.get(Number(r.id)) ?? [],
      checklist: checklistByTask.get(Number(r.id)) ?? [],
      comments: commentsByTask.get(Number(r.id)) ?? [],
      sharedWith: sharesByTask.get(Number(r.id)) ?? [],
    };
  });
  return NextResponse.json({ items });
}

export async function POST(req: NextRequest) {
  initDb();
  const user = requireUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!(user.role === "admin" || user.role === "manager")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Parse & validate with Zod
  const rawBody = await req.json().catch(() => null);
  const parsed = CreateTaskSchema.safeParse(rawBody);
  if (!parsed.success) {
    const messages = parsed.error.issues.map((e) => `${e.path.join(".")}: ${e.message}`).join("; ");
    return NextResponse.json({ error: messages }, { status: 400 });
  }

  const data = parsed.data;
  const assigned_to = data.assignedTo !== undefined 
    ? (typeof data.assignedTo === 'string' ? Number(data.assignedTo) : data.assignedTo)
    : data.assigned_to;

  if (assigned_to == null) {
     return NextResponse.json({ error: "assigned_to is required" }, { status: 400 });
  }

  const start_date = data.startDate !== undefined 
    ? (data.startDate == null ? null : Number(new Date(data.startDate).getTime()))
    : data.start_date;
    
  const due_date = data.dueDate !== undefined 
    ? (data.dueDate == null ? null : Number(new Date(data.dueDate).getTime()))
    : data.due_date;

  const project_id = data.projectId !== undefined
    ? (typeof data.projectId === 'string' ? Number(data.projectId) : data.projectId)
    : data.project_id;

  const rawShared =
    Array.isArray(data.sharedWith) && data.sharedWith.length
      ? data.sharedWith
      : Array.isArray(data.shared_with)
        ? data.shared_with
        : [];
  const sharedParsed = Array.isArray(rawShared)
    ? rawShared
        .map((x) => (typeof x === "string" ? Number(x) : x))
        .filter((n) => Number.isFinite(n) && n > 0)
    : [];
  const sharedWithIds = [...new Set(sharedParsed)]
    .filter((id) => id !== assigned_to)
    .slice(0, 25);

  const { title, description, priority, department, progress, checklist } = data;

  const db = getDb();

  const target = db.prepare("select role from users where id = ?").get(assigned_to) as { role: string } | undefined;
  if (!target) return NextResponse.json({ error: "Invalid assigned_to: user not found" }, { status: 400 });

  const now = Date.now();
  const r = db
    .prepare(
      "insert into tasks (title, description, assigned_to, assigned_by, status, progress, priority, start_date, due_date, department, project_id, created_at, updated_at) values (?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .run(title, description, assigned_to, user.id, progress || 0, priority, start_date, due_date, department, project_id || null, now, now);

  const taskId = Number(r.lastInsertRowid);

  // Parse checklist: support array of objects or newline-separated string
  const checklistItems: Array<{ text: string; done: boolean }> = Array.isArray(checklist)
    ? (checklist as Array<{ text: string; done?: boolean }>)
      .map((x) => ({ text: String(x.text ?? "").trim(), done: Boolean(x.done) }))
      .filter((x) => x.text)
    : typeof checklist === "string"
      ? String(checklist)
        .split(/\r?\n/)
        .map((s) => s.trim())
        .filter(Boolean)
        .map((text) => ({ text, done: false }))
      : [];

  const createdChecklistIds: number[] = [];
  if (checklistItems.length) {
    const st = db.prepare("insert into task_checklist (task_id, text, done, created_at) values (?, ?, ?, ?)");
    for (const it of checklistItems.slice(0, 50)) {
      const rr = st.run(taskId, it.text, it.done ? 1 : 0, now);
      createdChecklistIds.push(Number(rr.lastInsertRowid));
    }
  }

  // Notify assigned user
  db.prepare("insert into notifications (user_id, title, message, task_id, created_at, read) values (?, ?, ?, ?, ?, 0)").run(
    assigned_to,
    "New task assigned",
    `${user.email} assigned you a new task: ${title}`,
    taskId,
    now,
  );

  const sharerUser = db.prepare("select name, email from users where id = ?").get(user.id) as { name: string | null; email: string } | undefined;
  const sharerLabel = sharerUser?.name?.trim() || user.email;

  const shareStmt = db.prepare(
    "insert into task_shares (task_id, from_user_id, to_user_id, created_at) values (?, ?, ?, ?)",
  );
  for (const toUserId of sharedWithIds) {
    const tgt = db.prepare("select id from users where id = ?").get(toUserId) as { id: number } | undefined;
    if (!tgt) continue;
    const dup = db.prepare("select id from task_shares where task_id = ? and to_user_id = ?").get(taskId, toUserId);
    if (dup) continue;
    shareStmt.run(taskId, user.id, toUserId, now);
    db.prepare(
      "insert into notifications (user_id, title, message, task_id, created_at, read) values (?, ?, ?, ?, ?, 0)",
    ).run(
      toUserId,
      "Task shared with you",
      `${sharerLabel} shared a task with you: ${title || `Task #${taskId}`}`,
      taskId,
      now,
    );
  }

  const actorRow = db.prepare("select name from users where id = ?").get(user.id) as { name: string | null } | undefined;

  logActivity({
    actor_id: user.id,
    actor_name: actorRow?.name || user.email.split("@")[0],
    actor_role: user.role,
    action: ACTIONS.TASK_CREATED,
    entity_type: "task",
    entity_id: taskId,
    entity_title: title,
    route_path: `/app/tasks/${taskId}`,
  });

  return NextResponse.json({ id: taskId, checklistItemIds: createdChecklistIds });
}
