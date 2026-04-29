import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/server/http";
import { getDb } from "@/server/db";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = requireUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  
  const { id: taskId } = await params;
  
  try {
    const db = getDb();
    const tid = Number(taskId);
    if (!Number.isFinite(tid)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

    const taskRow = db
      .prepare("SELECT assigned_to, status FROM tasks WHERE id = ?")
      .get(tid) as { assigned_to: number; status: string } | undefined;
    if (!taskRow) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const isAdmin = user.role === "admin" || user.role === "manager";
    const isOwner = Number(taskRow.assigned_to) === Number(user.id);
    const isShared = Boolean(
      db
        .prepare("select id from task_shares where task_id = ? and to_user_id = ?")
        .get(tid, Number(user.id)),
    );
    if (!isAdmin && !isOwner && !isShared) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Get comments with user info and parent_id for replies
    const rows = db.prepare(`
      SELECT c.id, c.task_id as taskId, c.message as text, c.created_at as createdAt, 
             c.user_id as createdBy, u.email as createdByEmail, c.parent_id as parentId
      FROM task_comments c
      JOIN users u ON c.user_id = u.id
      WHERE c.task_id = ?
      ORDER BY c.created_at ASC
    `).all(tid) as Array<{
      id: number;
      taskId: number;
      text: string;
      createdAt: number;
      createdBy: number;
      createdByEmail: string;
      parentId: number | null;
    }>;
    
    const comments = rows.map(r => ({
      id: String(r.id),
      taskId: String(r.taskId),
      text: r.text,
      createdAt: r.createdAt,
      createdBy: String(r.createdBy),
      createdByEmail: r.createdByEmail,
      parentId: r.parentId ? String(r.parentId) : null,
    }));
    
    return NextResponse.json({ comments });
  } catch (error) {
    console.error("Error fetching comments:", error);
    return NextResponse.json({ error: "Failed to fetch comments" }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  let user;
  try {
    user = requireUser(request);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  
  const { id: taskId } = await params;
  
  try {
    const db = getDb();
    const tid = Number(taskId);
    if (!Number.isFinite(tid)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

    const body = await request.json();
    const { message, parentId } = body;
    
    if (!message || typeof message !== "string" || message.trim() === "") {
      return NextResponse.json({ error: "Message is required" }, { status: 400 });
    }
    
    // Validate parentId if provided
    const parentCommentId = parentId ? Number(parentId) : null;
    if (parentId && !Number.isFinite(parentCommentId)) {
      return NextResponse.json({ error: "Invalid parent comment ID" }, { status: 400 });
    }
    
    // Get task details to find the assigned user and enforce blocked lock
    const taskRow = db.prepare("SELECT assigned_to, title, status FROM tasks WHERE id = ?").get(tid) as { assigned_to: number | null; title: string; status: string } | undefined;
    const isAdmin = user.role === "admin" || user.role === "manager";
    if (!taskRow) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const isOwner = Number(taskRow.assigned_to) === Number(user.id);
    const isShared = Boolean(
      db
        .prepare("select id from task_shares where task_id = ? and to_user_id = ?")
        .get(tid, Number(user.id)),
    );
    if (!isAdmin && !isOwner && !isShared) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (taskRow && !isAdmin && String(taskRow.status) === "blocked") {
      return NextResponse.json({ error: "Task is blocked; commenting is disabled." }, { status: 403 });
    }
    
    // Insert comment with optional parent_id for replies
    const result = db.prepare(`
      INSERT INTO task_comments (task_id, user_id, parent_id, message, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(tid, Number(user.id), parentCommentId, message.trim(), Date.now());
    
    // Create notification for the assigned user if someone else is commenting
    if (taskRow?.assigned_to && taskRow.assigned_to !== Number(user.id)) {
      try {
        db.prepare(`
          INSERT INTO notifications (user_id, type, title, message, related_id, created_at, read)
          VALUES (?, 'comment', ?, ?, ?, ?, 0)
        `).run(
          taskRow.assigned_to,
          "New comment on task",
          `${isAdmin ? "Admin" : user.email} commented on "${taskRow.title}": ${message.slice(0, 100)}${message.length > 100 ? "..." : ""}`,
          String(tid),
          Date.now()
        );
      } catch (notifErr) {
        console.error("Notification creation failed (non-critical):", notifErr);
      }
    }
    
    // Get the inserted comment with user info
    const row = db.prepare(`
      SELECT c.id, c.task_id as taskId, c.parent_id as parentId, c.message as text, c.created_at as createdAt,
             c.user_id as createdBy, u.email as createdByEmail
      FROM task_comments c
      JOIN users u ON c.user_id = u.id
      WHERE c.id = ?
    `).get(Number(result.lastInsertRowid)) as {
      id: number;
      taskId: number;
      parentId: number | null;
      text: string;
      createdAt: number;
      createdBy: number;
      createdByEmail: string;
    } | undefined;
    
    if (!row) {
      return NextResponse.json({ error: "Failed to create comment" }, { status: 500 });
    }
    
    const comment = {
      id: String(row.id),
      taskId: String(row.taskId),
      parentId: row.parentId ? String(row.parentId) : null,
      text: row.text,
      createdAt: row.createdAt,
      createdBy: String(row.createdBy),
      createdByEmail: row.createdByEmail,
    };
    
    return NextResponse.json({ comment });
  } catch (error) {
    console.error("Error creating comment:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: "Failed to create comment", details: errorMessage }, { status: 500 });
  }
}
