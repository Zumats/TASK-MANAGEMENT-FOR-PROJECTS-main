import { getDb } from "@/server/db";

export const ACTIONS = {
  TASK_CREATED: "task.created",
  TASK_UPDATED: "task.updated",
  TASK_DELETED: "task.deleted",
  TASK_STATUS_CHANGED: "task.status_changed",
  TASK_ASSIGNED: "task.assigned",
  USER_CREATED: "user.created",
  USER_ROLE_CHANGED: "user.role_changed",
  USER_DEACTIVATED: "user.deactivated",
  LOGIN: "auth.login",
  LOGOUT: "auth.logout",
} as const;

export type ActivityLogParams = {
  actor_id: number;
  actor_name: string;
  actor_role: string;
  action: typeof ACTIONS[keyof typeof ACTIONS];
  entity_type: "task" | "user" | "project" | "system";
  entity_id: number;
  entity_title: string;
  meta?: Record<string, unknown>;
  route_path: string;
};

export function logActivity(params: ActivityLogParams) {
  try {
    const db = getDb();
    db.prepare(`
      insert into activity_logs (
        actor_id, actor_name, actor_role, action, entity_type, 
        entity_id, entity_title, meta, route_path, created_at
      ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      params.actor_id,
      params.actor_name,
      params.actor_role,
      params.action,
      params.entity_type,
      params.entity_id,
      params.entity_title,
      params.meta ? JSON.stringify(params.meta) : null,
      params.route_path,
      Date.now()
    );
  } catch (err) {
    console.error("Failed to log activity:", err);
  }
}
