import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import path from "path";
import fs from "fs";
import { initDb, getDb } from "@/server/db";
import { requireUser } from "@/server/http";
import { logActivity, ACTIONS } from "@/lib/activity";

// ── Zod schemas ─────────────────────────────────────────────────────────────
const PriorityEnum = z.enum(["easy", "medium", "high", "very_high", "critical"]);
const StatusEnum = z.enum(["pending", "not_started", "in_process", "blocked", "complete", "failed"]);

const PatchTaskSchema = z.object({
  status: StatusEnum.optional(),
  progress: z.number().min(0).max(100).optional(),
  timer_running: z.boolean().optional(),
  timerRunning: z.boolean().optional(),
  elapsed_seconds: z.number().min(0).optional(),
  elapsedSeconds: z.number().min(0).optional(),
  title: z.string().min(1).max(255).trim().optional(),
  description: z.string().max(5000).trim().optional(),
  priority: PriorityEnum.optional(),
  department: z.string().max(100).optional(),
  start_date: z.number().nullable().optional(),
  due_date: z.number().nullable().optional(),
  startDate: z.string().nullable().optional(),
  dueDate: z.string().nullable().optional(),
  assigned_to: z.number().int().positive().optional(),
  assignedTo: z.union([z.number(), z.string()]).optional(), // handle both types from frontend
  checklist: z
    .array(z.object({ id: z.string(), text: z.string(), done: z.boolean() }))
    .optional(),
  project_id: z.number().int().positive().nullable().optional(),
  projectId: z.union([z.number(), z.string()]).nullable().optional(),
  // Admin approval workflow
  admin_approved: z.boolean().optional(),
  adminApproved: z.boolean().optional(),
});

type TaskRow = {
  id: number;
  assigned_to: number;
  status: string;
  progress: number;
  title: string;
  description: string;
  priority: string;
  department: string;
  start_date: number | null;
  due_date: number | null;
};

