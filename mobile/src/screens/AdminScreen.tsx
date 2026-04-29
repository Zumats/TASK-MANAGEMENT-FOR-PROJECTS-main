import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  AppState,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  apiBaseUrl,
  apiDelete,
  apiGet,
  apiPatch,
  apiPost,
  requestMultipart,
  setToken,
  getToken,
} from "../lib/api";
import { TaskConversation } from "../components/TaskConversation";
import * as DocumentPicker from "expo-document-picker";
import * as Linking from "expo-linking";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import type {
  Department,
  TaskChecklistItem,
  TaskItem,
  TaskPriority,
  TaskStatus,
} from "../lib/types";
import {
  DarkSelectModal,
  type DarkSelectOption,
} from "../components/DarkSelectModal";
import { DarkMultiUserModal } from "../components/DarkMultiUserModal";
import { DateTimePickerModal } from "../components/DateTimePickerModal";
import { TaskDetailModal } from "../components/TaskDetailModal";
import {
  MobileAdminDrawer,
  type AdminTab,
} from "../components/MobileAdminDrawer";
import { AdminSettingsPanel } from "../components/AdminSettingsPanel";
import { BulletinBoardScreen } from "./BulletinBoardScreen";
import { ConfessionChatScreen } from "./ConfessionChatScreen";

type SimpleUser = {
  id: string;
  email: string;
  role?: string;
  department?: Department;
  status?: string;
  name?: string | null;
  age?: number | null;
  bio?: string | null;
  avatarUrl?: string | null;
  lastSeenAt?: number | null;
  isOnline?: boolean;
};

type CompanyDepartment =
  | "mobile_development"
  | "web_development"
  | "pos"
  | "hardware"
  | "erp_system"
  | "hyper_access"
  | "aln_navarro"
  | "other";

type TaskAttachmentView = {
  id: string;
  name: string;
  url: string;
  size?: number;
  contentType?: string;
  createdAt?: number;
  uploadedBy?: number;
};

type QueuedAssignment = {
  id: string;
  createdAt: number;
  payload: {
    title: string;
    description: string;
    assigned_to: number;
    priority: TaskPriority;
    progress: number;
    start_date: number | null;
    due_date: number | null;
    department: CompanyDepartment;
    project_id?: number;
    shared_with?: number[];
    checklist: Array<{ text: string; done: boolean }>;
  };
};

const ASSIGN_QUEUE_KEY = "hyperaccess_admin_assign_queue_v1";
const LAST_ASSIGN_KEY = "hyperaccess_last_assign_template_v1";

function isLikelyOfflineError(e: unknown): boolean {
  if (e instanceof TypeError) return true;
  if (
    e instanceof Error &&
    /network request failed|failed to fetch|network/i.test(e.message)
  )
    return true;
  return false;
}

function progressColor(pct: number): string {
  if (pct >= 80) return "#22c55e";
  if (pct >= 40) return "#f59e0b";
  return "#ef4444";
}

function barColor(kind: "status" | "priority", key: string): string {
  if (kind === "status") {
    if (key === "complete") return "#22c55e";
    if (key === "failed") return "#ef4444";
    return "#38bdf8";
  }
  if (key === "easy") return "#22c55e";
  if (key === "medium") return "#38bdf8";
  if (key === "high") return "#f59e0b";
  if (key === "very_high") return "#f97316";
  return "#ef4444";
}

function toDateInputValue(ms: number | null): string {
  if (!ms) return "";
  const d = new Date(ms);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function parseDateInputValue(s: string): number | null {
  const v = s.trim();
  if (!v) return null;
  const t = new Date(v).getTime();
  return Number.isFinite(t) ? t : null;
}

async function downloadProjectFile(projectId: string, fileName?: string): Promise<void> {
  try {
    const token = await getToken();
    if (!token) throw new Error("Not authenticated");

    const remoteUrl = `${apiBaseUrl()}/api/projects/${projectId}/file?download=1`;
    const safeName = (fileName || `project_${projectId}_file`).replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 80);
    const localUri = `${FileSystem.cacheDirectory ?? FileSystem.documentDirectory ?? ""}${Date.now()}_${safeName}`;

    if (!localUri) throw new Error("No local storage available");

    const result = await FileSystem.downloadAsync(remoteUrl, localUri, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!result?.uri) throw new Error("Download failed");
    if (result.status && result.status >= 400) throw new Error(`Download failed (${result.status})`);

    const canShare = await Sharing.isAvailableAsync();

    if (!canShare) {
      Alert.alert("Downloaded", `File saved to: ${result.uri}`);
      return;
    }

    // Detect mime type from file extension
    const ext = safeName.split(".").pop()?.toLowerCase();
    const mimeTypeMap: Record<string, string> = {
      pdf: "application/pdf",
      doc: "application/msword",
      docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      xls: "application/vnd.ms-excel",
      xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      ppt: "application/vnd.ms-powerpoint",
      pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      txt: "text/plain",
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      png: "image/png",
      gif: "image/gif",
      mp4: "video/mp4",
      mp3: "audio/mpeg",
    };

    const mimeType = mimeTypeMap[ext || ""] || result.headers?.["content-type"] || "application/octet-stream";

    // Share with UTI for iOS to support more apps like WPS Office
    await Sharing.shareAsync(result.uri, {
      mimeType,
      dialogTitle: fileName || "Open with...",
      UTI: mimeType,
    });
  } catch (e: unknown) {
    Alert.alert("Error", e instanceof Error ? e.message : "Failed to download file");
  }
}

const PRIORITY_COLORS: Record<string, string> = {
  easy: "#1a73e8",
  medium: "#188038",
  high: "#e37400",
  very_high: "#c5221f",
  critical: "#a50e0e",
};

const STATUS_LABELS: Record<string, string> = {
  pending: "Assigned",
  not_started: "Not Started",
  in_process: "In Progress",
  blocked: "Blocked",
  complete: "Done",
  failed: "Missing",
};

const STATUS_COLORS: Record<string, string> = {
  pending: "#1a73e8",
  not_started: "#5f6368",
  in_process: "#e37400",
  blocked: "#d93025",
  complete: "#188038",
  failed: "#c5221f",
};

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

function mapTaskRow(row: Record<string, unknown>): TaskItem {
  // Helper to parse dates (handles both timestamps and ISO strings)
  const parseDate = (val: unknown): number | null => {
    if (val == null) return null;
    if (typeof val === "number") return val;
    if (typeof val === "string") {
      // Try parsing as ISO string first
      const parsed = new Date(val).getTime();
      return isNaN(parsed) ? null : parsed;
    }
    return null;
  };

  const startDate = parseDate(row.start_date);
  const dueDate = parseDate(row.due_date);
  const rawProgress = Number(row.progress);
  const progress = Number.isFinite(rawProgress) ? Math.max(0, Math.min(100, rawProgress)) : 0;

  const comments = Array.isArray(row.comments)
    ? row.comments
      .filter((c): c is Record<string, unknown> => Boolean(c) && typeof c === "object")
      .map((c) => ({
        id: String(c.id ?? ""),
        taskId: String(c.task_id ?? c.taskId ?? ""),
        text: String(c.text ?? ""),
        createdAt: Number(c.created_at ?? c.createdAt ?? Date.now()),
        createdBy: String(c.user_id ?? c.createdBy ?? ""),
        createdByEmail: c.created_by_email == null ? undefined : String(c.created_by_email ?? c.createdByEmail ?? ""),
        attachments: Array.isArray(c.attachments)
            ? c.attachments.map((a: any) => ({
                id: String(a.id ?? ""),
                name: String(a.name ?? ""),
                url: String(a.url ?? ""),
                size: a.size == null ? 0 : Number(a.size),
                contentType: a.contentType == null ? "" : String(a.contentType),
                uploadedAt:
                  a.createdAt == null ? Date.now() : Number(a.createdAt),
                uploadedBy: String(a.uploadedBy ?? ""),
              }))
            : [],
      }))
      .filter((c) => c.id)
    : [];

  return {
    id: String(row.id),
    title: String(row.title ?? ""),
    description: String(row.description ?? ""),
    assignedTo: String(row.assigned_to ?? row.assignedTo ?? ""),
    assignedBy: String(row.assigned_by ?? row.assignedBy ?? ""),
    status: (row.status as any) ?? "in_process",
    progress,
    priority: (row.priority as any) ?? "medium",
    startDate,
    dueDate,
    createdAt: Number(row.created_at ?? Date.now()),
    updatedAt: Number(row.updated_at ?? Date.now()),
    type: (row.type as any) ?? "project",
    department: (row.department as any) ?? "other",
    tags: Array.isArray(row.tags) ? (row.tags as unknown[]).map(String) : [],
    timerRunning: Boolean(row.timerRunning ?? row.timer_running),
    elapsedSeconds: Number(row.elapsedSeconds ?? row.elapsed_seconds) || 0,
    adminApproved: Boolean(row.admin_approved),
    projectName: row.project_name ? String(row.project_name) : null,
    approvalStatus: "none" as any,
    checklist: Array.isArray(row.checklist) ? (row.checklist as any) : [],
    attachments: Array.isArray(row.attachments) ? (row.attachments as any) : [],
    comments,
  };
}

