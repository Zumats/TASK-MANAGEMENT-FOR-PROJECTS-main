import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/server/db";
import { getUserFromRequest } from "@/server/auth";

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; commentId: string }> }
) {
  const user = getUserFromRequest(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: taskId, commentId } = await params;
  if (!taskId || !commentId) {
    return NextResponse.json({ error: "Task ID and Comment ID are required" }, { status: 400 });
  }

  try {
    const db = getDb();
    
    // Get the comment to check ownership
    const comment = db.prepare(
      "SELECT user_id, parent_id FROM task_comments WHERE id = ? AND task_id = ?"
    ).get(Number(commentId), Number(taskId)) as { user_id: number; parent_id: number | null } | undefined;

    if (!comment) {
      return NextResponse.json({ error: "Comment not found" }, { status: 404 });
    }

    // Only allow deletion if user is the comment author
    const isAuthor = comment.user_id === Number(user.id);

    if (!isAuthor) {
      return NextResponse.json({ error: "Not authorized to delete this comment" }, { status: 403 });
    }

    // Delete the comment (and any replies if it's a parent)
    if (comment.parent_id === null) {
      // Delete replies first, then the parent
      db.prepare("DELETE FROM task_comments WHERE parent_id = ?").run(Number(commentId));
    }
    db.prepare("DELETE FROM task_comments WHERE id = ?").run(Number(commentId));

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Failed to delete comment:", err);
    return NextResponse.json({ error: "Failed to delete comment" }, { status: 500 });
  }
}
