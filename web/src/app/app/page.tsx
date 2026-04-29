"use client";

import { useCallback, useEffect, useMemo, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { RequireAuth } from "@/components/RequireAuth";
import { useAuth } from "@/components/AuthProvider";
import { Card } from "@/components/Card";
import { ProgressRing } from "@/components/ProgressRing";
import { SkeletonCard } from "@/components/SkeletonCard";
import { apiDelete, apiGet, apiPatch, apiPost } from "@/lib/api";
import { AdminSettings } from "@/components/AdminSettings";
import { AdminMeetings } from "@/components/AdminMeetings";
import { AdminProfile } from "@/components/AdminProfile";
import { AdminProjects } from "@/components/AdminProjects";
import { AdminUsersTasks } from "@/components/AdminUsersTasks";
import {
  AdminAssignUserPicker,
  loadLastAssignTemplate,
  saveLastAssignTemplate,
  splitPrimaryAndShared,
} from "@/components/AdminAssignUserPicker";
import { NotificationsView } from "@/components/NotificationsView";
import { BulletinBoard } from "@/components/bulletin/BulletinBoard";
import { ConfessionChat } from "@/components/confessions/ConfessionChat";
import { AppLayout, SidebarItem, type GlobalSearchHit } from "@/components/AppLayout";
import { AdminWorkPackages } from "@/components/AdminWorkPackages";
import { CommunityPolls } from "@/components/CommunityPolls";
import type { Project } from "@/lib/types";
import {
  LayoutDashboard,
  FolderOpen,
  PlusSquare,
  Briefcase,
  ListTodo,
  ClipboardList,
  Clock,
  Zap,
  AlertTriangle,
  Users,
  User,
  Inbox,
  UserCheck,
  Calendar,
  Settings,
  Globe,
  Megaphone,
  Ghost,
  PieChart
} from "lucide-react";

function AutoScrollToBottom({ dependencies }: { dependencies: unknown[] }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (ref.current?.parentElement) {
      const resp = ref.current.parentElement;
      resp.scrollTop = resp.scrollHeight;
    }
  }, dependencies); // eslint-disable-line react-hooks/exhaustive-deps
  return <div ref={ref} />;
}
import type {
  TaskItem,
  TaskPriority,
  TaskStatus,
  TaskComment,
} from "@/lib/types";

type QueuedAssignment = {
  id: string;
  createdAt: number;
  payload: {
    title: string;
    description: string;
    assigned_to: number;
    priority: TaskPriority;
    start_date: number | null;
    due_date: number | null;
    department: string;
    project_id?: number;
    shared_with?: number[];
    checklist: Array<{ text: string; done: boolean }>;
  };
};

const ASSIGN_QUEUE_KEY = "hyperaccess_admin_assign_queue_v1";

function loadAssignQueue(): QueuedAssignment[] {
  try {
    const raw = window.localStorage.getItem(ASSIGN_QUEUE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed)
      ? parsed
        .filter(
          (x): x is QueuedAssignment => Boolean(x) && typeof x === "object",
        )
        .slice(0, 50)
      : [];
  } catch {
    return [];
  }
}

function saveAssignQueue(next: QueuedAssignment[]) {
  window.localStorage.setItem(
    ASSIGN_QUEUE_KEY,
    JSON.stringify(next.slice(0, 50)),
  );
}

function isLikelyOfflineError(e: unknown): boolean {
  if (typeof navigator !== "undefined" && navigator.onLine === false)
    return true;
  if (e instanceof TypeError) return true;
  if (
    e instanceof Error &&
    /network|failed to fetch|fetch failed/i.test(e.message)
  )
    return true;
  return false;
}

function progressColor(pct: number): string {
  if (pct >= 80) return "#22c55e";
  if (pct >= 40) return "#f59e0b";
  return "#ef4444";
}

type CompanyDepartment =
  | "mobile_development"
  | "web_development"
  | "pos"
  | "hardware"
  | "erp_system"
  | "hyper_access"
  | "aln_navarro"
  | "other";

function toCompanyDepartment(value: unknown): CompanyDepartment {
  const v = String(value ?? "other");
  if (
    v === "mobile_development" ||
    v === "web_development" ||
    v === "pos" ||
    v === "hardware" ||
    v === "erp_system" ||
    v === "hyper_access" ||
    v === "aln_navarro" ||
    v === "other"
  )
    return v;
  return "other";
}

function toTaskDepartment(value: unknown): TaskItem["department"] {
  const v = String(value ?? "");
  if (v === "aln_navarro" || v === "hyper_access" || v === "other")
    return "other";
  return v as TaskItem["department"];
}