export function AdminScreen() {
  const [me, setMe] = useState<{
    id: number;
    email: string;
    role: "admin" | "manager" | "user";
    department: string;
  } | null>(null);
  const [users, setUsers] = useState<SimpleUser[]>([]);
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [selectedTask, setSelectedTask] = useState<TaskItem | null>(null);
  const [taskDetailOpen, setTaskDetailOpen] = useState(false);
  const [queuedCount, setQueuedCount] = useState(0);
  const [tasksPriorityFilter, setTasksPriorityFilter] = useState<
    "all" | TaskPriority
  >("all");
  const [tasksPriorityFilterOpen, setTasksPriorityFilterOpen] = useState(false);
  // Track which tasks are expanded (to show full details)
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

  const getFullAvatarUrl = (url: string | null | undefined) => {
    if (!url) return null;
    const u = String(url);
    return u.startsWith("http") ? u : `${apiBaseUrl()}${u}`;
  };

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [tab, setTab] = useState<AdminTab>("dashboard");

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  // Assign to multiple users - first is primary, rest are shared (matches web)
  const [assignSelectedUserIds, setAssignSelectedUserIds] = useState<string[]>([]);
  const [startDate, setStartDate] = useState<Date | null>(null);
  const [dueDate, setDueDate] = useState<Date | null>(null);
  const [startPickerOpen, setStartPickerOpen] = useState(false);
  const [duePickerOpen, setDuePickerOpen] = useState(false);
  const [priority, setPriority] = useState<TaskPriority>("medium");
  const [progress] = useState(0);
  const [department, setDepartment] = useState<CompanyDepartment>("other");
  const [tagsRaw, setTagsRaw] = useState("");
  const [checklistRaw, setChecklistRaw] = useState("");
  const [loading, setLoading] = useState(false);
  const [pickedFiles, setPickedFiles] = useState<
    Array<{ name: string; uri: string; mimeType?: string; size?: number }>
  >([]);
  const [uploading, setUploading] = useState(false);

  const loadAssignQueue = async (): Promise<QueuedAssignment[]> => {
    try {
      const raw = await AsyncStorage.getItem(ASSIGN_QUEUE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw) as unknown;
      return Array.isArray(parsed)
        ? (parsed as QueuedAssignment[]).slice(0, 50)
        : [];
    } catch {
      return [];
    }
  };

  const saveAssignQueue = async (next: QueuedAssignment[]) => {
    await AsyncStorage.setItem(
      ASSIGN_QUEUE_KEY,
      JSON.stringify(next.slice(0, 50)),
    );
    setQueuedCount(next.length);
  };

  const processAssignQueueOnce = async () => {
    const q = await loadAssignQueue();
    if (!q.length) {
      setQueuedCount(0);
      return;
    }
    const head = q[0];
    try {
      await apiPost<{ id: number }>("/api/tasks", head.payload);
      const remaining = q.slice(1);
      await saveAssignQueue(remaining);
    } catch {
      // keep queued
      setQueuedCount(q.length);
    }
  };

  const [assignToOpen, setAssignToOpen] = useState(false);
  const [assignProjectOpen, setAssignProjectOpen] = useState(false);
  const [assignProjectId, setAssignProjectId] = useState<string>("");
  // Project type definition
  interface Project {
    id: string;
    name: string;
    description?: string | null;
    linkUrl?: string | null;
    hasFile?: number;
    fileName?: string | null;
    createdAt?: number;
  }
  const [projects, setProjects] = useState<Project[]>([]);
  const [priorityOpen, setPriorityOpen] = useState(false);
  const [departmentOpen, setDepartmentOpen] = useState(false);

  const [editTaskId, setEditTaskId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editPriority, setEditPriority] = useState<TaskPriority>("medium");
  const [editProgress, setEditProgress] = useState(0);
  const [editStart, setEditStart] = useState<Date | null>(null);
  const [editDue, setEditDue] = useState<Date | null>(null);
  const [editDepartment, setEditDepartment] =
    useState<CompanyDepartment>("other");
  const [editStartPickerOpen, setEditStartPickerOpen] = useState(false);
  const [editDuePickerOpen, setEditDuePickerOpen] = useState(false);

  const [editPriorityOpen, setEditPriorityOpen] = useState(false);
  const [editDepartmentOpen, setEditDepartmentOpen] = useState(false);
  const [viewUserProfile, setViewUserProfile] = useState<SimpleUser | null>(
    null,
  );

  // Dashboard filter states
  const [dashboardDateRange, setDashboardDateRange] = useState<"7days" | "30days" | "90days" | "all">("30days");
  const [dashboardProjectFilter, setDashboardProjectFilter] = useState<string>("all");
  const [userSearchQuery, setUserSearchQuery] = useState<string>("");
  const [dateRangeModalOpen, setDateRangeModalOpen] = useState(false);
  const [projectFilterModalOpen, setProjectFilterModalOpen] = useState(false);

  // Projects page states
  const [projectSearchQuery, setProjectSearchQuery] = useState<string>("");
  const [createProjectModalOpen, setCreateProjectModalOpen] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [newProjectLink, setNewProjectLink] = useState("");
  const [creatingProject, setCreatingProject] = useState(false);
  // Edit project modal states
  const [editProjectModalOpen, setEditProjectModalOpen] = useState(false);
  const [editProjectId, setEditProjectId] = useState<string>("");
  const [editProjectName, setEditProjectName] = useState("");
  const [editProjectLink, setEditProjectLink] = useState("");
  const [editProjectDescription, setEditProjectDescription] = useState("");
  const [editingProject, setEditingProject] = useState(false);

  // Work Overview states
  const [workOverviewFilterOpen, setWorkOverviewFilterOpen] = useState(false);
  const [workOverviewSearch, setWorkOverviewSearch] = useState("");
  const [workOverviewProjectFilter, setWorkOverviewProjectFilter] = useState<string>("all");
  const [workOverviewStatusFilter, setWorkOverviewStatusFilter] = useState<string>("all");
  const [workOverviewProjectModalOpen, setWorkOverviewProjectModalOpen] = useState(false);
  const [workOverviewStatusModalOpen, setWorkOverviewStatusModalOpen] = useState(false);
  const [baselineModalOpen, setBaselineModalOpen] = useState(false);
  const [workOverviewAdvancedFilterOpen, setWorkOverviewAdvancedFilterOpen] = useState(false);
  const [workOverviewPriorityFilter, setWorkOverviewPriorityFilter] = useState<string>("all");
  const [workOverviewAssigneeFilter, setWorkOverviewAssigneeFilter] = useState<string>("all");

  // Users Tasks states
  const [usersTasksSearch, setUsersTasksSearch] = useState("");
  const [usersTasksStatusFilter, setUsersTasksStatusFilter] = useState<string>("all");
  const [usersTasksAssigneeFilter, setUsersTasksAssigneeFilter] = useState<string>("all");
  const [usersTasksStatusModalOpen, setUsersTasksStatusModalOpen] = useState(false);
  const [usersTasksAssigneeModalOpen, setUsersTasksAssigneeModalOpen] = useState(false);

  // Accounts states
  const [accountsFilter, setAccountsFilter] = useState<string>("all"); // Role filter
  const [accountsPresenceFilter, setAccountsPresenceFilter] = useState<string>("all");
  const [accountsStatusFilter, setAccountsStatusFilter] = useState<string>("all"); // Status filter: all, approved, pending, rejected, deleted
  const [accountsFilterModalOpen, setAccountsFilterModalOpen] = useState(false);
  const [accountsPresenceModalOpen, setAccountsPresenceModalOpen] = useState(false);
  const [accountsStatusModalOpen, setAccountsStatusModalOpen] = useState(false);
  const [allUsers, setAllUsers] = useState<SimpleUser[]>([]); // Includes pending/rejected/deleted

  useEffect(() => {
    let cancelled = false;
    let id: ReturnType<typeof setInterval> | null = null;

    // Update presence - mark user as online
    const updatePresence = async () => {
      try {
        await apiPost("/api/auth/presence", {});
      } catch (e) {
        console.log("Presence update failed:", e);
      }
    };

    const tick = async () => {
      try {
        // Update presence on each tick
        await updatePresence();

        const [meRes, tasksRes, usersRes, projectsRes] = await Promise.all([
          apiGet<{
            user: {
              id: number;
              email: string;
              role: "admin" | "manager" | "user";
              department: string;
            } | null;
          }>("/api/auth/me"),
          apiGet<{ items: unknown[] }>("/api/tasks"),
          apiGet<{ items: unknown[] }>("/api/admin/users"),
          apiGet<{
            items: Array<{
              id: number;
              name: string;
              description?: string | null;
              linkUrl?: string | null;
              hasFile?: number;
              fileName?: string | null;
              createdAt?: number;
            }>;
          }>("/api/projects").catch(() => ({ items: [] as { id: number; name: string; description?: string | null; linkUrl?: string | null; hasFile?: number; fileName?: string | null; createdAt?: number }[] })),
        ]);
        if (cancelled) return;

        setMe(meRes.user);

        setProjects(
          (projectsRes.items ?? []).map((p) => ({
            id: String(p.id),
            name: p.name,
            description: p.description ?? null,
            linkUrl: p.linkUrl ?? null,
            hasFile: p.hasFile,
            fileName: p.fileName ?? null,
            createdAt: p.createdAt ?? Date.now(),
          })),
        );

        const nextTasks = tasksRes.items
          .filter(
            (x): x is Record<string, unknown> =>
              Boolean(x) && typeof x === "object",
          )
          .map(mapTaskRow)
          .sort((a, b) => b.createdAt - a.createdAt);
        setTasks(nextTasks);

        const myId =
          meRes.user?.id != null ? String(meRes.user.id) : null;

        const nextUsers = usersRes.items
          .filter(
            (x): x is Record<string, unknown> =>
              Boolean(x) && typeof x === "object",
          )
          .map((u) => ({
            id: String(u.id ?? ""),
            email: String(u.email ?? ""),
            role: typeof u.role === "string" ? u.role : undefined,
            status: u.status == null ? undefined : String(u.status),
            department:
              (typeof u.department === "string"
                ? (u.department as Department)
                : undefined) ?? "other",
            name: u.name == null ? null : String(u.name),
            age: u.age == null ? null : Number(u.age),
            bio: u.bio == null ? null : String(u.bio),
            avatarUrl:
              u.avatarUrl != null
                ? String(u.avatarUrl)
                : u.avatar_url == null
                  ? null
                  : String(u.avatar_url),
            lastSeenAt: u.last_seen_at != null ? Number(u.last_seen_at) : null,
            isOnline: u.is_online === true || u.isOnline === true,
          }))
          .filter((u) => u.id)
          .filter((u) => myId == null || u.id !== myId);

        // All users including pending/rejected for accounts view
        const allUsersList = nextUsers.sort((a, b) => a.email.localeCompare(b.email));
        setAllUsers(allUsersList);

        // Filtered users for task assignment (only approved)
        const assignableUsers = nextUsers
          .filter((u) => u.status !== "pending" && u.status !== "rejected")
          .sort((a, b) => a.email.localeCompare(b.email));

        setUsers(assignableUsers);
      } catch {
        // ignore
      }
    };

    void tick();
    id = setInterval(tick, 2500);
    return () => {
      cancelled = true;
      if (id) clearInterval(id);
    };
  }, []);

  // Mobile presence: update when app comes to foreground
  useEffect(() => {
    const handleAppStateChange = (nextAppState: string) => {
      if (nextAppState === "active") {
        // Update presence immediately when app becomes active
        apiPost("/api/auth/presence", {}).catch(() => {});
      }
    };

    const subscription = AppState.addEventListener("change", handleAppStateChange);
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    let mounted = true;
    void (async () => {
      const q = await loadAssignQueue();
      if (!mounted) return;
      setQueuedCount(q.length);
      await processAssignQueueOnce();
    })();

    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") void processAssignQueueOnce();
    });
    const id = setInterval(() => void processAssignQueueOnce(), 5000);
    return () => {
      mounted = false;
      sub.remove();
      clearInterval(id);
    };
  }, []);

  // Helper to get primary assignee and shared users from selected IDs (matches web splitPrimaryAndShared)
  const { primaryAssignee, sharedUsers } = useMemo(() => {
    if (assignSelectedUserIds.length === 0) {
      return { primaryAssignee: null as SimpleUser | null, sharedUsers: [] as SimpleUser[] };
    }
    const firstId = assignSelectedUserIds[0];
    const restIds = assignSelectedUserIds.slice(1);
    const primary = users.find((u) => u.id === firstId) || null;
    const shared = users.filter((u) => restIds.includes(u.id));
    return { primaryAssignee: primary, sharedUsers: shared };
  }, [assignSelectedUserIds, users]);

  const assignOptions = useMemo(
    () =>
      users.map((u) => ({
        id: u.id,
        label: (u.name?.trim() || u.email) as string,
        subtitle: u.name?.trim() ? u.email : undefined,
        avatarUrl: u.avatarUrl || undefined,
      })),
    [users],
  );

  const projectSelectOptions: DarkSelectOption[] = useMemo(
    () => [
      { label: "No project", value: "" },
      ...projects.map((p) => ({ label: p.name, value: p.id })),
    ],
    [projects],
  );

  const priorityOptions: DarkSelectOption[] = useMemo(
    () => [
      { label: "Easy", value: "easy" },
      { label: "Medium", value: "medium" },
      { label: "High", value: "high" },
      { label: "Very high", value: "very_high" },
      { label: "Critical", value: "critical" },
    ],
    [],
  );

  const tasksPriorityFilterOptions: DarkSelectOption[] = useMemo(
    () => [{ label: "All", value: "all" }, ...priorityOptions],
    [priorityOptions],
  );

  const departmentOptions: DarkSelectOption[] = useMemo(
    () => [
      { label: "No project type", value: "other" },
      { label: "Mobile Development", value: "mobile_development" },
      { label: "Web Development", value: "web_development" },
      { label: "POS", value: "pos" },
      { label: "Hardware", value: "hardware" },
      { label: "ERP System", value: "erp_system" },
    ],
    [],
  );

  const totals = useMemo(() => {
    // Filter tasks based on dashboard settings
    const filtered = tasks.filter((t) => {
      // Project filter
      if (dashboardProjectFilter !== "all" && t.projectName !== projects.find(p => p.id === dashboardProjectFilter)?.name) {
        return false;
      }

      // Date range filter
      if (dashboardDateRange !== "all") {
        const now = Date.now();
        const days = dashboardDateRange === "7days" ? 7 : dashboardDateRange === "30days" ? 30 : 90;
        const threshold = now - days * 24 * 60 * 60 * 1000;
        if (t.createdAt < threshold) return false;
      }

      return true;
    });

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

    let sum = 0;
    for (const t of filtered) {
      if (t.status === "in_process" || t.status === "pending") status.in_process += 1;
      if (t.status === "complete") status.complete += 1;
      if (t.status === "failed") status.failed += 1;
      priorityCounts[t.priority] = (priorityCounts[t.priority] ?? 0) + 1;
      sum += t.progress;
    }

    const avgProgress = filtered.length ? Math.round(sum / filtered.length) : 0;
    return { status, priorityCounts, avgProgress, total: filtered.length };
  }, [tasks, dashboardDateRange, dashboardProjectFilter, projects]);

  const accounts = useMemo(() => allUsers, [allUsers]);

  const userEmailByUid = useMemo(() => {
    const m = new Map<string, string>();
    for (const u of users) m.set(u.id, u.email);
    return m;
  }, [users]);

  // Check if user is online - use API isOnline field or fall back to lastSeenAt check
  const isUserOnline = (user: SimpleUser): boolean => {
    // If API provided isOnline, use it
    if (user.isOnline !== undefined) return user.isOnline;
    // Otherwise check lastSeenAt (within 2 minutes)
    if (!user.lastSeenAt) return false;
    const ONLINE_THRESHOLD_MS = 2 * 60 * 1000; // 2 minutes
    return Date.now() - user.lastSeenAt < ONLINE_THRESHOLD_MS;
  };

  const userTotals = useMemo(() => {
    // 1. Get tasks in scope (matches totals calculation)
    const filteredTasks = tasks.filter((t) => {
      if (dashboardProjectFilter !== "all" && t.projectName !== projects.find(p => p.id === dashboardProjectFilter)?.name) {
        return false;
      }
      if (dashboardDateRange !== "all") {
        const now = Date.now();
        const days = dashboardDateRange === "7days" ? 7 : dashboardDateRange === "30days" ? 30 : 90;
        const threshold = now - days * 24 * 60 * 60 * 1000;
        if (t.createdAt < threshold) return false;
      }
      return true;
    });

    // 2. Aggregate counts per user
    const statsMap = new Map<string, { in_process: number; complete: number; failed: number }>();
    
    // Initialize stats for all relevant users
    users.forEach(u => {
      statsMap.set(u.id, { in_process: 0, complete: 0, failed: 0 });
    });

    // Count tasks for each user
    filteredTasks.forEach(t => {
      if (!t.assignedTo) return;
      const current = statsMap.get(t.assignedTo);
      if (current) {
        if (t.status === "in_process" || t.status === "pending") current.in_process += 1;
        else if (t.status === "complete") current.complete += 1;
        else if (t.status === "failed") current.failed += 1;
      }
    });

    // 3. Convert to array and filter by search
    return users
      .map(u => ({
        ...u,
        stats: statsMap.get(u.id) || { in_process: 0, complete: 0, failed: 0 }
      }))
      .filter(u => {
        if (!userSearchQuery) return true;
        const q = userSearchQuery.toLowerCase();
        return (u.name?.toLowerCase().includes(q) || u.email.toLowerCase().includes(q));
      })
      .sort((a, b) => a.email.localeCompare(b.email));
  }, [tasks, users, dashboardDateRange, dashboardProjectFilter, projects, userSearchQuery]);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.containerContent}
      keyboardShouldPersistTaps="handled"
    >
      <MobileAdminDrawer
        open={drawerOpen}
        active={tab}
        onClose={() => setDrawerOpen(false)}
        onSelect={(t) => setTab(t)}
      />

      {tab === "settings" ? <AdminSettingsPanel /> : null}

      {/* Assign To - Multi-user select like web */}
      <DarkMultiUserModal
        visible={assignToOpen}
        title="Assign to"
        options={assignOptions}
        selectedIds={assignSelectedUserIds}
        onClose={() => setAssignToOpen(false)}
        onToggle={(id) => {
          setAssignSelectedUserIds((prev) =>
            prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
          );
        }}
        resolveAvatarUrl={getFullAvatarUrl}
      />

      <DarkSelectModal
        visible={assignProjectOpen}
        title="Project"
        options={projectSelectOptions}
        selectedValue={assignProjectId}
        onClose={() => setAssignProjectOpen(false)}
        onSelect={(v) => setAssignProjectId(v)}
      />

      <DarkSelectModal
        visible={priorityOpen}
        title="Priority"
        options={priorityOptions}
        selectedValue={priority}
        onClose={() => setPriorityOpen(false)}
        onSelect={(v) => setPriority(v as TaskPriority)}
      />

      <DarkSelectModal
        visible={departmentOpen}
        title="Department"
        options={departmentOptions}
        selectedValue={department}
        onClose={() => setDepartmentOpen(false)}
        onSelect={(v) => setDepartment(v as CompanyDepartment)}
      />

      <DarkSelectModal
        visible={editPriorityOpen}
        title="Edit priority"
        options={priorityOptions}
        selectedValue={editPriority}
        onClose={() => setEditPriorityOpen(false)}
        onSelect={(v) => setEditPriority(v as TaskPriority)}
      />

      <DarkSelectModal
        visible={editDepartmentOpen}
        title="Edit department"
        options={departmentOptions}
        selectedValue={editDepartment}
        onClose={() => setEditDepartmentOpen(false)}
        onSelect={(v) => setEditDepartment(v as CompanyDepartment)}
      />

      <DateTimePickerModal
        visible={startPickerOpen}
        value={startDate}
        onClose={() => setStartPickerOpen(false)}
        onSelect={(d) => setStartDate(d)}
        title="Select start date & time"
      />

      <DateTimePickerModal
        visible={duePickerOpen}
        value={dueDate}
        onClose={() => setDuePickerOpen(false)}
        onSelect={(d) => setDueDate(d)}
        title="Select due date & time"
      />

      <DateTimePickerModal
        visible={editStartPickerOpen}
        value={editStart}
        onClose={() => setEditStartPickerOpen(false)}
        onSelect={(d) => setEditStart(d)}
        title="Edit start date & time"
      />

      <DateTimePickerModal
        visible={editDuePickerOpen}
        value={editDue}
        onClose={() => setEditDuePickerOpen(false)}
        onSelect={(d) => setEditDue(d)}
        title="Edit due date & time"
      />

      {/* Dashboard Filter Modals */}
      <DarkSelectModal
        visible={dateRangeModalOpen}
        title="Select Date Range"
        options={[
          { value: "7days", label: "Last 7 days" },
          { value: "30days", label: "Last 30 days" },
          { value: "90days", label: "Last 90 days" },
          { value: "all", label: "All time" },
        ]}
        selectedValue={dashboardDateRange}
        onClose={() => setDateRangeModalOpen(false)}
        onSelect={(v) => setDashboardDateRange(v as any)}
      />

      <DarkSelectModal
        visible={projectFilterModalOpen}
        title="Select Project"
        options={[
          { value: "all", label: "All projects" },
          ...projects.map((p) => ({ value: p.id, label: p.name })),
        ]}
        selectedValue={dashboardProjectFilter}
        onClose={() => setProjectFilterModalOpen(false)}
        onSelect={(v) => setDashboardProjectFilter(v)}
      />

      {/* Create Project Modal */}
      {createProjectModalOpen && (
        <View style={createProjectModalStyles.overlay}>
          <View style={createProjectModalStyles.modal}>
            <View style={createProjectModalStyles.header}>
              <Text style={createProjectModalStyles.title}>Create New Project</Text>
              <Pressable onPress={() => setCreateProjectModalOpen(false)}>
                <Text style={createProjectModalStyles.closeBtn}>✕</Text>
              </Pressable>
            </View>
            <Text style={createProjectModalStyles.label}>Project Name</Text>
            <TextInput
              style={createProjectModalStyles.input}
              placeholder="Enter project name"
              placeholderTextColor="rgba(255,255,255,0.4)"
              value={newProjectName}
              onChangeText={setNewProjectName}
            />
            <Text style={createProjectModalStyles.label}>Project Link (optional)</Text>
            <TextInput
              style={createProjectModalStyles.input}
              placeholder="https://..."
              placeholderTextColor="rgba(255,255,255,0.4)"
              value={newProjectLink}
              onChangeText={setNewProjectLink}
              autoCapitalize="none"
            />
            <View style={createProjectModalStyles.buttons}>
              <Pressable
                style={({ pressed }) => [
                  createProjectModalStyles.cancelBtn,
                  pressed && { opacity: 0.9 },
                ]}
                onPress={() => {
                  setCreateProjectModalOpen(false);
                  setNewProjectName("");
                  setNewProjectLink("");
                }}
              >
                <Text style={createProjectModalStyles.cancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [
                  createProjectModalStyles.createBtn,
                  (!newProjectName.trim() || creatingProject) && { opacity: 0.5 },
                  pressed && { opacity: 0.8 },
                ]}
                onPress={async () => {
                  if (!newProjectName.trim() || creatingProject) return;
                  setCreatingProject(true);
                  try {
                    await apiPost("/api/projects", {
                      name: newProjectName.trim(),
                      linkUrl: newProjectLink.trim() || null,
                    });
                    setNewProjectName("");
                    setNewProjectLink("");
                    setCreateProjectModalOpen(false);
                    Alert.alert("Success", "Project created successfully.");
                    // Refresh projects will happen on next data fetch
                  } catch (e) {
                    Alert.alert(
                      "Error",
                      e instanceof Error ? e.message : "Failed to create project",
                    );
                  } finally {
                    setCreatingProject(false);
                  }
                }}
              >
                <Text style={createProjectModalStyles.createText}>
                  {creatingProject ? "Creating..." : "Create Project"}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      )}

      {/* Edit Project Modal */}
      {editProjectModalOpen && (
        <View style={createProjectModalStyles.overlay}>
          <View style={createProjectModalStyles.modal}>
            <View style={createProjectModalStyles.header}>
              <Text style={createProjectModalStyles.title}>Edit Project</Text>
              <Pressable onPress={() => setEditProjectModalOpen(false)}>
                <Text style={createProjectModalStyles.closeBtn}>✕</Text>
              </Pressable>
            </View>
            <Text style={createProjectModalStyles.label}>Project Name</Text>
            <TextInput
              style={createProjectModalStyles.input}
              placeholder="Enter project name"
              placeholderTextColor="rgba(255,255,255,0.4)"
              value={editProjectName}
              onChangeText={setEditProjectName}
            />
            <Text style={createProjectModalStyles.label}>Description</Text>
            <TextInput
              style={[createProjectModalStyles.input, { height: 80, textAlignVertical: "top" }]}
              placeholder="Enter project description..."
              placeholderTextColor="rgba(255,255,255,0.4)"
              value={editProjectDescription}
              onChangeText={setEditProjectDescription}
              multiline
            />
            <Text style={createProjectModalStyles.label}>Project Link (optional)</Text>
            <TextInput
              style={createProjectModalStyles.input}
              placeholder="https://..."
              placeholderTextColor="rgba(255,255,255,0.4)"
              value={editProjectLink}
              onChangeText={setEditProjectLink}
              autoCapitalize="none"
            />
            <View style={createProjectModalStyles.buttons}>
              <Pressable
                style={({ pressed }) => [
                  createProjectModalStyles.cancelBtn,
                  pressed && { opacity: 0.9 },
                ]}
                onPress={() => {
                  setEditProjectModalOpen(false);
                  setEditProjectId("");
                  setEditProjectName("");
                  setEditProjectLink("");
                  setEditProjectDescription("");
                }}
              >
                <Text style={createProjectModalStyles.cancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [
                  createProjectModalStyles.createBtn,
                  (!editProjectName.trim() || editingProject) && { opacity: 0.5 },
                  pressed && { opacity: 0.8 },
                ]}
                onPress={async () => {
                  if (!editProjectName.trim() || editingProject) return;
                  setEditingProject(true);
                  try {
                    await apiPatch(`/api/projects/${editProjectId}`, {
                      name: editProjectName.trim(),
                      description: editProjectDescription.trim() || null,
                      linkUrl: editProjectLink.trim() || null,
                    });
                    setEditProjectId("");
                    setEditProjectName("");
                    setEditProjectLink("");
                    setEditProjectDescription("");
                    setEditProjectModalOpen(false);
                    Alert.alert("Success", "Project updated successfully.");
                  } catch (e) {
                    Alert.alert(
                      "Error",
                      e instanceof Error ? e.message : "Failed to update project",
                    );
                  } finally {
                    setEditingProject(false);
                  }
                }}
              >
                <Text style={createProjectModalStyles.createText}>
                  {editingProject ? "Saving..." : "Save Changes"}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      )}

      {/* Work Overview Filter Modals */}
      <DarkSelectModal
        visible={workOverviewFilterOpen}
        title="Select Filter"
        options={[
          { value: "all_open", label: "☰ All open" },
          { value: "recently_created", label: "⏱️ Recently Created" },
          { value: "latest_activity", label: "⚡ Latest Activity" },
          { value: "overdue", label: "⚠️ Overdue" },
          { value: "shared_with_users", label: "👥 Shared with Users" },
          { value: "shared_with_me", label: "👤 Shared with Me" },
        ]}
        selectedValue={tab}
        onClose={() => setWorkOverviewFilterOpen(false)}
        onSelect={(v) => setTab(v as AdminTab)}
      />

      <DarkSelectModal
        visible={workOverviewProjectModalOpen}
        title="Select Project"
        options={[
          { value: "all", label: "All projects" },
          ...projects.map((p) => ({ value: p.id, label: p.name })),
        ]}
        selectedValue={workOverviewProjectFilter}
        onClose={() => setWorkOverviewProjectModalOpen(false)}
        onSelect={(v) => setWorkOverviewProjectFilter(v)}
      />

      <DarkSelectModal
        visible={workOverviewStatusModalOpen}
        title="Select Status"
        options={[
          { value: "all", label: "All" },
          { value: "in_process", label: "In Progress" },
          { value: "complete", label: "Complete" },
          { value: "failed", label: "Pending" },
        ]}
        selectedValue={workOverviewStatusFilter}
        onClose={() => setWorkOverviewStatusModalOpen(false)}
        onSelect={(v) => setWorkOverviewStatusFilter(v)}
      />

      {/* Baseline Modal */}
      <DarkSelectModal
        visible={baselineModalOpen}
        title="Select Baseline"
        options={[
          { value: "none", label: "None" },
          { value: "save_current", label: "+ Save current as baseline" },
        ]}
        selectedValue="none"
        onClose={() => setBaselineModalOpen(false)}
        onSelect={(v) => {
          if (v === "save_current") {
            Alert.alert("Baseline", "Current view saved as baseline.");
          }
          setBaselineModalOpen(false);
        }}
      />

      {/* Advanced Filter Modal */}
      <DarkSelectModal
        visible={workOverviewAdvancedFilterOpen}
        title="Filter Tasks"
        options={[
          { value: "status_all", label: "━━ STATUS ━━" },
          { value: "status_in_process", label: "  In Progress" },
          { value: "status_complete", label: "  Complete" },
          { value: "status_pending", label: "  Pending" },
          { value: "priority_all", label: "━━ PRIORITY ━━" },
          { value: "priority_high", label: "  High" },
          { value: "priority_normal", label: "  Normal" },
          { value: "priority_low", label: "  Low" },
          { value: "assignee_all", label: "━━ ASSIGNEE ━━" },
          ...users.map((u) => ({ value: `assignee_${u.id}`, label: `  ${u.name || u.email}` })),
        ]}
        selectedValue="status_all"
        onClose={() => setWorkOverviewAdvancedFilterOpen(false)}
        onSelect={(v) => {
          if (v.startsWith("status_")) {
            const status = v.replace("status_", "");
            setWorkOverviewStatusFilter(status === "all" ? "all" : status);
          } else if (v.startsWith("priority_")) {
            const priority = v.replace("priority_", "");
            setWorkOverviewPriorityFilter(priority);
          } else if (v.startsWith("assignee_")) {
            const assignee = v.replace("assignee_", "");
            setWorkOverviewAssigneeFilter(assignee);
          }
          setWorkOverviewAdvancedFilterOpen(false);
        }}
      />

      {/* Users Tasks Filter Modals */}
      <DarkSelectModal
        visible={usersTasksStatusModalOpen}
        title="Select Status"
        options={[
          { value: "all", label: "All statuses" },
          { value: "pending", label: "Pending" },
          { value: "not_started", label: "Not started" },
          { value: "in_process", label: "In process" },
          { value: "blocked", label: "Blocked" },
          { value: "complete", label: "Done / Complete" },
          { value: "failed", label: "Failed" },
        ]}
        selectedValue={usersTasksStatusFilter}
        onClose={() => setUsersTasksStatusModalOpen(false)}
        onSelect={(v) => setUsersTasksStatusFilter(v)}
      />

      <DarkSelectModal
        visible={usersTasksAssigneeModalOpen}
        title="Select Assignee"
        options={[
          { value: "all", label: "All users" },
          ...users.map((u) => ({ value: u.id, label: u.name || u.email })),
        ]}
        selectedValue={usersTasksAssigneeFilter}
        onClose={() => setUsersTasksAssigneeModalOpen(false)}
        onSelect={(v) => setUsersTasksAssigneeFilter(v)}
        searchable
      />

      {/* Accounts Filter Modals */}
      <DarkSelectModal
        visible={accountsFilterModalOpen}
        title="Filter Users"
        options={[
          { value: "all", label: "All Users" },
          { value: "admin", label: "Admins" },
          { value: "manager", label: "Managers" },
          { value: "user", label: "Users" },
        ]}
        selectedValue={accountsFilter}
        onClose={() => setAccountsFilterModalOpen(false)}
        onSelect={(v) => setAccountsFilter(v)}
      />

      <DarkSelectModal
        visible={accountsPresenceModalOpen}
        title="Presence"
        options={[
          { value: "all", label: "All presence" },
          { value: "online", label: "Online" },
          { value: "offline", label: "Offline" },
        ]}
        selectedValue={accountsPresenceFilter}
        onClose={() => setAccountsPresenceModalOpen(false)}
        onSelect={(v) => setAccountsPresenceFilter(v)}
      />

      <DarkSelectModal
        visible={accountsStatusModalOpen}
        title="Status"
        options={[
          { value: "all", label: "All status" },
          { value: "approved", label: "Approved" },
          { value: "pending", label: "Pending" },
          { value: "rejected", label: "Rejected" },
          { value: "deleted", label: "Deleted" },
        ]}
        selectedValue={accountsStatusFilter}
        onClose={() => setAccountsStatusModalOpen(false)}
        onSelect={(v) => setAccountsStatusFilter(v)}
      />

      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Pressable
            style={({ pressed }) => [styles.menu, pressed && { opacity: 0.9 }]}
            onPress={() => setDrawerOpen((v) => !v)}
          >
            <Text style={{ color: "white", fontWeight: "900" }}>≡</Text>
          </Pressable>
          <View style={styles.brand}>
            <Image
              source={require("../../assets/hasi.jpg")}
              style={styles.logo}
              resizeMode="contain"
            />
            <Text style={styles.brandTitle}>Hyperaccess Project Management</Text>
          </View>
        </View>
        <View style={styles.headerActions}>
          <Pressable
            style={({ pressed }) => [
              styles.logout,
              pressed && { opacity: 0.9 },
            ]}
            onPress={async () => {
              await apiPost("/api/auth/logout").catch(() => null);
              await setToken(null);
            }}
          >
            <Text style={{ color: "white", fontWeight: "700" }}>Logout</Text>
          </Pressable>
        </View>
      </View>

      {tab === "dashboard" ? (
        <View style={dashboardStyles.container}>
          {/* Dashboard Filters Header */}
          <View style={dashboardStyles.filtersCard}>
            <Text style={dashboardStyles.filtersTitle}>Dashboard filters</Text>
            <Text style={dashboardStyles.filtersSubtitle}>Scope insights by date range and project.</Text>
            <Text style={dashboardStyles.filtersScope}>Showing {totals.total} tasks in scope.</Text>
            
            <View style={dashboardStyles.filterButtonsRow}>
              <Pressable style={dashboardStyles.filterBtn} onPress={() => setDateRangeModalOpen(true)}>
                <Text style={dashboardStyles.filterBtnLabel}>DATE RANGE</Text>
                <View style={dashboardStyles.filterBtnContent}>
                  <Text style={dashboardStyles.filterBtnText}>
                    {dashboardDateRange === "7days" ? "Last 7 days" :
                     dashboardDateRange === "30days" ? "Last 30 days" :
                     dashboardDateRange === "90days" ? "Last 90 days" : "All time"}
                  </Text>
                  <Text style={dashboardStyles.filterBtnIcon}>▼</Text>
                </View>
              </Pressable>
              <Pressable style={dashboardStyles.filterBtn} onPress={() => setProjectFilterModalOpen(true)}>
                <Text style={dashboardStyles.filterBtnLabel}>PROJECT</Text>
                <View style={dashboardStyles.filterBtnContent}>
                  <Text style={dashboardStyles.filterBtnText} numberOfLines={1}>
                    {dashboardProjectFilter === "all" ? "All projects" : projects.find(p => p.id === dashboardProjectFilter)?.name || "Project"}
                  </Text>
                  <Text style={dashboardStyles.filterBtnIcon}>▼</Text>
                </View>
              </Pressable>
            </View>
          </View>

          {/* Summary Cards - Horizontal Scroll */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={dashboardStyles.summaryScroll}
          >
            <View style={dashboardStyles.summaryCard}>
              <View style={[dashboardStyles.summaryCardBg, { backgroundColor: "rgba(56,189,248,0.12)", borderColor: "rgba(56,189,248,0.4)" }]}>
                <Text style={[dashboardStyles.summaryLabel, { color: "#38bdf8" }]}>IN PROCESS</Text>
                <Text style={dashboardStyles.summaryValue}>{totals.status.in_process}</Text>
              </View>
            </View>
            <View style={dashboardStyles.summaryCard}>
              <View style={[dashboardStyles.summaryCardBg, { backgroundColor: "rgba(34,197,94,0.12)", borderColor: "rgba(34,197,94,0.4)" }]}>
                <Text style={[dashboardStyles.summaryLabel, { color: "#22c55e" }]}>COMPLETE</Text>
                <Text style={dashboardStyles.summaryValue}>{totals.status.complete}</Text>
              </View>
            </View>
            <View style={dashboardStyles.summaryCard}>
              <View style={[dashboardStyles.summaryCardBg, { backgroundColor: "rgba(245,158,11,0.12)", borderColor: "rgba(245,158,11,0.4)" }]}>
                <Text style={[dashboardStyles.summaryLabel, { color: "#f59e0b" }]}>PENDING</Text>
                <Text style={dashboardStyles.summaryValue}>{totals.status.failed}</Text>
              </View>
            </View>
            <View style={dashboardStyles.summaryCard}>
              <View style={[dashboardStyles.summaryCardBg, { backgroundColor: "rgba(168,85,247,0.12)", borderColor: "rgba(168,85,247,0.4)" }]}>
                <Text style={[dashboardStyles.summaryLabel, { color: "#a855f7" }]}>AVG PROGRESS</Text>
                <Text style={dashboardStyles.summaryValue}>{totals.avgProgress}%</Text>
              </View>
            </View>
          </ScrollView>

          {/* Stats Section - Stacked Cards */}
          <View style={dashboardStyles.statsStack}>
            {/* Tasks by Status */}
            <View style={dashboardStyles.statCardFull}>
              <Text style={dashboardStyles.statCardTitle}>Tasks by status</Text>
              {(
                [
                  ["In Process", totals.status.in_process, "in_process", "#38bdf8"],
                  ["Complete", totals.status.complete, "complete", "#22c55e"],
                  ["Pending", totals.status.failed, "failed", "#ef4444"],
                ] as const
              ).map(([label, value, key, color]) => {
                const pct = totals.total ? Math.round((value / totals.total) * 100) : 0;
                return (
                  <View key={label} style={dashboardStyles.barRow}>
                    <View style={dashboardStyles.barHeader}>
                      <Text style={dashboardStyles.barLabel}>{label}</Text>
                      <Text style={dashboardStyles.barValue}>{value}</Text>
                    </View>
                    <View style={dashboardStyles.barTrack}>
                      <View style={[dashboardStyles.barFill, { width: `${pct}%`, backgroundColor: color }]} />
                    </View>
                  </View>
                );
              })}
            </View>

            {/* Tasks by Priority */}
            <View style={dashboardStyles.statCardFull}>
              <Text style={dashboardStyles.statCardTitle}>Tasks by priority</Text>
              {(
                [
                  ["Easy", totals.priorityCounts.easy, "#22c55e"],
                  ["Medium", totals.priorityCounts.medium, "#38bdf8"],
                  ["High", totals.priorityCounts.high, "#f59e0b"],
                  ["Very High", totals.priorityCounts.very_high, "#f97316"],
                  ["Critical", totals.priorityCounts.critical, "#ef4444"],
                ] as const
              ).map(([label, value, color]) => {
                const pct = totals.total ? Math.round((value / totals.total) * 100) : 0;
                return (
                  <View key={label} style={dashboardStyles.barRow}>
                    <View style={dashboardStyles.barHeader}>
                      <Text style={dashboardStyles.barLabel}>{label}</Text>
                      <Text style={dashboardStyles.barValue}>{value}</Text>
                    </View>
                    <View style={dashboardStyles.barTrack}>
                      <View style={[dashboardStyles.barFill, { width: `${pct}%`, backgroundColor: color }]} />
                    </View>
                  </View>
                );
              })}
            </View>

            {/* Health Section */}
            <View style={dashboardStyles.statCardFull}>
              <View style={dashboardStyles.healthHeaderRow}>
                <Text style={dashboardStyles.statCardTitle}>Health</Text>
                <Text style={dashboardStyles.quickInsights}>quick insights</Text>
              </View>
              
              <View style={dashboardStyles.healthBoxesRow}>
                <View style={dashboardStyles.healthBoxHalf}>
                  <Text style={dashboardStyles.healthLabel}>Open tasks</Text>
                  <Text style={dashboardStyles.healthValue}>{totals.status.in_process + totals.status.failed}</Text>
                  <View style={dashboardStyles.healthBar}>
                    <View style={[dashboardStyles.healthBarFill, { width: `${totals.total ? Math.round(((totals.status.in_process + totals.status.failed) / totals.total) * 100) : 0}%` }]} />
                  </View>
                </View>

                <View style={dashboardStyles.healthBoxHalf}>
                  <Text style={dashboardStyles.healthLabel}>Pending</Text>
                  <Text style={[dashboardStyles.healthValue, { color: "#ef4444" }]}>{totals.status.failed}</Text>
                  <Text style={dashboardStyles.healthSubtext}>Needs attention</Text>
                </View>
              </View>
            </View>
          </View>

          {/* Users Overview */}
          <View style={dashboardStyles.usersCard}>
            <View style={dashboardStyles.usersHeaderRow}>
              <View style={dashboardStyles.usersTitleSection}>
                <Text style={dashboardStyles.usersTitle}>Users Overview</Text>
                <Text style={dashboardStyles.usersSubtitle}>Task totals within current dashboard scope.</Text>
              </View>
              <View style={dashboardStyles.searchSection}>
                <Text style={dashboardStyles.filterLabel}>FILTER USERS</Text>
                <TextInput
                  style={dashboardStyles.searchInput}
                  placeholder="Search user..."
                  placeholderTextColor="rgba(255,255,255,0.4)"
                  value={userSearchQuery}
                  onChangeText={setUserSearchQuery}
                />
              </View>
            </View>

            <View style={dashboardStyles.userCardRow}>
              {userTotals.map((u) => (
                <View key={u.id} style={dashboardStyles.userCard}>
                  <Text style={dashboardStyles.userEmail} numberOfLines={1}>{u.name || u.email}</Text>
                  <View style={dashboardStyles.userStats}>
                    <Text style={dashboardStyles.userStatText}>
                      <Text style={{ color: "#38bdf8" }}>{u.stats.in_process} In process</Text>
                      {"  "}
                      <Text style={{ color: "#22c55e" }}>{u.stats.complete} Complete</Text>
                      {"  "}
                      <Text style={{ color: "#ef4444" }}>{u.stats.failed} Pending</Text>
                    </Text>
                  </View>
                </View>
              ))}
              {userTotals.length === 0 && (
                <Text style={dashboardStyles.emptyText}>No users found matching search.</Text>
              )}
            </View>
          </View>
        </View>
      ) : null}

      {tab === "projects" ? (
        <ScrollView style={projectsStyles.container} showsVerticalScrollIndicator={false}>
          {/* Header Section */}
          <View style={projectsStyles.headerRow}>
            <View style={projectsStyles.titleSection}>
              <Text style={projectsStyles.title}>Projects</Text>
              <Text style={projectsStyles.subtitle}>Manage your company's projects and high-level initiatives.</Text>
            </View>
            <Pressable
              style={({ pressed }) => [
                projectsStyles.newProjectBtn,
                pressed && { opacity: 0.9 },
              ]}
              onPress={() => setCreateProjectModalOpen(true)}
            >
              <Text style={projectsStyles.newProjectIcon}>+</Text>
              <Text style={projectsStyles.newProjectText}>New Project</Text>
            </Pressable>
          </View>

          {/* Search Filter - Full Width */}
          <View style={projectsStyles.searchRow}>
            <View style={projectsStyles.searchBox}>
              <Text style={projectsStyles.searchIcon}>🔍</Text>
              <TextInput
                style={projectsStyles.searchInput}
                placeholder="Filter by name..."
                placeholderTextColor="rgba(255,255,255,0.4)"
                value={projectSearchQuery}
                onChangeText={setProjectSearchQuery}
              />
            </View>
          </View>

          {/* Pagination Info */}
          <View style={projectsStyles.paginationRow}>
            <Text style={projectsStyles.paginationText}>
              Showing 1–{Math.min(1, projects.filter(p => p.name.toLowerCase().includes(projectSearchQuery.toLowerCase())).length)} of {projects.filter(p => p.name.toLowerCase().includes(projectSearchQuery.toLowerCase())).length}
            </Text>
            <View style={projectsStyles.paginationControls}>
              <Pressable style={projectsStyles.pageBtn}>
                <Text style={projectsStyles.pageBtnIcon}>‹</Text>
              </Pressable>
              <Text style={projectsStyles.pageInfo}>Page 1 / 1</Text>
              <Pressable style={projectsStyles.pageBtn}>
                <Text style={projectsStyles.pageBtnIcon}>›</Text>
              </Pressable>
            </View>
          </View>

          {/* Projects Cards Grid */}
          <View style={projectsStyles.cardsContainer}>
            {projects.filter(p => p.name.toLowerCase().includes(projectSearchQuery.toLowerCase())).length === 0 ? (
              <View style={projectsStyles.emptyState}>
                <Text style={projectsStyles.emptyText}>No projects found. Create one to get started.</Text>
              </View>
            ) : (
              projects
                .filter(p => p.name.toLowerCase().includes(projectSearchQuery.toLowerCase()))
                .map((p) => (
                  <View key={p.id} style={projectsStyles.projectCard}>
                    {/* Card Header */}
                    <View style={projectsStyles.cardHeader}>
                      <View style={projectsStyles.cardTitleRow}>
                        <View style={projectsStyles.folderIconBox}>
                          <Text style={projectsStyles.folderIcon}>📂</Text>
                        </View>
                        <Text style={projectsStyles.projectName}>{p.name}</Text>
                      </View>
                      <View style={projectsStyles.cardActions}>
                        <Pressable 
                          style={projectsStyles.iconBtn}
                          onPress={() => {
                            setEditProjectId(p.id);
                            setEditProjectName(p.name);
                            setEditProjectLink(p.linkUrl || "");
                            setEditProjectDescription(p.description || "");
                            setEditProjectModalOpen(true);
                          }}
                        >
                          <Text style={projectsStyles.iconBtnText}>✏️</Text>
                        </Pressable>
                        <Pressable 
                          style={[projectsStyles.iconBtn, projectsStyles.iconBtnDanger]}
                          onPress={() => {
                            Alert.alert(
                              "Delete Project",
                              `Are you sure you want to delete "${p.name}"? This action cannot be undone.`,
                              [
                                { text: "Cancel", style: "cancel" },
                                { 
                                  text: "Delete", 
                                  style: "destructive",
                                  onPress: async () => {
                                    try {
                                      await apiDelete(`/api/projects/${p.id}`);
                                      Alert.alert("Success", "Project deleted successfully.");
                                    } catch (e) {
                                      Alert.alert("Error", "Failed to delete project.");
                                    }
                                  }
                                }
                              ]
                            );
                          }}
                        >
                          <Text style={projectsStyles.iconBtnText}>🗑️</Text>
                        </Pressable>
                      </View>
                    </View>

                    {/* Description */}
                    <Text style={projectsStyles.projectDescription} numberOfLines={2}>
                      {p.description || "No description"}
                    </Text>

                    {/* Attachment Link */}
                    {p.linkUrl ? (
                      <Pressable
                        style={projectsStyles.attachmentLink}
                        onPress={() => {
                          const u = String(p.linkUrl);
                          void Linking.openURL(u.startsWith("http") ? u : `https://${u}`);
                        }}
                      >
                        <Text style={projectsStyles.attachmentIcon}>🔗</Text>
                        <Text style={projectsStyles.attachmentText} numberOfLines={1}>
                          {p.linkUrl.replace(/^https?:\/\//, "").substring(0, 30)}
                        </Text>
                      </Pressable>
                    ) : Number(p.hasFile) ? (
                      <Pressable
                        style={projectsStyles.attachmentLink}
                        onPress={() => void downloadProjectFile(p.id, p.fileName || `${p.name}_file`)}
                      >
                        <Text style={projectsStyles.attachmentIcon}>📎</Text>
                        <Text style={projectsStyles.attachmentText} numberOfLines={1}>
                          {p.fileName || "Download attachment"}
                        </Text>
                      </Pressable>
                    ) : null}

                    {/* Assignees */}
                    <View style={projectsStyles.assigneesRow}>
                      <Text style={projectsStyles.assigneesIcon}>👤</Text>
                      <Text style={projectsStyles.assigneesText}>No assignees yet</Text>
                    </View>

                    {/* Card Footer */}
                    <View style={projectsStyles.cardFooter}>
                      <Text style={projectsStyles.createdDate}>Created {p.createdAt ? new Date(p.createdAt).toLocaleDateString() : new Date().toLocaleDateString()}</Text>
                      <View style={projectsStyles.statusBadge}>
                        <Text style={projectsStyles.statusBadgeText}>ACTIVE</Text>
                      </View>
                    </View>
                  </View>
                ))
            )}
          </View>

          <View style={{ height: 40 }} />
        </ScrollView>
      ) : null}

      {tab === "assign" ? (
        <ScrollView style={assignStyles.container} showsVerticalScrollIndicator={false}>
          {/* Header */}
          <View style={assignStyles.header}>
            <View style={assignStyles.headerIcon}>
              <Text style={assignStyles.headerIconText}>+</Text>
            </View>
            <View style={assignStyles.headerText}>
              <Text style={assignStyles.headerTitle}>Assign a Task</Text>
              <Text style={assignStyles.headerSubtitle}>Create and assign tasks to team members</Text>
            </View>
          </View>

          {/* Task Details Section */}
          <View style={assignStyles.section}>
            <View style={assignStyles.sectionHeader}>
              <Text style={assignStyles.sectionIcon}>📝</Text>
              <Text style={assignStyles.sectionTitle}>Task Details</Text>
            </View>

            <View style={assignStyles.inputGroup}>
              <TextInput
                style={assignStyles.input}
                value={title}
                onChangeText={setTitle}
                placeholderTextColor="rgba(255,255,255,0.4)"
                placeholder="Task title"
              />
            </View>

            <View style={assignStyles.inputGroup}>
              <TextInput
                style={[assignStyles.input, assignStyles.textArea]}
                value={description}
                onChangeText={setDescription}
                multiline
                numberOfLines={4}
                placeholderTextColor="rgba(255,255,255,0.4)"
                placeholder="Task details (optional)"
              />
            </View>
          </View>

          {/* Assignment Section */}
          <View style={assignStyles.section}>
            <View style={assignStyles.sectionHeader}>
              <Text style={assignStyles.sectionIcon}>👥</Text>
              <Text style={assignStyles.sectionTitle}>Assignment</Text>
            </View>

            <View style={assignStyles.rowInputs}>
              <View style={assignStyles.halfInput}>
                <Text style={assignStyles.inputLabel}>Assign to (select multiple)</Text>
                <Pressable
                  style={({ pressed }) => [
                    assignStyles.selectBtn,
                    pressed && { opacity: 0.8 },
                  ]}
                  onPress={() => setAssignToOpen(true)}
                >
                  <Text style={assignStyles.selectText} numberOfLines={1}>
                    {assignSelectedUserIds.length === 0
                      ? "Choose users..."
                      : assignSelectedUserIds.length === 1
                        ? primaryAssignee?.name || primaryAssignee?.email || "1 user"
                        : `${assignSelectedUserIds.length} users selected`}
                  </Text>
                  <Text style={assignStyles.selectChevron}>▼</Text>
                </Pressable>
              </View>

              <View style={assignStyles.halfInput}>
                <Text style={assignStyles.inputLabel}>Projects</Text>
                <Pressable
                  style={({ pressed }) => [
                    assignStyles.selectBtn,
                    pressed && { opacity: 0.8 },
                  ]}
                  onPress={() => setAssignProjectOpen(true)}
                >
                  <Text style={assignStyles.selectText} numberOfLines={1}>
                    {assignProjectId
                      ? projects.find((p) => p.id === assignProjectId)?.name ?? "Project"
                      : "No project"}
                  </Text>
                  <Text style={assignStyles.selectChevron}>▼</Text>
                </Pressable>
              </View>
            </View>

            {assignSelectedUserIds.length === 0 && users.length === 0 && (
              <Text style={assignStyles.helperText}>No users loaded. Check Accounts / API access.</Text>
            )}
          </View>

          {/* Schedule & Priority Section */}
          <View style={assignStyles.section}>
            <View style={assignStyles.sectionHeader}>
              <Text style={assignStyles.sectionIcon}>⏰</Text>
              <Text style={assignStyles.sectionTitle}>Schedule & Priority</Text>
            </View>
            {startDate && dueDate && startDate > dueDate && (
              <Text style={{ color: "#ef4444", fontSize: 12, marginBottom: 8 }}>
                Start date must be before due date
              </Text>
            )}

            <View style={assignStyles.rowInputs}>
              <View style={assignStyles.thirdInput}>
                <Pressable
                  style={({ pressed }) => [
                    assignStyles.dateBtn,
                    pressed && { opacity: 0.8 },
                  ]}
                  onPress={() => setStartPickerOpen(true)}
                >
                  <Text style={assignStyles.dateIcon}>📅</Text>
                  <Text style={assignStyles.dateText} numberOfLines={1}>
                    {startDate ? startDate.toLocaleDateString() : "mm/dd/yyyy"}
                  </Text>
                </Pressable>
              </View>

              <View style={assignStyles.thirdInput}>
                <Pressable
                  style={({ pressed }) => [
                    assignStyles.dateBtn,
                    pressed && { opacity: 0.8 },
                  ]}
                  onPress={() => setDuePickerOpen(true)}
                >
                  <Text style={assignStyles.dateIcon}>⏰</Text>
                  <Text style={assignStyles.dateText} numberOfLines={1}>
                    {dueDate ? dueDate.toLocaleDateString() : "mm/dd/yyyy"}
                  </Text>
                </Pressable>
              </View>

              <View style={assignStyles.thirdInput}>
                <Pressable
                  style={({ pressed }) => [
                    assignStyles.selectBtn,
                    pressed && { opacity: 0.8 },
                  ]}
                  onPress={() => setPriorityOpen(true)}
                >
                  <Text style={assignStyles.selectIcon}>⚡</Text>
                  <Text style={assignStyles.selectText} numberOfLines={1}>
                    {priority.charAt(0).toUpperCase() + priority.slice(1).replace("_", " ")}
                  </Text>
                  <Text style={assignStyles.selectChevron}>▼</Text>
                </Pressable>
              </View>
            </View>
          </View>

          {/* Subtasks / Checklist Section */}
          <View style={assignStyles.section}>
            <View style={assignStyles.sectionHeader}>
              <Text style={assignStyles.sectionIcon}>☑️</Text>
              <Text style={assignStyles.sectionTitle}>Subtasks / Checklist</Text>
            </View>
            <TextInput
              style={[assignStyles.input, assignStyles.textArea]}
              value={checklistRaw}
              onChangeText={setChecklistRaw}
              multiline
              numberOfLines={5}
              placeholderTextColor="rgba(255,255,255,0.4)"
              placeholder="Enter subtasks, one per line: - Prepare report - Submit to manager - Review feedback"
            />
          </View>

          {/* Attachments Section */}
          <View style={assignStyles.section}>
            <View style={assignStyles.sectionHeader}>
              <Text style={assignStyles.sectionIcon}>📎</Text>
              <Text style={assignStyles.sectionTitle}>Attachments</Text>
            </View>

            <View style={assignStyles.attachmentBox}>
              <Text style={assignStyles.attachmentLabel}>Main task attachments</Text>
              <Pressable
                style={({ pressed }) => [
                  assignStyles.filePickerBtn,
                  pressed && { opacity: 0.8 },
                ]}
                onPress={async () => {
                  const res = await DocumentPicker.getDocumentAsync({
                    multiple: true,
                    type: "*/*",
                    copyToCacheDirectory: true,
                  });
                  if (res.canceled) return;
                  const next = res.assets.map((a) => ({
                    name: a.name,
                    uri: a.uri,
                    mimeType: a.mimeType,
                    size: a.size,
                  }));
                  setPickedFiles((prev) => [...prev, ...next].slice(0, 5));
                }}
              >
                <Text style={assignStyles.filePickerText}>Choose Files</Text>
                <Text style={assignStyles.filePickerSubtext}>
                  {pickedFiles.length ? `${pickedFiles.length} file(s) selected` : "No file chosen"}
                </Text>
              </Pressable>
              <Text style={assignStyles.attachmentHint}>Max 5 files for main task</Text>
            </View>

            {pickedFiles.length > 0 && (
              <View style={assignStyles.fileChips}>
                {pickedFiles.map((f, idx) => (
                  <View key={idx} style={assignStyles.fileChip}>
                    <Text style={assignStyles.fileChipText} numberOfLines={1}>
                      📎 {f.name}
                    </Text>
                  </View>
                ))}
              </View>
            )}
          </View>

          {/* Main Action Button */}
          <Pressable
            style={({ pressed }) => [
              assignStyles.mainBtn,
              pressed && { opacity: 0.9 },
              (loading || uploading) && { opacity: 0.5 },
            ]}
            disabled={loading || uploading}
            onPress={async () => {
              if (!title.trim())
                return Alert.alert("Missing title", "Please enter a task title.");
              if (assignSelectedUserIds.length === 0)
                return Alert.alert("Missing user", "Please select at least one user.");

              try {
                setLoading(true);
                setUploading(true);
                const startMs = startDate ? startDate.getTime() : null;
                const dueMs = dueDate ? dueDate.getTime() : null;
                const checklist = checklistRaw
                  .split(/\r?\n/)
                  .map((s) => s.trim())
                  .filter(Boolean)
                  .slice(0, 50)
                  .map((text) => ({ text, done: false }));

                const payload = {
                  title: title.trim(),
                  description: description.trim(),
                  assigned_to: primaryAssignee ? Number(primaryAssignee.id) : 0,
                  priority,
                  progress: Math.max(0, Math.min(100, progress)),
                  start_date: startMs,
                  due_date: dueMs,
                  department,
                  ...(assignProjectId
                    ? { project_id: Number(assignProjectId) }
                    : {}),
                  shared_with: sharedUsers
                    .map((u) => Number(u.id))
                    .filter((n) => Number.isFinite(n) && n > 0),
                  checklist,
                };

                const created = await apiPost<{ id: number }>(
                  "/api/tasks",
                  payload,
                );

                if (pickedFiles.length) {
                  for (const f of pickedFiles.slice(0, 5)) {
                    const fd = new FormData();
                    fd.append("taskId", String(created.id));
                    fd.append("file", {
                      uri: f.uri,
                      name: f.name,
                      type: f.mimeType || "application/octet-stream",
                    } as any);
                    await requestMultipart<{ id: number }>("/api/files", fd);
                  }
                }
                await AsyncStorage.setItem(
                  LAST_ASSIGN_KEY,
                  JSON.stringify({
                    assignSelectedUserIds,
                    projectId:
                      assignProjectId === "" ? "" : Number(assignProjectId),
                    priority,
                    startDate: startDate ? startDate.toISOString() : "",
                    dueDate: dueDate ? dueDate.toISOString() : "",
                    department,
                  }),
                );
                setTitle("");
                setDescription("");
                setStartDate(null);
                setDueDate(null);
                setPriority("medium");
                setDepartment("hyper_access");
                setChecklistRaw("");
                setPickedFiles([]);
                setAssignSelectedUserIds([]);
                setAssignProjectId("");
                Alert.alert("Success", "Task assigned.");
              } catch (e) {
                if (isLikelyOfflineError(e)) {
                  const startMs = startDate ? startDate.getTime() : null;
                  const dueMs = dueDate ? dueDate.getTime() : null;
                  const checklist = checklistRaw
                    .split(/\r?\n/)
                    .map((s) => s.trim())
                    .filter(Boolean)
                    .slice(0, 50)
                    .map((text) => ({ text, done: false }));

                  const payload = {
                    title: title.trim(),
                    description: description.trim(),
                    assigned_to: primaryAssignee ? Number(primaryAssignee.id) : 0,
                    priority,
                    progress: Math.max(0, Math.min(100, progress)),
                    start_date: startMs,
                    due_date: dueMs,
                    department,
                    ...(assignProjectId
                      ? { project_id: Number(assignProjectId) }
                      : {}),
                    shared_with: sharedUsers
                      .map((u) => Number(u.id))
                      .filter((n) => Number.isFinite(n) && n > 0),
                    checklist,
                  };

                  const q = await loadAssignQueue();
                  q.push({
                    id: `${Date.now()}_${Math.random().toString(16).slice(2)}`,
                    createdAt: Date.now(),
                    payload,
                  });
                  await saveAssignQueue(q);

                  // Attachments cannot be queued reliably offline
                  setPickedFiles([]);
                  setTitle("");
                  setDescription("");
                  setStartDate(null);
                  setDueDate(null);
                  setPriority("medium");
                  setDepartment("hyper_access");
                  setChecklistRaw("");

                  Alert.alert(
                    "Offline",
                    "Task queued and will be sent when you're back online. Re-attach files after it syncs.",
                  );
                  return;
                }

                Alert.alert(
                  "Assign failed",
                  e instanceof Error ? e.message : "Unknown error",
                );
              } finally {
                setUploading(false);
                setLoading(false);
              }
            }}
          >
            <Text style={assignStyles.mainBtnIcon}>+</Text>
            <Text style={assignStyles.mainBtnText}>
              {loading || uploading ? "Uploading..." : "Assign Task"}
            </Text>
          </Pressable>

          {/* Secondary Buttons */}
          <View style={assignStyles.secondaryButtons}>
            <Pressable
              style={({ pressed }) => [
                assignStyles.secondaryBtn,
                pressed && { opacity: 0.8 },
              ]}
              onPress={async () => {
                // Save current assignment as template and reset form
                if (primaryAssignee) {
                  await AsyncStorage.setItem(
                    LAST_ASSIGN_KEY,
                    JSON.stringify({
                      assignSelectedUserIds,
                      projectId:
                        assignProjectId === "" ? "" : Number(assignProjectId),
                      priority,
                      startDate: startDate ? startDate.toISOString() : "",
                      dueDate: dueDate ? dueDate.toISOString() : "",
                      department,
                    }),
                  );
                }
                // Reset form
                setTitle("");
                setDescription("");
                setStartDate(null);
                setDueDate(null);
                setPriority("medium");
                setDepartment("hyper_access");
                setChecklistRaw("");
                setPickedFiles([]);
                setAssignSelectedUserIds([]);
                setAssignProjectId("");
                // Reset all fields including assign selection
              }}
            >
              <Text style={assignStyles.secondaryBtnText}>Assign Another</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [
                assignStyles.secondaryBtn,
                pressed && { opacity: 0.8 },
              ]}
              onPress={() => {
                setTitle("");
                setDescription("");
                setAssignSelectedUserIds([]);
                setStartDate(null);
                setDueDate(null);
                setPriority("medium");
                setDepartment("hyper_access");
                setChecklistRaw("");
                setPickedFiles([]);
                setAssignProjectId("");
              }}
            >
              <Text style={assignStyles.secondaryBtnText}>Reset form</Text>
            </Pressable>
          </View>

          {/* Preview Section */}
          <View style={assignStyles.section}>
            <Text style={assignStyles.previewLabel}>Preview (how users will see this task)</Text>
            {(() => {
              const previewSubtasks = checklistRaw
                .split(/\r?\n/)
                .map((s) => s.trim())
                .filter(Boolean)
                .slice(0, 50);
              const hasContent = title.trim() || description.trim() || previewSubtasks.length > 0;
              if (!hasContent) {
                return (
                  <View style={assignStyles.previewEmpty}>
                    <Text style={assignStyles.previewEmptyText}>
                      Fill in the form above to see a preview
                    </Text>
                  </View>
                );
              }
              return (
                <View style={assignStyles.previewCard}>
                  <View style={assignStyles.previewHeader}>
                    <Text style={assignStyles.previewDept}>{department.replace("_", " ")}</Text>
                    <View style={assignStyles.previewBadge}>
                      <Text style={assignStyles.previewBadgeText}>Assigned</Text>
                    </View>
                  </View>
                  <Text style={assignStyles.previewTitle}>{title.trim() || "Untitled Task"}</Text>
                  {description.trim() ? (
                    <Text style={assignStyles.previewDesc} numberOfLines={2}>
                      {description}
                    </Text>
                  ) : null}
                  {dueDate ? (
                    <Text style={assignStyles.previewDue}>
                      📅 Due {dueDate.toLocaleDateString()}
                    </Text>
                  ) : null}
                  <View style={assignStyles.previewProgressTrack}>
                    <View style={[assignStyles.previewProgressFill, { width: "0%" }]} />
                  </View>
                  <Text style={assignStyles.previewProgressText}>Progress 0%</Text>
                  {previewSubtasks.length > 0 && (
                    <View style={assignStyles.previewSubtasks}>
                      <Text style={assignStyles.previewSubtasksTitle}>Subtasks</Text>
                      {previewSubtasks.map((text, idx) => (
                        <View key={idx} style={assignStyles.previewSubtaskItem}>
                          <Text style={assignStyles.previewCheckbox}>☐</Text>
                          <Text style={assignStyles.previewSubtaskText}>{text}</Text>
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              );
            })()}
          </View>

          <View style={{ height: 40 }} />
        </ScrollView>
      ) : null}

      <DarkSelectModal
        visible={tasksPriorityFilterOpen}
        title="Priority"
        options={tasksPriorityFilterOptions}
        selectedValue={tasksPriorityFilter}
        onClose={() => setTasksPriorityFilterOpen(false)}
        onSelect={(v) => {
          setTasksPriorityFilter(v as any);
          setTasksPriorityFilterOpen(false);
        }}
      />

      {tab === "users" ? (
        <ScrollView style={accountsStyles.container} showsVerticalScrollIndicator={false}>
          {/* Header */}
          <View style={accountsStyles.header}>
            <View>
              <Text style={accountsStyles.title}>Accounts</Text>
              <Text style={accountsStyles.subtitle}>Manage user access, approvals, and account status.</Text>
            </View>
          </View>

          {/* Filters Row */}
          <View style={accountsStyles.filtersRow}>
            <Pressable
              style={({ pressed }) => [
                accountsStyles.filterBtn,
                pressed && { opacity: 0.8 },
              ]}
              onPress={() => setAccountsFilterModalOpen(true)}
            >
              <Text style={accountsStyles.filterBtnText}>
                {accountsFilter === "all" ? "All Users" : 
                 accountsFilter === "admin" ? "Admins" :
                 accountsFilter === "manager" ? "Managers" : "Users"}
              </Text>
              <Text style={accountsStyles.filterBtnIcon}>▼</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [
                accountsStyles.filterBtn,
                pressed && { opacity: 0.8 },
              ]}
              onPress={() => setAccountsPresenceModalOpen(true)}
            >
              <Text style={accountsStyles.filterBtnText}>
                {accountsPresenceFilter === "all" ? "All presence" : 
                 accountsPresenceFilter === "online" ? "Online" : "Offline"}
              </Text>
              <Text style={accountsStyles.filterBtnIcon}>▼</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [
                accountsStyles.filterBtn,
                pressed && { opacity: 0.8 },
              ]}
              onPress={() => setAccountsStatusModalOpen(true)}
            >
              <Text style={accountsStyles.filterBtnText}>
                {accountsStatusFilter === "all" ? "All status" : 
                 accountsStatusFilter === "approved" ? "Approved" :
                 accountsStatusFilter === "pending" ? "Pending" :
                 accountsStatusFilter === "rejected" ? "Rejected" : "Deleted"}
              </Text>
              <Text style={accountsStyles.filterBtnIcon}>▼</Text>
            </Pressable>
            <View style={accountsStyles.countBadge}>
              <Text style={accountsStyles.countText}>{
                accounts.filter(u => {
                  if (accountsFilter !== "all" && u.role !== accountsFilter) return false;
                  if (accountsPresenceFilter === "online" && !isUserOnline(u)) return false;
                  if (accountsPresenceFilter === "offline" && isUserOnline(u)) return false;
                  if (accountsStatusFilter !== "all" && u.status !== accountsStatusFilter) return false;
                  return true;
                }).length
              } users</Text>
            </View>
          </View>

          {/* User Cards */}
          <View style={accountsStyles.cardsContainer}>
            {accounts.filter(u => {
              if (accountsFilter !== "all" && u.role !== accountsFilter) return false;
              if (accountsPresenceFilter === "online" && !isUserOnline(u)) return false;
              if (accountsPresenceFilter === "offline" && isUserOnline(u)) return false;
              if (accountsStatusFilter !== "all" && u.status !== accountsStatusFilter) return false;
              return true;
            }).length > 0 ? (
              accounts.filter(u => {
                if (accountsFilter !== "all" && u.role !== accountsFilter) return false;
                if (accountsPresenceFilter === "online" && !isUserOnline(u)) return false;
                if (accountsPresenceFilter === "offline" && isUserOnline(u)) return false;
                if (accountsStatusFilter !== "all" && u.status !== accountsStatusFilter) return false;
                return true;
              }).map((u) => {
                // Determine status badge styles
                const getStatusBadge = () => {
                  if (u.status === "pending") return { style: accountsStyles.pendingBadge, textStyle: accountsStyles.pendingText, text: "PENDING" };
                  if (u.status === "rejected") return { style: accountsStyles.rejectedBadge, textStyle: accountsStyles.rejectedText, text: "REJECTED" };
                  if (u.status === "deleted") return { style: accountsStyles.deletedBadge, textStyle: accountsStyles.deletedText, text: "DELETED" };
                  return { style: accountsStyles.approvedBadge, textStyle: accountsStyles.approvedText, text: "APPROVED" };
                };
                const statusBadge = getStatusBadge();
                const isDeleted = u.status === "deleted";

                return (
                  <View key={u.id} style={[accountsStyles.userCard, isDeleted && accountsStyles.deletedCard]}>
                    <View style={accountsStyles.userCardLeft}>
                      {/* Avatar */}
                      <View style={[accountsStyles.avatarContainer, isDeleted && accountsStyles.deletedAvatar]}>
                        {u.avatarUrl ? (
                          <Image
                            source={{ uri: getFullAvatarUrl(u.avatarUrl) || undefined }}
                            style={[accountsStyles.avatar, isDeleted && { opacity: 0.4 }]}
                          />
                        ) : (
                          <View style={[accountsStyles.avatarPlaceholder, isDeleted && accountsStyles.deletedAvatarPlaceholder]}>
                            <Text style={[accountsStyles.avatarLetter, isDeleted && { opacity: 0.4 }]}>
                              {(u.name || u.email || "?").charAt(0).toUpperCase()}
                            </Text>
                          </View>
                        )}
                      </View>

                      {/* User Info */}
                      <View style={accountsStyles.userInfo}>
                        <View style={accountsStyles.userNameRow}>
                          <Text style={[accountsStyles.userEmail, isDeleted && accountsStyles.cardDeletedText]}>{u.email}</Text>
                          {/* Status Badges */}
                          <View style={accountsStyles.badgesRow}>
                            <View style={[accountsStyles.badge, statusBadge.style]}>
                              <Text style={[accountsStyles.badgeText, statusBadge.textStyle]}>{statusBadge.text}</Text>
                            </View>
                            {u.status !== "deleted" && (
                              isUserOnline(u) ? (
                                <View style={[accountsStyles.badge, accountsStyles.onlineBadge]}>
                                  <Text style={[accountsStyles.badgeText, accountsStyles.onlineText]}>ONLINE</Text>
                                </View>
                              ) : (
                                <View style={[accountsStyles.badge, accountsStyles.offlineBadge]}>
                                  <Text style={[accountsStyles.badgeText, accountsStyles.offlineText]}>OFFLINE</Text>
                                </View>
                              )
                            )}
                            {u.role === "admin" && (
                              <View style={[accountsStyles.badge, accountsStyles.adminBadge]}>
                                <Text style={[accountsStyles.badgeText, accountsStyles.adminText]}>ADMIN</Text>
                              </View>
                            )}
                            {u.role === "manager" && (
                              <View style={[accountsStyles.badge, accountsStyles.managerBadge]}>
                                <Text style={[accountsStyles.badgeText, accountsStyles.managerText]}>MANAGER</Text>
                              </View>
                            )}
                            {u.role === "user" && (
                              <View style={[accountsStyles.badge, accountsStyles.userBadge]}>
                                <Text style={[accountsStyles.badgeText, accountsStyles.userText]}>USER</Text>
                              </View>
                            )}
                          </View>
                        </View>
                        <Text style={[accountsStyles.userMeta, isDeleted && accountsStyles.deletedMeta]}>
                          {u.email} • ID: {u.id}
                        </Text>
                      </View>
                    </View>

                    {/* Actions - Different based on status */}
                    <View style={accountsStyles.actionsRow}>
                      {u.status === "pending" ? (
                        <>
                          {/* Approve Button */}
                          <Pressable
                            style={({ pressed }) => [
                              accountsStyles.actionBtn,
                              accountsStyles.approveBtn,
                              pressed && { opacity: 0.8 },
                            ]}
                            onPress={async () => {
                              try {
                                await apiPatch(`/api/admin/users/${u.id}`, { action: "approve" });
                                Alert.alert("Success", "User approved successfully.");
                              } catch (e) {
                                const msg = e instanceof Error ? e.message : "Unknown error";
                                if (msg === "OFFLINE_QUEUED") {
                                  Alert.alert("Offline", "Approve queued and will sync when you're back online.");
                                } else {
                                  Alert.alert("Approve failed", msg);
                                }
                              }
                            }}
                          >
                            <Text style={accountsStyles.approveBtnText}>✓ Approve</Text>
                          </Pressable>
                          {/* Reject Button */}
                          <Pressable
                            style={({ pressed }) => [
                              accountsStyles.actionBtn,
                              accountsStyles.rejectBtn,
                              pressed && { opacity: 0.8 },
                            ]}
                            onPress={async () => {
                              Alert.alert("Reject User", "Reject this user? They will not be able to log in.", [
                                { text: "Cancel", style: "cancel" },
                                {
                                  text: "Reject",
                                  style: "destructive",
                                  onPress: async () => {
                                    try {
                                      await apiPatch(`/api/admin/users/${u.id}`, { action: "reject" });
                                      Alert.alert("Success", "User rejected.");
                                    } catch (e) {
                                      const msg = e instanceof Error ? e.message : "Unknown error";
                                      if (msg === "OFFLINE_QUEUED") {
                                        Alert.alert("Offline", "Reject queued and will sync when you're back online.");
                                      } else {
                                        Alert.alert("Reject failed", msg);
                                      }
                                    }
                                  },
                                },
                              ]);
                            }}
                          >
                            <Text style={accountsStyles.rejectBtnText}>✕ Reject</Text>
                          </Pressable>
                          <Pressable
                            style={({ pressed }) => [
                              accountsStyles.actionBtn,
                              accountsStyles.viewBtn,
                              pressed && { opacity: 0.8 },
                            ]}
                            onPress={() => setViewUserProfile(u)}
                          >
                            <Text style={accountsStyles.viewBtnText}>View Profile</Text>
                          </Pressable>
                        </>
                      ) : u.status === "deleted" ? (
                        <>
                          {/* Restore Button for deleted users */}
                          <Pressable
                            style={({ pressed }) => [
                              accountsStyles.actionBtn,
                              accountsStyles.restoreBtn,
                              pressed && { opacity: 0.8 },
                            ]}
                            onPress={async () => {
                              Alert.alert("Restore User", "Restore this user account? They will be able to log in again.", [
                                { text: "Cancel", style: "cancel" },
                                {
                                  text: "Restore",
                                  style: "default",
                                  onPress: async () => {
                                    try {
                                      await apiPatch(`/api/admin/users/${u.id}`, { action: "restore" });
                                      Alert.alert("Success", "User account restored.");
                                    } catch (e) {
                                      const msg = e instanceof Error ? e.message : "Unknown error";
                                      if (msg === "OFFLINE_QUEUED") {
                                        Alert.alert("Offline", "Restore queued and will sync when you're back online.");
                                      } else {
                                        Alert.alert("Restore failed", msg);
                                      }
                                    }
                                  },
                                },
                              ]);
                            }}
                          >
                            <Text style={accountsStyles.restoreBtnText}>↻ Restore</Text>
                          </Pressable>
                          <Pressable
                            style={({ pressed }) => [
                              accountsStyles.actionBtn,
                              accountsStyles.viewBtn,
                              pressed && { opacity: 0.8 },
                            ]}
                            onPress={() => setViewUserProfile(u)}
                          >
                            <Text style={accountsStyles.viewBtnText}>View Profile</Text>
                          </Pressable>
                        </>
                      ) : (
                        <>
                          <Pressable
                            style={({ pressed }) => [
                              accountsStyles.actionBtn,
                              accountsStyles.viewBtn,
                              pressed && { opacity: 0.8 },
                            ]}
                            onPress={() => setViewUserProfile(u)}
                          >
                            <Text style={accountsStyles.viewBtnText}>View Profile</Text>
                          </Pressable>
                          <Pressable
                            style={({ pressed }) => [
                              accountsStyles.actionBtn,
                              accountsStyles.deleteBtn,
                              pressed && { opacity: 0.8 },
                            ]}
                            onPress={async () => {
                              Alert.alert("Delete User", "Soft-delete this user? You can restore them later.", [
                                { text: "Cancel", style: "cancel" },
                                {
                                  text: "Delete",
                                  style: "destructive",
                                  onPress: async () => {
                                    try {
                                      await apiDelete(`/api/admin/users/${u.id}`);
                                      Alert.alert("Success", "User removed.");
                                    } catch (e) {
                                      const msg = e instanceof Error ? e.message : "Unknown error";
                                      if (msg === "OFFLINE_QUEUED") {
                                        Alert.alert("Offline", "Delete queued and will sync when you're back online.");
                                      } else {
                                        Alert.alert("Delete failed", msg);
                                      }
                                    }
                                  },
                                },
                              ]);
                            }}
                          >
                            <Text style={accountsStyles.deleteBtnText}>Delete</Text>
                          </Pressable>
                        </>
                      )}
                    </View>
                  </View>
                );
              })
            ) : (
              <View style={accountsStyles.emptyState}>
                <Text style={accountsStyles.emptyText}>No users found.</Text>
                <Text style={accountsStyles.emptySubtext}>
                  {accounts.length === 0 ? "Loading users..." : "Try adjusting your filters."}
                </Text>
              </View>
            )}
          </View>
        </ScrollView>
      ) : null}

      {/* User Profile Modal */}
      {viewUserProfile && (
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 12,
              }}
            >
              <Text style={{ color: "white", fontSize: 16, fontWeight: "800" }}>
                User Profile
              </Text>
              <Pressable
                style={({ pressed }) => [
                  styles.pill,
                  pressed && { opacity: 0.9 },
                ]}
                onPress={() => setViewUserProfile(null)}
              >
                <Text style={styles.pillText}>Close</Text>
              </Pressable>
            </View>

            {/* Profile Picture */}
            <View style={{ alignItems: "center", marginBottom: 16 }}>
              {viewUserProfile.avatarUrl ? (
                <Image
                  source={{
                    uri:
                      getFullAvatarUrl(viewUserProfile.avatarUrl) || undefined,
                  }}
                  style={{
                    width: 80,
                    height: 80,
                    borderRadius: 40,
                    borderWidth: 2,
                    borderColor: "rgba(255,255,255,0.2)",
                  }}
                />
              ) : (
                <View
                  style={{
                    width: 80,
                    height: 80,
                    borderRadius: 40,
                    backgroundColor: "rgba(255,255,255,0.1)",
                    alignItems: "center",
                    justifyContent: "center",
                    borderWidth: 2,
                    borderColor: "rgba(255,255,255,0.2)",
                  }}
                >
                  <Text style={{ fontSize: 32 }}>👤</Text>
                </View>
              )}
            </View>

            <View style={{ gap: 10 }}>
              <View>
                <Text style={{ color: "rgba(255,255,255,0.6)", fontSize: 12 }}>
                  Email
                </Text>
                <Text style={{ color: "white", fontWeight: "700" }}>
                  {viewUserProfile.email}
                </Text>
              </View>
              <View>
                <Text style={{ color: "rgba(255,255,255,0.6)", fontSize: 12 }}>
                  Role
                </Text>
                <Text style={{ color: "white", fontWeight: "700" }}>
                  {viewUserProfile.role || "—"}
                </Text>
              </View>
              <View>
                <Text style={{ color: "rgba(255,255,255,0.6)", fontSize: 12 }}>
                  Department
                </Text>
                <Text style={{ color: "white", fontWeight: "700" }}>
                  {viewUserProfile.department || "—"}
                </Text>
              </View>
              <View>
                <Text style={{ color: "rgba(255,255,255,0.6)", fontSize: 12 }}>
                  Name
                </Text>
                <Text style={{ color: "white", fontWeight: "700" }}>
                  {viewUserProfile.name || "—"}
                </Text>
              </View>
              <View>
                <Text style={{ color: "rgba(255,255,255,0.6)", fontSize: 12 }}>
                  Age
                </Text>
                <Text style={{ color: "white", fontWeight: "700" }}>
                  {viewUserProfile.age || "—"}
                </Text>
              </View>
              <View>
                <Text style={{ color: "rgba(255,255,255,0.6)", fontSize: 12 }}>
                  Bio
                </Text>
                <Text style={{ color: "white", fontWeight: "700" }}>
                  {viewUserProfile.bio || "—"}
                </Text>
              </View>
              <View>
                <Text style={{ color: "rgba(255,255,255,0.6)", fontSize: 12 }}>
                  User ID
                </Text>
                <Text style={{ color: "white", fontWeight: "700" }}>
                  {viewUserProfile.id}
                </Text>
              </View>
            </View>
          </View>
        </View>
      )}

      {tab === "bulletin" ? <BulletinBoardScreen isAdmin={true} /> : null}

      {tab === "confessions" ? (
        <ConfessionChatScreen isAdmin={true} userId={me?.id} />
      ) : null}

      {tab === "settings" ? (
        <View style={[styles.card, { marginTop: 12 }]}>
          <Text style={styles.cardTitle}>Settings</Text>
          <Text style={{ color: "rgba(255,255,255,0.7)" }}>
            More admin tools can be added here.
          </Text>
        </View>
      ) : null}

      {/* Work Overview - Full Web-Style Mobile View */}
      {["all_open", "recently_created", "latest_activity", "overdue", "shared_with_users", "shared_with_me"].includes(tab) ? (
        <View style={workOverviewStyles.container}>
          {/* Header with Breadcrumb */}
          <View style={workOverviewStyles.headerRow}>
            <View>
              <View style={workOverviewStyles.breadcrumb}>
                <Text style={workOverviewStyles.breadcrumbMain}>Work Overview</Text>
                <Text style={workOverviewStyles.breadcrumbDivider}>›</Text>
                <Text style={workOverviewStyles.breadcrumbSub}>
                  {tab === "all_open" ? "All Open" :
                   tab === "recently_created" ? "Recently Created" :
                   tab === "latest_activity" ? "Latest Activity" :
                   tab === "overdue" ? "Overdue" :
                   tab === "shared_with_users" ? "Shared with Users" : "Shared with Me"}
                </Text>
              </View>
            </View>
          </View>

          {/* Top Actions - Baseline and Filter */}
          <View style={workOverviewStyles.topActionsRow}>
            <Pressable style={workOverviewStyles.baselineBtn} onPress={() => setBaselineModalOpen(true)}>
              <Text style={workOverviewStyles.baselineIcon}>⏱️</Text>
              <Text style={workOverviewStyles.baselineText}>Baseline: None</Text>
              <Text style={workOverviewStyles.baselineIcon}>▼</Text>
            </Pressable>
            <Pressable style={workOverviewStyles.filterActionBtn} onPress={() => setWorkOverviewAdvancedFilterOpen(true)}>
              <Text style={workOverviewStyles.filterActionIcon}>🔽</Text>
              <Text style={workOverviewStyles.filterActionText}>Filter</Text>
            </Pressable>
          </View>

          {/* Search Row - Full Width */}
          <View style={workOverviewStyles.searchRow}>
            <View style={workOverviewStyles.searchBoxFull}>
              <TextInput
                style={workOverviewStyles.searchInputFull}
                placeholder="Filter by text"
                placeholderTextColor="rgba(255,255,255,0.4)"
                value={workOverviewSearch}
                onChangeText={setWorkOverviewSearch}
              />
              <Text style={workOverviewStyles.searchIconRight}>🔍</Text>
            </View>
          </View>

          {/* Filter Row - Project and Status */}
          <View style={workOverviewStyles.filterRow}>
            <Pressable
              style={({ pressed }) => [
                workOverviewStyles.filterBtn,
                workOverviewStyles.filterBtnFlex,
                pressed && { opacity: 0.8 },
              ]}
              onPress={() => setWorkOverviewProjectModalOpen(true)}
            >
              <Text style={workOverviewStyles.filterBtnLabel}>Project Filter:</Text>
              <Text style={workOverviewStyles.filterBtnValue} numberOfLines={1}>
                {workOverviewProjectFilter === "all" ? "All projects" : projects.find(p => p.id === workOverviewProjectFilter)?.name || "Project"}
              </Text>
              <Text style={workOverviewStyles.filterBtnIcon}>▼</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [
                workOverviewStyles.filterBtn,
                workOverviewStyles.filterBtnFlex,
                pressed && { opacity: 0.8 },
              ]}
              onPress={() => setWorkOverviewStatusModalOpen(true)}
            >
              <Text style={workOverviewStyles.filterBtnLabel}>Status:</Text>
              <Text style={workOverviewStyles.filterBtnValue} numberOfLines={1}>
                {workOverviewStatusFilter === "all" ? "All" : workOverviewStatusFilter}
              </Text>
              <Text style={workOverviewStyles.filterBtnIcon}>▼</Text>
            </Pressable>
          </View>

          {/* Table Header - All Columns */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={workOverviewStyles.tableContainer}>
              <View style={workOverviewStyles.tableHeader}>
                <Text style={[workOverviewStyles.tableHeaderCell, { width: 50 }]}>ID</Text>
                <Text style={[workOverviewStyles.tableHeaderCell, { width: 120 }]}>SUBJECT</Text>
                <Text style={[workOverviewStyles.tableHeaderCell, { width: 100 }]}>PROJECT</Text>
                <Text style={[workOverviewStyles.tableHeaderCell, { width: 90 }]}>STATUS</Text>
                <Text style={[workOverviewStyles.tableHeaderCell, { width: 100 }]}>ASSIGNEE</Text>
                <Text style={[workOverviewStyles.tableHeaderCell, { width: 100 }]}>ACCOUNTABLE</Text>
                <Text style={[workOverviewStyles.tableHeaderCell, { width: 80 }]}>PRIORITY</Text>
                <Text style={[workOverviewStyles.tableHeaderCell, { width: 90 }]}>START DATE</Text>
                <Text style={[workOverviewStyles.tableHeaderCell, { width: 90 }]}>FINISH DATE</Text>
              </View>

              {/* Tasks Table Body */}
              <ScrollView style={workOverviewStyles.tableBody} showsVerticalScrollIndicator={false}>
            {(() => {
              // Filter tasks based on selected tab and filters
              let filteredTasks = tasks;
              const now = Date.now();

              // Apply tab filter
              switch (tab) {
                case "all_open":
                  filteredTasks = tasks.filter(t => t.status !== "complete");
                  break;
                case "recently_created":
                  filteredTasks = tasks.slice().sort((a, b) => b.createdAt - a.createdAt).slice(0, 20);
                  break;
                case "latest_activity":
                  filteredTasks = tasks.slice().sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 20);
                  break;
                case "overdue":
                  filteredTasks = tasks.filter(t => t.dueDate && t.dueDate < now && t.status !== "complete");
                  break;
                case "shared_with_users":
                  filteredTasks = tasks.filter(t => assignSelectedUserIds.some(id => String(t.assignedTo) === String(id)));
                  break;
                case "shared_with_me":
                  filteredTasks = tasks.filter(t => String(t.assignedTo) === String(me?.id));
                  break;
              }

              // Apply search filter
              if (workOverviewSearch.trim()) {
                const searchLower = workOverviewSearch.toLowerCase();
                filteredTasks = filteredTasks.filter(t =>
                  t.title?.toLowerCase().includes(searchLower) ||
                  t.description?.toLowerCase().includes(searchLower)
                );
              }

              // Apply project filter
              if (workOverviewProjectFilter !== "all") {
                filteredTasks = filteredTasks.filter(t =>
                  String(t.projectName) === String(workOverviewProjectFilter) ||
                  String(t.department) === String(workOverviewProjectFilter)
                );
              }

              // Apply status filter
              if (workOverviewStatusFilter !== "all") {
                filteredTasks = filteredTasks.filter(t => t.status === workOverviewStatusFilter);
              }

              if (filteredTasks.length === 0) {
                return (
                  <View style={workOverviewStyles.emptyRow}>
                    <Text style={workOverviewStyles.emptyText}>No tasks found matching filters.</Text>
                  </View>
                );
              }

              return filteredTasks.map((t, index) => {
                const isComplete = t.status === "complete";
                const isApproved = Boolean(t.adminApproved);
                const accentColor = (PRIORITY_COLORS as any)[t.priority] ?? "#1a73e8";

                let statusLabel = (STATUS_LABELS as any)[t.status] ?? t.status;
                let statusColor = (STATUS_COLORS as any)[t.status] ?? "#5f6368";

                if (isComplete && !isApproved) {
                  statusLabel = "Pending Review";
                  statusColor = "#e37400";
                } else if (isComplete && isApproved) {
                  statusLabel = "Approved";
                  statusColor = "#188038";
                }

                const assignee = users.find(u => String(u.id) === String(t.assignedTo));
                const assigneeName = assignee?.email?.split("@")[0] || assignee?.name || "Unassigned";

                const projectName = t.projectName || projects.find(p => String(p.id) === String(t.department))?.name || "—";
                const startDate = t.startDate ? new Date(t.startDate).toLocaleDateString() : "—";
                const finishDate = t.dueDate ? new Date(t.dueDate).toLocaleDateString() : "—";

                return (
                  <Pressable
                    key={t.id}
                    style={({ pressed }) => [
                      workOverviewStyles.tableRow,
                      index % 2 === 0 ? workOverviewStyles.tableRowEven : null,
                      pressed && { backgroundColor: "rgba(255,255,255,0.05)" },
                    ]}
                    onPress={() => {
                      setSelectedTask(t);
                      setTaskDetailOpen(true);
                    }}
                  >
                    <View style={[workOverviewStyles.tableCell, { width: 50 }]}>
                      <View style={[workOverviewStyles.idBadge, { backgroundColor: accentColor }]}>
                        <Text style={workOverviewStyles.idText}>{t.id.slice(0, 4)}</Text>
                      </View>
                    </View>
                    <View style={[workOverviewStyles.tableCell, { width: 120 }]}>
                      <Text style={workOverviewStyles.subjectText} numberOfLines={1}>
                        {t.title || "Untitled"}
                      </Text>
                    </View>
                    <View style={[workOverviewStyles.tableCell, { width: 100 }]}>
                      <Text style={workOverviewStyles.projectText} numberOfLines={1}>
                        {projectName}
                      </Text>
                    </View>
                    <View style={[workOverviewStyles.tableCell, { width: 90 }]}>
                      <View style={[workOverviewStyles.statusBadge, { backgroundColor: `${statusColor}20` }]}>
                        <Text style={[workOverviewStyles.statusText, { color: statusColor }]}>
                          {statusLabel}
                        </Text>
                      </View>
                    </View>
                    <View style={[workOverviewStyles.tableCell, { width: 100 }]}>
                      <Text style={workOverviewStyles.assigneeText} numberOfLines={1}>
                        {assigneeName}
                      </Text>
                    </View>
                    <View style={[workOverviewStyles.tableCell, { width: 100 }]}>
                      <Text style={workOverviewStyles.assigneeText} numberOfLines={1}>
                        {assigneeName}
                      </Text>
                    </View>
                    <View style={[workOverviewStyles.tableCell, { width: 80 }]}>
                      <Text style={[workOverviewStyles.priorityText, { color: accentColor }]} numberOfLines={1}>
                        {t.priority}
                      </Text>
                    </View>
                    <View style={[workOverviewStyles.tableCell, { width: 90 }]}>
                      <Text style={workOverviewStyles.dateText} numberOfLines={1}>
                        {startDate}
                      </Text>
                    </View>
                    <View style={[workOverviewStyles.tableCell, { width: 90 }]}>
                      <Text style={workOverviewStyles.dateText} numberOfLines={1}>
                        {finishDate}
                      </Text>
                    </View>
                  </Pressable>
                );
              });
            })()}
              </ScrollView>
            </View>
          </ScrollView>

          {/* Pagination Footer */}
          <View style={workOverviewStyles.paginationRow}>
            <Text style={workOverviewStyles.paginationText}>
              Showing 1 to {Math.min(20, tasks.length)} of {tasks.length} items
            </Text>
            <View style={workOverviewStyles.paginationControls}>
              <Text style={[workOverviewStyles.paginationBtn, { opacity: 0.5 }]}>Previous</Text>
              <View style={workOverviewStyles.pageNumber}>
                <Text style={workOverviewStyles.pageNumberText}>1</Text>
              </View>
              <Text style={workOverviewStyles.paginationBtn}>Next</Text>
            </View>
          </View>

        </View>
      ) : null}

      {tab === "users_tasks" ? (
        <View style={usersTasksStyles.container}>
          {/* Header */}
          <View style={usersTasksStyles.header}>
            <Text style={usersTasksStyles.title}>Users Tasks</Text>
            <Text style={usersTasksStyles.subtitle}>Every assignee's workload: status, progress, files, and timer reports.</Text>
          </View>

          {/* Filters Row */}
          <View style={usersTasksStyles.filterRow}>
            <View style={usersTasksStyles.searchBox}>
              <Text style={usersTasksStyles.searchIcon}>🔍</Text>
              <TextInput
                style={usersTasksStyles.searchInput}
                placeholder="Filter by task, project, assignee..."
                placeholderTextColor="rgba(255,255,255,0.4)"
                value={usersTasksSearch}
                onChangeText={setUsersTasksSearch}
              />
            </View>
          </View>

          {/* Filter Dropdowns Row */}
          <View style={usersTasksStyles.dropdownsRow}>
            <Pressable
              style={({ pressed }) => [
                usersTasksStyles.filterBtn,
                pressed && { opacity: 0.8 },
              ]}
              onPress={() => setUsersTasksStatusModalOpen(true)}
            >
              <View style={usersTasksStyles.filterBtnContent}>
                <Text style={usersTasksStyles.filterBtnLabel}>STATUS</Text>
                <Text style={usersTasksStyles.filterBtnValue}>
                  {usersTasksStatusFilter === "all" ? "All statuses" : usersTasksStatusFilter.replace("_", " ")}
                </Text>
              </View>
              <Text style={usersTasksStyles.filterBtnIcon}>▼</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [
                usersTasksStyles.filterBtn,
                pressed && { opacity: 0.8 },
              ]}
              onPress={() => setUsersTasksAssigneeModalOpen(true)}
            >
              <View style={usersTasksStyles.filterBtnContent}>
                <Text style={usersTasksStyles.filterBtnLabel}>ASSIGNEE</Text>
                <Text style={usersTasksStyles.filterBtnValue}>
                  {usersTasksAssigneeFilter === "all" ? "All users" : users.find(u => u.id === usersTasksAssigneeFilter)?.name || "User"}
                </Text>
              </View>
              <Text style={usersTasksStyles.filterBtnIcon}>▼</Text>
            </Pressable>
          </View>

          {/* Results Count */}
          <Text style={usersTasksStyles.resultsText}>Showing 0 of 0 tasks</Text>

          {/* Empty State */}
          <View style={usersTasksStyles.emptyState}>
            <Text style={usersTasksStyles.emptyText}>No tasks match your filters.</Text>
          </View>
        </View>
      ) : null}

      {tab === "meetings" ? (
        <View style={[styles.card, { marginTop: 12 }]}>
          <Text style={styles.cardTitle}>Meetings</Text>
          <Text style={{ color: "rgba(255,255,255,0.7)", marginTop: 8 }}>
            Meetings view coming soon.
          </Text>
        </View>
      ) : null}

      {["community", "community_polls"].includes(tab) ? (
        <View style={[styles.card, { marginTop: 12 }]}>
          <Text style={styles.cardTitle}>
            {tab === "community" ? "Community" : "Polls & Feedback"}
          </Text>
          <Text style={{ color: "rgba(255,255,255,0.7)", marginTop: 8 }}>
            Community feature coming soon.
          </Text>
        </View>
      ) : null}

      {tab === "profile" ? (
        <View style={[styles.card, { marginTop: 12 }]}>
          <Text style={styles.cardTitle}>Profile</Text>
          <Text style={{ color: "rgba(255,255,255,0.7)", marginTop: 8 }}>
            {me?.email ?? "User profile"}
          </Text>
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0b0b10" },
  containerContent: {
    paddingTop: 56,
    paddingHorizontal: 16,
    paddingBottom: 28,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 14,
  },
  headerActions: { flexDirection: "row", alignItems: "center", gap: 10 },
  headerLeft: { flexDirection: "row", alignItems: "center", gap: 12, flex: 1 },
  brand: { flexDirection: "row", alignItems: "center", gap: 10, flex: 1, marginRight: 8 },
  logo: { width: 32, height: 32, borderRadius: 6 },
  brandTitle: { color: "white", fontSize: 15, fontWeight: "700", letterSpacing: 0.3, flexShrink: 1 },
  menu: {
    width: 42,
    height: 42,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
  },
  title: { color: "white", fontSize: 22, fontWeight: "800" },
  subtitle: { marginTop: 4, color: "rgba(255,255,255,0.65)" },
  logout: {
    paddingHorizontal: 12,
    height: 42,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
  },
  card: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.06)",
    padding: 14,
  },
  cardTitle: {
    color: "white",
    fontSize: 16,
    fontWeight: "800",
    marginBottom: 10,
  },
  projectRow: {
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.08)",
    gap: 6,
  },
  projectRowTitle: {
    color: "white",
    fontWeight: "800",
    fontSize: 15,
  },
  projectLink: {
    color: "#60a5fa",
    fontWeight: "700",
    fontSize: 13,
    textDecorationLine: "underline",
  },
  analyticsMetricsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  metricCard: {
    flexGrow: 1,
    minWidth: 110,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.06)",
    padding: 12,
  },
  metricLabel: {
    color: "rgba(255,255,255,0.6)",
    fontSize: 12,
    fontWeight: "700",
  },
  metricValue: {
    marginTop: 6,
    color: "white",
    fontSize: 20,
    fontWeight: "900",
  },
  analyticsSectionTitle: {
    color: "rgba(255,255,255,0.70)",
    fontSize: 12,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  distCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.05)",
    padding: 12,
    marginBottom: 10,
  },
  distHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  distLabel: { color: "rgba(255,255,255,0.85)", fontWeight: "800" },
  distValue: {
    color: "rgba(255,255,255,0.55)",
    fontSize: 12,
    fontWeight: "700",
  },
  meterTrack: {
    height: 8,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.10)",
    overflow: "hidden",
    marginTop: 10,
  },
  meterFill: {
    height: 8,
    borderRadius: 999,
  },
  sectionTitle: { color: "white", fontSize: 14, fontWeight: "800" },
  statsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  statBox: {
    flexGrow: 1,
    minWidth: 140,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    backgroundColor: "rgba(255,255,255,0.05)",
    padding: 12,
  },
  statLabel: {
    color: "rgba(255,255,255,0.65)",
    fontSize: 12,
    fontWeight: "700",
  },
  statValue: { marginTop: 6, color: "white", fontSize: 18, fontWeight: "900" },
  rowBetween: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  rowLabel: { color: "rgba(255,255,255,0.8)", fontWeight: "700" },
  rowValue: { color: "rgba(255,255,255,0.7)", fontWeight: "700" },
  label: { marginTop: 10, color: "rgba(255,255,255,0.85)", fontWeight: "600" },
  helper: { marginTop: 8, color: "rgba(255,255,255,0.7)" },
  input: {
    marginTop: 8,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.08)",
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: "white",
  },
  button: {
    marginTop: 14,
    borderRadius: 14,
    backgroundColor: "white",
    paddingVertical: 12,
    alignItems: "center",
  },
  buttonText: { color: "black", fontWeight: "700" },
  selectBtn: {
    marginTop: 8,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.08)",
    paddingHorizontal: 12,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  selectBtnText: { flex: 1, color: "white", fontWeight: "700" },
  selectBtnChevron: { color: "rgba(255,255,255,0.8)", fontWeight: "900" },
  taskTitleRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 8,
  },
  badge: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.08)",
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  badgeText: {
    color: "rgba(255,255,255,0.85)",
    fontSize: 12,
    fontWeight: "700",
  },
  progressTrack: {
    marginTop: 10,
    height: 10,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.08)",
    overflow: "hidden",
  },
  progressFill: { height: 10, borderRadius: 999 },
  progressControls: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 10,
  },
  progressBtn: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.05)",
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  progressBtnActive: {
    backgroundColor: "white",
  },
  progressBtnText: {
    color: "rgba(255,255,255,0.85)",
    fontWeight: "700",
    fontSize: 12,
  },
  progressBtnTextActive: { color: "black" },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  modalCard: {
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(20,20,26,0.96)",
    borderRadius: 16,
    padding: 12,
    overflow: "hidden",
  },
  pill: {
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.06)",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
  },
  pillText: {
    color: "rgba(255,255,255,0.92)",
    fontSize: 12,
    fontWeight: "700",
  },
  accountRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    backgroundColor: "rgba(255,255,255,0.05)",
    padding: 12,
    marginBottom: 10,
    gap: 10,
  },
  accountEmail: { color: "white", fontWeight: "800" },
  accountUid: { marginTop: 4, color: "rgba(255,255,255,0.55)", fontSize: 12 },
  taskRow: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    backgroundColor: "rgba(255,255,255,0.06)",
    padding: 12,
    marginBottom: 10,
  },
  taskCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    backgroundColor: "rgba(255,255,255,0.06)",
    padding: 12,
    marginBottom: 12,
    borderLeftWidth: 4,
  },
  accountAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  accountAvatarPlaceholder: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    backgroundColor: "rgba(255,255,255,0.05)",
    alignItems: "center",
    justifyContent: "center",
  },
  taskHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  taskDepartment: {
    color: "rgba(255,255,255,0.6)",
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  statusBadge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  statusText: {
    fontSize: 11,
    fontWeight: "700",
  },
  taskCardTitle: {
    color: "white",
    fontSize: 17,
    fontWeight: "700",
    marginBottom: 4,
  },
  taskCardDesc: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 13,
    marginBottom: 10,
  },
  dueRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
    gap: 6,
  },
  dueIcon: {
    fontSize: 14,
  },
  dueText: {
    color: "rgba(255,255,255,0.6)",
    fontSize: 13,
  },
  lateText: {
    color: "#ef4444",
    fontSize: 12,
  },
  progressRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 4,
  },
  progressLabel: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 11,
  },
  progressValue: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 11,
  },
  subtasksBox: {
    marginTop: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(255,255,255,0.03)",
    padding: 10,
  },
  subtasksHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  subtasksTitle: {
    color: "rgba(255,255,255,0.6)",
    fontSize: 12,
    fontWeight: "700",
  },
  subtasksCount: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 11,
  },
  subtaskItem: {
    marginBottom: 8,
  },
  subtaskRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },
  checkbox: {
    color: "rgba(255,255,255,0.8)",
    fontSize: 16,
    lineHeight: 20,
  },
  subtaskText: {
    color: "rgba(255,255,255,0.8)",
    fontSize: 13,
    flex: 1,
    lineHeight: 18,
  },
  subtaskAttachments: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 6,
    marginLeft: 24,
  },
  attachmentsSection: {
    marginTop: 12,
  },
  attachmentsTitle: {
    color: "rgba(255,255,255,0.6)",
    fontSize: 12,
    fontWeight: "700",
    marginBottom: 8,
  },
  attachmentsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  attachmentChip: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    backgroundColor: "rgba(255,255,255,0.08)",
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  attachmentChipText: {
    color: "rgba(255,255,255,0.8)",
    fontSize: 11,
    maxWidth: 200,
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 12,
    gap: 10,
  },
  statusLabel: {
    color: "rgba(255,255,255,0.6)",
    fontSize: 12,
  },
  statusButtons: {
    flexDirection: "row",
    gap: 8,
  },
  statusBtn: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
    backgroundColor: "rgba(255,255,255,0.05)",
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  statusBtnActive: {
    backgroundColor: "rgba(255,255,255,0.20)",
    borderColor: "rgba(255,255,255,0.30)",
  },
  statusBtnText: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 11,
    fontWeight: "600",
  },
  statusBtnTextActive: {
    color: "white",
    fontWeight: "700",
  },
  adminActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.08)",
  },
  actionBtn: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
    backgroundColor: "rgba(255,255,255,0.08)",
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  actionBtnText: {
    color: "rgba(255,255,255,0.9)",
    fontSize: 12,
    fontWeight: "700",
  },
  deleteBtn: {
    borderColor: "rgba(239,68,68,0.30)",
    backgroundColor: "rgba(239,68,68,0.10)",
  },
  deleteBtnText: {
    color: "#ef4444",
    fontSize: 12,
    fontWeight: "700",
  },
  // Assigned user styles
  assignedRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
    gap: 6,
  },
  assignedIcon: {
    fontSize: 14,
  },
  assignedText: {
    color: "rgba(255,255,255,0.6)",
    fontSize: 13,
  },
  assignedEmail: {
    color: "rgba(255,255,255,0.85)",
    fontWeight: "700",
  },
  // Subtask attachments with labels
  subtaskAttachmentsContainer: {
    marginLeft: 24,
    marginTop: 8,
  },
  subtaskAttachmentsLabel: {
    fontSize: 10,
    color: "rgba(255,255,255,0.4)",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  noAttachmentsText: {
    fontSize: 10,
    color: "rgba(255,255,255,0.3)",
    fontStyle: "italic",
    marginLeft: 24,
    marginTop: 4,
  },
  // Main task attachments box
  mainAttachmentsBox: {
    marginTop: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(255,255,255,0.03)",
    padding: 10,
  },
  mainAttachmentsTitle: {
    fontSize: 11,
    color: "rgba(255,255,255,0.6)",
    fontWeight: "700",
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  // User attachment styles (green/emerald theme)
  userAttachmentChip: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(16,185,129,0.30)",
    backgroundColor: "rgba(16,185,129,0.10)",
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  userAttachmentChipText: {
    color: "rgba(110,231,183,0.9)",
    fontSize: 11,
    maxWidth: 200,
  },
  // User subtask attachments per subtask
  userSubtaskAttachmentsContainer: {
    marginLeft: 24,
    marginTop: 8,
  },
  userSubtaskAttachmentsLabel: {
    fontSize: 10,
    color: "rgba(110,231,183,0.7)",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  userSubtaskAttachments: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  // User subtask attachments (all section)
  userSubtaskAttachmentsBoxAll: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(16,185,129,0.20)",
    backgroundColor: "rgba(16,185,129,0.05)",
    padding: 10,
  },
  userSubtaskAttachmentsTitleAll: {
    fontSize: 11,
    color: "rgba(110,231,183,0.8)",
    fontWeight: "700",
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  // Admin subtask attachments (all section)
  adminSubtaskAttachmentsBox: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(255,255,255,0.03)",
    padding: 10,
  },
  adminSubtaskAttachmentsTitle: {
    fontSize: 11,
    color: "rgba(255,255,255,0.6)",
    fontWeight: "700",
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  // User main task attachments
  userMainAttachmentsBox: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(16,185,129,0.20)",
    backgroundColor: "rgba(16,185,129,0.05)",
    padding: 10,
  },
  userMainAttachmentsTitle: {
    fontSize: 11,
    color: "rgba(110,231,183,0.8)",
    fontWeight: "700",
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  // Assign task form - file chips for main task attachments
  fileChipsContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 10,
  },
  fileChip: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    backgroundColor: "rgba(255,255,255,0.08)",
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  fileChipText: {
    color: "rgba(255,255,255,0.8)",
    fontSize: 11,
  },
  // Subtask attachments in assign form
  subtaskAttachmentsBox: {
    marginTop: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(255,255,255,0.03)",
    padding: 12,
    gap: 12,
  },
  subtaskAttachmentItem: {
    gap: 8,
  },
  subtaskAttachmentLabel: {
    color: "rgba(255,255,255,0.6)",
    fontSize: 12,
  },
  subtaskSelectBtn: {
    marginTop: 0,
  },
  // Preview card styles
  previewEmptyBox: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(255,255,255,0.03)",
    padding: 20,
    alignItems: "center",
  },
  previewEmptyText: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 13,
  },
  previewCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    backgroundColor: "rgba(255,255,255,0.05)",
    overflow: "hidden",
    flexDirection: "row",
  },
  previewLeftBorder: {
    width: 4,
    backgroundColor: "#3b82f6",
  },
  previewContent: {
    flex: 1,
    padding: 14,
    paddingLeft: 12,
  },
  previewHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  previewDepartment: {
    color: "rgba(255,255,255,0.6)",
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  previewStatusBadge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: "rgba(59,130,246,0.12)",
  },
  previewStatusText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#60a5fa",
  },
  previewTitle: {
    color: "white",
    fontSize: 17,
    fontWeight: "700",
    marginBottom: 4,
  },
  previewDescription: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 13,
    marginBottom: 10,
  },
  previewDueRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
    gap: 6,
  },
  previewDueIcon: {
    fontSize: 14,
  },
  previewDueText: {
    color: "rgba(255,255,255,0.6)",
    fontSize: 13,
  },
  previewProgressTrack: {
    height: 6,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.08)",
    overflow: "hidden",
  },
  previewProgressFill: {
    height: 6,
    borderRadius: 999,
    backgroundColor: "#3b82f6",
  },
  previewProgressRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 4,
  },
  previewProgressLabel: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 11,
  },
  previewProgressValue: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 11,
  },
  previewSubtasksBox: {
    marginTop: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(255,255,255,0.03)",
    padding: 10,
  },
  previewSubtasksHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  previewSubtasksTitle: {
    color: "rgba(255,255,255,0.6)",
    fontSize: 12,
    fontWeight: "700",
  },
  previewSubtasksCount: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 11,
  },
  previewSubtaskItem: {
    marginBottom: 8,
  },
  previewSubtaskRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },
  previewCheckbox: {
    color: "rgba(255,255,255,0.6)",
    fontSize: 16,
  },
  previewSubtaskText: {
    color: "rgba(255,255,255,0.8)",
    fontSize: 13,
    flex: 1,
  },
  addWorkRow: {
    marginTop: 8,
    marginLeft: 24,
  },
  addWorkText: {
    color: "rgba(255,255,255,0.4)",
    fontSize: 11,
  },
  previewAttachmentsBox: {
    marginTop: 12,
  },
  previewAttachmentsTitle: {
    color: "rgba(255,255,255,0.6)",
    fontSize: 12,
    fontWeight: "700",
    marginBottom: 8,
  },
  previewAttachmentsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  previewAttachmentChip: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    backgroundColor: "rgba(255,255,255,0.05)",
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  previewAttachmentChipText: {
    color: "rgba(255,255,255,0.8)",
    fontSize: 11,
  },
  previewActionsRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.08)",
  },
  markDoneBtn: {
    borderRadius: 8,
    backgroundColor: "rgba(59,130,246,0.3)",
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexDirection: "row",
    alignItems: "center",
  },
  markDoneText: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 12,
    fontWeight: "700",
  },
  addWorkMainBtn: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexDirection: "row",
    alignItems: "center",
  },
  addWorkMainText: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 12,
  },
  // Dashboard alert styles for Failed/Missing tasks
  dashboardAlertHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  dashboardAlertTitle: {
    color: "white",
    fontSize: 14,
    fontWeight: "800",
  },
  dashboardAlertBadge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: "rgba(239,68,68,0.20)",
  },
  dashboardAlertBadgeText: {
    color: "#ef4444",
    fontSize: 12,
    fontWeight: "800",
  },
  dashboardAlertSubtitle: {
    color: "rgba(255,255,255,0.55)",
    fontSize: 12,
    marginBottom: 10,
  },
  failedTaskCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(239,68,68,0.20)",
    backgroundColor: "rgba(239,68,68,0.05)",
    padding: 12,
    marginBottom: 8,
  },
  lateTaskCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(245,158,11,0.20)",
    backgroundColor: "rgba(245,158,11,0.05)",
    padding: 12,
    marginBottom: 8,
  },
  failedTaskHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  failedTaskTitle: {
    color: "white",
    fontSize: 14,
    fontWeight: "700",
    flex: 1,
  },
  failedBadge: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: "rgba(239,68,68,0.20)",
  },
  failedBadgeText: {
    color: "#ef4444",
    fontSize: 10,
    fontWeight: "700",
  },
  failedTaskAssignee: {
    color: "rgba(255,255,255,0.6)",
    fontSize: 12,
    marginBottom: 4,
  },
  failedTaskMeta: {
    color: "rgba(255,255,255,0.45)",
    fontSize: 11,
  },
  moreTasksText: {
    color: "rgba(255,255,255,0.4)",
    fontSize: 12,
    textAlign: "center",
    marginTop: 6,
  },
  // Assign Task form - improved styles
  reuseLastBtn: {
    marginBottom: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(59,130,246,0.45)",
    backgroundColor: "rgba(59,130,246,0.15)",
    paddingVertical: 12,
    paddingHorizontal: 14,
    alignItems: "center",
  },
  reuseLastBtnText: {
    color: "#93c5fd",
    fontWeight: "800",
    fontSize: 13,
  },
  assignHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 20,
    gap: 12,
  },
  assignHeaderIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: "#3b82f6",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#3b82f6",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  assignHeaderIconText: {
    fontSize: 24,
    color: "white",
    fontWeight: "bold",
  },
  assignHeaderText: {
    flex: 1,
  },
  assignSubtitle: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 12,
    marginTop: 2,
  },
  queuedBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(245,158,11,0.15)",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    gap: 4,
  },
  queuedBadgeText: {
    color: "#f59e0b",
    fontSize: 12,
    fontWeight: "600",
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 16,
    marginBottom: 10,
    gap: 8,
  },
  sectionWithBorder: {
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.08)",
    paddingTop: 16,
  },
  sectionIcon: {
    fontSize: 16,
  },
  inputWithIcon: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.08)",
    paddingHorizontal: 12,
    height: 48,
    marginBottom: 16,
  },
  inputIconLeft: {
    fontSize: 18,
    marginRight: 10,
    opacity: 0.6,
  },
  inputWithLeftIcon: {
    flex: 1,
    borderWidth: 0,
    backgroundColor: "transparent",
    paddingHorizontal: 0,
    paddingVertical: 0,
    marginBottom: 0,
    height: "100%",
  },
  selectBtnIcon: {
    fontSize: 16,
    marginRight: 10,
    opacity: 0.7,
  },
  fileChipIcon: {
    fontSize: 12,
    marginRight: 4,
  },
  assignButton: {
    marginTop: 24,
    borderRadius: 14,
    backgroundColor: "#3b82f6",
    paddingVertical: 14,
    alignItems: "center",
    shadowColor: "#3b82f6",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  assignButtonPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.98 }],
  },
  assignButtonDisabled: {
    opacity: 0.6,
  },
  assignButtonContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  assignButtonIcon: {
    fontSize: 20,
    color: "white",
    fontWeight: "bold",
  },
  assignButtonText: {
    color: "white",
    fontWeight: "700",
    fontSize: 15,
  },
});