// GET /api/tasks/[id] - Fetch single task with comments
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  initDb();
  const user = requireUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await ctx.params;
  const taskId = Number(id);
  if (!Number.isFinite(taskId)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  const db = getDb();

  // Fetch task
  const task = db.prepare("select t.*, p.name as project_name from tasks t left join projects p on p.id=t.project_id where t.id = ?").get(taskId) as any;
  if (!task) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Set the camelCase project values for frontend
  if (task.project_id) {
    task.projectId = String(task.project_id);
    task.projectName = String(task.project_name);
  }

  const isAdmin = user.role === "admin" || user.role === "manager";
  const isOwner = task.assigned_to === user.id;

  let isShared = false;
  if (!isAdmin && !isOwner) {
    const share = db.prepare("select id from task_shares where task_id = ? and to_user_id = ?").get(taskId, user.id);
    if (share) isShared = true;
  }

  if (!isAdmin && !isOwner && !isShared) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // If admin set Blocked, assignees/shared users cannot open it
  if (!isAdmin && String(task.status) === "blocked") {
    return NextResponse.json({ error: "This task is blocked and cannot be opened." }, { status: 403 });
  }

  // Fetch comments
  const comments = db.prepare(`
    SELECT c.id, c.task_id as taskId, c.message as text, c.created_at as createdAt,
           c.user_id as createdBy, u.email as createdByEmail, c.parent_id as parentId
    FROM task_comments c
    JOIN users u ON c.user_id = u.id
    WHERE c.task_id = ?
    ORDER BY c.created_at ASC
  `).all(taskId) as Array<Record<string, unknown>>;

  // Fetch comment attachments
  const commentAttachments = db.prepare(`
    SELECT id, comment_id as commentId, name, size, content_type as contentType
    FROM comment_attachments
    WHERE task_id = ?
  `).all(taskId) as Array<Record<string, unknown>>;

  const commentsWithAttachments = comments.map((c: Record<string, unknown>) => ({
    ...c,
    attachments: commentAttachments
      .filter((a) => a.commentId === c.id)
      .map((a) => ({
        id: String(a.id),
        name: a.name,
        url: `/api/comment-files/${a.id}`,
        size: a.size,
        contentType: a.contentType,
      })),
  }));

  // Fetch checklist
  const checklist = db.prepare(`
    SELECT id, task_id as taskId, text, done, created_at as createdAt
    FROM task_checklist
    WHERE task_id = ?
    ORDER BY created_at ASC
  `).all(taskId);

  // Fetch attachments
  const attachments = db.prepare(`
    SELECT id, task_id as taskId, filename, path, size, created_at as createdAt
    FROM attachments
    WHERE task_id = ?
    ORDER BY created_at DESC
  `).all(taskId);

  return NextResponse.json({
    task: {
      ...task,
      comments: commentsWithAttachments,
      checklist,
      attachments,
    },
  });
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  initDb();
  const user = requireUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await ctx.params;
  const taskId = Number(id);
  if (!Number.isFinite(taskId)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  // Parse & validate with Zod
  const rawBody = await req.json().catch(() => null);
  const parsed = PatchTaskSchema.safeParse(rawBody);
  if (!parsed.success) {
    const messages = parsed.error.issues.map((e) => `${e.path.join(".")}: ${e.message}`).join("; ");
    return NextResponse.json({ error: messages }, { status: 400 });
  }
  const body = parsed.data;

  const db = getDb();
  const task = db.prepare("select * from tasks where id = ?").get(taskId) as TaskRow | undefined;
  if (!task) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const isOwner = task.assigned_to === user.id;
  const isAdmin = user.role === "admin";
  const isManager = user.role === "manager";

  let isShared = false;
  if (!isAdmin && !isManager && !isOwner) {
    const share = db.prepare("select id from task_shares where task_id = ? and to_user_id = ?").get(taskId, user.id);
    if (share) isShared = true;
  }

  if (!(isAdmin || isManager || isOwner || isShared)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // When admin sets blocked: assigned/shared users cannot edit anything.
  // When admin sets not_started: assigned/shared users can only view, not edit.
  if (!(isAdmin || isManager) && (String(task.status) === "blocked" || String(task.status) === "not_started")) {
    return NextResponse.json(
      { error: `Task is ${String(task.status).replace("_", " ")}; you can’t edit it.` },
      { status: 403 },
    );
  }

  const next: Record<string, unknown> = {};
  const prevAssignedTo = task.assigned_to;

  // Fields any authorized user can update
  if (body.status != null) {
    next.status = body.status;
    // When user marks task as complete, reset admin_approved to 0 (pending review)
    if (body.status === "complete" && !(isAdmin || isManager)) {
      next.admin_approved = 0;
    }
    // When admin/manager sets task back to in_process (decline), clear admin_approved
    if (body.status === "in_process" && (isAdmin || isManager)) {
      next.admin_approved = 0;
    }
  }
  if (body.progress != null) next.progress = Math.max(0, Math.min(100, body.progress));
  
  const timerRunning = body.timerRunning !== undefined ? body.timerRunning : body.timer_running;
  if (timerRunning !== undefined) next.timer_running = timerRunning ? 1 : 0;
  
  const elapsedSeconds = body.elapsedSeconds !== undefined ? body.elapsedSeconds : body.elapsed_seconds;
  if (elapsedSeconds !== undefined) next.elapsed_seconds = Math.max(0, elapsedSeconds);

  // Admin approval: only admin/manager can set admin_approved
  const adminApprovedVal = body.adminApproved !== undefined ? body.adminApproved : body.admin_approved;
  if (adminApprovedVal !== undefined && (isAdmin || isManager)) {
    next.admin_approved = adminApprovedVal ? 1 : 0;
  }

  // Admin/manager-only fields
  if (body.title != null && (isAdmin || isManager)) next.title = body.title;
  if (body.description != null && (isAdmin || isManager)) next.description = body.description;
  if (body.priority != null && (isAdmin || isManager)) next.priority = body.priority;
  if (body.department != null && (isAdmin || isManager)) next.department = body.department;
  if (body.start_date !== undefined && (isAdmin || isManager)) next.start_date = body.start_date;
  if (body.due_date !== undefined && (isAdmin || isManager)) next.due_date = body.due_date;
  // camelCase aliases from frontend
  if (body.startDate !== undefined && (isAdmin || isManager)) {
    next.start_date = body.startDate == null ? null : Number(new Date(body.startDate).getTime());
  }
  if (body.dueDate !== undefined && (isAdmin || isManager)) {
    next.due_date = body.dueDate == null ? null : Number(new Date(body.dueDate).getTime());
  }
  if (body.assignedTo !== undefined && (isAdmin || isManager)) {
    const raw = body.assignedTo;
    // tasks.assigned_to is NOT NULL in schema; treat unassign as transfer back to acting admin/manager
    if (raw === "" || raw === null || raw === 0 || raw === "0") {
      next.assigned_to = user.id;
    } else {
      const val = typeof raw === "string" ? Number(raw) : raw;
      if (val != null && Number.isFinite(val) && val > 0) {
        next.assigned_to = val;
      }
    }
  }
  if (body.assigned_to !== undefined && (isAdmin || isManager)) {
    if (body.assigned_to == null || Number(body.assigned_to) <= 0) {
      next.assigned_to = user.id;
    } else {
      next.assigned_to = body.assigned_to;
    }
  }
  if (body.projectId !== undefined && (isAdmin || isManager)) {
    const val = typeof body.projectId === 'string' ? Number(body.projectId) : body.projectId;
    if (val != null && Number.isFinite(val) && val > 0) {
      next.project_id = val;
    } else if (val === 0 || body.projectId === null || body.projectId === "") {
      next.project_id = null;
    }
  }
  if (body.project_id !== undefined && (isAdmin || isManager)) {
    next.project_id = body.project_id;
  }
  
  if (next.assigned_to !== undefined) {
    const target = db.prepare("select role from users where id = ?").get(next.assigned_to) as { role: string } | undefined;
    if (!target) return NextResponse.json({ error: "Invalid assigned_to: user not found" }, { status: 400 });
    // Soften check: allow managers too if user is admin
    if (String(target.role).toLowerCase() === "admin" && !isAdmin) {
       return NextResponse.json({ error: "Only admins can reassign admin tasks" }, { status: 403 });
    }
  }

  const keys = Object.keys(next);
  if (!keys.length && !body.checklist) return NextResponse.json({ ok: true });

  if (keys.length) {
    next.updated_at = Date.now();
    const sets = [...keys, "updated_at"].map((k) => `${k} = ?`).join(", ");
    const values = [...keys.map((k) => next[k]), next.updated_at, taskId];
    db.prepare(`update tasks set ${sets} where id = ?`).run(...values);
  }

  // If task was reassigned, remove stale shares so old assignee stops seeing it.
  if (next.assigned_to != null && Number(next.assigned_to) !== Number(prevAssignedTo)) {
    const nextAssignedTo = Number(next.assigned_to);
    if (Number.isFinite(prevAssignedTo) && prevAssignedTo > 0) {
      db.prepare("delete from task_shares where task_id = ? and to_user_id = ?").run(taskId, prevAssignedTo);
    }
    if (Number.isFinite(nextAssignedTo) && nextAssignedTo > 0) {
      db.prepare("delete from task_shares where task_id = ? and to_user_id = ?").run(taskId, nextAssignedTo);
    }
  }

  // Send notifications if admin/manager changed something important
  if (isAdmin || isManager) {
    const now = Date.now();
    const title = String(next.title ?? task.title ?? "Task updated");

    if (next.assigned_to != null) {
      const nextAssignedTo = Number(next.assigned_to);
      if (Number.isFinite(nextAssignedTo) && nextAssignedTo > 0 && nextAssignedTo !== prevAssignedTo) {
        // Notify new assignee
        db.prepare("insert into notifications (user_id, title, message, task_id, created_at, read) values (?, ?, ?, ?, ?, 0)").run(
          nextAssignedTo,
          "Task assigned",
          `${user.email} assigned you to a task: ${title}`,
          taskId,
          now,
        );
        // Notify previous assignee
        if (prevAssignedTo && prevAssignedTo > 0) {
          db.prepare("insert into notifications (user_id, title, message, task_id, created_at, read) values (?, ?, ?, ?, ?, 0)").run(
            prevAssignedTo,
            "Task unassigned",
            `${user.email} unassigned you from task: ${title}`,
            taskId,
            now,
          );
        }
      }
    }

    if (next.status != null && next.status !== task.status) {
      // Notify the person who is currently assigned (the new one if changed)
      const currentAssignee = next.assigned_to != null ? Number(next.assigned_to) : task.assigned_to;
      if (currentAssignee && currentAssignee > 0) {
        db.prepare("insert into notifications (user_id, title, message, task_id, created_at, read) values (?, ?, ?, ?, ?, 0)").run(
          currentAssignee,
          "Task status updated",
          `${user.email} changed your task status to ${String(next.status).replace("_", " ")}: ${title}`,
          taskId,
          now,
        );
      }
    }
  }

  // Handle checklist updates (task owners can update their own subtasks)
  if (body.checklist != null) {
    const updateStmt = db.prepare("update task_checklist set done = ? where id = ? and task_id = ?");
    for (const item of body.checklist) {
      const itemId = Number(item.id);
      if (Number.isFinite(itemId)) {
        updateStmt.run(item.done ? 1 : 0, itemId, taskId);
      }
    }
  }

  let action: typeof ACTIONS[keyof typeof ACTIONS] = ACTIONS.TASK_UPDATED;
  let meta: Record<string, unknown> = {};
  if (next.status != null && next.status !== task.status) {
    action = ACTIONS.TASK_STATUS_CHANGED;
    meta.oldStatus = task.status;
    meta.newStatus = next.status;
  } else if (next.assigned_to != null && next.assigned_to !== prevAssignedTo) {
    action = ACTIONS.TASK_ASSIGNED;
    meta.oldAssignee = prevAssignedTo;
    meta.newAssignee = next.assigned_to;
  } else {
    meta.updatedFields = Object.keys(next);
    if (body.checklist) meta.checklistUpdated = true;
  }

  logActivity({
    actor_id: user.id,
    actor_name: user.email.split("@")[0],
    actor_role: user.role,
    action,
    entity_type: "task",
    entity_id: taskId,
    entity_title: String(next.title ?? task.title),
    meta: Object.keys(meta).length ? meta : undefined,
    route_path: `/app/tasks/${taskId}`,
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  initDb();
  const user = requireUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (user.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await ctx.params;
  const taskId = Number(id);
  if (!Number.isFinite(taskId)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const db = getDb();

  try {
    const rows = db.prepare("select path from attachments where task_id = ?").all(taskId) as Array<{ path: string }>;
    const uploadsDir = path.join(process.cwd(), ".data", "uploads");
    for (const r of rows) {
      const p = path.join(uploadsDir, String(r.path));
      if (fs.existsSync(p)) fs.unlinkSync(p);
    }
  } catch {
    // best-effort cleanup
  }

  const task = db.prepare("select title from tasks where id = ?").get(taskId) as { title: string } | undefined;
  if (task) {
    logActivity({
      actor_id: user.id,
      actor_name: user.email.split("@")[0],
      actor_role: user.role,
      action: ACTIONS.TASK_DELETED,
      entity_type: "task",
      entity_id: taskId,
      entity_title: task.title,
      route_path: `/app/tasks`,
    });
  }

  db.prepare("delete from tasks where id = ?").run(taskId);
  return NextResponse.json({ ok: true });
}