function toDateInputValue(ms: number | null): string {
  if (!ms) return "";
  const d = new Date(ms);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}T${hh}:${min}`;
}

function mapTaskRow(row: Record<string, unknown>): TaskItem {
  console.log(
    `[DEBUG mapTaskRow] id=${row.id}, timerRunning=${row.timerRunning}, timer_running=${row.timer_running}, elapsedSeconds=${row.elapsedSeconds}, elapsed_seconds=${row.elapsed_seconds}`,
  );
  const rawPriority = String(row.priority ?? "medium");
  const priority: TaskPriority =
    rawPriority === "easy" ||
      rawPriority === "medium" ||
      rawPriority === "high" ||
      rawPriority === "very_high" ||
      rawPriority === "critical"
      ? rawPriority
      : "medium";
  const rawProgress = Number(row.progress);
  const progress = Number.isFinite(rawProgress)
    ? Math.max(0, Math.min(100, rawProgress))
    : 0;
  const startDate = row.start_date == null ? null : Number(row.start_date);
  const dueDate = row.due_date == null ? null : Number(row.due_date);

  const attachments = Array.isArray(row.attachments)
    ? row.attachments
      .filter(
        (a): a is Record<string, unknown> =>
          Boolean(a) && typeof a === "object",
      )
      .map((a) => ({
        id: String(a.id ?? ""),
        name: String(a.name ?? ""),
        url: String(a.url ?? ""),
        checklistItemId:
          a.checklistItemId == null
            ? null
            : Number.isFinite(Number(a.checklistItemId))
              ? Number(a.checklistItemId)
              : null,
        size: a.size == null ? undefined : Number(a.size),
        contentType:
          a.contentType == null ? undefined : String(a.contentType),
        createdAt: a.createdAt == null ? undefined : Number(a.createdAt),
        uploadedBy: a.uploadedBy == null ? undefined : Number(a.uploadedBy),
        avatarUrl: a.avatarUrl == null ? null : String(a.avatarUrl),
      }))
      .filter((a) => a.id && a.url)
    : [];

  const department = toTaskDepartment(row.department);

  const checklist = Array.isArray(row.checklist)
    ? row.checklist
      .filter(
        (x): x is Record<string, unknown> =>
          Boolean(x) && typeof x === "object",
      )
      .map((x) => ({
        id: String(x.id ?? ""),
        text: String(x.text ?? ""),
        done: Boolean(x.done),
      }))
      .filter((x) => x.id && x.text)
    : [];

  const comments = Array.isArray(row.comments)
    ? row.comments
      .filter(
        (c): c is Record<string, unknown> =>
          Boolean(c) && typeof c === "object",
      )
      .map((c) => ({
        id: String(c.id ?? ""),
        taskId: String(c.taskId ?? row.id ?? ""),
        parentId: c.parentId ? String(c.parentId) : null,
        text: String(c.text ?? ""),
        createdAt: Number(c.createdAt ?? Date.now()),
        createdBy: String(c.createdBy ?? ""),
        createdByEmail: String(c.createdByEmail ?? ""),
        attachments: Array.isArray(c.attachments)
          ? c.attachments.map((a: any) => ({
            id: String(a.id ?? ""),
            name: String(a.name ?? ""),
            url: String(a.url ?? ""),
            size: Number(a.size ?? 0),
            contentType: a.contentType ? String(a.contentType) : undefined,
          }))
          : [],
      }))
      .filter((c) => c.id)
    : [];

  return {
    id: String(row.id),
    title: String(row.title ?? ""),
    description: String(row.description ?? ""),
    assignedTo: String(row.assigned_to ?? ""),
    assignedBy: String(row.assigned_by ?? ""),
    status: (row.status as TaskStatus) ?? "in_process",
    progress,
    priority,
    startDate,
    dueDate,
    createdAt: Number(row.created_at ?? Date.now()),
    updatedAt: Number(row.updated_at ?? Date.now()),
    timerRunning: Boolean(row.timerRunning),
    elapsedSeconds: Number(row.elapsedSeconds) || 0,

    type: "project",
    department,
    tags: [],
    approvalStatus: "none",
    adminApproved: Boolean(row.admin_approved || (row as any).adminApproved),
    checklist,
    comments,
    attachments: attachments as unknown as TaskItem["attachments"],
    sharedWith: Array.isArray(row.sharedWith)
      ? row.sharedWith.map((s) => ({
        id: String(s.id),
        email: String(s.email),
        avatarUrl: s.avatarUrl ? String(s.avatarUrl) : undefined,
      }))
      : [],
    projectId: row.projectId ? String(row.projectId) : null,
    projectName: row.projectName ? String(row.projectName) : null,
    assignedToEmail:
      row.assigned_to_email == null ? undefined : String(row.assigned_to_email),
    assignedToName:
      row.assigned_to_name == null ? null : String(row.assigned_to_name),
    assignedToAvatarUrl:
      row.assigned_to_avatar == null ? null : String(row.assigned_to_avatar),
  };
}

function CollapsibleDescription({
  text,
  maxLength = 80,
}: {
  text: string;
  maxLength?: number;
}) {
  const [expanded, setExpanded] = useState(false);
  if (!text) return null;
  if (text.length <= maxLength)
    return <p className="mt-1 text-sm text-white/70">{text}</p>;

  return (
    <div className="mt-1 text-sm text-white/70">
      <p>{expanded ? text : `${text.slice(0, maxLength)}...`}</p>
      <button
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setExpanded(!expanded);
        }}
        className="mt-1 text-xs font-medium text-blue-400 hover:text-blue-300 focus:outline-none"
      >
        {expanded ? "Show less" : "Show more"}
      </button>
    </div>
  );
}

export default function AppPage() {
  const { appUser } = useAuth();
  const router = useRouter();
  const [fullscreenMedia, setFullscreenMedia] = useState<{
    url: string;
    type: "image" | "video";
    name: string;
  } | null>(null);
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [tasksLoading, setTasksLoading] = useState(true);
  const [toast, setToast] = useState<string | null>(null);
  const [taskLoadError, setTaskLoadError] = useState<string | null>(null);
  const [queuedCount, setQueuedCount] = useState(0);
  const [adminTasksPriorityFilter, setAdminTasksPriorityFilter] = useState<
    "all" | TaskPriority
  >("all");
  const [adminTasksUserFilter, setAdminTasksUserFilter] = useState<
    "all" | string
  >("all");
  const [taskFilter, setTaskFilter] = useState<string>("all_open");
  const [dashProjectFilter, setDashProjectFilter] = useState<string>("all");
  const [dashRange, setDashRange] = useState<"all" | "7d" | "30d" | "90d">("30d");
  const [dashUserQuery, setDashUserQuery] = useState("");

  const uid = appUser?.id ?? null;

  const isAdmin = appUser?.role === "admin";

  useEffect(() => {
    if (!appUser) return;
    if (!isAdmin) router.replace("/profile");
  }, [appUser, isAdmin, router]);

  useEffect(() => {
    if (!appUser || !uid) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const res = await apiGet<{ items: unknown[] }>(
          `/api/tasks?filter=${taskFilter}`,
        );
        if (cancelled) return;
        const next = res.items
          .filter(
            (x): x is Record<string, unknown> =>
              Boolean(x) && typeof x === "object",
          )
          .map(mapTaskRow)
          .sort((a, b) => b.createdAt - a.createdAt);
        setTasks(next);
        setTaskLoadError(null);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "Failed to load tasks";
        setTaskLoadError(msg);
      } finally {
        if (!cancelled) setTasksLoading(false);
      }
    };
    void tick();
    const id = window.setInterval(tick, 2500);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [appUser, uid, taskFilter]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const syncCount = () => setQueuedCount(loadAssignQueue().length);

    const processQueue = async () => {
      const q = loadAssignQueue();
      if (!q.length) {
        syncCount();
        return;
      }
      // process in order
      const head = q[0];
      try {
        await apiPost<{ id: number }>("/api/tasks", head.payload);
        const remaining = q.slice(1);
        saveAssignQueue(remaining);
        setToast("Queued task sent");
        setTimeout(() => setToast(null), 2000);
        setQueuedCount(remaining.length);
      } catch {
        // keep queued
        syncCount();
      }
    };

    syncCount();
    void processQueue();
    const onOnline = () => void processQueue();
    window.addEventListener("online", onOnline);
    const id = window.setInterval(() => void processQueue(), 5000);
    return () => {
      window.removeEventListener("online", onOnline);
      window.clearInterval(id);
    };
  }, []);

  const [allUsers, setAllUsers] = useState<
    Array<{ id: number; email: string }>
  >([]);
  const [allUserRecords, setAllUserRecords] = useState<
    Array<{
      id: number;
      email: string;
      role: string;
      department: string;
      status?: string;
      name?: string | null;
      age?: number | null;
      bio?: string | null;
      avatarUrl?: string | null;
      isOnline?: boolean;
      lastSeenAt?: number | null;
    }>
  >([]);
  const [viewUserProfile, setViewUserProfile] = useState<{
    id: number;
    email: string;
    role: string;
    department: string;
    name?: string | null;
    age?: number | null;
    bio?: string | null;
    avatarUrl?: string | null;
  } | null>(null);
  // Separate state for email lookups - includes ALL users without filtering
  const [userEmailMap, setUserEmailMap] = useState<
    Map<string | number, string>
  >(new Map());
  const [userRoleMap, setUserRoleMap] = useState<Map<string | number, string>>(
    new Map(),
  );

  /** Checked users in assign form; first in list order = primary assignee, rest = shared. */
  const [assignSelectedUserIds, setAssignSelectedUserIds] = useState<number[]>([]);

  const assignPickerUsers = useMemo(() => {
    if (!uid) return [];
    return allUserRecords
      .filter((u) => u.id !== uid)
      .filter(
        (u) => String(u.role) === "user" || String(u.role) === "manager",
      )
      .filter((u) => u.status !== "pending" && u.status !== "rejected")
      .sort((a, b) => a.email.localeCompare(b.email))
      .map((u) => ({
        id: u.id,
        email: u.email,
        name: u.name,
        avatarUrl: u.avatarUrl,
      }));
  }, [allUserRecords, uid]);

  useEffect(() => {
    setAssignSelectedUserIds((cur) => {
      const allowed = new Set(assignPickerUsers.map((u) => u.id));
      const next = cur.filter((id) => allowed.has(id));
      if (next.length) return next;
      return assignPickerUsers.length ? [assignPickerUsers[0].id] : [];
    });
  }, [assignPickerUsers]);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [subtasksRaw, setSubtasksRaw] = useState("");
  const [startDate, setStartDate] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("medium");
  const [department, setDepartment] = useState<CompanyDepartment>("other");
  const [projectId, setProjectId] = useState<number | "">("");
  const [projects, setProjects] = useState<Project[]>([]);
  const [pickedFiles, setPickedFiles] = useState<File[]>([]);
  const [subtaskFiles, setSubtaskFiles] = useState<Record<number, File>>({});

  const resetAssignTaskForm = useCallback(() => {
    setTitle("");
    setDescription("");
    setSubtasksRaw("");
    setStartDate("");
    setDueDate("");
    setPriority("medium");
    setDepartment("other");
    setProjectId("");
    setPickedFiles([]);
    setSubtaskFiles({});
    setAssignSelectedUserIds(
      assignPickerUsers.length ? [assignPickerUsers[0].id] : [],
    );
  }, [assignPickerUsers]);

  const applyAssignAnotherTemplate = useCallback(() => {
    const t = loadLastAssignTemplate();
    if (!t) {
      setToast("No saved assignment yet");
      setTimeout(() => setToast(null), 2000);
      return;
    }
    const allowed = new Set(assignPickerUsers.map((u) => u.id));
    const primary = Number(t.assignedTo);
    const ids = [
      ...(Number.isFinite(primary) && primary > 0 && allowed.has(primary)
        ? [primary]
        : []),
      ...t.sharedWith.filter((id) => allowed.has(id)),
    ];
    let unique = [...new Set(ids)];
    if (!unique.length && assignPickerUsers.length)
      unique = [assignPickerUsers[0].id];
    setAssignSelectedUserIds(unique);
    setProjectId(
      t.projectId === ""
        ? ""
        : projects.some((p) => String(p.id) === String(t.projectId))
          ? t.projectId
          : "",
    );
    setPriority(t.priority);
    setStartDate(t.startDate);
    setDueDate(t.dueDate);
    setDepartment(toCompanyDepartment(t.department));
    setToast("Loaded last people, project & schedule");
    setTimeout(() => setToast(null), 2000);
  }, [assignPickerUsers, projects]);

  const [adminTab, setAdminTab] = useState<
    | "dashboard"
    | "assign"
    | "tasks"
    | "users_tasks"
    | "users"
    | "meetings"
    | "projects"
    | "settings"
    | "notifications"
    | "bulletin"
    | "confessions"
    | "community_polls"
    | "profile"
  >("dashboard");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [activityUnread, setActivityUnread] = useState(0);
  const [unreadNotifCount, setUnreadNotifCount] = useState(0);
  const [userStatusFilter, setUserStatusFilter] = useState<"all" | "approved" | "pending" | "rejected" | "deleted">("all");
  const [presenceFilter, setPresenceFilter] = useState<"all" | "online" | "offline">("all");
  const [usersTasksFocusUserId, setUsersTasksFocusUserId] = useState<string | null>(null);

  const [editTaskId, setEditTaskId] = useState<string | null>(null);
  const [viewTaskId, setViewTaskId] = useState<string | null>(null);
  const [fullscreenTask, setFullscreenTask] = useState<TaskItem | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editProjectId, setEditProjectId] = useState<number | "">("");
  const [editDescription, setEditDescription] = useState("");
  const [editPriority, setEditPriority] = useState<TaskPriority>("medium");
  const [editProgress, setEditProgress] = useState(0);
  const [editStart, setEditStart] = useState("");
  const [editDue, setEditDue] = useState("");
  const [editDepartment, setEditDepartment] =
    useState<CompanyDepartment>("other");
  const [editAssignedTo, setEditAssignedTo] = useState("");
  const [editStatus, setEditStatus] = useState<TaskStatus>("in_process");
  const [editComments, setEditComments] = useState<TaskComment[]>([]);
  const [newCommentText, setNewCommentText] = useState("");

  // Confirm delete modal state
  const [deleteConfirm, setDeleteConfirm] = useState<{
    taskId: string;
    taskTitle: string;
  } | null>(null);
  const [deleteConfirmMsg, setDeleteConfirmMsg] = useState<string | null>(null);
  // Task transfer state
  const [transferTaskId, setTransferTaskId] = useState<string | null>(null);
  const [transferToUserId, setTransferToUserId] = useState("");
  const [transferring, setTransferring] = useState(false);
  // 3-dot message context menu state (per comment)
  const [msgMenuCommentId, setMsgMenuCommentId] = useState<string | null>(null);
  // Forwarding state
  const [forwardingComment, setForwardingComment] =
    useState<TaskComment | null>(null);
  const [forwardSearch, setForwardSearch] = useState("");
  // Reply-to state
  const [replyTo, setReplyTo] = useState<{
    commentId: string;
    text: string;
  } | null>(null);
  // Comment file attachment state (per task conversation)
  const [commentFiles, setCommentFiles] = useState<Record<string, File[]>>({});
  const [commentFilePreviews, setCommentFilePreviews] = useState<
    Record<string, string[]>
  >({});
  // Expanded tasks state for summarize dropdown
  const [expandedTasks, setExpandedTasks] = useState<Set<string>>(new Set());

  const toggleTaskExpansion = (taskId: string) => {
    setExpandedTasks((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) {
        next.delete(taskId);
      } else {
        next.add(taskId);
      }
      return next;
    });
  };

  // In-app notification toast (for new message notifs)
  const [notifToast, setNotifToast] = useState<{
    title: string;
    message: string;
    taskId?: string | null;
  } | null>(null);
  // Last known notification count for detecting new ones
  const lastNotifCountRef = useRef(0);

  // Close message menu on click outside
  useEffect(() => {
    const handleClick = () => setMsgMenuCommentId(null);
    window.addEventListener("click", handleClick);
    return () => window.removeEventListener("click", handleClick);
  }, []);

  // Admin: Timer Reports Modal state
  type AdminTimerReport = {
    id: number;
    elapsedSeconds: number;
    stopNote: string | null;
    createdAt: number;
    userEmail: string;
    userName: string | null;
  };
  const [adminReportsModal, setAdminReportsModal] = useState<{
    taskId: string;
    taskTitle: string;
  } | null>(null);
  const [adminReportsData, setAdminReportsData] = useState<AdminTimerReport[]>(
    [],
  );
  const [adminReportsLoading, setAdminReportsLoading] = useState(false);
  const [returningTaskId, setReturningTaskId] = useState<string | null>(null);

  const openAdminReports = async (taskId: string, taskTitle: string) => {
    setAdminReportsModal({ taskId, taskTitle });
    setAdminReportsLoading(true);
    setAdminReportsData([]);
    try {
      const data = await apiGet<{ items: AdminTimerReport[] }>(
        `/api/tasks/${taskId}/reports`,
      );
      setAdminReportsData(data.items || []);
    } catch (err: any) {
      console.error("Failed to load reports:", err);
      setToast("Error loading reports. The server might be busy.");
      setTimeout(() => setToast(null), 4000);
      setAdminReportsData([]);
    } finally {
      setAdminReportsLoading(false);
    }
  };

  const returnTaskToUser = async (taskId: string, assignedTo: string) => {
    if (
      !confirm(
        "Return this task to the user? Their timer time will be preserved and they can Resume where they left off.",
      )
    )
      return;
    setReturningTaskId(taskId);
    try {
      await apiPatch(`/api/tasks/${taskId}`, {
        status: "in_process",
        progress: 0,
        timer_running: false,
      });
      await apiPost("/api/notifications", {
        user_id: Number(assignedTo),
        title: "Task returned",
        message:
          "An admin has returned your task. You can Resume the timer from where you left off.",
        task_id: Number(taskId),
      });
      setTasks((prev) =>
        prev.map((t) =>
          t.id === taskId ? { ...t, status: "in_process", progress: 0 } : t,
        ),
      );
      setToast("Task returned to user. Timer time preserved.");
      setTimeout(() => setToast(null), 3000);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to return task";
      setToast(msg);
      setTimeout(() => setToast(null), 4000);
    } finally {
      setReturningTaskId(null);
    }
  };

  const refreshProjects = async () => {
    try {
      const data = await apiGet<{ items: Project[] }>("/api/projects");
      setProjects(data.items || []);
    } catch (err: any) {
      console.error("Failed to refresh projects:", err);
    }
  };

  // Poll unread activity count for bell badge every 30 seconds (admin only)
  useEffect(() => {
    if (!isAdmin) return;
    let cancelled = false;
    const fetchUnread = async () => {
      try {
        const res = await apiGet<{ items: Array<{ isRead?: boolean }> }>(
          "/api/admin/activity?limit=100",
        );
        if (!cancelled) {
          const count = (res.items || []).filter((i) => !i.isRead).length;
          setActivityUnread(count);
        }
      } catch {
        // ignore
      }
    };
    void fetchUnread();
    const id = setInterval(fetchUnread, 30_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [isAdmin]);

  // Poll notifications unread count for bell dot
  useEffect(() => {
    if (!appUser) return;
    let cancelled = false;
    const fetchUnreadNotifs = async () => {
      try {
        const res = await apiGet<{ items: Array<{ read: number }> }>(
          "/api/notifications",
        );
        if (!cancelled) {
          const count = (res.items || []).filter((i) => !i.read).length;
          setUnreadNotifCount(count);
        }
      } catch {
        // ignore
      }
    };
    void fetchUnreadNotifs();
    const id = setInterval(fetchUnreadNotifs, 10_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [appUser]);

  // Delete task with confirmation modal (optimistic update)
  const confirmDeleteTask = (taskId: string, taskTitle: string) => {
    setDeleteConfirm({ taskId, taskTitle });
  };

  const executeDeleteTask = async (taskId: string) => {
    setDeleteConfirm(null);
    // Optimistic update
    setTasks((prev) => prev.filter((t) => t.id !== taskId));
    try {
      await apiDelete(`/api/tasks/${taskId}`);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Delete failed";
      setToast(msg);
      setTimeout(() => setToast(null), 4000);
      // Revert on error by re-fetching
      const res = await apiGet<{ items: unknown[] }>("/api/tasks").catch(
        () => null,
      );
      if (res) {
        const next = res.items
          .filter(
            (x): x is Record<string, unknown> =>
              Boolean(x) && typeof x === "object",
          )
          .map(mapTaskRow)
          .sort((a, b) => b.createdAt - a.createdAt);
        setTasks(next);
      }
    }
  };

  // Transfer task to another user
  const executeTransferTask = async () => {
    if (!transferTaskId || !transferToUserId) return;
    setTransferring(true);
    try {
      await apiPatch(`/api/tasks/${transferTaskId}`, {
        assigned_to: Number(transferToUserId),
      });
      setTasks((prev) =>
        prev.map((t) =>
          t.id === transferTaskId ? { ...t, assignedTo: transferToUserId } : t,
        ),
      );
      setTransferTaskId(null);
      setToast("Task transferred successfully.");
      setTimeout(() => setToast(null), 3000);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Transfer failed";
      setToast(msg);
      setTimeout(() => setToast(null), 4000);
    } finally {
      setTransferring(false);
    }
  };

  const handleForwardMessage = async (targetTaskId: string) => {
    if (!forwardingComment) return;
    try {
      // 1. Create the comment in the target task
      const res = await apiPost<{ comment: { id: string } }>(
        `/api/tasks/${targetTaskId}/comments`,
        {
          message: forwardingComment.text || "📎 Forwarded Attachment",
        },
      );

      setForwardingComment(null);
      setForwardSearch("");
      setToast("Message forwarded successfully");
      setTimeout(() => setToast(null), 3000);

      // Refresh tasks to see new comment if we are viewing that task
      apiGet<{ items: any[] }>("/api/tasks").then((res) => {
        const next = res.items
          .filter(
            (x): x is Record<string, unknown> =>
              Boolean(x) && typeof x === "object",
          )
          .map(mapTaskRow)
          .sort((a, b) => b.createdAt - a.createdAt);
        setTasks(next);
      }).catch(err => {
        console.warn("Soft fail on tasks refresh after forward:", err);
      });
    } catch (e: any) {
      console.error("Forward failed:", e);
      alert(`Failed to forward message: ${e.message || "Internal Server Error"}`);
    }
  };

  // Send comment, optionally with a file attachment
  const sendComment = async (
    taskId: string,
    text: string,
    parentId?: string | null,
  ): Promise<void> => {
    const files = commentFiles[taskId] || [];
    if (!text.trim() && files.length === 0) return;
    const messageTextToSend = text.trim() || "📎 Attachment";

    const res = await apiPost<{ comment: TaskComment }>(
      `/api/tasks/${taskId}/comments`,
      {
        message: messageTextToSend,
        parentId: replyTo?.commentId || parentId || null,
      },
    );
    setReplyTo(null);
    const commentId = res.comment.id;
    // Upload files if attached
    if (files && files.length > 0) {
      for (const file of files) {
        const fd = new FormData();
        fd.set("file", file);
        await fetch(`/api/tasks/${taskId}/comments/${commentId}/attachments`, {
          method: "POST",
          credentials: "include",
          body: fd,
        }).catch(() => {
          /* best-effort */
        });
      }
      // Revoke preview URLs
      const previews = commentFilePreviews[taskId] || [];
      previews.forEach((p) => {
        if (p) URL.revokeObjectURL(p);
      });
      setCommentFiles((prev) => {
        const n = { ...prev };
        delete n[taskId];
        return n;
      });
      setCommentFilePreviews((prev) => {
        const n = { ...prev };
        delete n[taskId];
        return n;
      });
    }
    // Optimistic update - refetch tasks
    const data = await apiGet<{ items: unknown[] }>("/api/tasks").catch(
      () => null,
    );
    if (data) {
      const next = data.items
        .filter(
          (x): x is Record<string, unknown> =>
            Boolean(x) && typeof x === "object",
        )
        .map(mapTaskRow)
        .sort((a, b) => b.createdAt - a.createdAt);
      setTasks(next);
    }
  };

  // Handle adding a comment from admin edit modal
  const handleAddComment = async () => {
    if (!editTaskId || !newCommentText.trim()) return;
    try {
      const res = await apiPost<{ comment: TaskComment }>(
        `/api/tasks/${editTaskId}/comments`,
        {
          message: newCommentText.trim(),
        },
      );
      setEditComments((prev) => [...prev, res.comment]);
      setNewCommentText("");
      // Notify user about new comment
      apiPost("/api/notifications", {
        user_id: Number(uid), // Notify the current user or a specific user as needed
        title: "New Comment",
        message: `New comment added to task ${editTaskId}.`,
      }).catch(console.error);
    } catch (err) {
      console.error("Failed to add comment:", err);
      alert("Failed to add comment");
    }
  };

  // Notification polling: detect new notifications and show pop-up toasts
  useEffect(() => {
    if (!uid) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const res = await apiGet<{
          items: Array<{
            id: number;
            title: string;
            message: string;
            task_id: number | null;
            read: number;
            created_at: number;
          }>;
        }>("/api/notifications");
        if (cancelled) return;
        const notifs = res.items;
        // Detect new unread notifications
        const unreadCount = notifs.filter((n) => !n.read).length;
        setUnreadNotifCount(unreadCount);
        if (
          unreadCount > lastNotifCountRef.current &&
          lastNotifCountRef.current > 0
        ) {
          // New notification arrived - show toast
          const newest = notifs.filter((n) => !n.read)[0];
          if (newest) {
            setNotifToast({
              title: newest.title,
              message: newest.message,
              taskId: newest.task_id ? String(newest.task_id) : null,
            });
            setTimeout(() => setNotifToast(null), 5000);
          }
        }
        lastNotifCountRef.current = unreadCount;
      } catch {
        /* ignore */
      }
    };
    void tick();
    const id = window.setInterval(tick, 5000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [uid]);

  useEffect(() => {
    if (!isAdmin || !uid) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const res = await apiGet<{
          items: Array<{
            id: number;
            email: string;
            role: string;
            department: string;
            status?: string;
            name?: string | null;
            age?: number | null;
            bio?: string | null;
            avatarUrl?: string | null;
            isOnline?: boolean;
            lastSeenAt?: number | null;
          }>;
        }>("/api/admin/users");
        if (cancelled) return;
        // All users for Accounts tab (including current admin)
        const allRecords = res.items.sort((a, b) =>
          a.email.localeCompare(b.email),
        );
        // Filtered users for assign dropdown (exclude current admin, only user/manager roles)
        const assignableUsers = res.items
          .filter((u) => u.id !== uid)
          .filter(
            (u) => String(u.role) === "user" || String(u.role) === "manager",
          )
          .filter((u) => u.status !== "pending" && u.status !== "rejected")
          .sort((a, b) => a.email.localeCompare(b.email));
        setAllUsers(assignableUsers.map(({ id, email }) => ({ id, email })));
        setAllUserRecords(
          allRecords.map(
            ({
              id,
              email,
              role,
              department,
              status,
              name,
              age,
              bio,
              avatarUrl,
              isOnline,
              lastSeenAt,
            }) => ({
              id,
              email,
              role,
              department,
              status,
              name,
              age,
              bio,
              avatarUrl,
              isOnline,
              lastSeenAt,
            }),
          ),
        );
        // Build email map from ALL users (unfiltered) for lookups
        const emailMap = new Map<string | number, string>();
        const roleMap = new Map<string | number, string>();
        res.items.forEach((u) => {
          emailMap.set(u.id, u.email);
          emailMap.set(String(u.id), u.email);
          roleMap.set(u.id, u.role);
          roleMap.set(String(u.id), u.role);
        });
        setUserEmailMap(emailMap);
        setUserRoleMap(roleMap);
        setTaskLoadError(null);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "Failed to load users";
        setAllUsers([]);
        setAllUserRecords([]);
        setToast(msg);
        setTimeout(() => setToast(null), 4000);
      }
    };
    void tick();
    const id = window.setInterval(tick, 4000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [isAdmin, uid]);

  useEffect(() => {
    if (!isAdmin) return;
    let cancelled = false;
    const fetchProjects = async () => {
      try {
        const res = await apiGet<{ items: Project[] }>("/api/projects");
        if (!cancelled) setProjects(res.items);
      } catch (err) {
        // ignore
      }
    };
    void fetchProjects();
    return () => { cancelled = true; };
  }, [isAdmin]);

  const myTasks = useMemo(() => tasks, [tasks]);

  const dashboardTasks = useMemo(() => {
    const byProject =
      dashProjectFilter === "all"
        ? tasks
        : tasks.filter((t) => String(t.projectId ?? "") === String(dashProjectFilter));
    if (dashRange === "all") return byProject;
    const days = dashRange === "7d" ? 7 : dashRange === "90d" ? 90 : 30;
    const end = Date.now();
    const start = end - days * 24 * 60 * 60 * 1000;
    return byProject.filter((t) => {
      const createdAt = typeof t.createdAt === "number" ? t.createdAt : 0;
      const updatedAt = typeof t.updatedAt === "number" ? t.updatedAt : 0;
      return (createdAt >= start && createdAt <= end) || (updatedAt >= start && updatedAt <= end);
    });
  }, [dashProjectFilter, dashRange, tasks]);

  const totals = useMemo(() => {
    const status: { in_process: number; complete: number; failed: number } = {
      in_process: 0,
      complete: 0,
      failed: 0,
    };
    const priorityCounts: Record<TaskPriority, number> = {
      easy: 0,
      medium: 0,
      high: 0,
      very_high: 0,
      critical: 0,
    };
    let sumProgress = 0;

    for (const t of dashboardTasks) {
      if (t.status === "in_process") status.in_process += 1;
      if (t.status === "complete") status.complete += 1;
      if (t.status === "failed") status.failed += 1;
      priorityCounts[t.priority] = (priorityCounts[t.priority] ?? 0) + 1;
      sumProgress += t.progress;
    }

    const avgProgress = dashboardTasks.length
      ? Math.round(sumProgress / dashboardTasks.length)
      : 0;
    return { status, priorityCounts, avgProgress, total: dashboardTasks.length };
  }, [dashboardTasks]);

  const dashboardSeries = useMemo(() => {
    const days = 14;
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - (days - 1));

    const buckets = Array.from({ length: days }).map((_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return {
        key: d.toISOString().slice(0, 10),
        label: d.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
        startMs: d.getTime(),
        endMs: d.getTime() + 24 * 60 * 60 * 1000,
        created: 0,
        completed: 0,
      };
    });

    for (const t of dashboardTasks) {
      const createdAt = typeof (t as any).createdAt === "number" ? (t as any).createdAt : null;
      const updatedAt = typeof (t as any).updatedAt === "number" ? (t as any).updatedAt : null;
      for (const b of buckets) {
        if (createdAt && createdAt >= b.startMs && createdAt < b.endMs) b.created += 1;
        if (t.status === "complete" && updatedAt && updatedAt >= b.startMs && updatedAt < b.endMs) b.completed += 1;
      }
    }

    const max = Math.max(1, ...buckets.map((b) => Math.max(b.created, b.completed)));
    return { buckets, max };
  }, [dashboardTasks]);

  const dashboardByProject = useMemo(() => {
    const map = new Map<string, { label: string; count: number }>();
    for (const t of dashboardTasks) {
      const pid = t.projectId == null ? "" : String(t.projectId);
      const name = pid ? (projects.find((p) => String(p.id) === pid)?.name ?? "Unknown project") : "No project";
      const key = pid || "__none__";
      map.set(key, { label: name, count: (map.get(key)?.count ?? 0) + 1 });
    }
    return Array.from(map.values()).sort((a, b) => b.count - a.count).slice(0, 6);
  }, [projects, dashboardTasks]);

  const adminSidebar = (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-3 backdrop-blur-xl">
      <div className="text-xs font-semibold uppercase tracking-wide text-white/60">
        Admin
      </div>
      <div className="mt-3 grid gap-2">
        {(
          [
            ["dashboard", "Dashboard"],
            ["assign", "Assign Task"],
            ["tasks", "All Tasks"],
            ["users", "Accounts"],
            ["meetings", "Meetings"],
            ["settings", "Settings"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setAdminTab(key)}
            className={
              "w-full rounded-xl px-3 py-2 text-left text-sm transition-colors " +
              (adminTab === key
                ? "bg-white text-black"
                : "border border-white/10 bg-white/5 text-white/85 hover:bg-white/10")
            }
          >
            {label}
          </button>
        ))}
        {/* Notifications nav item with badge */}
        <button
          type="button"
          onClick={() => {
            setAdminTab("notifications");
            setActivityUnread(0);
          }}
          className={
            "w-full rounded-xl px-3 py-2 text-left text-sm transition-colors flex items-center justify-between " +
            (adminTab === "notifications"
              ? "bg-white text-black"
              : "border border-white/10 bg-white/5 text-white/85 hover:bg-white/10")
          }
        >
          <span>Notifications</span>
          {activityUnread > 0 && (
            <span className="ml-auto bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
              {activityUnread}
            </span>
          )}
        </button>
      </div>

      <div className="mt-4 rounded-xl border border-white/10 bg-white/5 p-3">
        <div className="text-xs font-semibold text-white/70">Quick stats</div>
        <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
          <div className="rounded-xl border border-white/10 bg-white/5 p-2">
            <div className="text-[11px] text-white/60">Total</div>
            <div className="text-white font-semibold">{totals.total}</div>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/5 p-2">
            <div className="text-[11px] text-white/60">Avg progress</div>
            <div className="text-white font-semibold">
              {totals.avgProgress}%
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <RequireAuth>
      <style jsx global>{`
        select option {
          color: #000;
          background: #fff;
        }
      `}</style>

      {/* ── Global: Notification pop-up toast ── */}
      {notifToast && (
        <div className="fixed top-4 right-4 z-[200] max-w-sm rounded-2xl border border-blue-500/30 bg-[#0d0d1a] shadow-2xl shadow-blue-500/10 p-4 animate-in slide-in-from-top-2 duration-300">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-xl bg-blue-500/20 flex items-center justify-center flex-shrink-0">
              <svg
                className="w-4 h-4 text-blue-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
                />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-white">
                {notifToast.title}
              </div>
              <div className="text-xs text-white/60 mt-0.5 line-clamp-2">
                {notifToast.message}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setNotifToast(null)}
              className="text-white/40 hover:text-white/70 text-lg leading-none flex-shrink-0"
            >
              ×
            </button>
          </div>
        </div>
      )}

      {/* ── Global: Delete Confirmation Modal ── */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
          <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#0d0d1a] shadow-2xl p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-red-500/20 flex items-center justify-center">
                <svg
                  className="w-5 h-5 text-red-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                  />
                </svg>
              </div>
              <div>
                <div className="text-base font-semibold text-white">
                  Delete Task?
                </div>
                <div className="text-xs text-white/50">
                  This action cannot be undone
                </div>
              </div>
            </div>
            <p className="text-sm text-white/70 mb-5">
              Are you sure you want to delete{" "}
              <span className="font-medium text-white">
                &quot;{deleteConfirm.taskTitle}&quot;
              </span>
              ?
            </p>
            {deleteConfirmMsg && (
              <p className="text-xs text-red-400 mb-3">{deleteConfirmMsg}</p>
            )}
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => {
                  setDeleteConfirm(null);
                  setDeleteConfirmMsg(null);
                }}
                className="flex-1 rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-sm text-white/80 hover:bg-white/10 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void executeDeleteTask(deleteConfirm.taskId)}
                className="flex-1 rounded-xl bg-red-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-600 transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Global: Transfer Task Modal ── */}
      {transferTaskId && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
          <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#0d0d1a] shadow-2xl p-6">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 rounded-xl bg-blue-500/20 flex items-center justify-center">
                <svg
                  className="w-5 h-5 text-blue-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"
                  />
                </svg>
              </div>
              <div>
                <div className="text-base font-semibold text-white">
                  Transfer Task
                </div>
                <div className="text-xs text-white/50">
                  Reassign to another user
                </div>
              </div>
            </div>
            <div className="mb-5">
              <label className="text-xs font-medium text-white/70 mb-1.5 block">
                Transfer to
              </label>
              <select
                className="w-full rounded-xl border border-white/15 bg-white/10 px-3 py-2.5 text-sm text-white outline-none focus:border-blue-500/50"
                value={transferToUserId}
                onChange={(e) => setTransferToUserId(e.target.value)}
              >
                <option value="">Select user...</option>
                {allUsers.map((u) => (
                  <option
                    key={u.id}
                    value={String(u.id)}
                    className="bg-[#13131f]"
                  >
                    {u.email}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setTransferTaskId(null)}
                className="flex-1 rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-sm text-white/80 hover:bg-white/10 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!transferToUserId || transferring}
                onClick={() => void executeTransferTask()}
                className="flex-1 rounded-xl bg-blue-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-600 transition-colors disabled:opacity-50"
              >
                {transferring ? "Transferring..." : "Transfer"}
              </button>
            </div>
          </div>
        </div>
      )}

      <AppLayout
        sidebarTitle={isAdmin ? "ADMINISTRATION" : "USER PROFILE"}
        sidebarOpen={sidebarOpen}
        onSidebarToggle={() => setSidebarOpen((v) => !v)}
        unreadCount={unreadNotifCount + activityUnread}
        onGlobalSearchSelect={(hit: GlobalSearchHit) => {
          if (hit.type === "task") {
            setViewTaskId(hit.id);
            setTaskFilter("all_open");
            setAdminTab("tasks");
            return;
          }
          if (hit.type === "comment" && hit.taskId) {
            setViewTaskId(hit.taskId);
            setTaskFilter("all_open");
            setAdminTab("tasks");
            return;
          }
          if (hit.type === "project") {
            setAdminTab("projects");
            return;
          }
          if (hit.type === "user") {
            setUsersTasksFocusUserId(hit.id);
            setAdminTab("users_tasks");
            return;
          }
          if (hit.type === "announcement") {
            setAdminTab("bulletin");
            return;
          }
        }}
        sidebarItems={[
          { id: "dashboard", icon: <LayoutDashboard size={18} />, label: "Dashboard" },
          { id: "projects", icon: <FolderOpen size={18} />, label: "Projects" },
          { id: "assign", icon: <PlusSquare size={18} />, label: "Assign Task" },
          {
            id: "tasks",
            icon: <Briefcase size={18} />,
            label: "Work Overview",
            children: [
              { id: "all_open", icon: <ListTodo size={16} />, label: "All open" },
              { id: "recently_created", icon: <Clock size={16} />, label: "Recently Created" },
              { id: "latest_activity", icon: <Zap size={16} />, label: "Latest Activity" },
              { id: "overdue", icon: <AlertTriangle size={16} />, label: "Overdue" },
              {
                id: "shared_with_users",
                icon: <Users size={16} />,
                label: "Shared with Users",
              },
              { id: "shared_with_me", icon: <Inbox size={16} />, label: "Shared with Me" },
            ],
          },
          { id: "users_tasks", icon: <ClipboardList size={18} />, label: "Users Tasks" },
          { id: "users", icon: <UserCheck size={18} />, label: "Accounts" },
          { id: "meetings", icon: <Calendar size={18} />, label: "Meetings" },
          { id: "settings", icon: <Settings size={18} />, label: "Settings" },
          { id: "div1", icon: <span />, label: "", isDivider: true },
          {
            id: "community",
            icon: <Globe size={18} />,
            label: "Community",
            children: [
              { id: "bulletin", icon: <Megaphone size={16} />, label: "Announcements" },
              { id: "confessions", icon: <Ghost size={16} />, label: "Anonymous Wall" },
              { id: "community_polls", icon: <PieChart size={16} />, label: "Polls & Feedback" },
            ],
          },
          { id: "div3", icon: <span />, label: "", isDivider: true },
          { id: "profile", icon: <User size={18} />, label: "Profile" },
        ]}
        activeTab={adminTab === "tasks" ? taskFilter : adminTab}
        onTabChange={(id) => {
          if (id === "profile") {
            setAdminTab("profile");
          } else if (id === "my_tasks") {
            router.push("/profile");
          } else if (id === "tasks") {
            setTaskFilter("all_open");
            setAdminTab("tasks");
          } else if (
            [
              "all_open",
              "recently_created",
              "latest_activity",
              "overdue",
              "shared_with_users",
              "shared_with_me",
            ].includes(id)
          ) {
            setTaskFilter(id);
            setAdminTab("tasks");
          } else if (id === "analytics") {
            setAdminTab("dashboard");
          } else if (
            [
              "dashboard",
              "projects",
              "assign",
              "users_tasks",
              "users",
              "meetings",
              "settings",
              "notifications",
              "bulletin",
              "confessions",
              "community_polls",
              "profile",
            ].includes(id)
          ) {
            setAdminTab(id as any);
          } else {
            // ignore unknown ids from shared menus
          }
        }}
      >
        <div className="p-4 md:p-5 lg:p-6 h-full overflow-y-auto">
          <div className="max-w-[1400px] mx-auto w-full">
            {toast ? (
              <div className="mb-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-100 italic flex items-center gap-2">
                <span className="text-emerald-400">✓</span> {toast}
              </div>
            ) : null}

            {taskLoadError ? (
              <div className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200 flex items-center gap-2">
                <span className="text-red-400">⚠</span> {taskLoadError}
              </div>
            ) : null}

            <div>
              {isAdmin && adminTab === "dashboard" ? (
                <div className="space-y-6">
                  <Card className="bg-[#191922] border-white/10">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                      <div>
                        <h3 className="text-base font-semibold text-white">Dashboard filters</h3>
                        <p className="mt-1 text-sm text-white/55">
                          Scope insights by date range and project.
                        </p>
                      </div>
                      <div className="grid gap-2 sm:grid-cols-2">
                        <div className="grid gap-1">
                          <label className="text-[10px] font-bold uppercase tracking-wider text-white/40">
                            Date range
                          </label>
                          <select
                            value={dashRange}
                            onChange={(e) => setDashRange(e.target.value as any)}
                            className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/85 outline-none focus:border-blue-500/50"
                            style={{ colorScheme: "dark" }}
                          >
                            <option value="all" className="bg-[#191922]">All time</option>
                            <option value="7d" className="bg-[#191922]">Last 7 days</option>
                            <option value="30d" className="bg-[#191922]">Last 30 days</option>
                            <option value="90d" className="bg-[#191922]">Last 90 days</option>
                          </select>
                        </div>
                        <div className="grid gap-1">
                          <label className="text-[10px] font-bold uppercase tracking-wider text-white/40">
                            Project
                          </label>
                          <select
                            value={dashProjectFilter}
                            onChange={(e) => setDashProjectFilter(e.target.value)}
                            className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/85 outline-none focus:border-blue-500/50"
                            style={{ colorScheme: "dark" }}
                          >
                            <option value="all" className="bg-[#191922]">All projects</option>
                            {projects.map((p) => (
                              <option key={p.id} value={String(p.id)} className="bg-[#191922]">
                                {p.name}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                    </div>
                    <div className="mt-4 text-xs text-white/45">
                      Showing {dashboardTasks.length} task{dashboardTasks.length === 1 ? "" : "s"} in scope.
                    </div>
                  </Card>

                  <div className="grid gap-4 lg:grid-cols-3">
                    <Card className="bg-[#191922] border-white/10">
                      <h3 className="text-base font-semibold text-white">
                        Tasks by status
                      </h3>
                      <div className="mt-4 grid gap-3">
                        {(
                          [
                            [
                              "in_process",
                              totals.status.in_process,
                              "bg-sky-400",
                            ],
                            [
                              "complete",
                              totals.status.complete,
                              "bg-emerald-400",
                            ],
                            ["pending", totals.status.failed, "bg-rose-400"],
                          ] as const
                        ).map(([k, v, cls]) => (
                          <div key={k}>
                            <div className="flex items-center justify-between text-sm text-white/80">
                              <div className="capitalize">
                                {k.replace("_", " ")}
                              </div>
                              <div className="text-white/70">{v}</div>
                            </div>
                            <div className="mt-2 h-2 w-full rounded-full bg-white/10">
                              <div
                                className={"h-2 rounded-full " + cls}
                                style={{
                                  width: `${totals.total ? Math.round((v / totals.total) * 100) : 0}%`,
                                }}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    </Card>

                    <Card className="bg-[#191922] border-white/10">
                      <h3 className="text-base font-semibold text-white">
                        Tasks by priority
                      </h3>
                      <div className="mt-4 grid gap-3">
                        {(
                          [
                            [
                              "easy",
                              totals.priorityCounts.easy,
                              "bg-emerald-400",
                            ],
                            [
                              "medium",
                              totals.priorityCounts.medium,
                              "bg-sky-400",
                            ],
                            [
                              "high",
                              totals.priorityCounts.high,
                              "bg-amber-400",
                            ],
                            [
                              "very_high",
                              totals.priorityCounts.very_high,
                              "bg-orange-400",
                            ],
                            [
                              "critical",
                              totals.priorityCounts.critical,
                              "bg-rose-400",
                            ],
                          ] as const
                        ).map(([k, v, cls]) => (
                          <div key={k}>
                            <div className="flex items-center justify-between text-sm text-white/80">
                              <div className="capitalize">
                                {k.replace("_", " ")}
                              </div>
                              <div className="text-white/70">{v}</div>
                            </div>
                            <div className="mt-2 h-2 w-full rounded-full bg-white/10">
                              <div
                                className={"h-2 rounded-full " + cls}
                                style={{
                                  width: `${totals.total ? Math.round((v / totals.total) * 100) : 0}%`,
                                }}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    </Card>

                    <Card className="bg-[#191922] border-white/10">
                      <div className="flex items-center justify-between">
                        <h3 className="text-base font-semibold text-white">
                          Health
                        </h3>
                        <span className="text-xs text-white/50">
                          quick insights
                        </span>
                      </div>
                      <div className="mt-4 grid gap-3">
                        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                          <div className="text-xs text-white/60">
                            Open tasks
                          </div>
                          <div className="mt-1 text-2xl font-semibold text-white">
                            {totals.total - totals.status.complete}
                          </div>
                          <div className="mt-3 h-2 w-full rounded-full bg-white/10 overflow-hidden">
                            <div
                              className="h-2 bg-sky-400"
                              style={{
                                width: `${totals.total ? Math.round(((totals.total - totals.status.complete) / totals.total) * 100) : 0}%`,
                              }}
                            />
                          </div>
                        </div>
                        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                          <div className="text-xs text-white/60">
                            Pending (attention)
                          </div>
                          <div className="mt-1 text-2xl font-semibold text-white">
                            {totals.status.failed}
                          </div>
                          <div className="mt-1 text-xs text-white/50">
                            Tasks marked as pending / failed
                          </div>
                        </div>
                      </div>
                    </Card>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    {(
                      [
                        { label: "In process", value: totals.status.in_process, cls: "from-sky-500/25 to-sky-500/5 border-sky-500/20 text-sky-300" },
                        { label: "Complete", value: totals.status.complete, cls: "from-emerald-500/25 to-emerald-500/5 border-emerald-500/20 text-emerald-300" },
                        { label: "Pending", value: totals.status.failed, cls: "from-amber-500/25 to-amber-500/5 border-amber-500/20 text-amber-300" },
                        { label: "Avg progress", value: `${totals.avgProgress}%`, cls: "from-violet-500/25 to-violet-500/5 border-violet-500/20 text-violet-300" },
                      ] as const
                    ).map((kpi, idx) => (
                      <motion.div
                        key={kpi.label}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.3, delay: 0.04 * idx }}
                      >
                        <div className={`rounded-2xl border bg-gradient-to-b p-4 ${kpi.cls}`}>
                          <div className="text-[11px] font-bold uppercase tracking-wider text-white/50">
                            {kpi.label}
                          </div>
                          <div className="mt-2 text-3xl font-semibold text-white">
                            {kpi.value}
                          </div>
                        </div>
                      </motion.div>
                    ))}
                  </div>

                  {/* Calendar view removed per request */}

                  {/* Users Overview Section */}
                  <Card className="bg-[#191922] border-white/10">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                      <div>
                        <h3 className="text-base font-semibold text-white">
                          Users Overview
                        </h3>
                        <p className="mt-1 text-sm text-white/55">
                          Task totals within current dashboard scope.
                        </p>
                      </div>
                      <div className="grid gap-1">
                        <label className="text-[10px] font-bold uppercase tracking-wider text-white/40">
                          Filter users
                        </label>
                        <input
                          value={dashUserQuery}
                          onChange={(e) => setDashUserQuery(e.target.value)}
                          placeholder="Search user…"
                          className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/85 outline-none focus:border-blue-500/50"
                        />
                      </div>
                    </div>
                    <div className="mt-4 grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
                      {allUserRecords
                        .filter(
                          (u) => u.role === "user" || u.role === "manager",
                        )
                        .filter((u) => {
                          const q = dashUserQuery.trim().toLowerCase();
                          if (!q) return true;
                          const label = (u.name?.trim() || u.email).toLowerCase();
                          return label.includes(q) || String(u.email).toLowerCase().includes(q);
                        })
                        .slice(0, 6)
                        .map((u) => {
                          const uTasks = dashboardTasks.filter(
                            (t) => String(t.assignedTo) === String(u.id),
                          );
                          const inProcess = uTasks.filter(
                            (t) => t.status === "in_process",
                          ).length;
                          const complete = uTasks.filter(
                            (t) => t.status === "complete",
                          ).length;
                          const failed = uTasks.filter(
                            (t) => t.status === "failed",
                          ).length;
                          return (
                            <div
                              key={u.id}
                              className="rounded-xl border border-white/10 bg-white/5 p-4 flex flex-col gap-2"
                            >
                              <div className="font-medium text-white truncate">
                                {u.email}
                              </div>
                              <div className="flex gap-3 text-xs">
                                <span className="text-sky-400">
                                  {inProcess} In process
                                </span>
                                <span className="text-emerald-400">
                                  {complete} Complete
                                </span>
                                <span className="text-rose-400">
                                  {failed} Pending
                                </span>
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  </Card>

                  {/* Pending Tasks Section */}
                  {(() => {
                    const failedTasks = dashboardTasks.filter(
                      (t) => t.status === "failed",
                    );
                    return failedTasks.length > 0 ? (
                      <Card className="bg-[#191922] border-white/10">
                        <div className="flex items-center justify-between">
                          <div>
                            <h3 className="text-base font-semibold text-white">
                              Pending Tasks
                            </h3>
                            <p className="text-sm text-white/55">
                              {failedTasks.length} task
                              {failedTasks.length === 1 ? "" : "s"} marked as
                              pending
                            </p>
                          </div>
                          <div className="rounded-lg bg-rose-500/20 px-3 py-1 text-sm font-medium text-rose-400">
                            {failedTasks.length}
                          </div>
                        </div>
                        <div className="mt-4 grid gap-3">
                          {failedTasks.slice(0, 10).map((t) => (
                            <div
                              key={t.id}
                              className="rounded-xl border border-rose-500/20 bg-rose-500/5 p-3"
                              onClick={() => setFullscreenTask(t)}
                            >
                              <div className="flex items-center justify-between">
                                <div className="font-medium text-white">
                                  {t.title}
                                </div>
                                <span className="rounded-full bg-rose-500/20 px-2 py-0.5 text-xs text-rose-400">
                                  Pending
                                </span>
                              </div>
                              <div className="mt-1 text-sm text-white/60">
                                Assigned to:{" "}
                                {userEmailMap.get(t.assignedTo) ||
                                  userEmailMap.get(String(t.assignedTo)) ||
                                  t.assignedTo}
                              </div>
                              <div className="mt-1 text-xs text-white/50">
                                {t.dueDate
                                  ? `Due ${new Date(t.dueDate).toLocaleDateString()}`
                                  : "No due date"}{" "}
                                • {t.progress}% progress
                              </div>
                            </div>
                          ))}
                          {failedTasks.length > 10 && (
                            <div className="text-center text-sm text-white/50">
                              +{failedTasks.length - 10} more pending tasks
                            </div>
                          )}
                        </div>
                      </Card>
                    ) : null;
                  })()}

                  {/* Missing/Late Tasks Section */}
                  {(() => {
                    const lateTasks = dashboardTasks.filter(
                      (t) =>
                        t.dueDate &&
                        Date.now() > t.dueDate &&
                        t.status !== "complete",
                    );
                    return lateTasks.length > 0 ? (
                      <Card className="bg-[#191922] border-white/10">
                        <div className="flex items-center justify-between">
                          <div>
                            <h3 className="text-base font-semibold text-white">
                              Missing / Late Tasks
                            </h3>
                            <p className="text-sm text-white/55">
                              {lateTasks.length} overdue task
                              {lateTasks.length === 1 ? "" : "s"} not yet
                              completed
                            </p>
                          </div>
                          <div className="rounded-lg bg-amber-500/20 px-3 py-1 text-sm font-medium text-amber-400">
                            {lateTasks.length}
                          </div>
                        </div>
                        <div className="mt-4 grid gap-3">
                          {lateTasks.slice(0, 10).map((t) => (
                            <div
                              key={t.id}
                              className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3"
                              onClick={() => setFullscreenTask(t)}
                            >
                              <div className="flex items-center justify-between">
                                <div className="font-medium text-white">
                                  {t.title}
                                </div>
                                <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-xs text-amber-400">
                                  Late
                                </span>
                              </div>
                              <div className="mt-1 text-sm text-white/60">
                                Assigned to:{" "}
                                {userEmailMap.get(t.assignedTo) ||
                                  userEmailMap.get(String(t.assignedTo)) ||
                                  t.assignedTo}
                              </div>
                              <div className="mt-1 text-xs text-white/50">
                                Due {new Date(t.dueDate!).toLocaleDateString()}{" "}
                                •{" "}
                                {Math.ceil(
                                  (Date.now() - t.dueDate!) /
                                  (1000 * 60 * 60 * 24),
                                )}{" "}
                                days overdue
                              </div>
                            </div>
                          ))}
                          {lateTasks.length > 10 && (
                            <div className="text-center text-sm text-white/50">
                              +{lateTasks.length - 10} more late tasks
                            </div>
                          )}
                        </div>
                      </Card>
                    ) : null;
                  })()}
                </div>
              ) : null}

              {isAdmin && adminTab === "assign" ? (
                <Card>
                  {/* Header */}
                  <div className="flex items-center gap-3 mb-6">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center shadow-lg shadow-blue-500/20">
                      <svg
                        className="w-5 h-5 text-white"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M12 4v16m8-8H4"
                        />
                      </svg>
                    </div>
                    <div>
                      <h2 className="text-lg font-semibold text-white">
                        Assign a Task
                      </h2>
                      <p className="text-xs text-white/50">
                        Create and assign tasks to team members
                      </p>
                    </div>
                    {queuedCount ? (
                      <div className="ml-auto flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500/20 text-amber-400 text-xs font-medium">
                        <svg
                          className="w-3.5 h-3.5"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                          />
                        </svg>
                        {queuedCount} queued
                      </div>
                    ) : null}
                  </div>

                  <form
                    className="space-y-5"
                    onSubmit={async (e) => {
                      e.preventDefault();
                      try {
                        const safeTitle = title.trim();
                        const safeDesc = description.trim();
                        const { primary: assignedToNum, shared: sharedWithRest } =
                          splitPrimaryAndShared(
                            assignSelectedUserIds,
                            assignPickerUsers,
                          );
                        if (!safeTitle) {
                          setToast("Missing title");
                          setTimeout(() => setToast(null), 3000);
                          return;
                        }
                        if (
                          assignedToNum == null ||
                          !Number.isFinite(assignedToNum) ||
                          assignedToNum <= 0
                        ) {
                          setToast("Select at least one assignee");
                          setTimeout(() => setToast(null), 3000);
                          return;
                        }

                        const startMs = startDate
                          ? new Date(startDate).getTime()
                          : null;
                        const dueMs = dueDate
                          ? new Date(dueDate).getTime()
                          : null;
                        const checklist = subtasksRaw
                          .split(/\r?\n/)
                          .map((s) => s.trim())
                          .filter(Boolean)
                          .slice(0, 50)
                          .map((text) => ({ text, done: false }));

                        const payload = {
                          title: safeTitle,
                          description: safeDesc,
                          assigned_to: assignedToNum,
                          priority,
                          start_date: startMs,
                          due_date: dueMs,
                          department,
                          project_id: projectId || undefined,
                          shared_with: sharedWithRest,
                          checklist,
                        };

                        const created = await apiPost<{
                          id: number;
                          checklistItemIds: number[];
                        }>("/api/tasks", payload);

                        // Upload main task files (no checklistItemId)
                        if (pickedFiles.length) {
                          const taskId = Number(created.id);
                          if (Number.isFinite(taskId)) {
                            for (const f of pickedFiles.slice(0, 5)) {
                              const fd = new FormData();
                              fd.set("taskId", String(taskId));
                              fd.set("file", f);
                              await fetch("/api/files", {
                                method: "POST",
                                credentials: "include",
                                body: fd,
                              });
                            }
                          }
                        }

                        // Upload subtask files (with real checklistItemId returned by the API)
                        const subtaskFileEntries = Object.entries(subtaskFiles);
                        if (subtaskFileEntries.length) {
                          const taskId = Number(created.id);
                          if (Number.isFinite(taskId)) {
                            for (const [idxStr, file] of subtaskFileEntries) {
                              const idx = Number(idxStr);
                              const checklistItemId =
                                created.checklistItemIds?.[idx] ?? null;
                              if (
                                !Number.isFinite(idx) ||
                                !checklistItemId ||
                                !Number.isFinite(Number(checklistItemId))
                              )
                                continue;
                              const fd = new FormData();
                              fd.set("taskId", String(taskId));
                              fd.set("file", file);
                              fd.set(
                                "checklistItemId",
                                String(checklistItemId),
                              );
                              await fetch("/api/files", {
                                method: "POST",
                                credentials: "include",
                                body: fd,
                              });
                            }
                          }
                        }
                        setTitle("");
                        setDescription("");
                        setSubtasksRaw("");
                        setStartDate("");
                        setDueDate("");
                        setPriority("medium");
                        setDepartment("other");
                        setProjectId("");
                        setPickedFiles([]);
                        setSubtaskFiles({});
                        saveLastAssignTemplate({
                          assignedTo: String(assignedToNum),
                          sharedWith: sharedWithRest,
                          projectId,
                          priority,
                          startDate,
                          dueDate,
                          department,
                        });
                        setAssignSelectedUserIds(
                          assignPickerUsers.length
                            ? [assignPickerUsers[0].id]
                            : [],
                        );
                        setToast("Task assigned");
                        setTimeout(() => setToast(null), 2500);
                        // Notify user about new task
                        apiPost("/api/notifications", {
                          user_id: assignedToNum,
                          title: "New Task Assigned",
                          message: `You have been assigned to: "${safeTitle}".`,
                        }).catch(console.error);
                      } catch (e: unknown) {
                        if (
                          typeof window !== "undefined" &&
                          isLikelyOfflineError(e)
                        ) {
                          const safeTitle = title.trim();
                          const safeDesc = description.trim();
                          const { primary: assignedToNum, shared: sw } =
                            splitPrimaryAndShared(
                              assignSelectedUserIds,
                              assignPickerUsers,
                            );
                          if (
                            assignedToNum == null ||
                            !Number.isFinite(assignedToNum) ||
                            assignedToNum <= 0
                          ) {
                            setToast("Select at least one assignee");
                            setTimeout(() => setToast(null), 3000);
                            return;
                          }
                          const startMs = startDate
                            ? new Date(startDate).getTime()
                            : null;
                          const dueMs = dueDate
                            ? new Date(dueDate).getTime()
                            : null;
                          const checklist = subtasksRaw
                            .split(/\r?\n/)
                            .map((s) => s.trim())
                            .filter(Boolean)
                            .slice(0, 50)
                            .map((text) => ({ text, done: false }));

                          const q = loadAssignQueue();
                          q.push({
                            id: `${Date.now()}_${Math.random().toString(16).slice(2)}`,
                            createdAt: Date.now(),
                            payload: {
                              title: safeTitle,
                              description: safeDesc,
                              assigned_to: assignedToNum,
                              priority,
                              start_date: startMs,
                              due_date: dueMs,
                              department,
                              project_id: projectId || undefined,
                              shared_with: sw,
                              checklist,
                            },
                          });
                          saveAssignQueue(q);
                          setQueuedCount(q.length);

                          // Files cannot be queued in localStorage; require reselect when online.
                          setPickedFiles([]);
                          setSubtaskFiles({});
                          setTitle("");
                          setDescription("");
                          setSubtasksRaw("");
                          setStartDate("");
                          setDueDate("");
                          setAssignSelectedUserIds(
                            assignPickerUsers.length
                              ? [assignPickerUsers[0].id]
                              : [],
                          );
                          setToast("Offline: task queued");
                          setTimeout(() => setToast(null), 2500);
                          return;
                        }

                        const msg =
                          e instanceof Error ? e.message : "Assign failed";
                        setToast(msg);
                        setTimeout(() => setToast(null), 3000);
                      }
                    }}
                  >
                    {/* Task Details Section */}
                    <div className="space-y-4">
                      <div className="flex items-center gap-2 text-sm font-medium text-white/70">
                        <svg
                          className="w-4 h-4"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                          />
                        </svg>
                        Task Details
                      </div>

                      {/* Title */}
                      <div className="relative">
                        <input
                          className="w-full rounded-xl border border-white/15 bg-white/10 pl-10 pr-3 py-3 text-sm text-white placeholder:text-white/40 outline-none focus:border-blue-500/50 focus:bg-white/15 transition-all"
                          value={title}
                          onChange={(e) => setTitle(e.target.value)}
                          placeholder="Task title"
                          required
                        />
                        <svg
                          className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-white/40"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                          />
                        </svg>
                      </div>

                      {/* Description */}
                      <textarea
                        className="w-full rounded-xl border border-white/15 bg-white/10 px-3 py-3 text-sm text-white placeholder:text-white/40 outline-none focus:border-blue-500/50 focus:bg-white/15 transition-all resize-none"
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        rows={3}
                        placeholder="Task details (optional)"
                      />
                    </div>

                    {/* Assignment Section */}
                    <div className="space-y-4 pt-2 border-t border-white/10">
                      <div className="flex flex-wrap items-center justify-between gap-2 text-sm font-medium text-white/70">
                        <div className="flex items-center gap-2">
                          <svg
                            className="w-4 h-4"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
                            />
                          </svg>
                          Assignment
                        </div>
                        
                      </div>

                      

                      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
                        <div className="min-w-0 flex-1 space-y-3">
                          <AdminAssignUserPicker
                            users={assignPickerUsers}
                            selectedIds={assignSelectedUserIds}
                            onChange={setAssignSelectedUserIds}
                          />
                          {!assignPickerUsers.length ? (
                            <div className="text-xs text-white/50">
                              No users loaded. Check Accounts / API access.
                            </div>
                          ) : null}
                        </div>
                        
                        {/* Project */}
                        <div className="relative min-w-0 flex-1">
                        <p className="text-[11px] text-white/45 leading-relaxed">
                        Projects 
                      </p>
                          <select
                            className="w-full rounded-xl border border-white/15 bg-white/10 pl-10 pr-3 py-3 text-sm text-white outline-none focus:border-blue-500/50 focus:bg-white/15 transition-all appearance-none cursor-pointer"
                            value={projectId}
                            onChange={(e) => setProjectId(e.target.value ? Number(e.target.value) : "")}
                          >
                            <option value="" className="bg-[#13131f]">
                              No project
                            </option>
                            {projects.map(p => (
                              <option key={p.id} value={p.id} className="bg-[#13131f]">
                                {p.name}
                              </option>
                            ))}
                          </select>
                          <svg
                            className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-white/40"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                          </svg>
                          <svg
                            className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40 pointer-events-none"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                        </div>
                      </div>
                    </div>

                    {/* Schedule & Priority Section */}
                    <div className="space-y-4 pt-2 border-t border-white/10">
                      <div className="flex items-center gap-2 text-sm font-medium text-white/70">
                        <svg
                          className="w-4 h-4"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                          />
                        </svg>
                        Schedule & Priority
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        {/* Start date */}
                        <div className="relative">
                          <input
                            type="datetime-local"
                            className="w-full rounded-xl border border-white/15 bg-white/10 pl-10 pr-3 py-3 text-sm text-white outline-none focus:border-blue-500/50 focus:bg-white/15 transition-all [color-scheme:dark]"
                            value={startDate}
                            onChange={(e) => setStartDate(e.target.value)}
                          />
                          <svg
                            className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-white/40"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                            />
                          </svg>
                        </div>

                        {/* Due date */}
                        <div className="relative">
                          <input
                            type="datetime-local"
                            className="w-full rounded-xl border border-white/15 bg-white/10 pl-10 pr-3 py-3 text-sm text-white outline-none focus:border-blue-500/50 focus:bg-white/15 transition-all [color-scheme:dark]"
                            value={dueDate}
                            onChange={(e) => setDueDate(e.target.value)}
                          />
                          <svg
                            className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-white/40"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                            />
                          </svg>
                        </div>

                        {/* Priority */}
                        <div className="relative">
                          <select
                            className="w-full rounded-xl border border-white/15 bg-white/10 pl-10 pr-3 py-3 text-sm text-white outline-none focus:border-blue-500/50 focus:bg-white/15 transition-all appearance-none cursor-pointer"
                            value={priority}
                            onChange={(e) =>
                              setPriority(e.target.value as TaskPriority)
                            }
                          >
                            <option value="easy" className="bg-[#13131f]">
                              Easy
                            </option>
                            <option value="medium" className="bg-[#13131f]">
                              Medium
                            </option>
                            <option value="high" className="bg-[#13131f]">
                              High
                            </option>
                            <option value="very_high" className="bg-[#13131f]">
                              Very high
                            </option>
                            <option value="critical" className="bg-[#13131f]">
                              Critical
                            </option>
                          </select>
                          <svg
                            className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-white/40"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M13 10V3L4 14h7v7l9-11h-7z"
                            />
                          </svg>
                          <svg
                            className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40 pointer-events-none"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M19 9l-7 7-7-7"
                            />
                          </svg>
                        </div>
                      </div>
                    </div>

                    {/* Subtasks Section */}
                    <div className="space-y-3 pt-2 border-t border-white/10">
                      <div className="flex items-center gap-2 text-sm font-medium text-white/70">
                        <svg
                          className="w-4 h-4"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"
                          />
                        </svg>
                        Subtasks / Checklist
                      </div>
                      <textarea
                        className="w-full rounded-xl border border-white/15 bg-white/10 px-3 py-3 text-sm text-white placeholder:text-white/40 outline-none focus:border-blue-500/50 focus:bg-white/15 transition-all resize-none"
                        value={subtasksRaw}
                        onChange={(e) => setSubtasksRaw(e.target.value)}
                        rows={4}
                        placeholder="Enter subtasks, one per line:
- Prepare report
- Submit to manager
- Review feedback"
                      />
                    </div>

                    {/* Attachments Section */}
                    <div className="space-y-3 pt-2 border-t border-white/10">
                      <div className="flex items-center gap-2 text-sm font-medium text-white/70">
                        <svg
                          className="w-4 h-4"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"
                          />
                        </svg>
                        Attachments
                      </div>

                      {/* Main task attachments */}
                      <div className="grid gap-2 rounded-xl border border-white/10 bg-white/5 p-3">
                        <label className="text-sm font-medium text-white/80">
                          Main task attachments
                        </label>
                        <input
                          type="file"
                          multiple
                          className="w-full rounded-lg border border-white/15 bg-white/10 px-3 py-2 text-xs text-white outline-none file:mr-4 file:py-1 file:px-2 file:rounded-lg file:border-0 file:text-xs file:font-medium file:bg-blue-500/20 file:text-blue-400 hover:file:bg-blue-500/30"
                          onChange={(e) => {
                            const files = Array.from(
                              e.currentTarget.files ?? [],
                            );
                            setPickedFiles(files.slice(0, 5));
                          }}
                        />
                        {pickedFiles.length > 0 && (
                          <div className="flex flex-wrap gap-2">
                            {pickedFiles.map((f, idx) => (
                              <span
                                key={idx}
                                className="flex items-center gap-1 rounded-md border border-white/10 bg-white/10 px-2 py-1 text-xs text-white/70"
                              >
                                <svg
                                  className="w-3 h-3"
                                  fill="none"
                                  viewBox="0 0 24 24"
                                  stroke="currentColor"
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"
                                  />
                                </svg>
                                {f.name}
                              </span>
                            ))}
                          </div>
                        )}
                        <p className="text-xs text-white/50">
                          Max 5 files for main task
                        </p>
                      </div>
                    </div>

                    {/* Subtask attachments - separate section */}
                    {(() => {
                      const previewSubtasks = subtasksRaw
                        .split(/\r?\n/)
                        .map((s) => s.trim().replace(/^-\s*/, ""))
                        .filter(Boolean)
                        .slice(0, 50);
                      if (previewSubtasks.length === 0) return null;
                      return (
                        <div className="grid gap-3 rounded-xl border border-white/10 bg-white/5 p-3">
                          <label className="text-sm font-medium text-white/80">
                            Subtask attachments Guide
                          </label>
                          <div className="space-y-3">
                            {previewSubtasks.map((text, idx) => (
                              <div
                                key={idx}
                                className="grid gap-1 rounded-lg border border-white/10 bg-white/5 p-2"
                              >
                                <div className="flex items-center gap-2">
                                  <span className="text-xs text-white/80 font-medium">
                                    {idx + 1}.
                                  </span>
                                  <span className="text-xs text-white/60 line-clamp-1">
                                    {text}
                                  </span>
                                </div>
                                <input
                                  type="file"
                                  className="w-full rounded-lg border border-white/15 bg-white/10 px-3 py-1.5 text-xs text-white outline-none file:mr-3 file:py-1 file:px-2 file:rounded-md file:border-0 file:text-xs file:bg-blue-500/20 file:text-blue-400"
                                  onChange={(e) => {
                                    const file =
                                      e.currentTarget.files?.[0] ?? null;
                                    if (file) {
                                      setSubtaskFiles((prev) => ({
                                        ...prev,
                                        [idx]: file,
                                      }));
                                    }
                                  }}
                                />
                                {subtaskFiles[idx] && (
                                  <div className="flex items-center gap-1 text-xs text-white/70">
                                    <svg
                                      className="h-3 w-3"
                                      fill="none"
                                      viewBox="0 0 24 24"
                                      stroke="currentColor"
                                    >
                                      <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth={2}
                                        d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"
                                      />
                                    </svg>
                                    {subtaskFiles[idx]?.name}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })()}

                    {/* Submit Button */}
                    <div className="pt-4 space-y-2">
                      <button
                        className="w-full rounded-xl bg-gradient-to-r from-blue-500 to-purple-600 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-500/25 transition-all hover:shadow-blue-500/40 hover:scale-[1.02] active:scale-[0.98] flex items-center justify-center gap-2"
                        type="submit"
                      >
                        <svg
                          className="w-4 h-4"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M12 4v16m8-8H4"
                          />
                        </svg>
                        Assign Task
                      </button>
                      <button
                        type="button"
                        onClick={() => applyAssignAnotherTemplate()}
                        className="rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-semibold text-white/80 hover:bg-white/10 transition-colors"
                      >
                        Assign Another
                      </button>
                      <button
                          type="button"
                          onClick={() => resetAssignTaskForm()}
                          className="rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-semibold text-white/80 hover:bg-white/10 transition-colors"
                        >
                          Reset form
                        </button>
                    </div>
                  </form>

                  {/* Preview: How the task will look to users */}
                  <div className="mt-8 border-t border-white/10 pt-6">
                    <h3 className="text-sm font-medium text-white/70 mb-4">
                      Preview (how users will see this task)
                    </h3>
                    {(() => {
                      const previewSubtasks = subtasksRaw
                        .split(/\r?\n/)
                        .map((s) => s.trim().replace(/^-\s*/, ""))
                        .filter(Boolean)
                        .slice(0, 50);
                      const hasContent =
                        title.trim() ||
                        description.trim() ||
                        previewSubtasks.length > 0;
                      if (!hasContent) {
                        return (
                          <div className="rounded-xl border border-white/10 bg-white/5 p-6 text-center">
                            <p className="text-sm text-white/50">
                              Fill in the form above to see a preview
                            </p>
                          </div>
                        );
                      }
                      const dueMs = dueDate
                        ? new Date(dueDate).getTime()
                        : null;
                      return (
                        <div className="relative overflow-hidden rounded-xl border border-white/10 bg-white/5 backdrop-blur-sm">
                          {/* Colored left border like Google Classroom */}
                          <div className="absolute left-0 top-0 h-full w-1.5 bg-blue-500" />
                          <div className="p-4 pl-5">
                            {/* Header: Department and Status */}
                            <div className="flex items-center justify-between gap-3">

                              <span className="rounded-full px-3 py-1 text-xs font-medium bg-blue-500/20 text-blue-400">
                                Assigned
                              </span>
                            </div>

                            {/* Title */}
                            <h3 className="mt-2 text-lg font-medium text-white">
                              {title.trim() || "Untitled Task"}
                            </h3>

                            {/* Description */}
                            {description.trim() && (
                              <p className="mt-1 text-sm text-white/70 line-clamp-2">
                                {description}
                              </p>
                            )}

                            {/* Due date */}
                            <div className="mt-3 flex items-center gap-2 text-sm">
                              <svg
                                className="h-4 w-4 text-white/50"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                                />
                              </svg>
                              <span className="text-white/60">
                                {dueMs
                                  ? `Due ${new Date(dueMs).toLocaleDateString(
                                    "en-US",
                                    {
                                      month: "short",
                                      day: "numeric",
                                      hour: "numeric",
                                      minute: "2-digit",
                                    },
                                  )}`
                                  : "No due date"}
                              </span>
                            </div>

                            {/* Progress bar */}
                            <div className="mt-3">
                              <div className="h-1.5 w-full rounded-full bg-white/10">
                                <div
                                  className="h-1.5 rounded-full bg-blue-500"
                                  style={{ width: "0%" }}
                                />
                              </div>
                              <div className="mt-1 flex items-center justify-between text-xs text-white/50">
                                <span>Progress</span>
                                <span>0%</span>
                              </div>
                            </div>

                            {/* Subtasks / Checklist */}
                            {previewSubtasks.length > 0 && (
                              <div className="mt-4 rounded-lg border border-white/10 bg-white/5 p-3">
                                <div className="mb-2 flex items-center justify-between">
                                  <span className="text-xs font-medium text-white/60">
                                    Subtasks
                                  </span>
                                  <span className="text-xs text-white/50">
                                    0/{previewSubtasks.length} done
                                  </span>
                                </div>
                                <div className="space-y-2">
                                  {previewSubtasks.map((text, idx) => (
                                    <div
                                      key={idx}
                                      className="rounded-lg border border-white/10 bg-white/5 p-2"
                                    >
                                      <label className="flex cursor-pointer items-start gap-2">
                                        <input
                                          type="checkbox"
                                          disabled
                                          className="mt-0.5 h-4 w-4 rounded border-white/20 bg-white/10"
                                        />
                                        <span className="text-sm text-white/80">
                                          {text}
                                        </span>
                                      </label>
                                      {/* Add work for this subtask */}
                                      <div className="mt-2 pl-6">
                                        <span className="flex items-center gap-1 text-xs text-white/50">
                                          <svg
                                            className="h-3 w-3"
                                            fill="none"
                                            viewBox="0 0 24 24"
                                            stroke="currentColor"
                                          >
                                            <path
                                              strokeLinecap="round"
                                              strokeLinejoin="round"
                                              strokeWidth={2}
                                              d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"
                                            />
                                          </svg>
                                          Add work (subtask)
                                        </span>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Main task attachments preview */}
                            {pickedFiles.length > 0 && (
                              <div className="mt-3">
                                <div className="mb-2 text-xs font-medium text-white/60">
                                  Main task attachments Guide
                                </div>
                                <div className="flex flex-wrap gap-2">
                                  {pickedFiles.map((f, idx) => (
                                    <span
                                      key={idx}
                                      className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs text-white/80"
                                    >
                                      <svg
                                        className="h-3.5 w-3.5"
                                        fill="none"
                                        viewBox="0 0 24 24"
                                        stroke="currentColor"
                                      >
                                        <path
                                          strokeLinecap="round"
                                          strokeLinejoin="round"
                                          strokeWidth={2}
                                          d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"
                                        />
                                      </svg>
                                      {f.name}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Actions row - Main task Add work */}
                            <div className="mt-4 flex items-center gap-3 border-t border-white/10 pt-3">
                              <button
                                type="button"
                                disabled
                                className="flex items-center gap-2 rounded-lg bg-blue-500/50 px-3 py-1.5 text-sm font-medium text-white/70 cursor-not-allowed"
                              >
                                <svg
                                  className="h-4 w-4"
                                  fill="none"
                                  viewBox="0 0 24 24"
                                  stroke="currentColor"
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                                  />
                                </svg>
                                Mark as done
                              </button>
                              <span className="flex items-center gap-1.5 rounded-lg border border-white/20 bg-transparent px-3 py-1.5 text-sm text-white/60">
                                <svg
                                  className="h-4 w-4"
                                  fill="none"
                                  viewBox="0 0 24 24"
                                  stroke="currentColor"
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"
                                  />
                                </svg>
                                Add work (main task)
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                </Card>
              ) : null}

              {isAdmin && adminTab === "tasks" ? (
                <div className="h-[calc(100vh-8rem)] min-h-[560px] rounded-2xl border border-white/10 bg-[#191922] overflow-hidden">
                  <AdminWorkPackages
                    tasks={tasks}
                    allUsers={allUserRecords}
                    projects={projects}
                    filterType={taskFilter}
                    setFilterType={setTaskFilter as any}
                    onShowTask={(t) => setFullscreenTask(t)}
                    onEditTask={(id) => {
                      const t = tasks.find((x) => x.id === id);
                      if (t) {
                        setEditTaskId(id);
                        setEditTitle(t.title);
                        setEditProjectId(t.projectId ? Number(t.projectId) : "");
                        setEditDescription(t.description || "");
                        setEditStatus(t.status);
                        setEditStart(
                          t.startDate
                            ? new Date(t.startDate).toISOString().slice(0, 16)
                            : "",
                        );
                        setEditDue(
                          t.dueDate
                            ? new Date(t.dueDate).toISOString().slice(0, 16)
                            : "",
                        );
                        setEditPriority(t.priority);
                        setEditDepartment(
                          t.department
                            ? toCompanyDepartment(t.department)
                            : "other",
                        );
                        setEditAssignedTo(String(t.assignedTo));
                      }
                    }}
                  />
                </div>
              ) : null}

              {isAdmin && adminTab === "users" ? (
                <Card className="bg-[#191922] border-white/10">
                  {/* Header */}
                  <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                      <h2 className="text-xl font-bold text-white tracking-tight">Accounts</h2>
                      <p className="text-sm text-white/50 mt-0.5">
                        Manage user access, approvals, and account status.
                      </p>
                    </div>
                    <div className="flex items-center gap-3 flex-wrap justify-end">
                      {/* Status Filter */}
                      <div className="relative">
                        <select
                          className="appearance-none rounded-xl border border-white/10 bg-white/5 pl-4 pr-8 py-2 text-xs font-semibold text-white/70 outline-none focus:border-blue-500/50 focus:bg-white/10 transition-all cursor-pointer"
                          value={userStatusFilter}
                          onChange={(e) => setUserStatusFilter(e.target.value as any)}
                        >
                          <option value="all" className="bg-[#13131f]">All Users</option>
                          <option value="approved" className="bg-[#13131f]">✓ Approved</option>
                          <option value="pending" className="bg-[#13131f]">⏳ Pending</option>
                          <option value="rejected" className="bg-[#13131f]">✗ Rejected</option>
                          <option value="deleted" className="bg-[#13131f]">🗑 Deleted</option>
                        </select>
                        <div className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-white/40 text-[10px]">▼</div>
                      </div>
                      {/* Presence Filter */}
                      <div className="relative">
                        <select
                          className="appearance-none rounded-xl border border-white/10 bg-white/5 pl-4 pr-8 py-2 text-xs font-semibold text-white/70 outline-none focus:border-blue-500/50 focus:bg-white/10 transition-all cursor-pointer"
                          value={presenceFilter}
                          onChange={(e) => setPresenceFilter(e.target.value as any)}
                        >
                          <option value="all" className="bg-[#13131f]">All presence</option>
                          <option value="online" className="bg-[#13131f]">● Online</option>
                          <option value="offline" className="bg-[#13131f]">○ Offline</option>
                        </select>
                        <div className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-white/40 text-[10px]">▼</div>
                      </div>
                      {/* Count badge */}
                      <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-bold text-white/60">
                        <span className="text-white">
                          {allUserRecords.filter((u) => {
                            if (userStatusFilter !== "all" && (u.status || "approved") !== userStatusFilter) return false;
                            const lastSeenAt = (u as any).last_seen_at ?? (u as any).lastSeenAt ?? null;
                            const online = Boolean(lastSeenAt) && Date.now() - Number(lastSeenAt) < 5 * 60_000 && u.status !== "deleted";
                            if (presenceFilter === "online" && !online) return false;
                            if (presenceFilter === "offline" && online) return false;
                            return true;
                          }).length}
                        </span>{" "}
                        users
                      </div>
                    </div>
                  </div>

                  {/* User List */}
                  <div className="grid gap-3">
                    {allUserRecords.filter((u) => {
                      if (userStatusFilter !== "all" && (u.status || "approved") !== userStatusFilter) return false;
                      const lastSeenAt = (u as any).last_seen_at ?? (u as any).lastSeenAt ?? null;
                      const online = Boolean(lastSeenAt) && Date.now() - Number(lastSeenAt) < 5 * 60_000 && u.status !== "deleted";
                      if (presenceFilter === "online" && !online) return false;
                      if (presenceFilter === "offline" && online) return false;
                      return true;
                    }).length === 0 ? (
                      <div className="py-16 text-center flex flex-col items-center gap-3 opacity-40">
                        <div className="w-16 h-16 rounded-full border-2 border-dashed border-white/20 flex items-center justify-center">
                          <span className="text-2xl">👤</span>
                        </div>
                        <p className="text-sm text-white/60 font-medium">No users match this filter</p>
                      </div>
                    ) : (
                      allUserRecords.filter((u) => {
                        if (userStatusFilter !== "all" && (u.status || "approved") !== userStatusFilter) return false;
                        const lastSeenAt = (u as any).last_seen_at ?? (u as any).lastSeenAt ?? null;
                        const online = Boolean(lastSeenAt) && Date.now() - Number(lastSeenAt) < 5 * 60_000 && u.status !== "deleted";
                        if (presenceFilter === "online" && !online) return false;
                        if (presenceFilter === "offline" && online) return false;
                        return true;
                      }).map((u) => {
                        const statusBadge = u.status === "pending"
                          ? { text: "Pending", cls: "bg-amber-500/15 text-amber-400 border-amber-500/30" }
                          : u.status === "rejected"
                            ? { text: "Rejected", cls: "bg-red-500/15 text-red-400 border-red-500/30" }
                            : u.status === "deleted"
                              ? { text: "Deleted", cls: "bg-neutral-500/15 text-neutral-400 border-neutral-500/30" }
                              : { text: "Approved", cls: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" };

                        // Use isOnline from API (calculated server-side with 2-minute threshold)
                        const online = u.isOnline ?? false;
                        const presenceBadge = online
                          ? { text: "Online", cls: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" }
                          : { text: "Offline", cls: "bg-gray-500/15 text-gray-400 border-gray-500/30" };

                        return (
                          <div
                            key={u.id}
                            className={`group flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-2xl border px-5 py-4 transition-all ${u.status === "deleted"
                                ? "border-white/5 bg-white/[0.02] opacity-60 hover:opacity-100"
                                : "border-white/10 bg-white/[0.03] hover:bg-white/[0.06] hover:border-white/20"
                              }`}
                          >
                            {/* User Info */}
                            <div className="flex items-center gap-4 min-w-0 flex-1">
                              {/* Avatar */}
                              <div className="w-10 h-10 rounded-xl overflow-hidden bg-white/5 border border-white/10 flex-shrink-0 flex items-center justify-center">
                                {u.avatarUrl ? (
                                  <img src={u.avatarUrl} alt="" className="w-full h-full object-cover" />
                                ) : (
                                  <span className="text-sm font-bold text-white/50">
                                    {(u.name || u.email || "?")[0].toUpperCase()}
                                  </span>
                                )}
                              </div>

                              <div className="min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="text-sm font-semibold text-white truncate">
                                    {u.name || u.email}
                                  </span>
                                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${statusBadge.cls}`}>
                                    {statusBadge.text}
                                  </span>
                                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${presenceBadge.cls}`}>
                                    {presenceBadge.text}
                                  </span>
                                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-blue-500/10 text-blue-400 border border-blue-500/20">
                                    {u.role}
                                  </span>
                                </div>
                                <div className="text-xs text-white/40 mt-0.5 flex items-center gap-2">
                                  <span className="truncate">{u.email}</span>
                                  <span className="opacity-50">•</span>
                                  <span>ID: {u.id}</span>
                                </div>
                              </div>
                            </div>

                            {/* Action Buttons */}
                            <div className="flex flex-wrap items-center gap-2">
                              {/* Pending: Approve + Reject */}
                              {u.status === "pending" && (
                                <>
                                  <button
                                    type="button"
                                    className="rounded-xl bg-emerald-500/15 border border-emerald-500/30 px-3 py-1.5 text-xs font-semibold text-emerald-400 hover:bg-emerald-500/25 transition-all active:scale-95"
                                    onClick={async () => {
                                      try {
                                        await apiPatch(`/api/admin/users/${u.id}`, { action: "approve" });
                                        setAllUserRecords((prev) =>
                                          prev.map((user) => user.id === u.id ? { ...user, status: "approved" } : user)
                                        );
                                        setToast("User approved ✓");
                                        setTimeout(() => setToast(null), 3000);
                                      } catch (e: any) {
                                        setToast(e?.message || "Approve failed");
                                        setTimeout(() => setToast(null), 3000);
                                      }
                                    }}
                                  >
                                    ✓ Approve
                                  </button>
                                  <button
                                    type="button"
                                    className="rounded-xl bg-red-500/10 border border-red-500/20 px-3 py-1.5 text-xs font-semibold text-red-400 hover:bg-red-500/20 transition-all active:scale-95"
                                    onClick={async () => {
                                      if (!confirm("Reject this user? They will not be able to log in.")) return;
                                      try {
                                        await apiPatch(`/api/admin/users/${u.id}`, { action: "reject" });
                                        setAllUserRecords((prev) =>
                                          prev.map((user) => user.id === u.id ? { ...user, status: "rejected" } : user)
                                        );
                                        setToast("User rejected");
                                        setTimeout(() => setToast(null), 3000);
                                      } catch (e: any) {
                                        setToast(e?.message || "Reject failed");
                                        setTimeout(() => setToast(null), 3000);
                                      }
                                    }}
                                  >
                                    ✗ Reject
                                  </button>
                                </>
                              )}

                              {/* Deleted: Restore button */}
                              {u.status === "deleted" && (
                                <button
                                  type="button"
                                  className="rounded-xl bg-blue-500/15 border border-blue-500/30 px-3 py-1.5 text-xs font-semibold text-blue-400 hover:bg-blue-500/25 transition-all active:scale-95"
                                  onClick={async () => {
                                    if (!confirm("Restore this user account? They will be able to log in again.")) return;
                                    try {
                                      await apiPatch(`/api/admin/users/${u.id}`, { action: "restore" });
                                      setAllUserRecords((prev) =>
                                        prev.map((user) => user.id === u.id ? { ...user, status: "approved" } : user)
                                      );
                                      setToast("User account restored ✓");
                                      setTimeout(() => setToast(null), 3000);
                                    } catch (e: any) {
                                      setToast(e?.message || "Restore failed");
                                      setTimeout(() => setToast(null), 3000);
                                    }
                                  }}
                                >
                                  ↺ Restore
                                </button>
                              )}

                              {/* Profile button */}
                              <button
                                type="button"
                                className="rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-white/70 hover:bg-white/10 hover:text-white transition-all active:scale-95"
                                onClick={() => setViewUserProfile(u)}
                              >
                                View Profile
                              </button>

                              {/* Delete button (only for non-deleted) */}
                              {u.status !== "deleted" && (
                                <button
                                  type="button"
                                  className="rounded-xl border border-red-500/20 bg-red-500/5 px-3 py-1.5 text-xs font-semibold text-red-400/70 hover:bg-red-500/15 hover:text-red-400 transition-all active:scale-95"
                                  onClick={async () => {
                                    if (!confirm("Soft-delete this user? You can restore them later.")) return;
                                    try {
                                      await apiDelete(`/api/admin/users/${u.id}`);
                                      setAllUserRecords((prev) =>
                                        prev.map((user) => user.id === u.id ? { ...user, status: "deleted" } : user)
                                      );
                                      setToast("User removed");
                                      setTimeout(() => setToast(null), 3000);
                                    } catch (e: unknown) {
                                      const msg = e instanceof Error ? e.message : "Delete failed";
                                      setToast(msg);
                                      setTimeout(() => setToast(null), 4000);
                                    }
                                  }}
                                >
                                  Delete
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </Card>
              ) : null}

              {isAdmin && adminTab === "meetings" ? (
                <Card className="bg-[#191922] border-white/10">
                  <AdminMeetings allUsers={allUserRecords} projects={projects} />
                </Card>
              ) : null}

              {isAdmin && adminTab === "projects" ? (
                <Card className="bg-[#191922] border-white/10">
                  <AdminProjects onProjectsUpdated={refreshProjects} />
                </Card>
              ) : null}

              {isAdmin && adminTab === "users_tasks" ? (
                <Card className="bg-[#191922] border-white/10">
                  <AdminUsersTasks
                    tasks={tasks}
                    allUserRecords={allUserRecords}
                    focusUserId={usersTasksFocusUserId}
                    onTaskPatched={(taskId: string, patch: Partial<TaskItem>) => {
                      setTasks((prev) =>
                        prev.map((t) => (String(t.id) === String(taskId) ? { ...t, ...patch } : t)),
                      );
                    }}
                  />
                </Card>
              ) : null}

              {isAdmin && adminTab === "community_polls" ? (
                <Card className="bg-[#191922] border-white/10">
                  <CommunityPolls canCreate={Boolean(isAdmin)} />
                </Card>
              ) : null}

              {isAdmin && adminTab === "settings" ? (
                <div className="rounded-2xl border border-white/10 bg-[#191922] p-2">
                  <AdminSettings />
                </div>
              ) : null}

              {isAdmin && adminTab === "notifications" ? (
                <NotificationsView />
              ) : null}

              {isAdmin && adminTab === "profile" ? (
                <AdminProfile />
              ) : null}

              {adminTab === "bulletin" ? <BulletinBoard /> : null}

              {adminTab === "confessions" ? (
                <ConfessionChat isAdmin={isAdmin} />
              ) : null}

              {!isAdmin && adminTab === "settings" && (
                <Card>
                  <div className="flex items-center gap-3 mb-6">
                    <div className="w-10 h-10 rounded-xl bg-blue-500/20 flex items-center justify-center">
                      <svg
                        className="w-5 h-5 text-blue-400"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                        />
                      </svg>
                    </div>
                    <div>
                      <h2 className="text-lg font-semibold text-white">
                        Profile Settings
                      </h2>
                      <p className="text-sm text-white/50">
                        Manage your account preferences
                      </p>
                    </div>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    <button className="flex flex-col items-start gap-4 p-4 rounded-2xl border border-white/10 bg-white/5 hover:bg-white/10 transition-all text-left group">
                      <div className="w-10 h-10 rounded-xl bg-sky-500/20 flex items-center justify-center group-hover:scale-110 transition-transform">
                        <svg
                          className="w-5 h-5 text-sky-400"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"
                          />
                        </svg>
                      </div>
                      <div>
                        <div className="text-sm font-semibold text-white">
                          Change Password
                        </div>
                        <div className="text-xs text-white/40 mt-1">
                          Update your security credentials
                        </div>
                      </div>
                    </button>

                    <button className="flex flex-col items-start gap-4 p-4 rounded-2xl border border-white/10 bg-white/5 hover:bg-white/10 transition-all text-left group">
                      <div className="w-10 h-10 rounded-xl bg-purple-500/20 flex items-center justify-center group-hover:scale-110 transition-transform">
                        <svg
                          className="w-5 h-5 text-purple-400"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                          />
                        </svg>
                      </div>
                      <div>
                        <div className="text-sm font-semibold text-white">
                          Edit Profile
                        </div>
                        <div className="text-xs text-white/40 mt-1">
                          Change your name, bio, and avatar
                        </div>
                      </div>
                    </button>

                    <button className="flex flex-col items-start gap-4 p-4 rounded-2xl border border-white/10 bg-white/5 hover:bg-white/10 transition-all text-left group">
                      <div className="w-10 h-10 rounded-xl bg-amber-500/20 flex items-center justify-center group-hover:scale-110 transition-transform">
                        <svg
                          className="w-5 h-5 text-amber-400"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                          />
                        </svg>
                      </div>
                      <div>
                        <div className="text-sm font-semibold text-white">
                          Work Preferences
                        </div>
                        <div className="text-xs text-white/40 mt-1">
                          Set your working hours and notifications
                        </div>
                      </div>
                    </button>

                    <button className="flex flex-col items-start gap-4 p-4 rounded-2xl border border-white/10 bg-white/5 hover:bg-white/10 transition-all text-left group">
                      <div className="w-10 h-10 rounded-xl bg-emerald-500/20 flex items-center justify-center group-hover:scale-110 transition-transform">
                        <svg
                          className="w-5 h-5 text-emerald-400"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z"
                          />
                        </svg>
                      </div>
                      <div>
                        <div className="text-sm font-semibold text-white">
                          Sync Data
                        </div>
                        <div className="text-xs text-white/40 mt-1">
                          Force a manual sync with the server
                        </div>
                      </div>
                    </button>

                    <button
                      onClick={() => {
                        apiPost("/api/logout", {}).then(() => {
                          window.location.href = "/login";
                        });
                      }}
                      className="flex flex-col items-start gap-4 p-4 rounded-2xl border border-red-500/10 bg-red-500/5 hover:bg-red-500/10 transition-all text-left group"
                    >
                      <div className="w-10 h-10 rounded-xl bg-red-500/20 flex items-center justify-center group-hover:scale-110 transition-transform">
                        <svg
                          className="w-5 h-5 text-red-400"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-6 0v-1m6-10V7a3 3 0 00-6 0v1"
                          />
                        </svg>
                      </div>
                      <div>
                        <div className="text-sm font-semibold text-red-400">
                          Logout
                        </div>
                        <div className="text-xs text-red-400/40 mt-1">
                          Sign out of your account
                        </div>
                      </div>
                    </button>
                  </div>
                </Card>
              )}

              {!isAdmin ? (
                <Card>
                  <div className="flex items-center justify-between">
                    <h2 className="text-lg font-semibold text-white">
                      My tasks
                    </h2>
                    <div className="text-xs text-white/50">
                      {myTasks.length} active tasks
                    </div>
                  </div>
                  <div className="mt-4 grid gap-4">
                    {myTasks.length ? (
                      myTasks.map((t) => {
                        const isLate =
                          t.dueDate &&
                          Date.now() > t.dueDate &&
                          t.status !== "complete";
                        const isComplete = t.status === "complete";
                        const statusColor = isComplete
                          ? "#22c55e"
                          : isLate
                            ? "#ef4444"
                            : "#3b82f6";
                        const statusText = isComplete
                          ? "Turned in"
                          : isLate
                            ? "Missing"
                            : "Assigned";

                        const isAdminUploader = (
                          uploadedBy: unknown,
                        ): boolean => {
                          const keyNum =
                            typeof uploadedBy === "number"
                              ? uploadedBy
                              : Number(uploadedBy);
                          const role =
                            (Number.isFinite(keyNum)
                              ? userRoleMap.get(keyNum)
                              : undefined) ??
                            userRoleMap.get(String(uploadedBy ?? ""));
                          return role === "admin" || role === "manager";
                        };

                        const mainAttachments =
                          t.attachments?.filter((a) => {
                            const id = a.checklistItemId;
                            return id === null || id === undefined || id === 0;
                          }) ?? [];
                        const adminMainAttachments = mainAttachments.filter(
                          (a) => isAdminUploader(a.uploadedBy),
                        );
                        const userMainAttachments = mainAttachments.filter(
                          (a) => !isAdminUploader(a.uploadedBy),
                        );

                        const subtaskAttachments =
                          t.attachments?.filter((a) => {
                            const id = a.checklistItemId;
                            return (
                              id !== null &&
                              id !== undefined &&
                              id !== 0 &&
                              !isNaN(Number(id))
                            );
                          }) ?? [];
                        const adminSubtaskAttachments =
                          subtaskAttachments.filter((a) =>
                            isAdminUploader(a.uploadedBy),
                          );
                        const userSubtaskAttachments =
                          subtaskAttachments.filter(
                            (a) => !isAdminUploader(a.uploadedBy),
                          );

                        return (
                          <div
                            key={t.id}
                            className="relative overflow-hidden rounded-xl border border-white/10 bg-white/5 backdrop-blur-sm transition-all hover:bg-white/10"
                          >
                            {/* Colored left border */}
                            <div
                              className="absolute left-0 top-0 h-full w-1.5"
                              style={{ backgroundColor: statusColor }}
                            />

                            <div className="p-4 pl-5">
                              {/* Header: Department and Status */}
                              <div className="flex items-center justify-between gap-3">
                                <span className="text-xs font-medium text-white/60 uppercase tracking-wide">
                                  {(t.department ?? "other").replace("_", " ")}
                                </span>
                                <div className="flex items-center gap-2">
                                  <span
                                    className="rounded-full px-3 py-1 text-xs font-medium"
                                    style={{
                                      backgroundColor: `${statusColor}20`,
                                      color: statusColor,
                                    }}
                                  >
                                    {statusText}
                                  </span>
                                  {/* Live Status badge */}
                                  <span
                                    className={`rounded-lg border border-white/15 px-2 py-1 text-xs ${t.status === "complete"
                                      ? "bg-green-500/20 text-green-400"
                                      : t.timerRunning
                                        ? "bg-blue-500/20 text-blue-400"
                                        : "bg-amber-500/20 text-amber-400"
                                      }`}
                                  >
                                    {t.status === "complete"
                                      ? "Complete"
                                      : t.timerRunning
                                        ? "In Progress"
                                        : "Pending"}
                                  </span>
                                  <button
                                    onClick={() => toggleTaskExpansion(t.id)}
                                    className="p-1 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 transition-colors"
                                    title={
                                      expandedTasks.has(t.id)
                                        ? "Show Less"
                                        : "Show More"
                                    }
                                  >
                                    <svg
                                      className={`w-4 h-4 text-white/70 transition-transform ${expandedTasks.has(t.id) ? "rotate-180" : ""}`}
                                      fill="none"
                                      viewBox="0 0 24 24"
                                      stroke="currentColor"
                                    >
                                      <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth={2}
                                        d="M19 9l-7 7-7-7"
                                      />
                                    </svg>
                                  </button>
                                </div>
                              </div>

                              {/* Title */}
                              <div className="mt-2 flex items-center justify-between gap-2">
                                <h3 className="text-lg font-medium text-white">
                                  {t.title}
                                </h3>
                                {/* Summary Icons for folded state */}
                                {!expandedTasks.has(t.id) && (
                                  <div className="flex items-center gap-3 text-[10px] text-white/40">
                                    {t.checklist && t.checklist.length > 0 && (
                                      <span className="flex items-center gap-1">
                                        ☑{" "}
                                        {
                                          t.checklist.filter((c) => c.done)
                                            .length
                                        }
                                        /{t.checklist.length}
                                      </span>
                                    )}
                                    {t.attachments &&
                                      t.attachments.length > 0 && (
                                        <span className="flex items-center gap-1">
                                          📎 {t.attachments.length}
                                        </span>
                                      )}
                                    {t.comments && t.comments.length > 0 && (
                                      <span className="flex items-center gap-1">
                                        💬 {t.comments.length}
                                      </span>
                                    )}
                                  </div>
                                )}
                              </div>

                              <CollapsibleDescription text={t.description} />

                              {/* Dates & Quick Progress for folded view */}
                              <div className="mt-2 flex flex-wrap items-center gap-4 text-xs text-white/50">
                                <div className="flex items-center gap-1.5">
                                  <svg
                                    className="h-3.5 w-3.5 opacity-60"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    stroke="currentColor"
                                  >
                                    <path
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      strokeWidth={2}
                                      d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                                    />
                                  </svg>
                                  <span
                                    className={
                                      isLate && !isComplete
                                        ? "text-red-400"
                                        : ""
                                    }
                                  >
                                    {t.dueDate
                                      ? new Date(t.dueDate).toLocaleDateString()
                                      : "No due date"}
                                  </span>
                                </div>
                                <div className="flex items-center gap-1.5">
                                  <div className="h-1.5 w-20 rounded-full bg-white/10 overflow-hidden">
                                    <div
                                      className="h-full bg-blue-500"
                                      style={{
                                        width: `${t.progress}%`,
                                        backgroundColor:
                                          t.progress >= 100
                                            ? "#22c55e"
                                            : "#3b82f6",
                                      }}
                                    />
                                  </div>
                                  <span>{t.progress}%</span>
                                </div>
                              </div>

                              {expandedTasks.has(t.id) && (
                                <div className="mt-4 pt-4 border-t border-white/10 animate-in fade-in slide-in-from-top-2 duration-300">
                                  {/* Time recorded for completed tasks */}
                                  {isComplete &&
                                    t.elapsedSeconds &&
                                    t.elapsedSeconds > 0 && (
                                      <div className="mb-4 flex items-center gap-2 text-sm text-green-400 bg-green-400/10 p-2 rounded-lg border border-green-500/20">
                                        <svg
                                          className="h-4 w-4"
                                          fill="none"
                                          viewBox="0 0 24 24"
                                          stroke="currentColor"
                                        >
                                          <path
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            strokeWidth={2}
                                            d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                                          />
                                        </svg>
                                        <span className="font-medium">
                                          Time recorded:{" "}
                                          {(() => {
                                            const elapsed =
                                              t.elapsedSeconds || 0;
                                            const hours = Math.floor(
                                              elapsed / 3600,
                                            );
                                            const mins = Math.floor(
                                              (elapsed % 3600) / 60,
                                            );
                                            const secs = elapsed % 60;
                                            return `${hours}h ${mins}m ${secs}s`;
                                          })()}
                                        </span>
                                      </div>
                                    )}

                                  {/* Subtasks */}
                                  {t.checklist?.length ? (
                                    <div className="mb-4 rounded-lg border border-white/10 bg-white/5 p-3">
                                      <div className="mb-2 flex items-center justify-between">
                                        <span className="text-xs font-medium text-white/60 uppercase tracking-wider">
                                          Subtasks
                                        </span>
                                        <span className="text-xs text-white/50">
                                          {
                                            t.checklist.filter((c) => c.done)
                                              .length
                                          }
                                          /{t.checklist.length} done
                                        </span>
                                      </div>
                                      <div className="space-y-2">
                                        {t.checklist.map((item) => {
                                          const itemAttachments =
                                            t.attachments?.filter(
                                              (a) =>
                                                a.checklistItemId ===
                                                Number(item.id),
                                            ) ?? [];
                                          return (
                                            <div
                                              key={item.id}
                                              className="rounded-lg border border-white/5 bg-white/5 p-2 transition-colors hover:bg-white/10"
                                            >
                                              <label className="flex items-start gap-2 cursor-pointer">
                                                <input
                                                  type="checkbox"
                                                  checked={item.done}
                                                  onChange={async () => {
                                                    const updatedChecklist =
                                                      t.checklist?.map((c) =>
                                                        c.id === item.id
                                                          ? {
                                                            ...c,
                                                            done: !c.done,
                                                          }
                                                          : c,
                                                      );
                                                    await apiPatch(
                                                      `/api/tasks/${t.id}`,
                                                      {
                                                        checklist:
                                                          updatedChecklist,
                                                      },
                                                    );
                                                  }}
                                                  className="mt-0.5 h-4 w-4 rounded border-white/20 bg-white/10 text-blue-500 accent-blue-500"
                                                />
                                                <span
                                                  className={`text-sm ${item.done ? "text-white/40 line-through" : "text-white/80"}`}
                                                >
                                                  {item.text}
                                                </span>
                                              </label>
                                              {itemAttachments.length > 0 && (
                                                <div className="mt-2 pl-6 flex flex-wrap gap-2">
                                                  {itemAttachments.map((a) => (
                                                    <a
                                                      key={a.id}
                                                      href={a.url}
                                                      target="_blank"
                                                      rel="noreferrer"
                                                      className="text-[10px] text-blue-400 hover:underline flex items-center gap-1"
                                                    >
                                                      📎 {a.name}
                                                    </a>
                                                  ))}
                                                </div>
                                              )}
                                            </div>
                                          );
                                        })}
                                      </div>
                                    </div>
                                  ) : null}

                                  {/* Attachments */}
                                  <div className="mb-4 space-y-3">
                                    {adminMainAttachments.length > 0 && (
                                      <div className="rounded-lg border border-white/10 bg-white/5 p-3">
                                        <div className="text-[10px] font-medium text-white/50 mb-2 uppercase tracking-widest">
                                          Admin Files
                                        </div>
                                        <div className="flex flex-wrap gap-2">
                                          {adminMainAttachments.map((a) => (
                                            <a
                                              key={a.id}
                                              href={a.url}
                                              target="_blank"
                                              rel="noreferrer"
                                              className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs text-white/80 transition-colors hover:bg-white/10"
                                            >
                                              <svg
                                                className="h-3.5 w-3.5"
                                                fill="none"
                                                viewBox="0 0 24 24"
                                                stroke="currentColor"
                                              >
                                                <path
                                                  strokeLinecap="round"
                                                  strokeLinejoin="round"
                                                  strokeWidth={2}
                                                  d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"
                                                />
                                              </svg>
                                              {a.name}
                                            </a>
                                          ))}
                                        </div>
                                      </div>
                                    )}
                                    {userMainAttachments.length > 0 && (
                                      <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3">
                                        <div className="text-[10px] font-medium text-emerald-400/60 mb-2 uppercase tracking-widest">
                                          Your Files
                                        </div>
                                        <div className="flex flex-wrap gap-2">
                                          {userMainAttachments.map((a) => (
                                            <a
                                              key={a.id}
                                              href={a.url}
                                              target="_blank"
                                              rel="noreferrer"
                                              className="flex items-center gap-1.5 rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-2.5 py-1.5 text-xs text-emerald-300 transition-colors hover:bg-emerald-500/10"
                                            >
                                              <svg
                                                className="h-3.5 w-3.5 text-emerald-500/50"
                                                fill="none"
                                                viewBox="0 0 24 24"
                                                stroke="currentColor"
                                              >
                                                <path
                                                  strokeLinecap="round"
                                                  strokeLinejoin="round"
                                                  strokeWidth={2}
                                                  d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"
                                                />
                                              </svg>
                                              {a.name}
                                            </a>
                                          ))}
                                        </div>
                                      </div>
                                    )}
                                  </div>

                                  {/* Integration of Conversation inside expansion */}
                                  <div className="rounded-xl border border-white/10 bg-[#0d0d1a] overflow-hidden">
                                    <div className="bg-white/5 px-3 py-2 border-b border-white/10 flex items-center justify-between text-xs text-white/60">
                                      <span className="flex items-center gap-1.5">
                                        <span className="text-blue-400">
                                          💬
                                        </span>{" "}
                                        Conversation
                                      </span>
                                      <span>
                                        {t.comments?.length || 0} messages
                                      </span>
                                    </div>
                                    <div className="p-3">
                                      {/* Simplified chat view or reused Messenger logic */}
                                      <div className="max-h-60 overflow-y-auto space-y-2 mb-3 pr-2 scrollbar-thin">
                                        {t.comments && t.comments.length > 0 ? (
                                          t.comments.map((comment) => {
                                            const isMe =
                                              String(comment.createdBy) ===
                                              String(appUser?.id) ||
                                              comment.createdByEmail ===
                                              appUser?.email;
                                            return (
                                              <div
                                                key={comment.id}
                                                className={`flex ${isMe ? "justify-end" : "justify-start"}`}
                                              >
                                                <div
                                                  className={`max-w-[85%] rounded-2xl px-3 py-1.5 text-[11px] ${isMe ? "bg-blue-600 text-white rounded-br-sm" : "bg-white/10 text-white/90 rounded-bl-sm"}`}
                                                >
                                                  {!isMe && (
                                                    <div className="text-[9px] text-white/40 mb-0.5">
                                                      {
                                                        comment.createdByEmail?.split(
                                                          "@",
                                                        )[0]
                                                      }
                                                    </div>
                                                  )}
                                                  <div>{comment.text}</div>
                                                  <div className="text-[8px] text-white/30 text-right mt-1">
                                                    {new Date(
                                                      comment.createdAt,
                                                    ).toLocaleTimeString([], {
                                                      hour: "2-digit",
                                                      minute: "2-digit",
                                                    })}
                                                  </div>
                                                </div>
                                              </div>
                                            );
                                          })
                                        ) : (
                                          <div className="text-center py-4 text-[10px] text-white/30 italic">
                                            No messages yet.
                                          </div>
                                        )}
                                      </div>

                                      <div className="flex gap-2">
                                        <input
                                          type="text"
                                          placeholder="Type a message..."
                                          className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-blue-500/50"
                                          onKeyDown={(e) => {
                                            if (
                                              e.key === "Enter" &&
                                              e.currentTarget.value.trim()
                                            ) {
                                              sendComment(
                                                String(t.id),
                                                e.currentTarget.value.trim(),
                                              );
                                              e.currentTarget.value = "";
                                            }
                                          }}
                                        />
                                        <button
                                          title="Send"
                                          className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center hover:bg-blue-500 transition-colors"
                                          onClick={(e) => {
                                            const input = e.currentTarget
                                              .previousElementSibling as HTMLInputElement;
                                            if (input.value.trim()) {
                                              sendComment(
                                                String(t.id),
                                                input.value.trim(),
                                              );
                                              input.value = "";
                                            }
                                          }}
                                        >
                                          <svg
                                            className="w-4 h-4 text-white"
                                            fill="currentColor"
                                            viewBox="0 0 24 24"
                                          >
                                            <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
                                          </svg>
                                        </button>
                                      </div>
                                    </div>
                                  </div>

                                  {/* Task Actions */}
                                  <div className="mt-4 flex items-center justify-between gap-2">
                                    <div className="flex-1 flex gap-2">
                                      <select
                                        className="flex-1 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white outline-none focus:border-blue-500/50"
                                        value={t.status}
                                        onChange={async (e) => {
                                          if (!appUser) return;
                                          const nextStatus = e.target
                                            .value as TaskStatus;
                                          await apiPatch(`/api/tasks/${t.id}`, {
                                            status: nextStatus,
                                            progress:
                                              nextStatus === "complete"
                                                ? 100
                                                : t.progress,
                                          });
                                        }}
                                      >
                                        <option
                                          value="in_process"
                                          className="bg-[#1a1a2e]"
                                        >
                                          In process
                                        </option>
                                        <option
                                          value="complete"
                                          className="bg-[#1a1a2e]"
                                        >
                                          Complete
                                        </option>
                                        <option
                                          value="failed"
                                          className="bg-[#1a1a2e]"
                                        >
                                          Pending
                                        </option>
                                      </select>
                                      <button
                                        type="button"
                                        className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/70 hover:bg-white/10 transition-colors"
                                        onClick={() => setTransferTaskId(t.id)}
                                      >
                                        Transfer
                                      </button>
                                    </div>
                                    <div className="flex gap-2">
                                      <button
                                        type="button"
                                        className="rounded-lg border border-blue-500/30 bg-blue-500/10 px-3 py-1.5 text-xs text-blue-400 hover:bg-blue-500/20 transition-colors"
                                        onClick={() => setFullscreenTask(t)}
                                      >
                                        🗖 Fullscreen
                                      </button>
                                      <button
                                        type="button"
                                        className="p-1.5 rounded-lg border border-red-500/30 bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors"
                                        onClick={() =>
                                          confirmDeleteTask(t.id, t.title)
                                        }
                                      >
                                        🗑
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      <div className="rounded-xl border border-white/5 bg-white/5 p-8 text-center text-white/40 italic">
                        No tasks yet.
                      </div>
                    )}
                  </div>
                </Card>
              ) : null}
            </div>

            {isAdmin && adminTab === "settings" ? (
              <div className="mt-8">
                <Card className="bg-[#191922] border-white/10">
                  <div className="text-xs font-bold uppercase tracking-wider text-white/30">
                    Admin setup
                  </div>
                  <div className="mt-3 space-y-2 text-xs text-white/55 leading-relaxed">
                    <div>
                      After creating your first account, go to Firestore → users → {"{uid}"} and set{" "}
                      <span className="text-white/70 font-semibold">role</span> ={" "}
                      <span className="text-white/70 font-semibold">"admin"</span>.
                    </div>
                    <div>
                      <span className="text-white/40 uppercase tracking-wider text-[10px] font-bold">
                        All admin
                      </span>{" "}
                      <span className="text-white/60">VINCE, NAZARENO, IAN, VEEJAY, YURI</span>
                    </div>
                  </div>
                </Card>
              </div>
            ) : null}
          </div>
        </div>
      </AppLayout>

      {/* Fullscreen Task Modal */}
      {fullscreenTask && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
          <div className="relative max-h-[90vh] w-full max-w-4xl overflow-auto rounded-2xl border border-white/10 bg-[#0b0b10] p-6">
            <div className="mb-6 flex items-center justify-between">
              <h2 className="text-xl font-semibold text-white">Task Details</h2>
              <button
                type="button"
                className="rounded-xl border border-white/15 bg-white/10 px-4 py-2 text-sm text-white/90"
                onClick={() => setFullscreenTask(null)}
              >
                Close
              </button>
            </div>
            {(() => {
              const t = fullscreenTask;
              const isComplete = t.status === "complete";
              const isLate = t.dueDate && Date.now() > t.dueDate && !isComplete;
              const statusColor = isComplete
                ? "#22c55e"
                : isLate
                  ? "#ef4444"
                  : "#3b82f6";
              const statusText = isComplete
                ? "Turned in"
                : isLate
                  ? "Missing"
                  : "Assigned";
              const isAdminUploader = (uploadedBy: unknown): boolean => {
                const keyNum =
                  typeof uploadedBy === "number"
                    ? uploadedBy
                    : Number(uploadedBy);
                const role =
                  (Number.isFinite(keyNum)
                    ? userRoleMap.get(keyNum)
                    : undefined) ?? userRoleMap.get(String(uploadedBy ?? ""));
                return role === "admin" || role === "manager";
              };
              const mainAttachments =
                t.attachments?.filter((a) => {
                  // Main task files have no checklistItemId, or it's null/undefined/0
                  const id = a.checklistItemId;
                  return id === null || id === undefined || id === 0;
                }) ?? [];
              // Separate admin/manager uploads from user uploads
              const adminMainAttachments = mainAttachments.filter((a) =>
                isAdminUploader(a.uploadedBy),
              );
              const userMainAttachments = mainAttachments.filter(
                (a) => !isAdminUploader(a.uploadedBy),
              );
              // Subtask attachments have a valid checklistItemId (non-zero number)
              const subtaskAttachments =
                t.attachments?.filter((a) => {
                  const id = a.checklistItemId;
                  return (
                    id !== null &&
                    id !== undefined &&
                    id !== 0 &&
                    !isNaN(Number(id))
                  );
                }) ?? [];
              const adminSubtaskAttachments = subtaskAttachments.filter((a) =>
                isAdminUploader(a.uploadedBy),
              );
              const userSubtaskAttachments = subtaskAttachments.filter(
                (a) => !isAdminUploader(a.uploadedBy),
              );
              return (
                <div className="relative overflow-hidden rounded-xl border border-white/10 bg-white/5 backdrop-blur-sm">
                  {/* Colored left border */}
                  <div
                    className="absolute left-0 top-0 h-full w-2"
                    style={{ backgroundColor: statusColor }}
                  />
                  <div className="p-6 pl-8">
                    {/* Header */}
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm font-medium text-white/60 uppercase tracking-wide">
                        {(t.department ?? "other").replace("_", " ")}
                      </span>
                      <span
                        className="rounded-full px-4 py-1.5 text-sm font-medium"
                        style={{
                          backgroundColor: `${statusColor}20`,
                          color: statusColor,
                        }}
                      >
                        {statusText}
                      </span>
                    </div>

                    {/* Title */}
                    <h3 className="mt-3 text-2xl font-medium text-white">
                      {t.title}
                    </h3>
                    {t.description && (
                      <p className="mt-2 text-base text-white/70">
                        {t.description}
                      </p>
                    )}

                    {/* Due date */}
                    <div className="mt-4 flex items-center gap-2 text-base">
                      <svg
                        className="h-5 w-5 text-white/50"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                        />
                      </svg>
                      <span
                        className={
                          isLate ? "text-red-400 font-medium" : "text-white/60"
                        }
                      >
                        {t.dueDate
                          ? `Due ${new Date(t.dueDate).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}`
                          : "No due date"}
                      </span>
                      {isLate && (
                        <span className="text-sm text-red-400">(Late)</span>
                      )}
                    </div>

                    {/* Progress bar */}
                    <div className="mt-4">
                      <div className="h-2 w-full rounded-full bg-white/10">
                        <div
                          className="h-2 rounded-full transition-all"
                          style={{
                            width: `${t.progress}%`,
                            backgroundColor:
                              t.progress >= 100 ? "#22c55e" : "#3b82f6",
                          }}
                        />
                      </div>
                      <div className="mt-2 flex items-center justify-between text-sm text-white/50">
                        <span>Progress</span>
                        <span>{t.progress}%</span>
                      </div>
                    </div>

                    {/* Subtasks */}
                    {t.checklist?.length ? (
                      <div className="mt-6 rounded-xl border border-white/10 bg-white/5 p-4">
                        <div className="mb-3 flex items-center justify-between">
                          <span className="text-sm font-medium text-white/70">
                            Subtasks
                          </span>
                          <span className="text-sm text-white/50">
                            {t.checklist.filter((c) => c.done).length}/
                            {t.checklist.length} done
                          </span>
                        </div>
                        <div className="space-y-3">
                          {t.checklist.map((item) => {
                            const itemAttachments =
                              t.attachments?.filter(
                                (a) => a.checklistItemId === Number(item.id),
                              ) ?? [];
                            const adminItemAttachments = itemAttachments.filter(
                              (a) => isAdminUploader(a.uploadedBy),
                            );
                            const userItemAttachments = itemAttachments.filter(
                              (a) => !isAdminUploader(a.uploadedBy),
                            );
                            return (
                              <div
                                key={item.id}
                                className="rounded-lg border border-white/10 bg-white/5 p-3"
                              >
                                <label className="flex items-start gap-3">
                                  <input
                                    type="checkbox"
                                    checked={item.done}
                                    readOnly
                                    className="mt-0.5 h-5 w-5 rounded border-white/20 bg-white/10"
                                  />
                                  <span
                                    className={`text-base ${item.done ? "text-white/40 line-through" : "text-white/80"}`}
                                  >
                                    {item.text}
                                  </span>
                                </label>
                                {/* Admin subtask attachments */}
                                {adminItemAttachments.length > 0 && (
                                  <div className="mt-3 pl-8">
                                    <div className="text-[10px] tracking-wide text-white/40 mb-2">
                                      Admin Subtask Files attachment GUIDE (
                                      {adminItemAttachments.length})
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                      {adminItemAttachments.map((a) => {
                                        const isImg =
                                          a.contentType?.startsWith("image/") ||
                                          (a.url &&
                                            a.url.match(
                                              /\.(jpeg|jpg|gif|png|webp)(?:$|\?)/i,
                                            ));
                                        const isVid =
                                          a.contentType?.startsWith("video/") ||
                                          (a.url &&
                                            a.url.match(
                                              /\.(mp4|mov|avi|webm)(?:$|\?)/i,
                                            ));
                                        if (isImg)
                                          return (
                                            <img
                                              key={a.id}
                                              src={a.url}
                                              alt={a.name}
                                              className="h-20 w-20 rounded-lg object-cover border border-white/10 cursor-pointer hover:opacity-90 transition"
                                              onClick={() =>
                                                setFullscreenMedia({
                                                  url: a.url,
                                                  type: "image",
                                                  name: a.name,
                                                })
                                              }
                                            />
                                          );
                                        if (isVid)
                                          return (
                                            <div
                                              key={a.id}
                                              className="relative h-20 w-20 rounded-lg bg-black cursor-pointer overflow-hidden"
                                              onClick={() =>
                                                setFullscreenMedia({
                                                  url: a.url,
                                                  type: "video",
                                                  name: a.name,
                                                })
                                              }
                                            >
                                              <video
                                                src={a.url}
                                                className="h-full w-full object-cover"
                                              />
                                              <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                                                <span className="text-white text-xs">
                                                  ▶
                                                </span>
                                              </div>
                                            </div>
                                          );
                                        return (
                                          <a
                                            key={a.id}
                                            href={a.url}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="flex items-center gap-1.5 rounded-md border border-white/10 bg-white/10 px-3 py-1 text-xs text-white/70 hover:bg-white/15"
                                          >
                                            <svg
                                              className="h-3 w-3"
                                              fill="none"
                                              viewBox="0 0 24 24"
                                              stroke="currentColor"
                                            >
                                              <path
                                                strokeLinecap="round"
                                                strokeLinejoin="round"
                                                strokeWidth={2}
                                                d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"
                                              />
                                            </svg>
                                            {a.name}
                                          </a>
                                        );
                                      })}
                                    </div>
                                  </div>
                                )}
                                {/* User subtask attachments */}
                                {userItemAttachments.length > 0 && (
                                  <div className="mt-3 pl-8">
                                    <div className="text-[10px] tracking-wide text-emerald-400/70 mb-2">
                                      User Subtask Files uploaded attachment (
                                      {userItemAttachments.length})
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                      {userItemAttachments.map((a) => {
                                        const isImg =
                                          a.contentType?.startsWith("image/") ||
                                          (a.url &&
                                            a.url.match(
                                              /\.(jpeg|jpg|gif|png|webp)(?:$|\?)/i,
                                            ));
                                        const isVid =
                                          a.contentType?.startsWith("video/") ||
                                          (a.url &&
                                            a.url.match(
                                              /\.(mp4|mov|avi|webm)(?:$|\?)/i,
                                            ));
                                        if (isImg)
                                          return (
                                            <img
                                              key={a.id}
                                              src={a.url}
                                              alt={a.name}
                                              className="h-20 w-20 rounded-lg object-cover border border-emerald-500/30 cursor-pointer hover:opacity-90 transition"
                                              onClick={() =>
                                                setFullscreenMedia({
                                                  url: a.url,
                                                  type: "image",
                                                  name: a.name,
                                                })
                                              }
                                            />
                                          );
                                        if (isVid)
                                          return (
                                            <div
                                              key={a.id}
                                              className="relative h-20 w-20 rounded-lg bg-black cursor-pointer overflow-hidden"
                                              onClick={() =>
                                                setFullscreenMedia({
                                                  url: a.url,
                                                  type: "video",
                                                  name: a.name,
                                                })
                                              }
                                            >
                                              <video
                                                src={a.url}
                                                className="h-full w-full object-cover"
                                              />
                                              <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                                                <span className="text-white text-xs">
                                                  ▶
                                                </span>
                                              </div>
                                            </div>
                                          );
                                        return (
                                          <a
                                            key={a.id}
                                            href={a.url}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="flex items-center gap-1.5 rounded-md border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-xs text-emerald-300 hover:bg-emerald-500/15"
                                          >
                                            <svg
                                              className="h-3 w-3"
                                              fill="none"
                                              viewBox="0 0 24 24"
                                              stroke="currentColor"
                                            >
                                              <path
                                                strokeLinecap="round"
                                                strokeLinejoin="round"
                                                strokeWidth={2}
                                                d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"
                                              />
                                            </svg>
                                            {a.name}
                                          </a>
                                        );
                                      })}
                                    </div>
                                  </div>
                                )}
                                {/* Add work indicator for subtask */}
                                <div className="mt-3 pl-8">
                                  <span className="flex items-center gap-1.5 text-sm text-white/50">
                                    <svg
                                      className="h-4 w-4"
                                      fill="none"
                                      viewBox="0 0 24 24"
                                      stroke="currentColor"
                                    >
                                      <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth={2}
                                        d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"
                                      />
                                    </svg>
                                    Add work (subtask)
                                  </span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ) : null}

                    {/* Main task attachments - organized: Admin Main, Admin Subtask, User Main, User Subtask */}
                    {(adminMainAttachments.length > 0 ||
                      userMainAttachments.length > 0 ||
                      adminSubtaskAttachments.length > 0 ||
                      userSubtaskAttachments.length > 0) && (
                        <div className="mt-6 space-y-4">
                          {/* 1. Admin Main Task Files */}
                          {adminMainAttachments.length > 0 && (
                            <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                              <div className="mb-3 text-xs font-medium text-white/70 tracking-wide">
                                Admin Main Task Files attachment GUIDE (
                                {adminMainAttachments.length})
                              </div>
                              <div className="flex flex-wrap gap-3">
                                {adminMainAttachments.map((a) => {
                                  const isImg =
                                    a.contentType?.startsWith("image/") ||
                                    a.url.match(
                                      /\.(jpeg|jpg|gif|png|webp)(?:$|\?)/i,
                                    );
                                  const isVid =
                                    a.contentType?.startsWith("video/") ||
                                    a.url.match(/\.(mp4|mov|avi|webm)(?:$|\?)/i);
                                  if (isImg)
                                    return (
                                      <img
                                        key={a.id}
                                        src={a.url}
                                        alt={a.name}
                                        className="h-24 w-24 rounded-lg object-cover border border-white/10 cursor-pointer hover:opacity-90 transition"
                                        onClick={() =>
                                          setFullscreenMedia({
                                            url: a.url,
                                            type: "image",
                                            name: a.name,
                                          })
                                        }
                                      />
                                    );
                                  if (isVid)
                                    return (
                                      <div
                                        key={a.id}
                                        className="relative h-24 w-24 rounded-lg bg-black cursor-pointer overflow-hidden"
                                        onClick={() =>
                                          setFullscreenMedia({
                                            url: a.url,
                                            type: "video",
                                            name: a.name,
                                          })
                                        }
                                      >
                                        <video
                                          src={a.url}
                                          className="h-full w-full object-cover"
                                        />
                                        <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                                          <span className="text-white text-lg">
                                            ▶
                                          </span>
                                        </div>
                                      </div>
                                    );
                                  return (
                                    <a
                                      key={a.id}
                                      href={a.url}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/80 transition-colors hover:bg-white/10"
                                    >
                                      <svg
                                        className="h-4 w-4"
                                        fill="none"
                                        viewBox="0 0 24 24"
                                        stroke="currentColor"
                                      >
                                        <path
                                          strokeLinecap="round"
                                          strokeLinejoin="round"
                                          strokeWidth={2}
                                          d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"
                                        />
                                      </svg>
                                      {a.name}
                                    </a>
                                  );
                                })}
                              </div>
                            </div>
                          )}

                          {/* 2. Admin Subtask Files */}
                          {adminSubtaskAttachments.length > 0 && (
                            <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                              <div className="mb-3 text-xs font-medium text-white/70 tracking-wide">
                                Admin Subtask Files attachment GUIDE (
                                {adminSubtaskAttachments.length})
                              </div>
                              <div className="flex flex-wrap gap-3">
                                {adminSubtaskAttachments.map((a) => {
                                  const isImg =
                                    a.contentType?.startsWith("image/") ||
                                    a.url.match(
                                      /\.(jpeg|jpg|gif|png|webp)(?:$|\?)/i,
                                    );
                                  const isVid =
                                    a.contentType?.startsWith("video/") ||
                                    a.url.match(/\.(mp4|mov|avi|webm)(?:$|\?)/i);
                                  if (isImg)
                                    return (
                                      <img
                                        key={a.id}
                                        src={a.url}
                                        alt={a.name}
                                        className="h-24 w-24 rounded-lg object-cover border border-white/10 cursor-pointer hover:opacity-90 transition"
                                        onClick={() =>
                                          setFullscreenMedia({
                                            url: a.url,
                                            type: "image",
                                            name: a.name,
                                          })
                                        }
                                      />
                                    );
                                  if (isVid)
                                    return (
                                      <div
                                        key={a.id}
                                        className="relative h-24 w-24 rounded-lg bg-black cursor-pointer overflow-hidden"
                                        onClick={() =>
                                          setFullscreenMedia({
                                            url: a.url,
                                            type: "video",
                                            name: a.name,
                                          })
                                        }
                                      >
                                        <video
                                          src={a.url}
                                          className="h-full w-full object-cover"
                                        />
                                        <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                                          <span className="text-white text-lg">
                                            ▶
                                          </span>
                                        </div>
                                      </div>
                                    );
                                  return (
                                    <a
                                      key={a.id}
                                      href={a.url}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/80 transition-colors hover:bg-white/10"
                                    >
                                      <svg
                                        className="h-4 w-4"
                                        fill="none"
                                        viewBox="0 0 24 24"
                                        stroke="currentColor"
                                      >
                                        <path
                                          strokeLinecap="round"
                                          strokeLinejoin="round"
                                          strokeWidth={2}
                                          d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"
                                        />
                                      </svg>
                                      {a.name}
                                    </a>
                                  );
                                })}
                              </div>
                            </div>
                          )}

                          {/* 3. User Main Task Files */}
                          {userMainAttachments.length > 0 && (
                            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-4">
                              <div className="mb-3 text-xs font-medium text-emerald-400/80 tracking-wide">
                                User Main Task Files uploaded attachment (
                                {userMainAttachments.length})
                              </div>
                              <div className="flex flex-wrap gap-3">
                                {userMainAttachments.map((a) => {
                                  const isImg =
                                    a.contentType?.startsWith("image/") ||
                                    a.url.match(
                                      /\.(jpeg|jpg|gif|png|webp)(?:$|\?)/i,
                                    );
                                  const isVid =
                                    a.contentType?.startsWith("video/") ||
                                    a.url.match(/\.(mp4|mov|avi|webm)(?:$|\?)/i);
                                  if (isImg)
                                    return (
                                      <img
                                        key={a.id}
                                        src={a.url}
                                        alt={a.name}
                                        className="h-24 w-24 rounded-lg object-cover border border-emerald-500/30 cursor-pointer hover:opacity-90 transition"
                                        onClick={() =>
                                          setFullscreenMedia({
                                            url: a.url,
                                            type: "image",
                                            name: a.name,
                                          })
                                        }
                                      />
                                    );
                                  if (isVid)
                                    return (
                                      <div
                                        key={a.id}
                                        className="relative h-24 w-24 rounded-lg bg-black cursor-pointer overflow-hidden"
                                        onClick={() =>
                                          setFullscreenMedia({
                                            url: a.url,
                                            type: "video",
                                            name: a.name,
                                          })
                                        }
                                      >
                                        <video
                                          src={a.url}
                                          className="h-full w-full object-cover"
                                        />
                                        <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                                          <span className="text-white text-lg">
                                            ▶
                                          </span>
                                        </div>
                                      </div>
                                    );
                                  return (
                                    <a
                                      key={a.id}
                                      href={a.url}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="flex items-center gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-4 py-2 text-sm text-emerald-300 transition-colors hover:bg-emerald-500/15"
                                    >
                                      <svg
                                        className="h-4 w-4"
                                        fill="none"
                                        viewBox="0 0 24 24"
                                        stroke="currentColor"
                                      >
                                        <path
                                          strokeLinecap="round"
                                          strokeLinejoin="round"
                                          strokeWidth={2}
                                          d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"
                                        />
                                      </svg>
                                      {a.name}
                                    </a>
                                  );
                                })}
                              </div>
                            </div>
                          )}

                          {/* 4. User Subtask Files */}
                          {userSubtaskAttachments.length > 0 && (
                            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-4">
                              <div className="mb-3 text-xs font-medium text-emerald-400/80 tracking-wide">
                                User Subtask Files uploaded attachment (
                                {userSubtaskAttachments.length})
                              </div>
                              <div className="flex flex-wrap gap-3">
                                {userSubtaskAttachments.map((a) => {
                                  const isImg =
                                    a.contentType?.startsWith("image/") ||
                                    a.url.match(
                                      /\.(jpeg|jpg|gif|png|webp)(?:$|\?)/i,
                                    );
                                  const isVid =
                                    a.contentType?.startsWith("video/") ||
                                    a.url.match(/\.(mp4|mov|avi|webm)(?:$|\?)/i);
                                  if (isImg)
                                    return (
                                      <img
                                        key={a.id}
                                        src={a.url}
                                        alt={a.name}
                                        className="h-24 w-24 rounded-lg object-cover border border-emerald-500/20 cursor-pointer hover:opacity-90 transition"
                                        onClick={() =>
                                          setFullscreenMedia({
                                            url: a.url,
                                            type: "image",
                                            name: a.name,
                                          })
                                        }
                                      />
                                    );
                                  if (isVid)
                                    return (
                                      <div
                                        key={a.id}
                                        className="relative h-24 w-24 rounded-lg bg-black cursor-pointer overflow-hidden"
                                        onClick={() =>
                                          setFullscreenMedia({
                                            url: a.url,
                                            type: "video",
                                            name: a.name,
                                          })
                                        }
                                      >
                                        <video
                                          src={a.url}
                                          className="h-full w-full object-cover"
                                        />
                                        <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                                          <span className="text-white text-lg">
                                            ▶
                                          </span>
                                        </div>
                                      </div>
                                    );
                                  return (
                                    <a
                                      key={a.id}
                                      href={a.url}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="flex items-center gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-4 py-2 text-sm text-emerald-300 transition-colors hover:bg-emerald-500/15"
                                    >
                                      <svg
                                        className="h-4 w-4"
                                        fill="none"
                                        viewBox="0 0 24 24"
                                        stroke="currentColor"
                                      >
                                        <path
                                          strokeLinecap="round"
                                          strokeLinejoin="round"
                                          strokeWidth={2}
                                          d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"
                                        />
                                      </svg>
                                      {a.name}
                                    </a>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                    {/* Messenger Chat Section */}
                    <div className="mt-6 rounded-xl border border-white/10 bg-[#1a1a2e] p-4">
                      <div className="mb-3 flex items-center justify-between border-b border-white/10 pb-3">
                        <h4 className="text-sm font-medium text-white/90 flex items-center gap-2">
                          <svg
                            className="w-4 h-4 text-blue-400"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                            />
                          </svg>
                          Task Conversation
                        </h4>
                        <span className="text-xs text-white/40">
                          {fullscreenTask.comments?.length || 0} messages
                        </span>
                      </div>

                      {/* Chat Messages - iMessage Style */}
                      <div className="max-h-72 overflow-y-auto space-y-1 mb-4 px-1 scrollbar-thin">
                        {fullscreenTask.comments &&
                          fullscreenTask.comments.length > 0 ? (
                          (() => {
                            let lastDate: string | null = null;
                            return fullscreenTask.comments?.map(
                              (comment, index) => {
                                const isMe =
                                  String(comment.createdBy) ===
                                  String(appUser?.id) ||
                                  (comment.createdByEmail && appUser?.email
                                    ? String(
                                      comment.createdByEmail,
                                    ).toLowerCase() ===
                                    String(appUser.email).toLowerCase()
                                    : false);
                                const commentDate = new Date(
                                  comment.createdAt,
                                ).toLocaleDateString();
                                const showDate = commentDate !== lastDate;
                                lastDate = commentDate;
                                const prevComment =
                                  index > 0
                                    ? fullscreenTask.comments?.[index - 1]
                                    : null;
                                const showSender =
                                  !prevComment ||
                                  prevComment.createdBy !== comment.createdBy;

                                return (
                                  <div key={comment.id}>
                                    {/* Date separator */}
                                    {showDate && (
                                      <div className="flex justify-center my-2">
                                        <span className="text-[10px] text-white/40 bg-white/5 px-2 py-0.5 rounded-full">
                                          {new Date(
                                            comment.createdAt,
                                          ).toLocaleDateString("en-US", {
                                            weekday: "short",
                                            month: "short",
                                            day: "numeric",
                                          })}
                                        </span>
                                      </div>
                                    )}
                                    {/* Message row - Current viewer messages on RIGHT */}
                                    <div
                                      key={comment.id}
                                      className={`flex ${isMe ? "justify-end" : "justify-start"} mb-1`}
                                    >
                                      <div
                                        className={`flex flex-col ${isMe ? "items-end" : "items-start"} max-w-[85%]`}
                                      >
                                        {/* Sender name for others - show on opposite side */}
                                        {!isMe && showSender && (
                                          <span className="text-[10px] text-white/50 mb-0.5 ml-1">
                                            {comment.createdByEmail?.split(
                                              "@",
                                            )[0] || "Unknown"}
                                          </span>
                                        )}

                                        {/* Message Bubble & Menu Container */}
                                        <div className="flex items-center gap-2 group">
                                          {/* Menu button for others (on the LEFT of the bubble) */}
                                          {!isMe && (
                                            <div className="relative">
                                              <button
                                                type="button"
                                                className="opacity-0 group-hover:opacity-100 p-1 rounded-full hover:bg-white/10 text-white/50 transition-all focus:outline-none"
                                                onClick={() =>
                                                  setMsgMenuCommentId(
                                                    msgMenuCommentId ===
                                                      comment.id
                                                      ? null
                                                      : comment.id,
                                                  )
                                                }
                                              >
                                                <svg
                                                  className="w-4 h-4 transform rotate-90"
                                                  fill="currentColor"
                                                  viewBox="0 0 24 24"
                                                >
                                                  <path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z" />
                                                </svg>
                                              </button>

                                              {/* Left side dropdown */}
                                              {msgMenuCommentId ===
                                                comment.id &&
                                                !isMe && (
                                                  <div className="absolute top-full left-0 mt-1 z-10 w-28 rounded-xl bg-[#1C1C1E] border border-white/10 shadow-xl overflow-hidden">
                                                    <button
                                                      type="button"
                                                      className="w-full text-left px-3 py-2 text-xs text-white hover:bg-white/10 flex items-center gap-2"
                                                      onClick={() => {
                                                        setReplyTo({
                                                          commentId: comment.id,
                                                          text: comment.text,
                                                        });
                                                        setMsgMenuCommentId(
                                                          null,
                                                        );
                                                      }}
                                                    >
                                                      <svg
                                                        className="w-3 h-3"
                                                        fill="none"
                                                        viewBox="0 0 24 24"
                                                        stroke="currentColor"
                                                      >
                                                        <path
                                                          strokeLinecap="round"
                                                          strokeLinejoin="round"
                                                          strokeWidth={2}
                                                          d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6"
                                                        />
                                                      </svg>
                                                      Reply
                                                    </button>
                                                  </div>
                                                )}
                                            </div>
                                          )}

                                          {/* The Message Bubble */}
                                          <div
                                            className={`relative px-4 py-2.5 rounded-2xl text-sm overflow-hidden ${isMe
                                              ? (comment.attachments
                                                ?.length &&
                                                (!comment.text ||
                                                  comment.text.match(
                                                    /attachment|📎/i,
                                                  ))
                                                ? "bg-transparent"
                                                : "bg-[#0A84FF]") +
                                              " text-white " +
                                              (comment.attachments?.length
                                                ? ""
                                                : "rounded-br-md")
                                              : (comment.attachments
                                                ?.length &&
                                                (!comment.text ||
                                                  comment.text.match(
                                                    /attachment|📎/i,
                                                  ))
                                                ? "bg-transparent"
                                                : "bg-[#262626]") +
                                              " text-white " +
                                              (comment.attachments?.length
                                                ? ""
                                                : "rounded-bl-md")
                                              } ${comment.attachments?.length && (!comment.text || comment.text.match(/attachment|📎/i)) ? "p-0" : "px-4 py-2.5"}`}
                                          >
                                            {/* Show Parent Quote if Replying */}
                                            {comment.parentId && (
                                              <div className="mb-1.5 border-l-2 border-white/40 pl-2 opacity-75">
                                                <span className="text-[10px] font-medium opacity-80 block truncate max-w-[200px]">
                                                  Replied message Context
                                                </span>
                                              </div>
                                            )}

                                            {comment.text &&
                                              !comment.text.match(
                                                /attachment/i,
                                              ) &&
                                              !comment.text.match(/📎/) && (
                                                <p className="whitespace-pre-wrap">
                                                  {comment.text}
                                                </p>
                                              )}

                                            {/* Attachments */}
                                            {comment.attachments &&
                                              comment.attachments.length >
                                              0 && (
                                                <div
                                                  className={`flex flex-col gap-2 ${comment.text && !comment.text.match(/attachment|📎/i) ? "mt-2 border-t border-white/10 pt-2" : ""}`}
                                                >
                                                  {comment.attachments.map(
                                                    (att) => {
                                                      const isImage =
                                                        att.contentType?.startsWith(
                                                          "image/",
                                                        ) ||
                                                        (att.url &&
                                                          att.url.match(
                                                            /\.(jpeg|jpg|gif|png|webp)(?:$|\?)/i,
                                                          ));
                                                      const isVideo =
                                                        att.contentType?.startsWith(
                                                          "video/",
                                                        ) ||
                                                        (att.url &&
                                                          att.url.match(
                                                            /\.(mp4|mov|avi|webm)(?:$|\?)/i,
                                                          ));
                                                      if (isImage) {
                                                        return (
                                                          <img
                                                            key={att.id}
                                                            src={att.url}
                                                            alt={att.name}
                                                            className={`max-w-full max-h-48 object-contain cursor-pointer transition hover:opacity-90 ${comment.text && !comment.text.match(/attachment/i) && !comment.text.match(/📎/) ? "rounded-lg" : isMe ? "rounded-l-2xl rounded-tr-2xl rounded-br-md" : "rounded-r-2xl rounded-tl-2xl rounded-bl-md"}`}
                                                            onClick={() =>
                                                              setFullscreenMedia(
                                                                {
                                                                  url: att.url,
                                                                  type: "image",
                                                                  name: att.name,
                                                                },
                                                              )
                                                            }
                                                          />
                                                        );
                                                      }
                                                      if (isVideo) {
                                                        return (
                                                          <div
                                                            key={att.id}
                                                            className={`relative max-w-full max-h-48 overflow-hidden cursor-pointer group ${comment.text && !comment.text.match(/attachment/i) && !comment.text.match(/📎/) ? "rounded-lg" : isMe ? "rounded-l-2xl rounded-tr-2xl rounded-br-md" : "rounded-r-2xl rounded-tl-2xl rounded-bl-md"}`}
                                                            onClick={() =>
                                                              setFullscreenMedia(
                                                                {
                                                                  url: att.url,
                                                                  type: "video",
                                                                  name: att.name,
                                                                },
                                                              )
                                                            }
                                                          >
                                                            <video
                                                              src={att.url}
                                                              className="w-full h-full object-contain bg-black"
                                                            />
                                                            <div className="absolute inset-0 flex items-center justify-center bg-black/30 group-hover:bg-black/40 transition">
                                                              <span className="text-white text-3xl">
                                                                ▶
                                                              </span>
                                                            </div>
                                                          </div>
                                                        );
                                                      }
                                                      return (
                                                        <a
                                                          key={att.id}
                                                          href={`${att.url}?download=1`}
                                                          target="_blank"
                                                          rel="noopener noreferrer"
                                                          className="flex items-center gap-2 bg-black/20 hover:bg-black/30 rounded-lg px-2 py-1.5 text-xs transition-colors"
                                                        >
                                                          <span className="shrink-0 text-blue-400">
                                                            📎
                                                          </span>
                                                          <span
                                                            className="truncate flex-1 min-w-0"
                                                            title={att.name}
                                                          >
                                                            {att.name}
                                                          </span>
                                                        </a>
                                                      );
                                                    },
                                                  )}
                                                </div>
                                              )}
                                          </div>

                                          {/* Menu button for ME (on the RIGHT of the bubble) */}
                                          {isMe && (
                                            <div className="relative">
                                              <button
                                                type="button"
                                                className="opacity-0 group-hover:opacity-100 p-1 rounded-full hover:bg-white/10 text-white/50 transition-all focus:outline-none"
                                                onClick={() =>
                                                  setMsgMenuCommentId(
                                                    msgMenuCommentId ===
                                                      comment.id
                                                      ? null
                                                      : comment.id,
                                                  )
                                                }
                                              >
                                                <svg
                                                  className="w-4 h-4 transform rotate-90"
                                                  fill="currentColor"
                                                  viewBox="0 0 24 24"
                                                >
                                                  <path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z" />
                                                </svg>
                                              </button>

                                              {/* Right side dropdown */}
                                              {msgMenuCommentId ===
                                                comment.id &&
                                                isMe && (
                                                  <div className="absolute top-full right-0 mt-1 z-10 w-28 rounded-xl bg-[#1C1C1E] border border-white/10 shadow-xl overflow-hidden">
                                                    <button
                                                      type="button"
                                                      className="w-full text-left px-3 py-2 text-xs text-white hover:bg-white/10 flex items-center gap-2"
                                                      onClick={() => {
                                                        setReplyTo({
                                                          commentId: comment.id,
                                                          text: comment.text,
                                                        });
                                                        setMsgMenuCommentId(
                                                          null,
                                                        );
                                                      }}
                                                    >
                                                      <svg
                                                        className="w-3 h-3"
                                                        fill="none"
                                                        viewBox="0 0 24 24"
                                                        stroke="currentColor"
                                                      >
                                                        <path
                                                          strokeLinecap="round"
                                                          strokeLinejoin="round"
                                                          strokeWidth={2}
                                                          d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6"
                                                        />
                                                      </svg>
                                                      Reply
                                                    </button>
                                                    <button
                                                      type="button"
                                                      className="w-full text-left px-3 py-2 text-xs text-red-400 hover:bg-red-500/10 flex items-center gap-2"
                                                      onClick={() => {
                                                        if (
                                                          confirm(
                                                            "Delete this message?",
                                                          )
                                                        ) {
                                                          fetch(
                                                            `/api/tasks/${fullscreenTask.id}/comments/${comment.id}`,
                                                            {
                                                              method: "DELETE",
                                                            },
                                                          )
                                                            .then(() => {
                                                              apiGet<{
                                                                task: TaskItem;
                                                              }>(
                                                                `/api/tasks/${fullscreenTask.id}`,
                                                              ).then((res) => {
                                                                setFullscreenTask(
                                                                  res.task,
                                                                );
                                                              });
                                                              setToast(
                                                                "Message deleted",
                                                              );
                                                            })
                                                            .catch(() =>
                                                              alert(
                                                                "Failed to delete message",
                                                              ),
                                                            );
                                                        }
                                                        setMsgMenuCommentId(
                                                          null,
                                                        );
                                                      }}
                                                    >
                                                      <svg
                                                        className="w-3 h-3"
                                                        fill="none"
                                                        viewBox="0 0 24 24"
                                                        stroke="currentColor"
                                                      >
                                                        <path
                                                          strokeLinecap="round"
                                                          strokeLinejoin="round"
                                                          strokeWidth={2}
                                                          d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                                                        />
                                                      </svg>
                                                      Delete
                                                    </button>
                                                  </div>
                                                )}
                                            </div>
                                          )}
                                        </div>

                                        {/* Timestamp */}
                                        <span
                                          className={`text-[10px] text-white/30 mt-1 mx-1 flex items-center gap-1 ${isMe ? "opacity-80" : ""}`}
                                        >
                                          {new Date(
                                            comment.createdAt,
                                          ).toLocaleTimeString([], {
                                            hour: "2-digit",
                                            minute: "2-digit",
                                          })}
                                          {isMe && (
                                            <span className="text-[#0A84FF]">
                                              ✓
                                            </span>
                                          )}
                                        </span>
                                      </div>
                                    </div>
                                  </div>
                                );
                              },
                            );
                          })()
                        ) : (
                          <div className="text-center py-8">
                            <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-white/5 flex items-center justify-center">
                              <svg
                                className="w-6 h-6 text-white/30"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={1.5}
                                  d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                                />
                              </svg>
                            </div>
                            <p className="text-sm text-white/40">
                              No messages yet. Start the conversation...
                            </p>
                          </div>
                        )}
                      </div>

                      {/* Reply To Banner */}
                      {replyTo && (
                        <div className="flex items-center justify-between bg-white/5 border border-white/10 rounded-lg px-3 py-2 mb-2 text-sm">
                          <div className="min-w-0 pr-4">
                            <span className="text-[#0A84FF] text-xs font-medium block mb-0.5">
                              Replying to message
                            </span>
                            <span className="text-white/70 block truncate">
                              {replyTo.text}
                            </span>
                          </div>
                          <button
                            type="button"
                            className="text-white/40 hover:text-white/80 shrink-0"
                            onClick={() => setReplyTo(null)}
                          >
                            <svg
                              className="w-4 h-4"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M6 18L18 6M6 6l12 12"
                              />
                            </svg>
                          </button>
                        </div>
                      )}

                      {/* File Upload Preview */}
                      {commentFiles[fullscreenTask.id] &&
                        commentFiles[fullscreenTask.id].length > 0 && (
                          <div className="flex gap-2 p-2 overflow-x-auto bg-white/5 border border-white/10 rounded-lg mb-2 items-center">
                            {commentFiles[fullscreenTask.id].map((file, i) => {
                              const previewUrl =
                                commentFilePreviews[fullscreenTask.id]?.[i];
                              return (
                                <div
                                  key={i}
                                  className="relative w-12 h-12 flex-shrink-0 group"
                                >
                                  {previewUrl ? (
                                    <img
                                      src={previewUrl}
                                      alt={file.name}
                                      className="w-12 h-12 rounded object-cover border border-white/20"
                                    />
                                  ) : (
                                    <div className="w-12 h-12 rounded bg-white/10 flex items-center justify-center border border-white/20 text-xs text-white/50 truncate p-1">
                                      {file.name.slice(0, 8)}..
                                    </div>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const newFiles = [
                                        ...commentFiles[fullscreenTask.id],
                                      ];
                                      newFiles.splice(i, 1);
                                      const newPreviews = [
                                        ...(commentFilePreviews[
                                          fullscreenTask.id
                                        ] || []),
                                      ];
                                      if (newPreviews[i]) {
                                        URL.revokeObjectURL(newPreviews[i]);
                                      }
                                      newPreviews.splice(i, 1);
                                      setCommentFiles((p) => ({
                                        ...p,
                                        [fullscreenTask.id]: newFiles,
                                      }));
                                      setCommentFilePreviews((p) => ({
                                        ...p,
                                        [fullscreenTask.id]: newPreviews,
                                      }));
                                    }}
                                    className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-500 text-white text-[10px] flex items-center justify-center opacity-0 group-hover:opacity-100"
                                  >
                                    ×
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                        )}

                      {/* Chat Input - iMessage Style */}
                      <div className="flex items-center gap-2 pt-3 border-t border-white/10 bg-[#0b0b10] rounded-lg px-2 py-1.5">
                        <button
                          type="button"
                          className="text-white/40 hover:text-white/80 p-1 shrink-0"
                          onClick={() =>
                            document
                              .getElementById(
                                `comment-file-${fullscreenTask.id}`,
                              )
                              ?.click()
                          }
                        >
                          <svg
                            className="w-5 h-5"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"
                            />
                          </svg>
                        </button>
                        <input
                          type="file"
                          multiple
                          id={`comment-file-${fullscreenTask.id}`}
                          className="hidden"
                          onChange={(e) => {
                            if (e.target.files?.length) {
                              const newFiles = Array.from(e.target.files);
                              const newPreviews = newFiles.map((f) =>
                                f.type.startsWith("image/")
                                  ? URL.createObjectURL(f)
                                  : "",
                              );
                              setCommentFiles((p) => ({
                                ...p,
                                [fullscreenTask.id]: [
                                  ...(p[fullscreenTask.id] || []),
                                  ...newFiles,
                                ],
                              }));
                              setCommentFilePreviews((p) => ({
                                ...p,
                                [fullscreenTask.id]: [
                                  ...(p[fullscreenTask.id] || []),
                                  ...newPreviews,
                                ],
                              }));
                            }
                            e.target.value = "";
                          }}
                        />
                        <input
                          type="text"
                          placeholder="iMessage"
                          onKeyDown={async (e) => {
                            if (e.key === "Enter" && !e.shiftKey) {
                              e.preventDefault();
                              const text = e.currentTarget.value.trim();
                              const input = e.currentTarget;
                              const files =
                                commentFiles[fullscreenTask.id] || [];
                              if (!text && !files.length) return;
                              input.disabled = true;

                              try {
                                const commentTextToSend =
                                  text.trim() || "📎 Attachment";

                                // 1. Create the comment
                                const res = await apiPost<{
                                  comment: TaskComment;
                                }>(`/api/tasks/${fullscreenTask.id}/comments`, {
                                  message: commentTextToSend,
                                  parentId: replyTo?.commentId ?? null,
                                });

                                const commentId = res.comment.id;

                                // 2. Upload attachments if any
                                if (files.length > 0) {
                                  for (const file of files) {
                                    const fd = new FormData();
                                    fd.set("file", file);
                                    await fetch(
                                      `/api/tasks/${fullscreenTask.id}/comments/${commentId}/attachments`,
                                      {
                                        method: "POST",
                                        credentials: "include",
                                        body: fd,
                                      },
                                    ).catch(() => {
                                      /* best-effort */
                                    });
                                  }
                                }

                                // 3. Cleanup
                                input.value = "";
                                setReplyTo(null);

                                const oldPreviews =
                                  commentFilePreviews[fullscreenTask.id] || [];
                                oldPreviews.forEach((p) => {
                                  if (p) URL.revokeObjectURL(p);
                                });
                                setCommentFiles((p) => {
                                  const newP = { ...p };
                                  delete newP[fullscreenTask.id];
                                  return newP;
                                });
                                setCommentFilePreviews((p) => {
                                  const newP = { ...p };
                                  delete newP[fullscreenTask.id];
                                  return newP;
                                });

                                // 4. Refresh modal and task list
                                const res2 = await apiGet<{ task: TaskItem }>(
                                  `/api/tasks/${fullscreenTask.id}`,
                                );
                                setFullscreenTask(res2.task);

                                const resTasks = await apiGet<{
                                  items: unknown[];
                                }>("/api/tasks").catch(() => null);
                                if (resTasks) {
                                  const next = resTasks.items
                                    .filter(
                                      (x): x is Record<string, unknown> =>
                                        Boolean(x) && typeof x === "object",
                                    )
                                    .map(mapTaskRow)
                                    .sort((a, b) => b.createdAt - a.createdAt);
                                  setTasks(next);
                                }
                              } catch (err) {
                                console.error("Send failed:", err);
                                alert("Failed to send message");
                              } finally {
                                input.disabled = false;
                                input.focus();
                              }
                            }
                          }}
                        />
                        <button
                          className="w-8 h-8 rounded-full bg-[#0A84FF] text-white flex items-center justify-center hover:bg-[#007AFF] transition-colors shrink-0"
                          onClick={async (e) => {
                            const input =
                              e.currentTarget.parentElement?.querySelector(
                                'input[type="text"]',
                              ) as HTMLInputElement;
                            if (input) {
                              const text = input.value.trim();
                              const files =
                                commentFiles[fullscreenTask.id] || [];
                              if (!text && !files.length) return;

                              input.disabled = true;
                              e.currentTarget.disabled = true;

                              try {
                                const commentTextToSend =
                                  text.trim() || "📎 Attachment";

                                // 1. Create the comment
                                const res = await apiPost<{
                                  comment: TaskComment;
                                }>(`/api/tasks/${fullscreenTask.id}/comments`, {
                                  message: commentTextToSend,
                                  parentId: replyTo?.commentId ?? null,
                                });

                                const commentId = res.comment.id;

                                // 2. Upload attachments if any
                                if (files.length > 0) {
                                  for (const file of files) {
                                    const fd = new FormData();
                                    fd.set("file", file);
                                    await fetch(
                                      `/api/tasks/${fullscreenTask.id}/comments/${commentId}/attachments`,
                                      {
                                        method: "POST",
                                        credentials: "include",
                                        body: fd,
                                      },
                                    ).catch(() => {
                                      /* best-effort */
                                    });
                                  }
                                }

                                // 3. Cleanup
                                input.value = "";
                                setReplyTo(null);

                                const oldPreviews =
                                  commentFilePreviews[fullscreenTask.id] || [];
                                oldPreviews.forEach((p) => {
                                  if (p) URL.revokeObjectURL(p);
                                });
                                setCommentFiles((p) => {
                                  const newP = { ...p };
                                  delete newP[fullscreenTask.id];
                                  return newP;
                                });
                                setCommentFilePreviews((p) => {
                                  const newP = { ...p };
                                  delete newP[fullscreenTask.id];
                                  return newP;
                                });

                                // 4. Refresh modal and task list
                                const res2 = await apiGet<{ task: TaskItem }>(
                                  `/api/tasks/${fullscreenTask.id}`,
                                );
                                setFullscreenTask(res2.task);

                                const resTasks = await apiGet<{
                                  items: unknown[];
                                }>("/api/tasks").catch(() => null);
                                if (resTasks) {
                                  const next = resTasks.items
                                    .filter(
                                      (x): x is Record<string, unknown> =>
                                        Boolean(x) && typeof x === "object",
                                    )
                                    .map(mapTaskRow)
                                    .sort((a, b) => b.createdAt - a.createdAt);
                                  setTasks(next);
                                }
                              } catch (err: any) {
                                console.error("Send failed:", err);
                                alert(`Failed to send message: ${err?.message || "Internal Server Error"}`);
                              } finally {
                                input.disabled = false;
                                if (e.currentTarget)
                                  e.currentTarget.disabled = false;
                                input.focus();
                              }
                            }
                          }}
                        >
                          <svg
                            className="w-4 h-4 relative left-[1px]"
                            viewBox="0 0 24 24"
                            fill="currentColor"
                          >
                            <path d="M2 21l21-9L2 3v7l15 2-15 2v7z" />
                          </svg>
                        </button>
                      </div>
                    </div>

                    {/* Actions row */}
                    <div className="mt-6 flex items-center gap-4 border-t border-white/10 pt-4">
                      <span className="flex items-center gap-2 rounded-lg bg-blue-500/50 px-4 py-2 text-base font-medium text-white/70">
                        <svg
                          className="h-5 w-5"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                          />
                        </svg>
                        Mark as done
                      </span>
                      <span className="flex items-center gap-2 rounded-lg border border-white/20 bg-transparent px-4 py-2 text-base text-white/60">
                        <svg
                          className="h-5 w-5"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"
                          />
                        </svg>
                        Add work (main task)
                      </span>
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* Edit Task Modal */}
      {editTaskId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
          <div className="relative max-h-[90vh] w-full max-w-2xl overflow-auto rounded-2xl border border-white/10 bg-[#0b0b10] p-6">
            <div className="mb-6 flex items-center justify-between">
              <h2 className="text-xl font-semibold text-white">Edit Task</h2>
              <button
                type="button"
                className="rounded-xl border border-white/15 bg-white/10 px-4 py-2 text-sm text-white/90"
                onClick={() => setEditTaskId(null)}
              >
                Close
              </button>
            </div>

            <div className="space-y-4">
              {/* Title */}
              <div>
                <label className="mb-1 block text-sm text-white/70">
                  Title
                </label>
                <input
                  type="text"
                  className="w-full rounded-xl border border-white/15 bg-white/10 px-3 py-2 text-sm text-white outline-none"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                />
              </div>

              {/* Description */}
              <div>
                <label className="mb-1 block text-sm text-white/70">
                  Description
                </label>
                <textarea
                  className="w-full rounded-xl border border-white/15 bg-white/10 px-3 py-2 text-sm text-white outline-none"
                  rows={3}
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                />
              </div>

              {/* Status - Key feature for returning tasks */}


              {/* Dates */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 block text-sm text-white/70">
                    Start Date
                  </label>
                  <input
                    type="datetime-local"
                    className="w-full rounded-xl border border-white/15 bg-white/10 px-3 py-2 text-sm text-white outline-none"
                    value={editStart}
                    onChange={(e) => setEditStart(e.target.value)}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm text-white/70">
                    Due Date
                  </label>
                  <input
                    type="datetime-local"
                    className="w-full rounded-xl border border-white/15 bg-white/10 px-3 py-2 text-sm text-white outline-none"
                    value={editDue}
                    onChange={(e) => setEditDue(e.target.value)}
                  />
                </div>
              </div>



              {/* Save Button */}
              <div className="flex justify-end gap-3 pt-4 border-t border-white/10">
                <button
                  type="button"
                  className="rounded-xl border border-white/15 bg-white/10 px-4 py-2 text-sm text-white/90 hover:bg-white/15"
                  onClick={() => setEditTaskId(null)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="rounded-xl bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-500 font-semibold"
                  onClick={async () => {
                    if (!editTaskId) return;
                    try {
                      await apiPatch(`/api/tasks/${editTaskId}`, {
                        title: editTitle,
                        description: editDescription,
                        priority: editPriority,
                        startDate: editStart ? new Date(editStart).toISOString() : undefined,
                        dueDate: editDue ? new Date(editDue).toISOString() : undefined,
                        department: editDepartment,
                        project_id: editProjectId || undefined,
                        assignedTo: editAssignedTo,
                        status: editStatus,
                      });
                      setEditTaskId(null);
                      setToast("Task saved successfully");
                      setTimeout(() => setToast(null), 3000);
                      // Refresh tasks
                      const resTasks = await apiGet<{ items: unknown[] }>("/api/tasks").catch(() => null);
                      if (resTasks) {
                        const next = (resTasks.items as Record<string, unknown>[])
                          .filter((x) => Boolean(x) && typeof x === "object")
                          .map(mapTaskRow)
                          .sort((a, b) => b.createdAt - a.createdAt);
                        setTasks(next);
                      }
                    } catch (err: any) {
                      console.error("Failed to save task:", err);
                      alert(`Failed to save: ${err?.message || "Server error"}`);
                    }
                  }}
                >
                  Save Changes
                </button>
                {editStatus === "complete" && (
                  <button
                    type="button"
                    className="rounded-xl bg-amber-600 px-4 py-2 text-sm text-white hover:bg-amber-500"
                    onClick={async () => {
                      if (!editTaskId) return;
                      try {
                        // Find the current task to preserve elapsed time
                        const currentTask = tasks.find(
                          (t) => t.id === editTaskId,
                        );
                        const savedElapsed = currentTask?.elapsedSeconds || 0;

                        // Return task - change status to in_process and save all changes including due date
                        // NOTE: We do NOT stop the timer here - user can continue working
                        await apiPatch(`/api/tasks/${editTaskId}`, {
                          title: editTitle,
                          description: editDescription,
                          priority: editPriority,
                          progress: 0,
                          startDate: new Date(editStart).toISOString(),
                          dueDate: new Date(editDue).toISOString(),
                          department: editDepartment,
                          assignedTo: editAssignedTo,
                          status: "in_process",
                          elapsedSeconds: savedElapsed,
                          // Do NOT set timerRunning - let user control it
                        });
                        setEditTaskId(null);
                        setToast("Task returned to user successfully");
                        setTimeout(() => setToast(null), 3000);
                      } catch (err) {
                        console.error("Failed to return task:", err);
                        alert("Failed to return task");
                      }
                    }}
                  >
                    Return Task
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* User Profile Modal */}
      {viewUserProfile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
          <div className="relative max-h-[90vh] w-full max-w-md overflow-auto rounded-2xl border border-white/10 bg-[#0b0b10] p-6">
            <div className="mb-6 flex items-center justify-between">
              <h2 className="text-xl font-semibold text-white">User Profile</h2>
              <button
                type="button"
                className="rounded-xl border border-white/15 bg-white/10 px-4 py-2 text-sm text-white/90"
                onClick={() => setViewUserProfile(null)}
              >
                Close
              </button>
            </div>

            {/* Profile Picture */}
            <div className="mb-6 flex justify-center">
              {viewUserProfile.avatarUrl ? (
                <img
                  src={viewUserProfile.avatarUrl}
                  alt="Profile"
                  className="h-24 w-24 rounded-full object-cover border-2 border-white/20"
                />
              ) : (
                <div className="h-24 w-24 rounded-full bg-white/10 flex items-center justify-center border-2 border-white/20">
                  <svg
                    className="h-12 w-12 text-white/50"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                    />
                  </svg>
                </div>
              )}
            </div>

            <div className="space-y-4 text-sm">
              <div>
                <span className="text-white/60">Email: </span>
                <span className="text-white">{viewUserProfile.email}</span>
              </div>
              <div>
                <span className="text-white/60">Role: </span>
                <span className="text-white">{viewUserProfile.role}</span>
              </div>
              <div>
                <span className="text-white/60">Department: </span>
                <span className="text-white">{viewUserProfile.department}</span>
              </div>
              <div>
                <span className="text-white/60">Name: </span>
                <span className="text-white">
                  {viewUserProfile.name || "—"}
                </span>
              </div>
              <div>
                <span className="text-white/60">Age: </span>
                <span className="text-white">{viewUserProfile.age || "—"}</span>
              </div>
              <div>
                <span className="text-white/60">Bio: </span>
                <span className="text-white">{viewUserProfile.bio || "—"}</span>
              </div>
              <div>
                <span className="text-white/60">User ID: </span>
                <span className="text-white">{viewUserProfile.id}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========== ADMIN TIMER REPORTS MODAL ========== */}
      {adminReportsModal && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="relative w-full max-w-lg rounded-2xl border border-white/15 bg-[#0f0f1a] p-6 shadow-2xl max-h-[85vh] flex flex-col">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                  <svg
                    className="h-5 w-5 text-blue-400"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                    />
                  </svg>
                  Timer Reports
                </h3>
                <p className="mt-0.5 text-xs text-white/50 truncate max-w-[340px]">
                  {adminReportsModal.taskTitle}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setAdminReportsModal(null)}
                className="shrink-0 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/60 hover:bg-white/10"
              >
                Close
              </button>
            </div>
            <div className="overflow-y-auto flex-1 space-y-3 pr-1">
              {adminReportsLoading ? (
                <div className="flex items-center justify-center py-10 text-white/40 text-sm">
                  Loading reports...
                </div>
              ) : adminReportsData.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 gap-2">
                  <svg
                    className="h-8 w-8 text-white/20"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                    />
                  </svg>
                  <p className="text-sm text-white/40">No reports yet</p>
                  <p className="text-xs text-white/30">
                    Reports are created when the work timer is stopped
                  </p>
                </div>
              ) : (
                adminReportsData.map((r) => {
                  const hrs = Math.floor(r.elapsedSeconds / 3600);
                  const mins = Math.floor((r.elapsedSeconds % 3600) / 60);
                  const secs = r.elapsedSeconds % 60;
                  const timeStr = `${hrs.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
                  return (
                    <div
                      key={r.id}
                      className="rounded-xl border border-white/10 bg-white/5 p-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <div className="h-8 w-8 rounded-full bg-blue-500/20 flex items-center justify-center shrink-0">
                            <span className="text-sm text-blue-400">⏱</span>
                          </div>
                          <div>
                            <div className="text-sm font-semibold text-white font-mono">
                              {timeStr}
                            </div>
                            <div className="text-xs text-white/50">
                              {r.userName || r.userEmail}
                            </div>
                          </div>
                        </div>
                        <div className="text-xs text-white/40 shrink-0">
                          {new Date(r.createdAt).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                            hour: "numeric",
                            minute: "2-digit",
                          })}
                        </div>
                      </div>
                      {r.stopNote && (
                        <div className="mt-3 rounded-lg bg-white/5 border border-white/10 px-3 py-2.5 text-sm text-white/80">
                          <span className="text-white/40 text-xs block mb-1">
                            Stop note:
                          </span>
                          {r.stopNote}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* Forward Message Modal */}
      {forwardingComment && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="relative w-full max-w-md rounded-2xl border border-white/15 bg-[#0b0b10] p-6 shadow-2xl flex flex-col max-h-[80vh]">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                <svg
                  className="w-5 h-5 text-blue-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"
                  />
                </svg>
                Forward Message
              </h3>
              <button
                onClick={() => setForwardingComment(null)}
                className="text-white/40 hover:text-white transition"
              >
                <svg
                  className="w-5 h-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>

            <div className="mb-4 p-3 rounded-xl bg-white/5 border border-white/10 italic text-xs text-white/60 line-clamp-2">
              "{forwardingComment.text || "📎 Attachment"}"
            </div>

            <div className="relative mb-4">
              <input
                type="text"
                placeholder="Search tasks..."
                value={forwardSearch}
                onChange={(e) => setForwardSearch(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-blue-500/50"
              />
              <svg
                className="absolute right-3 top-3 w-4 h-4 text-white/30"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
            </div>

            <div className="overflow-y-auto flex-1 space-y-1 pr-1 scrollbar-thin">
              {tasks
                .filter(
                  (t) =>
                    t.id !== forwardingComment.taskId &&
                    (t.title
                      .toLowerCase()
                      .includes(forwardSearch.toLowerCase()) ||
                      t.description
                        ?.toLowerCase()
                        .includes(forwardSearch.toLowerCase())),
                )
                .slice(0, 10) // Limit results for performance
                .map((targetTask) => (
                  <button
                    key={targetTask.id}
                    onClick={() => handleForwardMessage(targetTask.id)}
                    className="w-full p-3 rounded-xl hover:bg-white/5 border border-transparent hover:border-white/10 transition flex items-center justify-between text-left group"
                  >
                    <div className="flex-1 min-w-0 mr-3">
                      <p className="text-sm font-medium text-white group-hover:text-blue-400 transition truncate">
                        {targetTask.title}
                      </p>
                      <p className="text-[10px] text-white/40 truncate">
                        {targetTask.department?.replace("_", " ")} •{" "}
                        {targetTask.status}
                      </p>
                    </div>
                    <svg
                      className="w-4 h-4 text-white/20 group-hover:text-blue-400 transition"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M13 5l7 7m0 0l-7 7m7-7H6"
                      />
                    </svg>
                  </button>
                ))}
              {tasks.filter(
                (t) =>
                  t.id !== forwardingComment.taskId &&
                  t.title.toLowerCase().includes(forwardSearch.toLowerCase()),
              ).length === 0 && (
                  <div className="py-10 text-center text-white/30 text-xs">
                    No matching tasks found
                  </div>
                )}
            </div>
          </div>
        </div>
      )}

      {/* Fullscreen Media Modal */}
      {fullscreenMedia && (
        <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-black/95 animate-in fade-in duration-200">
          <button
            type="button"
            onClick={() => setFullscreenMedia(null)}
            className="absolute top-6 right-6 p-4 text-white/70 hover:text-white transition-colors z-10"
          >
            <svg
              className="w-8 h-8"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>

          <div className="w-full h-full flex items-center justify-center p-4">
            {fullscreenMedia.type === "image" ? (
              <img
                src={fullscreenMedia.url}
                alt={fullscreenMedia.name}
                className="max-w-full max-h-full object-contain"
              />
            ) : (
              <video
                src={fullscreenMedia.url}
                controls
                autoPlay
                className="max-w-full max-h-full"
              />
            )}
          </div>

          <div className="absolute bottom-8 left-0 right-0 flex flex-col items-center gap-4">
            <span className="text-sm text-white/60 font-medium px-4 py-2 rounded-full bg-white/5 border border-white/10">
              {fullscreenMedia.name}
            </span>
            <a
              href={fullscreenMedia.url}
              download={fullscreenMedia.name}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-2 px-6 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold transition-all shadow-lg active:scale-95"
            >
              <svg
                className="w-5 h-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                />
              </svg>
              Download {fullscreenMedia.type === "image" ? "Image" : "Video"}
            </a>
          </div>
        </div>
      )}
    </RequireAuth>
  );
}