const cs = StyleSheet.create({
  dueSoonBanner: { 
    backgroundColor: "#0d1b36", 
    marginHorizontal: 16, 
    marginTop: 16, 
    borderRadius: 14, 
    padding: 16, 
    flexDirection: "row", 
    justifyContent: "space-between", 
    alignItems: "center", 
    borderWidth: 1, 
    borderColor: "rgba(26,115,232,0.2)" 
  },
  dueSoonLeft: { flex: 1 },
  dueSoonTitle: { color: "#fff", fontSize: 15, fontWeight: "700" },
  dueSoonSub: { color: "rgba(255,255,255,0.55)", fontSize: 12, marginTop: 2 },
  dueSoonLink: { color: "#1a73e8", fontSize: 18, fontWeight: "600", marginLeft: 8 },

  statsStrip: { flexDirection: "row", paddingHorizontal: 16, marginTop: 12, gap: 8 },
  statCard: { 
    flex: 1, 
    backgroundColor: "rgba(255,255,255,0.05)", 
    borderRadius: 12, 
    padding: 10, 
    alignItems: "center", 
    borderWidth: 1, 
    borderColor: "rgba(255,255,255,0.07)" 
  },
  statValue: { fontSize: 18, fontWeight: "800" },
  statLabel: { color: "rgba(255,255,255,0.45)", fontSize: 9, marginTop: 2, textTransform: "uppercase", textAlign: "center" },

  taskCount: { color: "rgba(255,255,255,0.35)", fontSize: 11, marginHorizontal: 20, marginTop: 16, marginBottom: 8, textTransform: "uppercase" },

  classCard: {
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 12,
    borderTopWidth: 4,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "#191922",
    overflow: "hidden",
  },
  classCardHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 14 },
  classCardHeaderLeft: { flexDirection: "row", alignItems: "center", flex: 1, gap: 10 },
  classIcon: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  classIconText: { color: "#fff", fontWeight: "800", fontSize: 14 },
  classHeaderMeta: { flex: 1 },
  classTitle: { color: "#fff", fontSize: 15, fontWeight: "700" },
  classSub: { color: "rgba(255,255,255,0.5)", fontSize: 11, marginTop: 1 },
  statusChip: { borderRadius: 20, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 3 },
  statusChipText: { fontSize: 10, fontWeight: "700", textTransform: "uppercase" },

  classCardBody: { paddingHorizontal: 14, paddingBottom: 14 },
  dueDateRow: { flexDirection: "row", alignItems: "center", marginBottom: 8, gap: 6 },
  dueIcon: { fontSize: 13 },
  dueText: { color: "rgba(255,255,255,0.6)", fontSize: 12, flex: 1 },
  lateBadge: { 
    backgroundColor: "#c5221f", 
    color: "#fff", 
    fontSize: 9, 
    fontWeight: "800", 
    paddingHorizontal: 6, 
    paddingVertical: 2, 
    borderRadius: 4, 
    textTransform: "uppercase" 
  },

  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 10 },
  chip: { 
    borderRadius: 20, 
    borderWidth: 1, 
    borderColor: "rgba(255,255,255,0.12)", 
    backgroundColor: "rgba(255,255,255,0.05)", 
    paddingHorizontal: 8, 
    paddingVertical: 3 
  },
  chipText: { color: "rgba(255,255,255,0.65)", fontSize: 11 },

  expandBtn: { alignItems: "center", paddingVertical: 8 },
  expandBtnText: { color: "#1a73e8", fontSize: 12, fontWeight: "600" },

  expandedContent: { 
    marginTop: 4, 
    borderTopWidth: 1, 
    borderTopColor: "rgba(255,255,255,0.06)", 
    paddingTop: 12 
  },
  descText: { color: "rgba(255,255,255,0.7)", fontSize: 13, lineHeight: 20, marginBottom: 12 },
  sectionBox: { 
    backgroundColor: "rgba(255,255,255,0.03)", 
    borderRadius: 12, 
    padding: 12, 
    marginBottom: 12 
  },
  sectionTitle: { color: "rgba(255,255,255,0.4)", fontSize: 10, fontWeight: "700", textTransform: "uppercase", marginBottom: 8 },
  checkItem: { 
    flexDirection: "row", 
    alignItems: "center", 
    gap: 10, 
    paddingVertical: 8, 
    borderTopWidth: 1, 
    borderTopColor: "rgba(255,255,255,0.04)" 
  },
  checkbox: { 
    width: 18, 
    height: 18, 
    borderRadius: 4, 
    borderWidth: 1.5, 
    borderColor: "rgba(255,255,255,0.3)", 
    alignItems: "center", 
    justifyContent: "center" 
  },
  checkboxDone: { backgroundColor: "#188038", borderColor: "#188038" },
  checkboxCheck: { color: "#fff", fontSize: 11, fontWeight: "800" },
  checkItemText: { color: "rgba(255,255,255,0.85)", fontSize: 14, flex: 1 },
  checkItemDone: { color: "rgba(255,255,255,0.35)", textDecorationLine: "line-through" },

  timerBox: { 
    backgroundColor: "rgba(0,0,0,0.2)", 
    borderRadius: 12, 
    padding: 14, 
    marginBottom: 12, 
    borderWidth: 1, 
    borderColor: "rgba(255,255,255,0.05)" 
  },
  timerTopRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
  timerLabel: { color: "rgba(255,255,255,0.4)", fontSize: 12 },
  timerTime: { color: "#fff", fontSize: 22, fontWeight: "600" },
  timerBtns: { flexDirection: "row", gap: 8 },
  timerBtn: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 8, borderRadius: 8, borderWidth: 1 },
  timerBtnStart: { backgroundColor: "rgba(24,128,56,0.1)", borderColor: "rgba(24,128,56,0.3)" },
  timerBtnStop: { backgroundColor: "rgba(217,48,37,0.1)", borderColor: "rgba(217,48,37,0.3)" },
  timerBtnText: { color: "#188038", fontSize: 13, fontWeight: "600" },

  actionBar: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 16 },
  actionBtnSecondary: { 
    flex: 1, 
    alignItems: "center", 
    justifyContent: "center", 
    borderRadius: 8, 
    paddingVertical: 12, 
    borderWidth: 1, 
    borderColor: "#1a73e8", 
    backgroundColor: "rgba(26,115,232,0.05)" 
  },
  actionBtnSecondaryText: { color: "#1a73e8", fontSize: 13, fontWeight: "600" },
  actionBtnPrimary: { 
    flex: 1, 
    alignItems: "center", 
    justifyContent: "center", 
    borderRadius: 8, 
    paddingVertical: 12, 
    backgroundColor: "#1a73e8" 
  },
  actionBtnPrimaryText: { color: "#fff", fontSize: 13, fontWeight: "700" },
});

