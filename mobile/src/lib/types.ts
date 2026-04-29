export type TaskStatus = "in_process" | "complete" | "failed" | "pending" | "not_started" | "blocked";

export type TaskPriority = "easy" | "medium" | "high" | "very_high" | "critical";

export type Department = "software" | "hardware" | "sales" | "operations" | "accounting" | "hr" | "support" | "other";

export type TaskType = "project" | "ticket";

export type TaskApprovalStatus = "none" | "submitted" | "approved" | "rejected";

export type TaskChecklistItem = {
  id: string;
  text: string;
  done: boolean;
};

export type TaskAttachment = {
  id: string;
  name: string;
  url: string;
  contentType: string;
  size: number;
  uploadedAt: number;
  uploadedBy: string;
  checklistItemId?: number | null;
};

export type TaskComment = {
  id: string;
  taskId: string;
  parentId?: string | null;
  text: string;
  createdAt: number;
  createdBy: string;
  createdByEmail?: string;
  attachments?: TaskAttachment[];
};

export type TaskItem = {
  id: string;
  title: string;
  description: string;
  assignedTo: string;
  assignedBy: string;
  status: TaskStatus;
  progress: number;
  priority: TaskPriority;
  startDate: number | null;
  dueDate: number | null;
  createdAt: number;
  updatedAt: number;

  type?: TaskType;
  department?: Department;
  tags?: string[];

  timerRunning?: boolean;
  elapsedSeconds?: number;

  approvalStatus?: TaskApprovalStatus;
  adminApproved?: boolean;
  projectId?: string | null;
  projectName?: string | null;
  assignedToEmail?: string;
  assignedToName?: string | null;
  assignedToAvatarUrl?: string | null;
  sharedWith?: { id: string; email: string; avatarUrl?: string }[];
  checklist?: TaskChecklistItem[];
  attachments?: TaskAttachment[];
  comments?: TaskComment[];
};
