export type UserRole = "admin" | "manager" | "user";

export type Department = "software" | "hardware" | "sales" | "operations" | "accounting" | "hr" | "support" | "other";

export type TaskStatus = "pending" | "not_started" | "in_process" | "blocked" | "complete" | "failed";

export type TaskPriority = "easy" | "medium" | "high" | "very_high" | "critical";

export type TaskType = "project" | "ticket";

export type ProjectAssignee = {
  id: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
};

export type Project = {
  id: string;
  name: string;
  description: string;
  createdAt: number;
  updatedAt: number;
  taskCount?: number;
  linkUrl?: string | null;
  fileName?: string | null;
  hasFile?: number | boolean;
  assignees?: ProjectAssignee[];
};

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
  uploadedBy: string | number;
  checklistItemId?: number | null; // null = main task attachment, set = subtask attachment
};

export type TaskComment = {
  id: string;
  taskId: string;
  text: string;
  createdAt: number;
  createdBy: string;
  createdByEmail?: string;
  parentId?: string | null;
  attachments?: {
    id: string;
    name: string;
    url: string;
    size: number;
    contentType?: string;
  }[];
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
  timerRunning?: boolean;
  elapsedSeconds?: number;

  type?: TaskType;
  department?: Department;
  tags?: string[];
  projectId?: string | null;
  projectName?: string | null;
  assignedToEmail?: string;
  assignedToName?: string | null;
  assignedToAvatarUrl?: string | null;

  approvalStatus?: TaskApprovalStatus;
  adminApproved?: boolean; // true only after admin explicitly approves a "complete" task
  checklist?: TaskChecklistItem[];
  attachments?: TaskAttachment[];
  comments?: TaskComment[];
  sharedWith?: { id: string; email: string; avatarUrl?: string }[];
};