// Dashboard Styles - Mobile Friendly
const dashboardStyles = StyleSheet.create({
  container: {
    padding: 12,
    gap: 12,
  },
  // Filters Card - Vertical stack on mobile
  filtersCard: {
    backgroundColor: "#1a1a23",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    padding: 16,
  },
  filtersTitle: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 4,
  },
  filtersSubtitle: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 13,
    marginBottom: 6,
  },
  filtersScope: {
    color: "rgba(255,255,255,0.4)",
    fontSize: 12,
    marginBottom: 16,
  },
  filterButtonsRow: {
    flexDirection: "row",
    gap: 10,
  },
  filterBtn: {
    flex: 1,
    backgroundColor: "#252532",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  filterBtnLabel: {
    color: "rgba(255,255,255,0.4)",
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  filterBtnContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  filterBtnText: {
    color: "rgba(255,255,255,0.9)",
    fontSize: 13,
    fontWeight: "600",
  },
  filterBtnIcon: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 10,
  },
  // Summary Cards - Horizontal scroll
  summaryScroll: {
    paddingRight: 12,
    gap: 10,
  },
  summaryCard: {
    width: 120,
  },
  summaryCardBg: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    justifyContent: "center",
    height: 85,
  },
  summaryLabel: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  summaryValue: {
    color: "#fff",
    fontSize: 24,
    fontWeight: "700",
  },
  // Stats Stack - Full width cards
  statsStack: {
    gap: 12,
  },
  statCardFull: {
    backgroundColor: "#1a1a23",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    padding: 16,
  },
  statCardTitle: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "700",
    marginBottom: 14,
  },
  // Bar charts
  barRow: {
    marginBottom: 12,
  },
  barHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  barLabel: {
    color: "rgba(255,255,255,0.8)",
    fontSize: 13,
    fontWeight: "500",
  },
  barValue: {
    color: "rgba(255,255,255,0.9)",
    fontSize: 13,
    fontWeight: "600",
  },
  barTrack: {
    height: 8,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 4,
    overflow: "hidden",
  },
  barFill: {
    height: "100%",
    borderRadius: 4,
  },
  // Health section - Side by side boxes
  healthHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 14,
  },
  quickInsights: {
    color: "rgba(255,255,255,0.4)",
    fontSize: 11,
  },
  healthBoxesRow: {
    flexDirection: "row",
    gap: 12,
  },
  healthBoxHalf: {
    flex: 1,
    backgroundColor: "rgba(255,255,255,0.03)",
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.05)",
  },
  healthLabel: {
    color: "rgba(255,255,255,0.6)",
    fontSize: 12,
    marginBottom: 6,
  },
  healthValue: {
    color: "#fff",
    fontSize: 28,
    fontWeight: "700",
    marginBottom: 8,
  },
  healthBar: {
    height: 4,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 2,
    overflow: "hidden",
  },
  healthBarFill: {
    height: "100%",
    backgroundColor: "rgba(255,255,255,0.3)",
    borderRadius: 2,
  },
  healthSubtext: {
    color: "rgba(255,255,255,0.4)",
    fontSize: 11,
    marginTop: 6,
  },
  // Users Overview
  usersCard: {
    backgroundColor: "#1a1a23",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    padding: 16,
  },
  usersHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
  },
  usersTitleSection: {
    flex: 1,
  },
  usersTitle: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "700",
    marginBottom: 4,
  },
  usersSubtitle: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 12,
  },
  searchSection: {
    alignItems: "flex-end",
  },
  filterLabel: {
    color: "rgba(255,255,255,0.4)",
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  searchBox: {
    backgroundColor: "#252532",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    minWidth: 130,
  },
  searchInput: {
    backgroundColor: "#252532",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    minWidth: 130,
    color: "#fff",
    fontSize: 13,
  },
  searchPlaceholder: {
    color: "rgba(255,255,255,0.4)",
    fontSize: 13,
  },
  userCardRow: {
    marginTop: 16,
    gap: 12,
  },
  userCard: {
    backgroundColor: "rgba(255,255,255,0.03)",
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.05)",
  },
  userEmail: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 4,
  },
  userStats: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  userStatText: {
    fontSize: 11,
    fontWeight: "500",
  },
  emptyText: {
    color: "rgba(255,255,255,0.4)",
    fontSize: 13,
    textAlign: "center",
    marginTop: 20,
  },
});

// Projects Page Styles
const projectsStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0d0d12",
    padding: 16,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 16,
  },
  titleSection: {
    flex: 1,
  },
  title: {
    color: "#fff",
    fontSize: 20,
    fontWeight: "700",
    marginBottom: 4,
  },
  subtitle: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 13,
    lineHeight: 18,
  },
  newProjectBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1a73e8",
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 6,
  },
  newProjectIcon: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
  },
  newProjectText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "600",
  },
  searchRow: {
    flexDirection: "row",
    width: "100%",
    marginBottom: 16,
  },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1a1a23",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    paddingHorizontal: 12,
    flex: 1,
    width: "100%",
  },
  searchIcon: {
    fontSize: 14,
    marginRight: 8,
    color: "rgba(255,255,255,0.5)",
  },
  searchInput: {
    flex: 1,
    color: "#fff",
    fontSize: 14,
    paddingVertical: 10,
  },
  paginationRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  paginationText: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 13,
  },
  paginationControls: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  pageBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: "#1a1a23",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    justifyContent: "center",
    alignItems: "center",
  },
  pageBtnIcon: {
    color: "rgba(255,255,255,0.6)",
    fontSize: 14,
  },
  pageInfo: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 12,
  },
  cardsContainer: {
    gap: 12,
  },
  emptyState: {
    padding: 40,
    alignItems: "center",
  },
  emptyText: {
    color: "rgba(255,255,255,0.4)",
    fontSize: 14,
  },
  projectCard: {
    backgroundColor: "#1a1a23",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    padding: 16,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  cardTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1,
  },
  folderIconBox: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: "rgba(26,115,232,0.1)",
    justifyContent: "center",
    alignItems: "center",
  },
  folderIcon: {
    fontSize: 16,
  },
  projectName: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
  },
  cardActions: {
    flexDirection: "row",
    gap: 8,
  },
  iconBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: "rgba(255,255,255,0.05)",
    justifyContent: "center",
    alignItems: "center",
  },
  iconBtnDanger: {
    backgroundColor: "rgba(239,68,68,0.1)",
  },
  iconBtnText: {
    fontSize: 14,
  },
  projectDescription: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 14,
    marginBottom: 12,
    lineHeight: 20,
  },
  attachmentLink: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 12,
  },
  attachmentIcon: {
    fontSize: 12,
    color: "#1a73e8",
  },
  attachmentText: {
    color: "#1a73e8",
    fontSize: 12,
    flex: 1,
  },
  assigneesRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 16,
  },
  assigneesIcon: {
    fontSize: 12,
    color: "rgba(255,255,255,0.4)",
  },
  assigneesText: {
    color: "rgba(255,255,255,0.4)",
    fontSize: 12,
  },
  cardFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.06)",
  },
  createdDate: {
    color: "rgba(255,255,255,0.4)",
    fontSize: 11,
  },
  statusBadge: {
    backgroundColor: "rgba(26,115,232,0.15)",
    borderRadius: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  statusBadgeText: {
    color: "#1a73e8",
    fontSize: 11,
    fontWeight: "700",
  },
});

// Create Project Modal Styles
const createProjectModalStyles = StyleSheet.create({
  overlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.7)",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 1000,
    padding: 20,
  },
  modal: {
    backgroundColor: "#1a1a23",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    padding: 20,
    width: "100%",
    maxWidth: 400,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },
  title: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "700",
  },
  closeBtn: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 20,
    padding: 4,
  },
  label: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 13,
    fontWeight: "500",
    marginBottom: 8,
  },
  input: {
    backgroundColor: "#252532",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: "#fff",
    fontSize: 14,
    marginBottom: 16,
  },
  buttons: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 12,
    marginTop: 8,
  },
  cancelBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: "rgba(255,255,255,0.1)",
  },
  cancelText: {
    color: "rgba(255,255,255,0.8)",
    fontSize: 14,
    fontWeight: "600",
  },
  createBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: "#1a73e8",
  },
  createText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },
});

// Assign Task Page Styles
const assignStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0d0d12",
    padding: 16,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 20,
  },
  headerIcon: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: "#1a73e8",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  headerIconText: {
    color: "#fff",
    fontSize: 24,
    fontWeight: "300",
  },
  headerText: {
    flex: 1,
  },
  headerTitle: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 2,
  },
  headerSubtitle: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 13,
  },
  section: {
    marginBottom: 20,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  sectionIcon: {
    fontSize: 14,
    marginRight: 8,
  },
  sectionTitle: {
    color: "rgba(255,255,255,0.9)",
    fontSize: 13,
    fontWeight: "600",
  },
  inputGroup: {
    marginBottom: 10,
  },
  input: {
    backgroundColor: "#1a1a23",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: "#fff",
    fontSize: 14,
  },
  textArea: {
    height: 80,
    textAlignVertical: "top",
  },
  rowInputs: {
    flexDirection: "row",
    gap: 10,
  },
  halfInput: {
    flex: 1,
  },
  thirdInput: {
    flex: 1,
  },
  inputLabel: {
    color: "rgba(255,255,255,0.6)",
    fontSize: 12,
    marginBottom: 6,
  },
  selectBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1a1a23",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  selectText: {
    flex: 1,
    color: "rgba(255,255,255,0.8)",
    fontSize: 13,
  },
  selectIcon: {
    fontSize: 12,
    marginRight: 6,
  },
  selectChevron: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 10,
    marginLeft: 4,
  },
  dateBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1a1a23",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    paddingHorizontal: 10,
    paddingVertical: 12,
  },
  dateIcon: {
    fontSize: 12,
    marginRight: 6,
  },
  dateText: {
    flex: 1,
    color: "rgba(255,255,255,0.6)",
    fontSize: 12,
  },
  helperText: {
    color: "rgba(255,255,255,0.4)",
    fontSize: 11,
    marginTop: 8,
  },
  attachmentBox: {
    backgroundColor: "#1a1a23",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    padding: 14,
  },
  attachmentLabel: {
    color: "rgba(255,255,255,0.8)",
    fontSize: 13,
    fontWeight: "500",
    marginBottom: 10,
  },
  filePickerBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#252532",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  filePickerText: {
    color: "#1a73e8",
    fontSize: 12,
    fontWeight: "600",
    marginRight: 12,
  },
  filePickerSubtext: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 12,
  },
  attachmentHint: {
    color: "rgba(255,255,255,0.4)",
    fontSize: 11,
    marginTop: 8,
  },
  fileChips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 10,
  },
  fileChip: {
    backgroundColor: "rgba(26,115,232,0.15)",
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  fileChipText: {
    color: "#1a73e8",
    fontSize: 12,
  },
  mainBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#1a73e8",
    borderRadius: 10,
    paddingVertical: 14,
    marginTop: 10,
  },
  mainBtnIcon: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "300",
    marginRight: 8,
  },
  mainBtnText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "600",
  },
  secondaryButtons: {
    flexDirection: "row",
    gap: 10,
    marginTop: 12,
  },
  secondaryBtn: {
    flex: 1,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: "center",
  },
  secondaryBtnText: {
    color: "rgba(255,255,255,0.8)",
    fontSize: 13,
    fontWeight: "500",
  },
  previewLabel: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 13,
    fontWeight: "500",
    marginBottom: 10,
  },
  previewEmpty: {
    backgroundColor: "#1a1a23",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    padding: 20,
    alignItems: "center",
  },
  previewEmptyText: {
    color: "rgba(255,255,255,0.4)",
    fontSize: 13,
  },
  previewCard: {
    backgroundColor: "#1a1a23",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    padding: 14,
    borderLeftWidth: 3,
    borderLeftColor: "#3b82f6",
  },
  previewHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  previewDept: {
    color: "rgba(255,255,255,0.6)",
    fontSize: 11,
    textTransform: "capitalize",
  },
  previewBadge: {
    backgroundColor: "rgba(26,115,232,0.2)",
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  previewBadgeText: {
    color: "#1a73e8",
    fontSize: 10,
    fontWeight: "600",
  },
  previewTitle: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "600",
    marginBottom: 4,
  },
  previewDesc: {
    color: "rgba(255,255,255,0.6)",
    fontSize: 12,
    marginBottom: 8,
  },
  previewDue: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 12,
    marginBottom: 8,
  },
  previewProgressTrack: {
    height: 4,
    backgroundColor: "rgba(255,255,255,0.1)",
    borderRadius: 2,
    overflow: "hidden",
    marginBottom: 4,
  },
  previewProgressFill: {
    height: "100%",
    backgroundColor: "#3b82f6",
    borderRadius: 2,
  },
  previewProgressText: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 11,
    marginBottom: 10,
  },
  previewSubtasks: {
    marginTop: 8,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.06)",
  },
  previewSubtasksTitle: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 12,
    fontWeight: "600",
    marginBottom: 8,
  },
  previewSubtaskItem: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 6,
  },
  previewCheckbox: {
    color: "rgba(255,255,255,0.4)",
    fontSize: 14,
    marginRight: 8,
  },
  previewSubtaskText: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 12,
    flex: 1,
  },
});

// Work Overview Styles - Professional Table-like Mobile View
const workOverviewStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0d0d12",
    padding: 16,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.08)",
  },
  topActionsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 16,
    width: "100%",
  },
  baselineBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#16161d",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 6,
  },
  baselineIcon: {
    fontSize: 14,
    color: "rgba(255,255,255,0.7)",
  },
  baselineText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "500",
  },
  filterActionBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#3b82f6",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 6,
    shadowColor: "#3b82f6",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 3,
  },
  filterActionIcon: {
    fontSize: 12,
    color: "#fff",
  },
  filterActionText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "600",
  },
  tableContainer: {
    minWidth: 800,
  },
  breadcrumb: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
  },
  breadcrumbMain: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "700",
    letterSpacing: -0.3,
  },
  breadcrumbDivider: {
    color: "rgba(255,255,255,0.3)",
    fontSize: 14,
    marginHorizontal: 6,
  },
  breadcrumbSub: {
    color: "#3b82f6",
    fontSize: 14,
    fontWeight: "600",
  },
  searchRow: {
    marginBottom: 12,
  },
  searchBoxFull: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#16161d",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    paddingHorizontal: 16,
    paddingVertical: 14,
    width: "100%",
    minHeight: 48,
  },
  searchInputFull: {
    flex: 1,
    color: "#fff",
    fontSize: 14,
    paddingVertical: 0,
  },
  filterRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 16,
    width: "100%",
  },
  searchBox: {
    flex: 1.5,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1a1a23",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  searchIcon: {
    fontSize: 14,
    marginRight: 8,
    color: "rgba(255,255,255,0.6)",
  },
  searchIconRight: {
    fontSize: 14,
    marginLeft: 8,
    color: "rgba(255,255,255,0.5)",
  },
  searchInput: {
    flex: 1,
    color: "#fff",
    fontSize: 14,
    paddingVertical: 0,
  },
  filterBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#16161d",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    paddingVertical: 10,
  },
  filterBtnLabel: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 11,
    marginRight: 4,
  },
  filterBtnValue: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "500",
    maxWidth: 80,
  },
  filterBtnIcon: {
    color: "rgba(255,255,255,0.4)",
    fontSize: 10,
    marginLeft: 4,
  },
  filterBtnFlex: {
    flex: 1,
    justifyContent: "center",
    minHeight: 42,
    paddingHorizontal: 12,
  },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: "#0a0a0f",
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 8,
  },
  tableHeaderCell: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  tableBody: {
    flex: 1,
  },
  tableRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginBottom: 4,
  },
  tableRowEven: {
    backgroundColor: "rgba(255,255,255,0.02)",
  },
  tableCell: {
    justifyContent: "center",
  },
  idBadge: {
    width: 40,
    height: 24,
    borderRadius: 4,
    justifyContent: "center",
    alignItems: "center",
  },
  idText: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "600",
  },
  subjectText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "500",
  },
  projectText: {
    color: "rgba(255,255,255,0.4)",
    fontSize: 11,
    marginTop: 2,
  },
  statusBadge: {
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 3,
    alignSelf: "flex-start",
  },
  statusText: {
    fontSize: 10,
    fontWeight: "600",
  },
  assigneeText: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 12,
  },
  priorityText: {
    fontSize: 11,
    fontWeight: "600",
    textTransform: "capitalize",
  },
  dateText: {
    color: "rgba(255,255,255,0.6)",
    fontSize: 11,
  },
  emptyRow: {
    padding: 40,
    alignItems: "center",
  },
  emptyText: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 13,
  },
  paginationRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: 12,
    marginTop: 8,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.06)",
  },
  paginationText: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 12,
  },
  paginationControls: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  paginationBtn: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 12,
  },
  pageNumber: {
    width: 28,
    height: 28,
    borderRadius: 6,
    backgroundColor: "#1a1a23",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    justifyContent: "center",
    alignItems: "center",
  },
  pageNumberText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "600",
  },
});

// Users Tasks Styles - Professional Mobile View
const usersTasksStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0d0d12",
    padding: 16,
  },
  header: {
    marginBottom: 20,
  },
  title: {
    color: "#fff",
    fontSize: 22,
    fontWeight: "700",
    marginBottom: 6,
  },
  subtitle: {
    color: "rgba(255,255,255,0.6)",
    fontSize: 13,
    lineHeight: 18,
  },
  filterRow: {
    marginBottom: 12,
  },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#16161d",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  searchIcon: {
    fontSize: 14,
    color: "rgba(255,255,255,0.5)",
    marginRight: 10,
  },
  searchInput: {
    flex: 1,
    color: "#fff",
    fontSize: 14,
    paddingVertical: 0,
  },
  dropdownsRow: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 16,
  },
  filterBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#16161d",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  filterBtnContent: {
    flex: 1,
  },
  filterBtnLabel: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 10,
    fontWeight: "600",
    letterSpacing: 0.5,
    marginBottom: 4,
    textTransform: "uppercase",
  },
  filterBtnValue: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "500",
  },
  filterBtnIcon: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 10,
    marginLeft: 8,
  },
  resultsText: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 12,
    marginBottom: 20,
  },
  emptyState: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 60,
  },
  emptyText: {
    color: "rgba(255,255,255,0.4)",
    fontSize: 14,
  },
});

// Accounts Styles - Professional Mobile View
const accountsStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0d0d12",
    padding: 16,
    paddingBottom: 100,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 20,
  },
  title: {
    color: "#fff",
    fontSize: 22,
    fontWeight: "700",
    marginBottom: 4,
  },
  subtitle: {
    color: "rgba(255,255,255,0.6)",
    fontSize: 13,
  },
  filtersRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 20,
  },
  filterBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1a1a23",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 8,
  },
  filterBtnText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "500",
  },
  filterBtnIcon: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 10,
  },
  countBadge: {
    backgroundColor: "#1a1a23",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginLeft: "auto",
  },
  countText: {
    color: "rgba(255,255,255,0.8)",
    fontSize: 13,
    fontWeight: "500",
  },
  cardsContainer: {
    gap: 12,
  },
  userCard: {
    backgroundColor: "#16161d",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    padding: 16,
    gap: 12,
  },
  userCardLeft: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  avatarContainer: {
    width: 44,
    height: 44,
    borderRadius: 10,
    overflow: "hidden",
    backgroundColor: "#252532",
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 10,
  },
  avatarPlaceholder: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: "#252532",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarLetter: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "600",
  },
  userInfo: {
    flex: 1,
    gap: 4,
  },
  userNameRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 8,
  },
  userEmail: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "600",
  },
  badgesRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  badge: {
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
  approvedBadge: {
    backgroundColor: "#10b981",
  },
  approvedText: {
    color: "#fff",
  },
  offlineBadge: {
    backgroundColor: "#374151",
  },
  offlineText: {
    color: "rgba(255,255,255,0.7)",
  },
  onlineBadge: {
    backgroundColor: "#10b981",
  },
  onlineText: {
    color: "#fff",
  },
  adminBadge: {
    backgroundColor: "#2563eb",
  },
  adminText: {
    color: "#fff",
  },
  managerBadge: {
    backgroundColor: "#7c3aed",
  },
  managerText: {
    color: "#fff",
  },
  userBadge: {
    backgroundColor: "#3b82f6",
  },
  userText: {
    color: "#fff",
  },
  pendingBadge: {
    backgroundColor: "#f59e0b",
  },
  pendingText: {
    color: "#fff",
  },
  rejectedBadge: {
    backgroundColor: "#ef4444",
  },
  rejectedText: {
    color: "#fff",
  },
  deletedBadge: {
    backgroundColor: "#6b7280",
  },
  deletedText: {
    color: "#fff",
  },
  // Deleted user card styles
  deletedCard: {
    opacity: 0.6,
    backgroundColor: "rgba(255,255,255,0.02)",
  },
  deletedAvatar: {
    backgroundColor: "#1a1a23",
  },
  deletedAvatarPlaceholder: {
    backgroundColor: "#1a1a23",
  },
  cardDeletedText: {
    color: "rgba(255,255,255,0.5)",
  },
  deletedMeta: {
    color: "rgba(255,255,255,0.3)",
  },
  userMeta: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 12,
  },
  actionsRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 8,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.06)",
  },
  actionBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  viewBtn: {
    backgroundColor: "#252532",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  viewBtnText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "500",
  },
  deleteBtn: {
    backgroundColor: "#1a1a23",
    borderWidth: 1,
    borderColor: "#ef4444",
  },
  deleteBtnText: {
    color: "#ef4444",
    fontSize: 13,
    fontWeight: "500",
  },
  approveBtn: {
    backgroundColor: "#059669",
    borderWidth: 1,
    borderColor: "#10b981",
  },
  approveBtnText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "500",
  },
  rejectBtn: {
    backgroundColor: "#991b1b",
    borderWidth: 1,
    borderColor: "#ef4444",
  },
  rejectBtnText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "500",
  },
  restoreBtn: {
    backgroundColor: "#2563eb",
    borderWidth: 1,
    borderColor: "#3b82f6",
  },
  restoreBtnText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "500",
  },
  emptyState: {
    padding: 40,
    alignItems: "center",
  },
  emptyText: {
    color: "rgba(255,255,255,0.4)",
    fontSize: 14,
  },
  emptySubtext: {
    color: "rgba(255,255,255,0.3)",
    fontSize: 12,
    marginTop: 8,
  },
});
