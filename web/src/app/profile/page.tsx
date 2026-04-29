"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AdminSettings } from "@/components/AdminSettings";
import { NotificationsView } from "@/components/NotificationsView";
import { BulletinBoard } from "@/components/bulletin/BulletinBoard";
import { ConfessionChat } from "@/components/confessions/ConfessionChat";
import { CommunityPolls } from "@/components/CommunityPolls";
import { UserCalendar } from "@/components/UserCalendar";
import { AppLayout, type GlobalSearchHit } from "@/components/AppLayout";
import { RequireAuth } from "@/components/RequireAuth";
import { useAuth } from "@/components/AuthProvider";
import { Card } from "@/components/Card";
import { apiDelete, apiGet, apiPatch, apiPost } from "@/lib/api";
import {
  LayoutDashboard,
  ClipboardList,
  Calendar,
  Globe,
  Megaphone,
  Ghost,
  PieChart,
  CheckCircle2,
  FileText,
  Users,
  Edit
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

type ProfileTab = "dashboard" | "profile" | "my_tasks" | "calendar" | "settings" | "notifications" | "bulletin" | "confessions" | "community_polls";

type NotificationItem = {
  id: string;
  title: string;
  message: string;
  taskId: string | null;
  createdAtMs: number;
};

type TaskAttachmentView = {
  id: string;
  name: string;
  url: string;
  size?: number;
  contentType?: string;
  createdAt?: number;
  uploadedBy?: string;
  checklistItemId?: number | null;
};

type ToastItem = {
  id: string;
  title: string;
  message: string;
};

type TaskStatus = "in_process" | "complete" | "failed";

type TaskChecklistItem = {
  id: string;
  text: string;
  done: boolean;
};

type TaskComment = {
  id: string;
  taskId: string;
  text: string;
  createdAt: number;
  createdBy: string;
  createdByEmail?: string;
  parentId?: string | null;
  attachments?: Array<{ id: string; name: string; url: string; contentType?: string; size?: number }>;
};

type TaskItem = {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  progress: number;
  priority: "easy" | "medium" | "high" | "very_high" | "critical";
  startDate: number | null;
  dueDate: number | null;
  createdAt: number;
  department?: string;
  attachments?: TaskAttachmentView[];
  checklist?: TaskChecklistItem[];
  assignedTo?: string;
  elapsedSeconds?: number;
  comments?: TaskComment[];
  sharedWith?: { id: string; email: string; avatarUrl?: string }[];
  projectName?: string | null;
  assignedToEmail?: string;
  assignedToName?: string | null;
  assignedToAvatarUrl?: string | null;
};

function mapTaskRow(row: Record<string, unknown>): TaskItem {
  const rawProgress = Number(row.progress);
  const progress = Number.isFinite(rawProgress) ? Math.max(0, Math.min(100, rawProgress)) : 0;
  const status =
    row.status === "pending" ||
    row.status === "not_started" ||
    row.status === "in_process" ||
    row.status === "blocked" ||
    row.status === "complete" ||
    row.status === "failed"
      ? (row.status as TaskStatus)
      : "in_process";
  const projectName = row.project_name == null ? null : String(row.project_name);

  const startDate = row.start_date == null ? null : Number(row.start_date);
  const dueDate = row.due_date == null ? null : Number(row.due_date);

  const attachments = Array.isArray(row.attachments)
    ? row.attachments
      .filter((a): a is Record<string, unknown> => Boolean(a) && typeof a === "object")
      .map((a) => ({
        id: String(a.id ?? ""),
        name: String(a.name ?? ""),
        url: String(a.url ?? ""),
        size: a.size == null ? undefined : Number(a.size),
        contentType: a.contentType == null ? undefined : String(a.contentType),
        createdAt: a.createdAt == null ? undefined : Number(a.createdAt),
        uploadedBy: a.uploadedBy == null ? undefined : String(a.uploadedBy),
        checklistItemId: a.checklistItemId == null ? null : Number(a.checklistItemId),
      }))
      .filter((a) => a.id && a.url)
    : [];

  const department = row.department == null ? undefined : String(row.department);

  const checklist = Array.isArray(row.checklist)
    ? row.checklist
      .filter((x): x is Record<string, unknown> => Boolean(x) && typeof x === "object")
      .map((x) => ({ id: String(x.id ?? ""), text: String(x.text ?? ""), done: Boolean(x.done) }))
      .filter((x) => x.id && x.text)
    : [];

  const comments = Array.isArray(row.comments)
    ? row.comments
      .filter((c): c is Record<string, unknown> => Boolean(c) && typeof c === "object")
      .map((c) => ({
        id: String(c.id ?? ""),
        taskId: String(c.taskId ?? ""),
        text: String(c.text ?? ""),
        createdAt: Number(c.createdAt ?? Date.now()),
        createdBy: String(c.createdBy ?? ""),
        createdByEmail: c.createdByEmail == null ? undefined : String(c.createdByEmail),
        parentId: c.parentId == null ? null : String(c.parentId),
        attachments: Array.isArray(c.attachments) ? (c.attachments as Record<string, unknown>[]).map((a) => ({
          id: String(a.id ?? ""),
          name: String(a.name ?? ""),
          url: String(a.url ?? ""),
          contentType: a.contentType ? String(a.contentType) : undefined,
          size: a.size ? Number(a.size) : undefined,
        })) : [],
      }))
      .filter((c) => c.id)
    : [];

  const rawPriority = String(row.priority ?? "medium");
  const priority: TaskItem["priority"] =
    rawPriority === "easy" || rawPriority === "medium" || rawPriority === "high" || rawPriority === "very_high" || rawPriority === "critical"
      ? rawPriority
      : "medium";

  const sharedWith = Array.isArray(row.sharedWith) ? row.sharedWith.map((s: any) => ({
    id: String(s.id),
    email: String(s.email),
    avatarUrl: s.avatarUrl ? String(s.avatarUrl) : undefined
  })) : [];

  return {
    id: String(row.id ?? ""),
    title: String(row.title ?? ""),
    description: String(row.description ?? ""),
    status,
    progress,
    priority,
    startDate: Number.isFinite(startDate as number) ? (startDate as number) : null,
    dueDate: Number.isFinite(dueDate as number) ? (dueDate as number) : null,
    createdAt: Number(row.created_at ?? Date.now()),
    department,
    attachments,
    checklist,
    assignedTo: String(row.assigned_to ?? ""),
    elapsedSeconds: row.elapsed_seconds == null ? undefined : Number(row.elapsed_seconds),
    comments,
    sharedWith,
    projectName,
    assignedToEmail:
      row.assigned_to_email == null ? undefined : String(row.assigned_to_email),
    assignedToName:
      row.assigned_to_name == null ? null : String(row.assigned_to_name),
    assignedToAvatarUrl:
      row.assigned_to_avatar == null ? null : String(row.assigned_to_avatar),
  };
}

function mapNotifRow(row: Record<string, unknown>): NotificationItem {
  return {
    id: String(row.id),
    title: String(row.title ?? "Notification"),
    message: String(row.message ?? ""),
    taskId: row.task_id == null ? null : String(row.task_id),
    createdAtMs: Number(row.created_at ?? Date.now()),
  };
}

export default function ProfilePage() {
  const { appUser, refreshSession } = useAuth();
  const router = useRouter();

  const isAdmin = appUser?.role === "admin";

  const [tab, setTab] = useState<ProfileTab>("dashboard");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [taskFilter, setTaskFilter] = useState<string>("all");
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [allUsers, setAllUsers] = useState<Array<{ id: string; email: string; name: string | null; avatarUrl?: string | null }>>([]);
  const [notifs, setNotifs] = useState<NotificationItem[]>([]);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  // Highlighted task ID (for clicking a notification to jump to a task)
  const [highlightedTaskId, setHighlightedTaskId] = useState<string | null>(null);
  // Multi-file attachments per task conversation (taskId -> File[])
  const [commentFiles, setCommentFiles] = useState<Record<string, File[]>>({});
  const [commentFilePreviews, setCommentFilePreviews] = useState<Record<string, string[]>>({});
  const [fullscreenMedia, setFullscreenMedia] = useState<{ url: string; type: 'image' | 'video'; name: string } | null>(null);
  // 3-dot message context menu state (per comment)
  const [msgMenuCommentId, setMsgMenuCommentId] = useState<string | null>(null);
  // Forwarding state
  const [forwardingComment, setForwardingComment] = useState<TaskComment | null>(null);
  const [forwardSearch, setForwardSearch] = useState("");
  // Reply-to state
  const [replyTo, setReplyTo] = useState<{ commentId: string; text: string } | null>(null);

  const progressDebounceRef = useRef<Record<string, number>>({});

  // Expanded tasks state for folding/summarize logic
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

  // If admin marks task as blocked, force-close it in user view.
  useEffect(() => {
    const blockedIds = new Set(
      tasks
        .filter((t) => String(t.status) === "blocked")
        .map((t) => String(t.id)),
    );
    if (!blockedIds.size) return;
    setExpandedTasks((prev) => {
      let changed = false;
      const next = new Set(prev);
      blockedIds.forEach((id) => {
        if (next.has(id)) {
          next.delete(id);
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [tasks]);

  // Close message menu on click outside
  useEffect(() => {
    const handleClick = () => setMsgMenuCommentId(null);
    window.addEventListener("click", handleClick);
    return () => window.removeEventListener("click", handleClick);
  }, []);

  // Timer state for tracking work hours per task
  // timerState: 'idle' | 'running' | 'stopped'
  const [taskTimers, setTaskTimers] = useState<Record<string, {
    elapsedSeconds: number;
    isRunning: boolean;
    startedAt: number | null;
    stopped: boolean; // true = timer was started then stopped, clock paused, not done
    hasStarted: boolean; // true once timer has been started at least once
  }>>({});

  // Stop Report Modal state
  const [stopReportModal, setStopReportModal] = useState<{ taskId: string; elapsed: number } | null>(null);
  const [stopReportNote, setStopReportNote] = useState("");
  const [stopReportSaving, setStopReportSaving] = useState(false);
  // Per-task comment input text state
  const [commentInputs, setCommentInputs] = useState<Record<string, string>>({});

  // View Reports Modal state
  const [reportsModal, setReportsModal] = useState<{ taskId: string; taskTitle: string } | null>(null);
  type TimerReport = { id: number; taskId: string; userId: number; elapsedSeconds: number; stopNote: string | null; createdAt: number; userEmail: string; userName: string | null };
  const [reportsData, setReportsData] = useState<TimerReport[]>([]);
  const [reportsLoading, setReportsLoading] = useState(false);
  const [userReportTitle, setUserReportTitle] = useState("");
  const [userReportDescription, setUserReportDescription] = useState("");
  const [userReportFileName, setUserReportFileName] = useState("");
  const [userReportFileDataUrl, setUserReportFileDataUrl] = useState("");
  const [userReportSaving, setUserReportSaving] = useState(false);

  // Timer interval effect
  useEffect(() => {
    const interval = setInterval(() => {
      setTaskTimers((prev) => {
        const updated = { ...prev };
        let hasChanges = false;
        Object.keys(updated).forEach((taskId) => {
          if (updated[taskId].isRunning) {
            updated[taskId] = {
              ...updated[taskId],
              elapsedSeconds: updated[taskId].elapsedSeconds + 1,
            };
            hasChanges = true;
          }
        });
        return hasChanges ? updated : prev;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const postComment = async (taskId: string) => {
    const text = commentInputs[taskId] || "";
    const files = commentFiles[taskId] || [];
    if (!text.trim() && !files.length) return;

    try {
      const messageText = text.trim() || "📎 Attachment";
      const res = await apiPost<{ comment: TaskComment }>(`/api/tasks/${taskId}/comments`, {
        message: messageText,
        parentId: replyTo?.commentId || null,
      });

      const commentId = res.comment.id;
      if (files.length > 0) {
        for (const file of files) {
          const fd = new FormData();
          fd.set("file", file);
          await fetch(`/api/tasks/${taskId}/comments/${commentId}/attachments`, {
            method: "POST",
            credentials: "include",
            body: fd,
          });
        }
      }

      setCommentInputs(prev => ({ ...prev, [taskId]: "" }));
      setReplyTo(null);
      const oldPreviews = commentFilePreviews[taskId] || [];
      oldPreviews.forEach(p => { if (p) URL.revokeObjectURL(p); });
      setCommentFiles(p => { const n = { ...p }; delete n[taskId]; return n; });
      setCommentFilePreviews(p => { const n = { ...p }; delete n[taskId]; return n; });

      // Refresh tasks
      const res2 = await apiGet<{ items: unknown[] }>("/api/tasks");
      const next = res2.items
        .filter((x): x is Record<string, unknown> => Boolean(x) && typeof x === "object")
        .map(mapTaskRow)
        .sort((a, b) => b.createdAt - a.createdAt);
      setTasks(next);
    } catch (err) {
      console.error("Post comment failed:", err);
      alert("Failed to send message");
    }
  };

  // Initialize timers for new tasks - load saved elapsed time
  useEffect(() => {
    setTaskTimers((prev) => {
      const updated = { ...prev };
      tasks.forEach((t) => {
        if (!updated[t.id]) {
          const elapsed = t.elapsedSeconds || 0;
          // If task has elapsed time > 0, it was previously started+stopped
          updated[t.id] = {
            elapsedSeconds: elapsed,
            isRunning: false,
            startedAt: null,
            stopped: elapsed > 0, // stopped state if there's saved elapsed time
            hasStarted: elapsed > 0,
          };
        }
      });
      return updated;
    });
  }, [tasks]);

  // Stop timer when task is completed
  useEffect(() => {
    tasks.forEach((t) => {
      if (t.status === "complete" && taskTimers[t.id]?.isRunning) {
        setTaskTimers((prev) => ({
          ...prev,
          [t.id]: { ...prev[t.id], isRunning: false },
        }));
      }
    });
  }, [tasks, taskTimers]);

  // navigateToTask: switch to My Tasks tab and highlight/scroll to a specific task
  const handleForwardMessage = async (targetTaskId: string) => {
    if (!forwardingComment) return;
    try {
      await apiPost<{ comment: { id: string } }>(`/api/tasks/${targetTaskId}/comments`, {
        message: forwardingComment.text || "📎 Forwarded Attachment",
      });
      setForwardingComment(null);
      setForwardSearch("");
      setToasts((prev) => [{ id: `fwd_${Date.now()}`, title: "Message forwarded", message: "" }, ...prev].slice(0, 3));

      // Refresh tasks
      apiGet<{ items: any[] }>("/api/tasks").then((res) => {
        const next = res.items
          .filter((x): x is Record<string, unknown> => Boolean(x) && typeof x === "object")
          .map(mapTaskRow)
          .sort((a, b) => b.createdAt - a.createdAt);
        setTasks(next);
      });
    } catch (e) {
      alert("Failed to forward message");
    }
  };

  const navigateToTask = (taskId: string | null) => {
    if (!taskId) return;
    setTab("my_tasks");
    setHighlightedTaskId(taskId);
    setTimeout(() => {
      document.getElementById(`task-card-${taskId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
      // Auto-clear highlight after 3 seconds
      setTimeout(() => setHighlightedTaskId(null), 3000);
    }, 100);
  };

  const formatTime = (seconds: number) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hrs.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  const startTimer = (taskId: string) => {
    setTaskTimers((prev) => ({
      ...prev,
      [taskId]: { ...prev[taskId], isRunning: true, startedAt: Date.now(), stopped: false, hasStarted: true },
    }));
    apiPatch(`/api/tasks/${taskId}`, { timer_running: true, status: "in_process" }).catch(() => { });
    setTasks((prev) => prev.map((t) => t.id === taskId ? { ...t, status: "in_process" } : t));
  };

  // stopTimer: stops the timer but does NOT mark the task as complete.
  // Opens stop report modal so user can write a note about where they stopped.
  const stopTimer = (taskId: string) => {
    const currentTimer = taskTimers[taskId];
    const finalElapsed = currentTimer?.elapsedSeconds || 0;
    setTaskTimers((prev) => ({
      ...prev,
      [taskId]: { ...prev[taskId], isRunning: false, startedAt: null, stopped: true },
    }));
    // Save elapsed time to backend but DO NOT change status to complete
    apiPatch(`/api/tasks/${taskId}`, { timer_running: false, elapsed_seconds: finalElapsed, status: "in_process" }).catch(() => { });
    // Keep status as in_process
    setTasks((prev) => prev.map((t) => t.id === taskId ? { ...t, status: "in_process" } : t));
    // Open stop report modal
    setStopReportNote("");
    setStopReportModal({ taskId, elapsed: finalElapsed });
  };

  const submitStopReport = async () => {
    if (!stopReportModal) return;
    setStopReportSaving(true);
    try {
      await apiPost(`/api/tasks/${stopReportModal.taskId}/reports`, {
        elapsed_seconds: stopReportModal.elapsed,
        stop_note: stopReportNote.trim() || null,
      });
    } catch {
      // ignore if fails - note is optional
    } finally {
      setStopReportSaving(false);
      setStopReportModal(null);
      setStopReportNote("");
    }
  };

  const openReports = async (taskId: string, taskTitle: string) => {
    setReportsModal({ taskId, taskTitle });
    setReportsLoading(true);
    try {
      const data = await apiGet<{ items: TimerReport[] }>(`/api/tasks/${taskId}/reports`);
      setReportsData(data.items);
    } catch {
      setReportsData([]);
    } finally {
      setReportsLoading(false);
    }
  };

  // Removed pauseTimer - no longer needed

  const removeAttachment = async (attachmentId: string) => {
    const ok = window.confirm("Remove this attachment?");
    if (!ok) return;
    await apiDelete(`/api/files/${attachmentId}`);
    setTasks((prev) =>
      prev.map((t) => ({
        ...t,
        attachments: (t.attachments ?? []).filter((a) => String(a.id) !== String(attachmentId)),
      })),
    );
  };

  const canRemoveAttachment = (a: TaskAttachmentView) => {
    const uid = appUser?.id;
    if (uid == null) return false;
    if (a.uploadedBy == null) return false;
    return String(a.uploadedBy) === String(uid);
  };

  const reloadTasksFromServer = useCallback(async () => {
    try {
      const tRes = await apiGet<{ items: unknown[] }>(`/api/tasks?filter=${taskFilter}`);
      const nextTasks = tRes.items
        .filter((x): x is Record<string, unknown> => Boolean(x) && typeof x === "object")
        .map(mapTaskRow)
        .sort((a, b) => b.createdAt - a.createdAt);
      setTasks(nextTasks);
    } catch {
      /* ignore */
    }
  }, [taskFilter]);

  // Profile editing state
  const [editName, setEditName] = useState(appUser?.name ?? "");
  const [editAge, setEditAge] = useState(appUser?.age?.toString() ?? "");
  const [editBio, setEditBio] = useState(appUser?.bio ?? "");
  const [savingProfile, setSavingProfile] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  useEffect(() => {
    setEditName(appUser?.name ?? "");
    setEditAge(appUser?.age?.toString() ?? "");
    setEditBio(appUser?.bio ?? "");
  }, [appUser?.name, appUser?.age, appUser?.bio, appUser?.avatarUrl]);

  useEffect(() => {
    if (!appUser) return;

    if (isAdmin) {
      router.replace("/app");
      return;
    }

    apiGet<{ items: Array<{ id: string; email: string; name: string | null; avatarUrl?: string | null }> }>("/api/users")
      .then(res => setAllUsers(res.items || []))
      .catch(console.error);

    let cancelled = false;
    let lastNotifIds = new Set<string>();
    let firstLoadToastShown = false;

    const tick = async () => {
      try {
        const [tRes, nRes] = await Promise.all([
          apiGet<{ items: unknown[] }>(`/api/tasks?filter=${taskFilter}`),
          apiGet<{ items: unknown[] }>("/api/notifications"),
        ]);
        if (cancelled) return;

        const nextTasks = tRes.items
          .filter((x): x is Record<string, unknown> => Boolean(x) && typeof x === "object")
          .map(mapTaskRow);
        setTasks(nextTasks);

        const nextNotifs = nRes.items
          .filter((x): x is Record<string, unknown> => Boolean(x) && typeof x === "object")
          .map(mapNotifRow);
        setNotifs(nextNotifs);

        const nextIds = new Set(nextNotifs.map((n) => n.id));
        const added = nextNotifs.filter((n) => !lastNotifIds.has(n.id));
        lastNotifIds = nextIds;

        if (!firstLoadToastShown && nextNotifs.length) {
          firstLoadToastShown = true;
          const n = nextNotifs[0];
          const toastId = String(n.id);
          setToasts((prev) => {
            if (prev.some(t => t.id === toastId)) return prev;
            return [{ id: toastId, title: n.title, message: n.message }, ...prev].slice(0, 3);
          });
          window.setTimeout(() => {
            setToasts((prev) => prev.filter((x) => x.id !== toastId));
          }, 4500);
        } else if (added.length) {
          const addedToasts = added.slice(0, 3).map((n) => ({ id: String(n.id), title: n.title, message: n.message }));
          setToasts((prev) => {
            const uniqueAdded = addedToasts.filter(a => !prev.some(p => p.id === a.id));
            return [...uniqueAdded, ...prev].slice(0, 3);
          });
          for (const t of addedToasts) {
            window.setTimeout(() => {
              setToasts((prev) => prev.filter((x) => x.id !== t.id));
            }, 4500);
          }
        }
      } catch {
        // ignore
      }
    };

    void tick();
    const id = window.setInterval(tick, 2500);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [appUser, isAdmin, router, taskFilter]);

  const userTotals = useMemo(() => {
    const status = { in_process: 0, complete: 0, failed: 0 };
    const priorityCounts: Record<string, number> = { easy: 0, medium: 0, high: 0, very_high: 0, critical: 0 };
    let sumProgress = 0;
    for (const t of tasks) {
      if (t.status === "in_process") status.in_process++;
      if (t.status === "complete") status.complete++;
      if (t.status === "failed") status.failed++;
      priorityCounts[t.priority] = (priorityCounts[t.priority] ?? 0) + 1;
      sumProgress += t.progress;
    }
    const avgProgress = tasks.length ? Math.round(sumProgress / tasks.length) : 0;
    return { status, priorityCounts, avgProgress, total: tasks.length };
  }, [tasks]);

  const sidebar = (
    <div className="rounded-2xl border border-white/15 bg-white/5 p-3 backdrop-blur-xl">
      <div className="px-2 py-2">
        <div className="text-sm font-semibold text-white">User</div>
        <div className="mt-1 truncate text-xs text-white/60">{appUser?.email}</div>
      </div>
      <div className="mt-2 grid gap-2">
        {([
          ["dashboard", "Dashboard"],
          ["profile", "Profile"],
          ["my_tasks", "My tasks"],
          ["settings", "Settings"],
        ] as const).map(([k, label]) => (
          <button
            key={k}
            type="button"
            className={
              tab === k
                ? "rounded-xl bg-white px-3 py-2 text-left text-sm font-semibold text-black"
                : "rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-left text-sm text-white/85 hover:bg-white/10"
            }
            onClick={() => setTab(k)}
          >
            {label}
          </button>
        ))}
        <button
          type="button"
          className="rounded-xl border border-blue-500/30 bg-blue-500/10 px-3 py-2 text-left text-sm font-semibold text-blue-400 hover:bg-blue-500/20 shadow-[0_0_10px_rgba(59,130,246,0.1)] transition-colors flex items-center gap-2 mt-1"
          onClick={() => router.push("/work-packages")}
        >
          <span className="text-lg leading-none">📦</span> Work Packages (New UI)
        </button>
      </div>
      <div className="mt-4 pt-3 border-t border-white/10">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-white/60 mb-2 px-2">Community</div>
        <div className="grid gap-1">
          <button
            type="button"
            className={
              tab === "bulletin"
                ? "rounded-xl bg-blue-500/20 px-3 py-2 text-left text-sm font-semibold text-blue-400"
                : "rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-left text-sm text-white/85 hover:bg-white/10"
            }
            onClick={() => setTab("bulletin")}
          >
            <span className="mr-2">📋</span> Bulletin Board
          </button>
          <button
            type="button"
            className={
              tab === "confessions"
                ? "rounded-xl bg-blue-500/20 px-3 py-2 text-left text-sm font-semibold text-blue-400"
                : "rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-left text-sm text-white/85 hover:bg-white/10"
            }
            onClick={() => setTab("confessions")}
          >
            <span className="mr-2">💬</span> Confession Chat
          </button>
        </div>
      </div>
      {isAdmin && (
        <div className="mt-4 pt-3 border-t border-white/10">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-white/60 mb-2 px-2">Views</div>
          <div className="grid gap-1">
            {([
              ["recently_created", "Recently Created"],
              ["latest_activity", "Latest Activity"],
              ["overdue", "Overdue Tasks"],
              ["shared_with_users", "Shared with Users"],
              ["shared_with_me", "Shared with Me"],
            ] as const).map(([k, label]) => (
              <button
                key={k}
                type="button"
                className={
                  "w-full rounded-xl px-3 py-2 text-left text-[13px] font-medium transition-colors " +
                  (taskFilter === k
                    ? "bg-blue-500/20 text-blue-400"
                    : "text-white/85 hover:bg-white/10 hover:text-white")
                }
                onClick={() => {
                  setTaskFilter(k);
                  setTab("my_tasks");
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="mt-4 pt-4 border-t border-white/10">
        <button
          type="button"
          className="w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-left text-sm text-white/85 hover:bg-white/10"
          onClick={async () => {
            if (typeof window !== "undefined") sessionStorage.removeItem("tm_token");
            await apiPost("/api/auth/logout");
            router.replace("/login");
          }}
        >
          Logout
        </button>
      </div>
    </div>
  );

  const dashboardPanel = (
    <div className="grid gap-6">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-xl font-bold text-white">Dashboard</h2>
          <p className="mt-1 text-sm text-white/50">Your workload, progress, and what needs attention.</p>
        </div>
        <button
          type="button"
          onClick={() => setTab("my_tasks")}
          className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-white/70 hover:bg-white/10 hover:text-white transition-all"
        >
          View my tasks →
        </button>
      </div>

      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        {([
          { label: "In process", value: userTotals.status.in_process, cls: "from-sky-500/25 to-sky-500/5 border-sky-500/20" },
          { label: "Complete", value: userTotals.status.complete, cls: "from-emerald-500/25 to-emerald-500/5 border-emerald-500/20" },
          { label: "Pending", value: userTotals.status.failed, cls: "from-amber-500/25 to-amber-500/5 border-amber-500/20" },
          { label: "Avg progress", value: `${userTotals.avgProgress}%`, cls: "from-violet-500/25 to-violet-500/5 border-violet-500/20" },
        ] as const).map((kpi) => (
          <div key={kpi.label} className={`rounded-2xl border bg-gradient-to-b p-4 ${kpi.cls}`}>
            <div className="text-[11px] font-bold uppercase tracking-wider text-white/50">{kpi.label}</div>
            <div className="mt-2 text-3xl font-semibold text-white">{kpi.value}</div>
          </div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-base font-semibold text-white">Due soon</h3>
            <span className="text-xs text-white/45">{tasks.filter((t) => t.status !== "complete").length} open</span>
          </div>
          <div className="mt-4 grid gap-2">
            {tasks
              .filter((t) => t.status !== "complete")
              .slice()
              .sort((a, b) => (a.dueDate ?? Infinity) - (b.dueDate ?? Infinity))
              .slice(0, 5)
              .map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => { setTab("my_tasks"); setHighlightedTaskId(t.id); }}
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-left hover:bg-white/10 transition-all"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-white truncate">{t.title}</div>
                      <div className="mt-1 text-xs text-white/45">
                        {t.dueDate ? `Due ${new Date(t.dueDate).toLocaleDateString()}` : "No due date"}
                      </div>
                    </div>
                    <div className="text-xs font-bold text-white/60">{t.progress}%</div>
                  </div>
                  <div className="mt-2 h-1.5 w-full rounded-full bg-white/10 overflow-hidden">
                    <div className="h-1.5 bg-blue-400" style={{ width: `${t.progress}%` }} />
                  </div>
                </button>
              ))}
            {tasks.length === 0 ? (
              <div className="rounded-xl border border-white/10 bg-white/5 p-6 text-center text-sm text-white/40 italic">
                No tasks assigned.
              </div>
            ) : null}
          </div>
        </Card>

        <Card>
          <h3 className="text-base font-semibold text-white">By priority</h3>
          <div className="mt-4 grid gap-3">
            {([
              ["Easy", userTotals.priorityCounts.easy ?? 0, "bg-emerald-400"],
              ["Medium", userTotals.priorityCounts.medium ?? 0, "bg-sky-400"],
              ["High", userTotals.priorityCounts.high ?? 0, "bg-amber-400"],
              ["Very High", userTotals.priorityCounts.very_high ?? 0, "bg-orange-400"],
              ["Critical", userTotals.priorityCounts.critical ?? 0, "bg-rose-400"],
            ] as const).map(([label, v, cls]) => (
              <div key={label}>
                <div className="flex items-center justify-between text-sm text-white/80 mb-1.5">
                  <span>{label}</span>
                  <span className="text-white/60">{v}</span>
                </div>
                <div className="h-2 w-full rounded-full bg-white/10">
                  <div className={`h-2 rounded-full ${cls}`} style={{ width: `${userTotals.total ? Math.round((v / userTotals.total) * 100) : 0}%` }} />
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );

  const taskSummaryPanel = (
    <div className="space-y-6">
      <div className="rounded-[2.5rem] border border-white/[0.05] bg-[#161625]/80 p-8 backdrop-blur-3xl shadow-2xl overflow-hidden relative group">
        <div className="absolute top-0 right-0 p-8 opacity-[0.03] group-hover:opacity-[0.06] transition-opacity">
          <CheckCircle2 size={120} className="text-white" />
        </div>
        <div className="flex items-center justify-between mb-8 relative z-10">
          <h2 className="text-xl font-black text-white tracking-widest uppercase opacity-40">System Workload</h2>
          <span className="px-3 py-1 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400 text-[10px] font-black uppercase tracking-widest">
            {tasks.length} Active Operational Units
          </span>
        </div>
        <div className="grid gap-4 relative z-10">
          {tasks.slice(0, 5).map((t) => {
            const isComplete = t.status === "complete";
            const statusColor = isComplete ? "#10b981" : "#3b82f6";
            const statusText = isComplete ? "Operational" : "Synchronizing";
            return (
              <div key={t.id} className="group/item flex items-center justify-between p-4 rounded-2xl bg-white/[0.02] border border-white/[0.05] hover:bg-white/[0.05] hover:border-white/[0.1] transition-all">
                <div className="flex items-center gap-4 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-blue-600/10 flex items-center justify-center border border-blue-500/10 shrink-0">
                     <FileText size={16} className="text-blue-400" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-black text-white/90 truncate group-hover/item:text-blue-400 transition-colors">{t.title}</p>
                    <p className="text-[10px] text-white/20 font-bold uppercase tracking-widest mt-0.5">{t.projectName || "General Logistics"}</p>
                  </div>
                </div>
                <div className="flex items-center gap-6 shrink-0">
                  <div className="hidden md:block w-24 h-1.5 rounded-full bg-white/[0.05] overflow-hidden">
                    <div className="h-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]" style={{ width: `${t.progress}%` }} />
                  </div>
                  <span className="text-[9px] font-black uppercase tracking-widest px-3 py-1.5 rounded-lg border border-white/[0.05]" style={{ color: statusColor }}>{statusText}</span>
                </div>
              </div>
            );
          })}
          {tasks.length > 5 && (
            <button className="text-[11px] font-black text-white/20 hover:text-white transition-colors uppercase tracking-[0.2em] py-2">
              +{tasks.length - 5} More Parameters Available in Logistic Center
            </button>
          )}
        </div>
      </div>
    </div>
  );

  const profilePanel = (
    <div className="rounded-[2.5rem] border border-white/[0.05] bg-[#161625] p-10 backdrop-blur-3xl shadow-2xl relative overflow-hidden group">
      <div className="absolute top-0 right-0 p-10 opacity-[0.02] group-hover:opacity-[0.04] transition-opacity">
        <Users size={120} className="text-white" />
      </div>
      
      <div className="flex items-center justify-between mb-10 relative z-10">
        <h2 className="text-xl font-black text-white tracking-widest uppercase opacity-40">Personnel Profile</h2>
        <div className="text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded-xl bg-white/5 border border-white/10 text-white/50">
          Profile
        </div>
      </div>

      {/* Profile Picture */}
      <div className="mt-8 flex flex-col items-center gap-6 relative z-10">
        <div className="relative group/avatar">
          <div className="h-32 w-32 rounded-full p-1 bg-gradient-to-tr from-blue-600 via-purple-500 to-transparent shadow-2xl">
            {appUser?.avatarUrl ? (
              <img
                src={appUser.avatarUrl}
                alt="Profile"
                className="h-full w-full rounded-full object-cover border-4 border-[#161625]"
              />
            ) : (
              <div className="h-full w-full rounded-full bg-[#161625] flex items-center justify-center border-4 border-[#161625]">
                <Users size={48} className="text-white/20" />
              </div>
            )}
          </div>
          {uploadingAvatar && (
            <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/60 backdrop-blur-sm m-1">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
            </div>
          )}
          <label
            htmlFor="avatar-upload"
            className="absolute bottom-1 right-1 cursor-pointer rounded-2xl bg-blue-600 p-2.5 text-white shadow-xl hover:bg-blue-500 transition-all hover:scale-110 active:scale-95"
          >
            <Edit size={16} />
          </label>
        </div>
        <form
          className="hidden"
          onSubmit={async (e) => {
            e.preventDefault();
            const el = e.currentTarget.elements.namedItem("avatar") as HTMLInputElement | null;
            const f = el?.files?.[0] ?? null;
            if (!f) return;
            setUploadingAvatar(true);
            try {
              const fd = new FormData();
              fd.set("file", f);
              const res = await fetch("/api/auth/avatar", { method: "POST", credentials: "include", body: fd });
              if (!res.ok) throw new Error("Upload failed");
              await refreshSession();
              setToasts((prev) => [{ id: "avatar_saved", title: "Success", message: "Profile picture updated" }, ...prev].slice(0, 3));
              setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== "avatar_saved")), 3000);
            } catch (e) {
              setToasts((prev) => [{ id: "avatar_error", title: "Error", message: e instanceof Error ? e.message : "Failed to upload" }, ...prev].slice(0, 3));
              setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== "avatar_error")), 4000);
            } finally {
              setUploadingAvatar(false);
              if (el) el.value = "";
            }
          }}
        >
          <input
            name="avatar"
            type="file"
            id="avatar-upload"
            accept="image/*"
            onChange={(e) => e.currentTarget.form?.requestSubmit()}
          />
        </form>
        <div className="text-center">
           <h3 className="text-2xl font-black text-white tracking-tight">{appUser?.name || appUser?.email?.split('@')[0]}</h3>
           <p className="text-[11px] font-black text-white/20 uppercase tracking-[0.3em] mt-1">{appUser?.role || "Operational Unit"}</p>
        </div>
      </div>

      <div className="mt-12 grid gap-6 relative z-10 font-sans">
        {/* Editable Name Field */}
        <div className="grid gap-2">
          <label className="text-[10px] font-black text-white/30 uppercase tracking-widest px-1">Clearance Name</label>
          <input
            className="w-full rounded-2xl border border-white/[0.08] bg-black/20 px-5 py-3 text-[14px] text-white outline-none focus:border-blue-500/40 focus:ring-4 focus:ring-blue-500/[0.03] transition-all"
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            placeholder="System Identity"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
           {/* Editable Age Field */}
          <div className="grid gap-2">
            <label className="text-[10px] font-black text-white/30 uppercase tracking-widest px-1">Cycles (Age)</label>
            <input
              type="number"
              className="w-full rounded-2xl border border-white/[0.08] bg-black/20 px-5 py-3 text-[14px] text-white outline-none focus:border-blue-500/40 focus:ring-4 focus:ring-blue-500/[0.03] transition-all"
              value={editAge}
              onChange={(e) => setEditAge(e.target.value)}
              placeholder="0"
              min={1}
              max={120}
            />
          </div>
          
          <div className="grid gap-2">
            <label className="text-[10px] font-black text-white/30 uppercase tracking-widest px-1">Role</label>
            <div className="w-full rounded-2xl border border-white/[0.08] bg-white/[0.02] px-5 py-3 text-[12px] font-black text-white/70 uppercase tracking-widest flex items-center justify-between">
              {(appUser?.role || "user").toUpperCase()}
              <div className="w-2 h-2 rounded-full bg-blue-400 shadow-[0_0_8px_rgba(59,130,246,0.5)]" />
            </div>
          </div>
        </div>

        {/* Editable Bio Field */}
        <div className="grid gap-2">
          <label className="text-[10px] font-black text-white/30 uppercase tracking-widest px-1">Operational Bio</label>
          <textarea
            className="w-full rounded-2xl border border-white/[0.08] bg-black/20 px-5 py-4 text-[14px] text-white outline-none focus:border-blue-500/40 focus:ring-4 focus:ring-blue-500/[0.03] transition-all"
            value={editBio}
            onChange={(e) => setEditBio(e.target.value)}
            placeholder="Strategy and protocols..."
            rows={3}
          />
        </div>

        {/* Save Button */}
        <button
          type="button"
          disabled={savingProfile}
          className="mt-4 w-full rounded-[1.5rem] bg-blue-600 px-6 py-4.5 text-xs font-black text-white transition-all hover:bg-blue-500 hover:shadow-[0_15px_40px_rgba(37,99,235,0.4)] hover:scale-[1.02] active:scale-[0.98] disabled:opacity-30 uppercase tracking-[0.25em] shadow-xl"
          onClick={async () => {
            setSavingProfile(true);
            try {
              const ageNum = editAge ? Number(editAge) : null;
              await apiPatch("/api/auth/profile", {
                name: editName.trim() || null,
                age: ageNum && ageNum > 0 ? ageNum : null,
                bio: editBio.trim() || null,
              });
              await refreshSession();
              setToasts((prev) => [{ id: "profile_saved", title: "Success", message: "Profile updated successfully" }, ...prev].slice(0, 3));
              setTimeout(() => {
                setToasts((prev) => prev.filter((t) => t.id !== "profile_saved"));
              }, 3000);
            } catch (e) {
              setToasts((prev) => [{ id: "profile_error", title: "Error", message: e instanceof Error ? e.message : "Failed to update profile" }, ...prev].slice(0, 3));
              setTimeout(() => {
                setToasts((prev) => prev.filter((t) => t.id !== "profile_error"));
              }, 4000);
            } finally {
              setSavingProfile(false);
            }
          }}
        >
          {savingProfile ? "Writing Paramenters..." : "Commit Protocol"}
        </button>
      </div>
    </div>
  );

  const myTasksPanel = (
    <div className="umt-root h-full flex flex-col gap-4">
      <div className="flex items-center justify-between pb-1 border-b border-white/5">
        <h2 className="text-lg font-semibold text-white tracking-tight">My tasks</h2>
        <div className="flex items-center gap-2 text-xs text-white/60">
          <span className="inline-flex h-6 items-center rounded-full border border-white/15 bg-white/5 px-3 font-medium text-white/70">
            {tasks.length} assigned
          </span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto pr-1 space-y-3">
        {tasks.length ? (
          tasks.map((t) => {
            const isBlocked = String(t.status) === "blocked";
            const isNotStarted = String(t.status) === "not_started";
            const isLate = t.dueDate && Date.now() > t.dueDate && t.status !== "complete" && !isBlocked;
            const isComplete = t.status === "complete";
            const isReadOnly = isBlocked || isNotStarted;
            const statusColor = isComplete ? "#22c55e" : isBlocked ? "#f97316" : isNotStarted ? "#94a3b8" : isLate ? "#ef4444" : "#3b82f6";
            const statusText = isComplete ? "Turned in" : isBlocked ? "Blocked" : isNotStarted ? "Not started" : isLate ? "Missing" : "Assigned";

            return (
              <div
                key={t.id}
                id={`task-card-${t.id}`}
                className={`umt-task-card relative overflow-hidden rounded-2xl border transition-all ${
                  isBlocked
                    ? "umt-task-card--blocked border-orange-500/40 bg-gradient-to-r from-[#1c1c24] to-[#24130b]"
                    : "border-white/8 bg-gradient-to-r from-[#14141f] to-[#101018] hover:from-[#171724] hover:to-[#11111a]"
                } ${highlightedTaskId === t.id
                    ? "ring-2 ring-blue-500/60 shadow-[0_18px_45px_rgba(37,99,235,0.45)]"
                    : "shadow-[0_18px_45px_rgba(0,0,0,0.75)]"
                  }`}
              >
                {/* Colored left border */}
                <div
                  className="absolute left-0 top-0 h-full w-1.5"
                  style={{ backgroundColor: statusColor }}
                />

                <div className="px-5 py-4">
                  {/* Header: Department, Status, and Expansion Toggle */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex flex-col gap-1">
                      <span className="inline-flex items-center gap-2 text-[11px] font-medium text-white/60 uppercase tracking-wide">
                        {(t.department ?? "other").replace("_", " ")}
                        <span className="rounded-full border border-white/10 bg-black/40 px-2 py-0.5 text-[10px] font-semibold text-white/70">
                          #{t.id}
                        </span>
                      </span>
                      {String(t.assignedTo) !== String(appUser?.id) && (
                        <span className="ml-1 text-[9px] font-bold uppercase tracking-wider text-blue-400 bg-blue-500/10 px-1.5 py-0.5 rounded-full border border-blue-500/20 shadow-[0_0_10px_rgba(59,130,246,0.2)]">
                          Shared With Me
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 pl-3">
                      {/* Summary Icons (visible only when folded) */}
                      {!expandedTasks.has(t.id) && (
                        <div className="flex items-center gap-3 text-white/40 border-r border-white/10 pr-3 mr-1">
                          {t.checklist && t.checklist.length > 0 && (
                            <div className="flex items-center gap-1.5" title={`${t.checklist.filter(c => c.done).length}/${t.checklist.length} subtasks done`}>
                              <span className="text-xs">☑</span>
                              <span className="text-xs font-mono">{t.checklist.filter(c => c.done).length}/{t.checklist.length}</span>
                            </div>
                          )}
                          {t.attachments && t.attachments.length > 0 && (
                            <div className="flex items-center gap-1" title={`${t.attachments.length} attachments`}>
                              <span className="text-xs">📎</span>
                              <span className="text-xs font-mono">{t.attachments.length}</span>
                            </div>
                          )}
                          {t.comments && t.comments.length > 0 && (
                            <div className="flex items-center gap-1.5" title={`${t.comments.length} comments`}>
                              <span className="text-xs">💬</span>
                              <span className="text-xs font-mono">{t.comments.length}</span>
                            </div>
                          )}
                        </div>
                      )}
                      <span
                        className="rounded-full px-3 py-1 text-[11px] font-medium shadow-sm"
                        style={{
                          backgroundColor: `${statusColor}20`,
                          color: statusColor,
                        }}
                      >
                        {statusText}
                      </span>
                      <button
                        onClick={() => { if (!isBlocked) toggleTaskExpansion(t.id); }}
                        disabled={isBlocked}
                        className="flex h-8 w-8 items-center justify-center rounded-full bg-white/5 text-white/60 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-40 disabled:hover:bg-white/5 disabled:cursor-not-allowed"
                        title={isBlocked ? "Blocked tasks can’t be opened" : expandedTasks.has(t.id) ? "Show summary" : "Show details"}
                      >
                        <svg
                          className={`h-5 w-5 transition-transform duration-300 ${expandedTasks.has(t.id) ? "rotate-180" : ""}`}
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>
                    </div>
                  </div>

                  {/* Title */}
                  <h3 className="mt-3 text-base font-semibold text-white leading-snug">
                    {t.title}
                  </h3>
                  {t.projectName ? (
                    <p className="mt-1.5 text-xs font-medium text-blue-400/90">Project: {t.projectName}</p>
                  ) : null}

                  {/* Task Content: Folded vs Expanded */}
                  {!expandedTasks.has(t.id) ? (
                    /* Folded View: Simple Summary */
                    <div className="mt-2 space-y-2">
                      {t.description && (
                        <p className="text-sm text-white/50 line-clamp-1 italic">
                          {t.description}
                        </p>
                      )}
                      <div className="flex items-center justify-between pt-1">
                        <div className="flex items-center gap-4 text-[11px] text-white/55">
                          <span className="flex items-center gap-1.5">
                            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                            {t.dueDate ? new Date(t.dueDate).toLocaleDateString() : "No due date"}
                          </span>
                          <div className="flex items-center gap-2">
                            <div className="w-20 h-1.5 rounded-full bg-white/10">
                              <div className="h-1.5 rounded-full bg-blue-500" style={{ width: `${t.progress}%` }} />
                            </div>
                            <span className="tabular-nums">{t.progress}%</span>
                          </div>
                        </div>
                        {isBlocked ? (
                          <span className="text-xs font-medium text-orange-300/80">Blocked — ask admin to unblock</span>
                        ) : (
                          <button
                            onClick={() => toggleTaskExpansion(t.id)}
                            className="text-xs font-medium text-blue-400 hover:underline"
                          >
                            View details
                          </button>
                        )}
                      </div>
                    </div>
                  ) : (
                    /* Expanded View: Rich Details (matches Admin experience) */
                    <div className="mt-4 animate-in fade-in slide-in-from-top-2 duration-300">
                      {t.description && (
                        <div className="mb-4 rounded-lg bg-white/5 p-3">
                          <h4 className="mb-1 text-xs font-medium uppercase tracking-wider text-white/40">Description</h4>
                          <p className="text-sm leading-relaxed text-white/80">{t.description}</p>
                        </div>
                      )}

                      {/* Progress — user-adjustable */}
                      <div className="mb-4">
                        <div className="mb-1.5 flex items-center justify-between text-xs font-medium">
                          <span className="text-white/40">COMPLETION PROGRESS</span>
                          <span className="text-white tabular-nums">{t.progress}%</span>
                        </div>
                        <input
                          type="range"
                          min={0}
                          max={100}
                          value={t.progress}
                          disabled={isComplete || isReadOnly}
                          onChange={(e) => {
                            const v = Math.max(0, Math.min(100, Number(e.target.value)));
                            setTasks((prev) => prev.map((x) => (x.id === t.id ? { ...x, progress: v } : x)));
                            const cur = progressDebounceRef.current[t.id];
                            if (cur) window.clearTimeout(cur);
                            progressDebounceRef.current[t.id] = window.setTimeout(async () => {
                              try {
                                await apiPatch(`/api/tasks/${t.id}`, { progress: v });
                                setToasts((prev) =>
                                  [{ id: `prog_ok_${t.id}`, title: "Progress updated", message: `Saved at ${v}%` }, ...prev].slice(0, 3),
                                );
                                window.setTimeout(() => {
                                  setToasts((prev) => prev.filter((x) => x.id !== `prog_ok_${t.id}`));
                                }, 2200);
                              } catch (err) {
                                const msg = err instanceof Error ? err.message : "Could not save progress";
                                setToasts((prev) => [{ id: `prog_err_${t.id}`, title: "Error", message: msg }, ...prev].slice(0, 3));
                                void reloadTasksFromServer();
                              }
                            }, 450);
                          }}
                          className="mt-1 h-2 w-full cursor-pointer appearance-none rounded-full bg-white/10 accent-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
                        />
                      </div>

                      {/* Metadata Grid */}
                      <div className="mb-6 grid grid-cols-2 gap-4">
                        <div className="rounded-lg border border-white/5 bg-white/5 p-2.5">
                          <span className="mb-1 block text-[10px] font-semibold uppercase text-white/30">Assigned To</span>
                          <div className="flex items-center gap-2">
                            {(() => {
                              const u = allUsers.find((x) => String(x.id) === String(t.assignedTo));
                              const label =
                                t.assignedToName?.trim() ||
                                u?.name?.trim() ||
                                (t.assignedToEmail || u?.email || "").split("@")[0] ||
                                "Assignee";
                              const email = t.assignedToEmail || u?.email || "";
                              const av =
                                t.assignedToAvatarUrl ||
                                u?.avatarUrl ||
                                (String(t.assignedTo) === String(appUser?.id) ? appUser?.avatarUrl : null);
                              return (
                                <>
                                  {av ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img src={av} alt="" className="h-8 w-8 rounded-full object-cover border border-white/10" />
                                  ) : (
                                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-500/20 text-[10px] font-bold text-blue-400">
                                      {label.slice(0, 2).toUpperCase()}
                                    </div>
                                  )}
                                  <div className="min-w-0">
                                    <div className="truncate text-xs font-medium text-white/90">{label}</div>
                                    {email ? (
                                      <div className="truncate text-[10px] text-white/50">{email}</div>
                                    ) : null}
                                  </div>
                                </>
                              );
                            })()}
                          </div>
                        </div>
                        <div className="rounded-lg border border-white/5 bg-white/5 p-2.5">
                          <span className="mb-1 block text-[10px] font-semibold uppercase text-white/30">Due Date</span>
                          <div className="flex items-center gap-2">
                            <svg className="h-4 w-4 text-white/30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                            <span className={`text-xs font-medium ${isLate && !isComplete ? "text-red-400" : "text-white/80"}`}>
                              {t.dueDate ? new Date(t.dueDate).toLocaleString() : "No deadline"}
                              {isLate && !isComplete && " (Late)"}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Recorded time for completed tasks */}
                      {isComplete && Boolean(t.elapsedSeconds || taskTimers[t.id]?.elapsedSeconds) && (
                        <div className="mb-4 flex items-center gap-2 rounded-lg bg-green-500/10 px-3 py-2 text-sm text-green-400 border border-green-500/20">
                          <svg className="h-4 w-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          <span className="font-medium">
                            Time recorded: {formatTime(t.elapsedSeconds || taskTimers[t.id]?.elapsedSeconds || 0)}
                          </span>
                        </div>
                      )}

                      {/* Status */}
                      <div className="mb-6 max-w-xl">
                        <div>
                          <label className="mb-2 block text-xs font-medium uppercase tracking-wider text-white/40">Change Status</label>
                          <select
                            value={t.status === "complete" ? "complete" : taskTimers[t.id]?.isRunning ? "in_process" : "pending"}
                            onChange={async (e) => {
                              try {
                                const selectedValue = e.target.value;
                                if (selectedValue === "pending" && taskTimers[t.id]?.isRunning) return;
                                const newStatus = selectedValue as TaskStatus | "pending";
                                const newProgress = newStatus === "complete" ? 100 : t.progress;
                                if (newStatus === "complete") {
                                  setTaskTimers((prev) => ({
                                    ...prev,
                                    [t.id]: { ...prev[t.id], isRunning: false, stopped: false },
                                  }));
                                }
                                const updated = newStatus === "complete"
                                  ? t.checklist?.map((c) => ({ ...c, done: true }))
                                  : newStatus === "in_process" && t.status === "complete"
                                    ? t.checklist?.map((c) => ({ ...c, done: false }))
                                    : t.checklist;
                                await apiPatch(`/api/tasks/${t.id}`, { status: newStatus === "pending" ? "in_process" : newStatus, progress: newProgress, checklist: updated });
                              } catch (err) {
                                const msg = err instanceof Error ? err.message : "Failed to update status";
                                setToasts((prev) => [{ id: `status_error_${t.id}`, title: "Error", message: msg }, ...prev].slice(0, 3));
                                setTimeout(() => setToasts((prev) => prev.filter((x) => x.id !== `status_error_${t.id}`)), 4000);
                              }
                            }}
                            disabled={t.status === "complete" || isReadOnly}
                            className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white outline-none transition-all focus:border-blue-500/50 focus:bg-white/10 disabled:opacity-50"
                            style={{ colorScheme: "dark" }}
                          >
                            <option
                              value="pending"
                              className="bg-[#1a1a2e]"
                              disabled={taskTimers[t.id]?.isRunning}
                            >
                              {taskTimers[t.id]?.isRunning ? "Pending (cannot select while working)" : "Pending (Not started)"}
                            </option>
                            <option value="in_process" className="bg-[#1a1a2e]">In Progress (Working)</option>
                            <option value="complete" className="bg-[#1a1a2e]">Complete</option>
                          </select>
                        </div>
                      </div>
                      {/* Work Timer */}
                      {t.status !== "complete" && (
                        <div className="mt-4 rounded-xl border border-white/10 bg-white/5 p-4">
                          <div className="flex items-center justify-between mb-3">
                            <span className="text-xs font-medium text-white/40 uppercase tracking-wider">Work Timer</span>
                            <span className="text-xl font-mono font-bold text-white">
                              {formatTime(taskTimers[t.id]?.elapsedSeconds || 0)}
                            </span>
                          </div>
                          {/* Status badge */}
                          <div className="mb-4">
                            {taskTimers[t.id]?.isRunning ? (
                              <span className="inline-flex items-center gap-2 text-xs font-semibold text-blue-400 bg-blue-400/10 px-2 py-1 rounded">
                                <span className="h-1.5 w-1.5 rounded-full bg-blue-400 animate-pulse" />
                                IN PROGRESS
                              </span>
                            ) : taskTimers[t.id]?.stopped ? (
                              <span className="inline-flex items-center gap-2 text-xs font-semibold text-amber-400 bg-amber-400/10 px-2 py-1 rounded">
                                <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
                                STOPPED — Click Resume or Mark as Done
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-2 text-xs font-semibold text-white/30 bg-white/5 px-2 py-1 rounded">
                                <span className="h-1.5 w-1.5 rounded-full bg-white/30" />
                                PENDING — Click Start to begin
                              </span>
                            )}
                          </div>
                          {/* Timer controls */}
                          {(() => {
                            const isRunning = taskTimers[t.id]?.isRunning;
                            const isStopped = taskTimers[t.id]?.stopped;
                            const hasStarted = taskTimers[t.id]?.hasStarted;
                            return (
                              <div className="flex items-center gap-3 flex-wrap">
                                {!hasStarted && !isRunning && (
                                  <button
                                    type="button"
                                    onClick={() => startTimer(t.id)}
                                    className="flex items-center gap-2 rounded-lg bg-green-500 px-4 py-2 text-sm font-bold text-white transition-all hover:bg-green-600 shadow-lg shadow-green-500/20"
                                  >
                                    <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
                                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
                                    </svg>
                                    Start Timer
                                  </button>
                                )}
                                {isRunning && (
                                  <button
                                    type="button"
                                    onClick={() => stopTimer(t.id)}
                                    className="flex items-center gap-2 rounded-lg bg-red-500 px-4 py-2 text-sm font-bold text-white transition-all hover:bg-red-600 shadow-lg shadow-red-500/20"
                                  >
                                    <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
                                      <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zM7 8a1 1 0 011-1h4a1 1 0 110 2H8a1 1 0 01-1-1z" clipRule="evenodd" />
                                    </svg>
                                    Stop Timer
                                  </button>
                                )}
                                {isStopped && !isRunning && (
                                  <button
                                    type="button"
                                    onClick={() => startTimer(t.id)}
                                    className="flex items-center gap-2 rounded-lg bg-blue-500 px-4 py-2 text-sm font-bold text-white transition-all hover:bg-blue-600 shadow-lg shadow-blue-500/20"
                                  >
                                    <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
                                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
                                    </svg>
                                    Resume Work
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={() => void openReports(t.id, t.title)}
                                  className="ml-auto flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold text-white/60 transition-all hover:bg-white/10 hover:text-white"
                                >
                                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                  </svg>
                                  Reports
                                </button>
                              </div>
                            );
                          })()}
                          {taskTimers[t.id]?.stopped && (
                            <p className="mt-3 text-xs text-amber-400/90 bg-amber-400/10 rounded-lg p-3 border border-amber-400/20">
                              <span className="font-bold mr-1">NOTE:</span> Timer is paused. You can still attach files to the task and subtasks below.
                            </p>
                          )}
                        </div>
                      )}

                      {/* Subtasks Section */}
                      {t.checklist?.length ? (
                        <div className="mt-6">
                          <div className="mb-3 flex items-center justify-between">
                            <h4 className="text-xs font-bold uppercase tracking-wider text-white/40">Subtasks</h4>
                            <span className="text-xs font-medium text-blue-400">
                              {t.checklist.filter((c) => c.done).length}/{t.checklist.length} Complete
                            </span>
                          </div>
                          <div className="grid gap-2">
                            {t.checklist.map((item) => {
                              const itemAttachments = t.attachments?.filter(
                                (a) => a.checklistItemId === Number(item.id)
                              ) ?? [];
                              return (
                                <div key={item.id} className="group rounded-xl border border-white/5 bg-white/5 p-3 transition-all hover:bg-white/10">
                                  <div className="flex items-start justify-between gap-3">
                                    <label className={`flex flex-1 items-start gap-3 ${t.status === "complete" ? "cursor-default" : "cursor-pointer"}`}>
                                      <div className="relative flex items-center">
                                        <input
                                          type="checkbox"
                                          checked={item.done}
                                          disabled={t.status === "complete"}
                                          onChange={async () => {
                                            const updated = t.checklist?.map((c) =>
                                              c.id === item.id ? { ...c, done: !c.done } : c
                                            );
                                            const completedCount = updated?.filter((c) => c.done).length ?? 0;
                                            const totalCount = updated?.length ?? 1;
                                            const newProgress = Math.round((completedCount / totalCount) * 100);
                                            await apiPatch(`/api/tasks/${t.id}`, { checklist: updated, progress: newProgress });
                                          }}
                                          className="h-5 w-5 rounded-md border-white/20 bg-white/10 text-blue-500 checked:bg-blue-500 focus:ring-blue-500 focus:ring-offset-0 disabled:opacity-50"
                                        />
                                      </div>
                                      <span className={`text-sm font-medium leading-relaxed transition-all ${item.done ? "text-white/30 line-through" : "text-white/80"}`}>
                                        {item.text}
                                      </span>
                                    </label>

                                    {/* Subtask file upload */}
                                    {t.status !== "complete" && !isReadOnly && (
                                      <div className="flex items-center">
                                        <input
                                          name={`subtask_file_${t.id}_${item.id}`}
                                          type="file"
                                          id={`subtask_file_${t.id}_${item.id}`}
                                          className="hidden"
                                          onChange={async (e) => {
                                            const f = e.target.files?.[0];
                                            if (!f) return;
                                            const fd = new FormData();
                                            fd.set("taskId", String(t.id));
                                            fd.set("checklistItemId", item.id);
                                            fd.set("file", f);
                                            try {
                                              const r = await fetch("/api/files", { method: "POST", credentials: "include", body: fd });
                                              if (!r.ok) throw new Error("Upload failed");
                                              setToasts((prev) =>
                                                [{ id: `up_${t.id}_${item.id}`, title: "File uploaded", message: f.name }, ...prev].slice(0, 3),
                                              );
                                              window.setTimeout(() => {
                                                setToasts((prev) => prev.filter((x) => x.id !== `up_${t.id}_${item.id}`));
                                              }, 2500);
                                              await reloadTasksFromServer();
                                            } catch {
                                              setToasts((prev) =>
                                                [{ id: `up_err_${t.id}`, title: "Upload failed", message: "Try again" }, ...prev].slice(0, 3),
                                              );
                                            }
                                            e.target.value = "";
                                          }}
                                        />
                                        <label
                                          htmlFor={`subtask_file_${t.id}_${item.id}`}
                                          className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg bg-white/5 text-white/40 transition-colors hover:bg-white/20 hover:text-white"
                                          title="Add work to this subtask"
                                        >
                                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                          </svg>
                                        </label>
                                      </div>
                                    )}
                                  </div>

                                  {/* Subtask Attachments Area */}
                                  {itemAttachments.length > 0 && (
                                    <div className="mt-3 flex flex-wrap gap-2 pl-8">
                                      {itemAttachments.map((a) => (
                                        <div
                                          key={a.id}
                                          className="flex items-center gap-2 rounded-lg bg-white/5 py-1.5 pl-2.5 pr-1.5 text-[10px] font-medium text-white/70 border border-white/10 hover:bg-white/10 transition-colors"
                                        >
                                          <a href={a.url} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 truncate max-w-[120px]">
                                            <span className="text-blue-400">📎</span>
                                            {a.name}
                                          </a>
                                          {canRemoveAttachment(a) && (
                                            <button
                                              type="button"
                                              className="flex h-5 w-5 items-center justify-center rounded-md hover:bg-red-500/20 hover:text-red-400 transition-colors"
                                              onClick={() => void removeAttachment(String(a.id))}
                                            >
                                              ✕
                                            </button>
                                          )}
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ) : null}

                      {/* Main Attachments Section */}
                      {(() => {
                        const mainAttachments =
                          t.attachments?.filter((a) => a.checklistItemId == null || Number(a.checklistItemId) === 0) ?? [];
                        const showUpload = t.status !== "complete" && !isReadOnly;
                        if (!mainAttachments.length && !showUpload && t.status !== "complete") return null;

                        return (
                          <div className="mt-8 border-t border-white/5 pt-6">
                            <h4 className="mb-4 text-xs font-bold uppercase tracking-wider text-white/40">Task Attachments</h4>
                            <p className="mb-3 text-[11px] text-white/45">
                              Open files from your team or admin below. You can add your own files anytime the task is open for editing.
                            </p>

                            {mainAttachments.length > 0 && (
                              <div className="mb-4 grid gap-3 grid-cols-1 sm:grid-cols-2">
                                {mainAttachments.map((a: TaskAttachmentView) => (
                                  <div
                                    key={a.id}
                                    className="flex items-center justify-between rounded-xl border border-white/5 bg-white/5 p-3 transition-all hover:bg-white/10"
                                  >
                                    <a href={a.url} target="_blank" rel="noreferrer" className="flex items-center gap-3 overflow-hidden">
                                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500/10 text-blue-400">
                                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                                        </svg>
                                      </div>
                                      <div className="overflow-hidden">
                                        <div className="truncate text-sm font-medium text-white/90">{a.name}</div>
                                        <div className="text-[10px] text-white/40 uppercase tracking-tighter">Attachment</div>
                                      </div>
                                    </a>
                                    {canRemoveAttachment(a) && (
                                      <button
                                        type="button"
                                        className="flex h-8 w-8 items-center justify-center rounded-lg text-white/30 transition-colors hover:bg-red-500/20 hover:text-red-400"
                                        onClick={() => void removeAttachment(String(a.id))}
                                      >
                                        ✕
                                      </button>
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}

                            {showUpload && (
                              <div className="mt-4">
                                <input
                                  name={`file_${t.id}`}
                                  type="file"
                                  id={`file_${t.id}`}
                                  className="hidden"
                                  onChange={async (e) => {
                                    const f = e.target.files?.[0];
                                    if (!f) return;
                                    const fd = new FormData();
                                    fd.set("taskId", String(t.id));
                                    fd.set("file", f);
                                    try {
                                      const r = await fetch("/api/files", { method: "POST", credentials: "include", body: fd });
                                      if (!r.ok) throw new Error("Upload failed");
                                      setToasts((prev) =>
                                        [{ id: `up_main_${t.id}`, title: "File uploaded", message: f.name }, ...prev].slice(0, 3),
                                      );
                                      window.setTimeout(() => {
                                        setToasts((prev) => prev.filter((x) => x.id !== `up_main_${t.id}`));
                                      }, 2500);
                                      await reloadTasksFromServer();
                                    } catch {
                                      setToasts((prev) =>
                                        [{ id: `up_main_err_${t.id}`, title: "Upload failed", message: "Try again" }, ...prev].slice(0, 3),
                                      );
                                    }
                                    e.target.value = "";
                                  }}
                                />
                                <label
                                  htmlFor={`file_${t.id}`}
                                  className="flex w-full cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-white/10 bg-white/5 py-8 transition-all hover:border-blue-500/30 hover:bg-white/10"
                                >
                                  <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-blue-500/10 text-blue-400">
                                    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                    </svg>
                                  </div>
                                  <span className="text-sm font-bold text-white/90">Click to upload work</span>
                                  <span className="text-xs text-white/30">Adds to this task (visible to your team)</span>
                                </label>
                              </div>
                            )}

                            {t.status === "complete" ? (
                              <div className="mt-4 flex items-center gap-3 rounded-xl bg-green-500/10 p-4 border border-green-500/20">
                                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-500/20 text-green-400">
                                  <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                  </svg>
                                </div>
                                <div>
                                  <div className="text-sm font-bold text-green-400">Task Turned In</div>
                                  <div className="text-xs text-green-400/60">Attachments are read-only until you unsubmit.</div>
                                </div>
                              </div>
                            ) : null}
                          </div>
                        );
                      })()}

                      {/* Final Action Buttons (Mark as done / Unmark) */}
                      <div className="mt-8 flex gap-3">
                        {t.status === "complete" ? (
                          <button
                            type="button"
                            className="flex-1 flex items-center justify-center gap-3 rounded-xl bg-amber-500/10 py-4 text-sm font-bold text-amber-400 transition-all hover:bg-amber-500/20 border border-amber-500/20"
                            onClick={async () => {
                              const savedElapsed = taskTimers[t.id]?.elapsedSeconds || t.elapsedSeconds || 0;
                              const updated = t.checklist?.map((c) => ({ ...c, done: false }));
                              setTaskTimers((prev) => ({
                                ...prev,
                                [t.id]: { ...prev[t.id], isRunning: false, stopped: savedElapsed > 0, hasStarted: savedElapsed > 0, elapsedSeconds: savedElapsed },
                              }));
                              await apiPatch(`/api/tasks/${t.id}`, { status: "in_process", progress: 0, checklist: updated, elapsed_seconds: savedElapsed, timer_running: false });
                              setTasks((prev) => prev.map((task) => task.id === t.id ? { ...task, status: "in_process", progress: 0, elapsedSeconds: savedElapsed } : task));
                            }}
                          >
                            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                            </svg>
                            UNMARK AS DONE
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="flex-1 flex items-center justify-center gap-3 rounded-xl bg-green-500 py-4 text-sm font-bold text-white transition-all hover:bg-green-600 shadow-xl shadow-green-500/30"
                            onClick={async () => {
                              const elapsed = taskTimers[t.id]?.elapsedSeconds || t.elapsedSeconds || 0;
                              const hours = Math.floor(elapsed / 3600);
                              const mins = Math.floor((elapsed % 3600) / 60);
                              const secs = elapsed % 60;
                              const timeString = elapsed > 0 ? `${hours}h ${mins}m ${secs}s` : "No time tracked";
                              const confirmMessage = elapsed > 0
                                ? `Total time tracked: ${timeString}\n\nMark this task as complete?`
                                : "No time was tracked. Mark this task as complete anyway?";
                              if (window.confirm(confirmMessage)) {
                                setTaskTimers((prev) => ({
                                  ...prev,
                                  [t.id]: { ...prev[t.id], isRunning: false, stopped: false },
                                }));
                                const updated = t.checklist?.map((c) => ({ ...c, done: true }));
                                await apiPatch(`/api/tasks/${t.id}`, { status: "complete", progress: 100, checklist: updated, timer_running: false, elapsed_seconds: elapsed });
                                setTasks((prev) => prev.map((task) => task.id === t.id ? { ...task, status: "complete", progress: 100 } : task));
                              }
                            }}
                          >
                            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                            MARK AS DONE
                          </button>
                        )}
                      </div>

                      {/* Messenger Chat Section */}
                      <div className="mt-8">
                        <div className="mb-4 flex items-center justify-between">
                          <h4 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-white/40">
                            <span className="flex h-2 w-2 rounded-full bg-blue-500" />
                            Task Conversation
                          </h4>
                          <span className="text-[10px] font-bold text-white/30 uppercase tracking-widest">{t.comments?.length || 0} MESSAGES</span>
                        </div>
                        <div className="rounded-2xl border border-white/5 bg-[#0b0b14] p-4">
                          {/* Chat Messages */}
                          <div className="max-h-[400px] overflow-y-auto space-y-4 mb-4 scrollbar-thin pr-1">
                            {t.comments && t.comments.length > 0 ? (
                              (() => {
                                let lastDate: string | null = null;
                                return t.comments.map((comment, index) => {
                                  const currentUserId = appUser?.id;
                                  const isMe = String(comment.createdBy) === String(currentUserId);
                                  const commentDate = new Date(comment.createdAt).toLocaleDateString();
                                  const showDate = commentDate !== lastDate;
                                  lastDate = commentDate;
                                  const prevComment = index > 0 ? t.comments?.[index - 1] : null;
                                  const showSender = !prevComment || prevComment.createdBy !== comment.createdBy;

                                  return (
                                    <div key={comment.id}>
                                      {showDate && (
                                        <div className="flex justify-center my-4">
                                          <span className="text-[10px] font-bold text-white/20 uppercase tracking-widest">
                                            {new Date(comment.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                          </span>
                                        </div>
                                      )}
                                      <div className={`flex ${isMe ? 'justify-end' : 'justify-start'} mb-1`}>
                                        <div className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} max-w-[85%]`}>
                                          {!isMe && showSender && (
                                            <span className="text-[10px] font-bold text-white/30 mb-1 ml-2 uppercase tracking-tight">{comment.createdByEmail?.split('@')[0] || "Unknown"}</span>
                                          )}

                                          <div className={`flex items-center gap-2 w-full ${isMe ? 'flex-row-reverse' : 'flex-row'}`}>
                                            <div className={`relative group text-sm leading-relaxed flex flex-col ${isMe ? 'bg-blue-600 text-white' : 'bg-white/5 text-white/80'
                                              } ${isMe ? 'rounded-l-2xl rounded-tr-2xl rounded-br-sm' : 'rounded-r-2xl rounded-tl-2xl rounded-bl-sm'
                                              } ${comment.attachments?.length && (!comment.text || comment.text.match(/attachment|📎/i)) ? 'p-1' : 'px-4 py-3 shadow-sm border border-white/5'}`}>

                                              {/* Parent comment preview */}
                                              {comment.parentId && t.comments?.find(c => c.id === comment.parentId) && (
                                                <div className="mb-2 bg-black/20 rounded pl-2.5 py-1.5 text-[10px] border-l-2 border-white/30">
                                                  <div className="text-white/60 font-semibold mb-0.5">{t.comments.find(c => c.id === comment.parentId)?.createdByEmail?.split('@')[0] || "User"}</div>
                                                  <div className="text-white/80 line-clamp-1">{t.comments.find(c => c.id === comment.parentId)?.text || "📎 Attachment"}</div>
                                                </div>
                                              )}

                                              {/* Message Content */}
                                              {comment.text && !comment.text.match(/attachment/i) && !comment.text.match(/📎/) && (
                                                <div className="whitespace-pre-wrap">{comment.text}</div>
                                              )}

                                              {/* Attachments */}
                                              {comment.attachments && comment.attachments.length > 0 && (
                                                <div className={`flex flex-col gap-2 ${comment.text && !comment.text.match(/attachment|📎/i) ? "mt-3 pt-3 border-t border-white/10" : ""}`}>
                                                  {comment.attachments.map((att) => {
                                                    const isImage = att.contentType?.startsWith("image/") || (att.url && att.url.match(/\.(jpeg|jpg|gif|png|webp)(?:$|\?)/i));
                                                    if (isImage) {
                                                      return (
                                                        <img
                                                          key={att.id}
                                                          src={att.url}
                                                          alt={att.name}
                                                          className="max-w-full rounded-lg h-auto object-contain cursor-pointer transition hover:scale-[1.02]"
                                                          onClick={() => setFullscreenMedia({ url: att.url, type: 'image', name: att.name })}
                                                        />
                                                      );
                                                    }
                                                    return (
                                                      <a key={att.id} href={att.url} download target="_blank" rel="noreferrer" className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/10 hover:bg-white/20 transition-colors text-xs">
                                                        <span>📎</span>
                                                        <span className="truncate">{att.name}</span>
                                                      </a>
                                                    );
                                                  })}
                                                </div>
                                              )}
                                            </div>

                                            {/* Chat Message Menu */}
                                            <div className="flex items-center relative">
                                              <button
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  setMsgMenuCommentId(msgMenuCommentId === comment.id ? null : comment.id);
                                                }}
                                                className="p-1.5 rounded-full hover:bg-white/5 text-white/20 hover:text-white transition-all opacity-0 group-hover:opacity-100"
                                              >
                                                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                                                  <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
                                                </svg>
                                              </button>

                                              {msgMenuCommentId === comment.id && (
                                                <div
                                                  className={`absolute mb-1 ${isMe ? 'right-full mr-1' : 'left-full ml-1'} bottom-0 w-36 rounded-xl border border-white/10 bg-[#161625] shadow-2xl z-50 overflow-hidden py-1 animate-in fade-in zoom-in duration-200`}
                                                  onClick={(e) => e.stopPropagation()}
                                                >
                                                  <button
                                                    onClick={() => {
                                                      setReplyTo({ commentId: comment.id, text: comment.text || "📎 Attachment" });
                                                      setMsgMenuCommentId(null);
                                                    }}
                                                    className="w-full px-4 py-2 text-left text-xs text-white hover:bg-white/5 flex items-center gap-2"
                                                  >
                                                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                                                    </svg>
                                                    Reply
                                                  </button>
                                                  <button
                                                    onClick={() => {
                                                      navigator.clipboard.writeText(comment.text || "");
                                                      setToasts((prev) => [{ id: `copy_${Date.now()}`, title: "Copied", message: "Copied to clipboard" }, ...prev].slice(0, 3));
                                                      setTimeout(() => setToasts((prev) => prev.filter((x) => x.id !== `copy_${Date.now()}`)), 2000);
                                                      setMsgMenuCommentId(null);
                                                    }}
                                                    className="w-full px-4 py-2 text-left text-xs text-white hover:bg-white/5 flex items-center gap-2"
                                                  >
                                                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                                                    </svg>
                                                    Copy Content
                                                  </button>
                                                </div>
                                              )}
                                            </div>
                                          </div>
                                          <span className="text-[9px] font-bold text-white/20 mt-1 uppercase tracking-tighter">
                                            {new Date(comment.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                          </span>
                                        </div>
                                      </div>
                                    </div>
                                  );
                                });
                              })()
                            ) : (
                              <div className="text-center py-10">
                                <p className="text-xs font-bold text-white/10 uppercase tracking-[0.2em]">Start of conversation</p>
                              </div>
                            )}
                            <AutoScrollToBottom dependencies={[t.comments?.length || 0]} />
                          </div>

                          {/* Chat Input */}
                          <div className="relative mt-4 pt-4 border-t border-white/5">
                            {replyTo && (
                              <div className="flex items-center justify-between px-3 py-2 mb-2 rounded-xl bg-white/5 border border-white/10 text-xs">
                                <div className="truncate flex-1">
                                  <span className="text-blue-400 font-semibold mr-1">Replying to:</span>
                                  <span className="text-white/70">{replyTo.text || "📎 Attachment"}</span>
                                </div>
                                <button onClick={() => setReplyTo(null)} className="text-white/40 hover:text-white shrink-0 ml-3">
                                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                  </svg>
                                </button>
                              </div>
                            )}
                            <div className="flex items-end gap-3 rounded-2xl border border-white/5 bg-white/5 p-2 transition-all focus-within:border-blue-500/30 focus-within:bg-white/10">
                              <input
                                type="file"
                                id={`chat-upload-${t.id}`}
                                className="hidden"
                                multiple
                                onChange={(e) => {
                                  if (e.target.files?.length) {
                                    const fs = Array.from(e.target.files);
                                    setCommentFiles(p => ({ ...p, [t.id]: [...(p[t.id] || []), ...fs] }));
                                    const ps = fs.map(f => f.type.startsWith('image/') ? URL.createObjectURL(f) : "");
                                    setCommentFilePreviews(p => ({ ...p, [t.id]: [...(p[t.id] || []), ...ps] }));
                                  }
                                  e.target.value = "";
                                }}
                              />
                              <label htmlFor={`chat-upload-${t.id}`} className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-xl text-white/30 hover:bg-white/5 hover:text-white">
                                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                                </svg>
                              </label>
                              <textarea
                                rows={1}
                                value={commentInputs[t.id] || ""}
                                onChange={(e) => setCommentInputs(p => ({ ...p, [t.id]: e.target.value }))}
                                placeholder="Write a message..."
                                className="flex-1 resize-none bg-transparent px-2 py-2 text-sm text-white placeholder-white/20 outline-none max-h-32"
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter' && !e.shiftKey) {
                                    e.preventDefault();
                                    void postComment(t.id);
                                  }
                                }}
                              />
                              <button
                                onClick={() => void postComment(t.id)}
                                disabled={!commentInputs[t.id]?.trim() && !commentFiles[t.id]?.length}
                                className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500 text-white shadow-lg shadow-blue-500/20 transition-all hover:bg-blue-600 disabled:bg-white/5 disabled:text-white/10 disabled:shadow-none"
                              >
                                <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
                                  <path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z" />
                                </svg>
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })
        ) : (
          <div className="rounded-xl border border-white/10 bg-white/5 p-8 text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-white/10">
              <svg className="h-6 w-6 text-white/50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
            </div>
            <p className="text-white/70">No tasks assigned</p>
            <p className="mt-1 text-sm text-white/50">Check back later for new assignments</p>
          </div>
        )}
      </div>
    </div>
  );

  const notificationsPanel = (
    <Card>
      <h2 className="text-lg font-semibold text-white">Notifications</h2>
      <div className="mt-4 grid gap-3">
        {notifs.length ? (
          notifs.map((n) => (
            <div
              key={n.id}
              className={`flex items-start justify-between gap-3 rounded-2xl border p-3 transition-all ${n.taskId
                  ? "cursor-pointer border-blue-500/20 bg-blue-500/5 hover:bg-blue-500/10"
                  : "border-white/15 bg-white/5"
                }`}
              onClick={() => {
                if (n.taskId) navigateToTask(n.taskId);
              }}
            >
              <div className="flex items-start gap-3 min-w-0">
                {/* Notification icon */}
                <div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${n.taskId ? "bg-blue-500/20" : "bg-white/10"}`}>
                  <span className="text-sm">{n.taskId ? "📋" : "🔔"}</span>
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-white">{n.title}</div>
                  {n.message ? <div className="mt-0.5 text-sm text-white/70 truncate">{n.message}</div> : null}
                  {n.taskId && (
                    <div className="mt-1 flex items-center gap-1 text-xs text-blue-400">
                      <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                      Click to view task
                    </div>
                  )}
                  <div className="mt-1 text-xs text-white/40">{new Date(n.createdAtMs).toLocaleString()}</div>
                </div>
              </div>
              <button
                type="button"
                className="shrink-0 rounded-xl border border-white/15 bg-white/10 px-3 py-2 text-xs text-white/90 hover:bg-white/15"
                onClick={async (e) => {
                  e.stopPropagation();
                  await apiDelete(`/api/notifications/${n.id}`);
                  setNotifs((prev) => prev.filter((x) => x.id !== n.id));
                }}
              >
                Dismiss
              </button>
            </div>
          ))
        ) : (
          <div className="flex flex-col items-center justify-center py-8 gap-2">
            <span className="text-3xl">🔔</span>
            <p className="text-sm text-white/50">No notifications.</p>
          </div>
        )}
      </div>
    </Card>
  );

  const settingsPanel = (
    <Card>
      <h2 className="text-lg font-semibold text-white">Settings</h2>
      <div className="mt-6 flex flex-col gap-6">


        {/* Export Data */}
        <div className="flex items-center justify-between border-b border-white/10 pb-4">
          <div>
            <div className="text-sm font-medium text-white">Export My Data</div>
            <div className="text-xs text-white/50 mt-1">Download a JSON file with all your activity.</div>
          </div>
          <button
            type="button"
            className="rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-xs font-semibold text-white hover:bg-white/10 transition-colors"
            onClick={() => {
              alert("Data export started. It will be emailed to you shortly.");
            }}
          >
            Export
          </button>
        </div>

        {/* Upload Report */}
        <div className="border-b border-white/10 pb-4">
          <div className="text-sm font-medium text-white">Upload Report</div>
          <div className="text-xs text-white/50 mt-1">Send your report to admins with optional attachment.</div>
          <div className="mt-3 grid gap-2">
            <input
              value={userReportTitle}
              onChange={(e) => setUserReportTitle(e.target.value)}
              className="w-full rounded-lg border border-white/15 bg-[#101014] px-3 py-2 text-sm text-white outline-none focus:border-blue-500/50"
              placeholder="Report title"
            />
            <textarea
              rows={3}
              value={userReportDescription}
              onChange={(e) => setUserReportDescription(e.target.value)}
              className="w-full rounded-lg border border-white/15 bg-[#101014] px-3 py-2 text-sm text-white outline-none focus:border-blue-500/50 resize-none"
              placeholder="What do you want to report?"
            />
            <input
              type="file"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                setUserReportFileName(file.name);
                const reader = new FileReader();
                reader.onload = () => setUserReportFileDataUrl(typeof reader.result === "string" ? reader.result : "");
                reader.readAsDataURL(file);
              }}
              className="block w-full text-xs text-white/70 file:mr-3 file:rounded-lg file:border-0 file:bg-blue-500/20 file:px-3 file:py-1.5 file:text-blue-300 hover:file:bg-blue-500/30"
            />
            <div className="flex justify-end">
              <button
                type="button"
                disabled={userReportSaving}
                className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-500 disabled:opacity-60"
                onClick={async () => {
                  if (!userReportTitle.trim()) {
                    alert("Please add a report title.");
                    return;
                  }
                  setUserReportSaving(true);
                  try {
                    await apiPost("/api/reports", {
                      title: userReportTitle.trim(),
                      description: userReportDescription.trim(),
                      fileName: userReportFileName || null,
                      fileDataUrl: userReportFileDataUrl || null,
                    });
                    setUserReportTitle("");
                    setUserReportDescription("");
                    setUserReportFileName("");
                    setUserReportFileDataUrl("");
                    alert("Report uploaded.");
                  } catch {
                    alert("Failed to upload report.");
                  } finally {
                    setUserReportSaving(false);
                  }
                }}
              >
                {userReportSaving ? "Uploading..." : "Upload"}
              </button>
            </div>
          </div>
        </div>

        {/* Change Password Placeholder */}
        <div className="flex items-center justify-between pb-2">
          <div>
            <div className="text-sm font-medium text-white">Security</div>
            <div className="text-xs text-white/50 mt-1">Manage your account credentials.</div>
          </div>
          <button
            type="button"
            className="rounded-xl bg-white px-4 py-2 text-xs font-semibold text-black hover:bg-white/90 transition-colors"
            onClick={() => {
              alert("Password reset link sent to your email.");
            }}
          >
            Change Password
          </button>
        </div>
      </div>
    </Card>
  );

  const bulletinPanel = (
    <BulletinBoard />
  );

  const confessionsPanel = (
    <div className="h-full w-full">
      <ConfessionChat />
    </div>
  );

  const pollsPanel = (
    <Card>
      <CommunityPolls canCreate={false} />
    </Card>
  );

  const calendarPanel = (
    <Card>
      <UserCalendar tasks={tasks} />
    </Card>
  );

  const main =
    tab === "dashboard" ? dashboardPanel :
      tab === "profile" ? profilePanel :
        tab === "my_tasks" ? myTasksPanel :
          tab === "calendar" ? calendarPanel :
            tab === "settings" ? settingsPanel :
              tab === "notifications" ? notificationsPanel :
                tab === "bulletin" ? bulletinPanel :
                  tab === "confessions" ? confessionsPanel :
                    tab === "community_polls" ? pollsPanel :
                      dashboardPanel;

  return (
    <RequireAuth>
      <>
        <AppLayout
          sidebarTitle="USER PROFILE"
          sidebarOpen={sidebarOpen}
          onSidebarToggle={() => setSidebarOpen((v) => !v)}
          onGlobalSearchSelect={(hit: GlobalSearchHit) => {
            if (hit.type === "task") navigateToTask(hit.id);
            else if (hit.type === "comment" && hit.taskId) navigateToTask(hit.taskId);
          }}
          sidebarItems={[
            { id: "dashboard", icon: <LayoutDashboard size={18} />, label: "Dashboard" },
            { id: "my_tasks", icon: <ClipboardList size={18} />, label: "My Tasks" },
            { id: "calendar", icon: <Calendar size={18} />, label: "Calendar" },
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
            }
          ]}
          activeTab={tab}
          onTabChange={(id) => {
            // Prevent "Community" parent nav from falling into Settings/default panel
            if (id === "community") return;
            setTab(id as any);
          }}
          unreadCount={notifs.length}
        >
          <div className="p-4 md:p-6 lg:p-8 h-full overflow-y-auto">
            <div className="max-w-6xl mx-auto w-full">
              <div>{main}</div>
            </div>
          </div>
        </AppLayout>

        {toasts.length ? (
          <div className="fixed right-4 top-20 z-[95] flex w-[340px] max-w-[calc(100vw-2rem)] flex-col gap-2">
            {toasts.map((t) => (
              <div
                key={t.id}
                className="rounded-xl border border-blue-500/30 bg-[#14141c]/95 px-3 py-2 shadow-2xl backdrop-blur"
              >
                <div className="text-xs font-semibold text-blue-300">{t.title}</div>
                {t.message ? <div className="mt-0.5 text-xs text-white/75">{t.message}</div> : null}
              </div>
            ))}
          </div>
        ) : null}

        {/* ========== STOP REPORT MODAL ========== */}
        {stopReportModal && (
          <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="relative w-full max-w-md rounded-2xl border border-white/15 bg-[#0f0f1a] p-6 shadow-2xl">
              <div className="mb-1 flex items-center gap-2">
                <span className="text-xl">⏹</span>
                <h3 className="text-lg font-semibold text-white">Timer Stopped</h3>
              </div>
              <p className="mb-4 text-sm text-white/60">
                Time recorded: <span className="font-mono font-semibold text-white">{formatTime(stopReportModal.elapsed)}</span>.
                Write a quick note about where you left off (optional).
              </p>
              <textarea
                className="w-full rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-sm text-white placeholder-white/30 outline-none focus:border-blue-500/50 resize-none"
                rows={4}
                value={stopReportNote}
                onChange={(e) => setStopReportNote(e.target.value)}
                placeholder="e.g. Completed the API integration, still need to write tests for the auth module..."
              />
              <div className="mt-4 flex gap-3">
                <button
                  type="button"
                  disabled={stopReportSaving}
                  onClick={() => void submitStopReport()}
                  className="flex-1 rounded-xl bg-blue-600 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:opacity-60"
                >
                  {stopReportSaving ? "Saving..." : "Save & Close"}
                </button>
                <button
                  type="button"
                  onClick={() => { setStopReportModal(null); setStopReportNote(""); }}
                  className="rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-sm text-white/70 hover:bg-white/10"
                >
                  Skip
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ========== VIEW REPORTS MODAL ========== */}
        {reportsModal && (
          <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="relative w-full max-w-lg rounded-2xl border border-white/15 bg-[#0f0f1a] p-6 shadow-2xl max-h-[85vh] flex flex-col">
              <div className="mb-4 flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                    <svg className="h-5 w-5 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    Timer Reports
                  </h3>
                  <p className="mt-0.5 text-xs text-white/50 truncate max-w-[340px]">{reportsModal.taskTitle}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setReportsModal(null)}
                  className="shrink-0 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/60 hover:bg-white/10"
                >
                  Close
                </button>
              </div>
              <div className="overflow-y-auto flex-1 space-y-3 pr-1">
                {reportsLoading ? (
                  <div className="flex items-center justify-center py-10 text-white/40 text-sm">Loading reports...</div>
                ) : reportsData.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-10 gap-2">
                    <svg className="h-8 w-8 text-white/20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    <p className="text-sm text-white/40">No reports yet</p>
                    <p className="text-xs text-white/30">Reports are created when the work timer is stopped</p>
                  </div>
                ) : (
                  reportsData.map((r) => (
                    <div key={r.id} className="rounded-xl border border-white/10 bg-white/5 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <div className="h-8 w-8 rounded-full bg-blue-500/20 flex items-center justify-center shrink-0">
                            <span className="text-sm text-blue-400">⏱</span>
                          </div>
                          <div>
                            <div className="text-sm font-semibold text-white font-mono">{formatTime(r.elapsedSeconds)}</div>
                            <div className="text-xs text-white/50">{r.userName || r.userEmail}</div>
                          </div>
                        </div>
                        <div className="text-xs text-white/40 shrink-0">
                          {new Date(r.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })}
                        </div>
                      </div>
                      {r.stopNote && (
                        <div className="mt-3 rounded-lg bg-white/5 border border-white/8 px-3 py-2.5 text-sm text-white/80">
                          <span className="text-white/40 text-xs block mb-1">Stop note:</span>
                          {r.stopNote}
                        </div>
                      )}
                    </div>
                  ))
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
                  <svg className="w-5 h-5 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                  </svg>
                  Forward Message
                </h3>
                <button onClick={() => setForwardingComment(null)} className="text-white/40 hover:text-white transition">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
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
                <svg className="absolute right-3 top-3 w-4 h-4 text-white/30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>

              <div className="overflow-y-auto flex-1 space-y-1 pr-1 scrollbar-thin">
                {tasks
                  .filter(t =>
                    t.id !== forwardingComment.taskId &&
                    (t.title.toLowerCase().includes(forwardSearch.toLowerCase()) ||
                      t.description?.toLowerCase().includes(forwardSearch.toLowerCase()))
                  )
                  .slice(0, 10) // Limit results for performance
                  .map(targetTask => (
                    <button
                      key={targetTask.id}
                      onClick={() => handleForwardMessage(targetTask.id)}
                      className="w-full p-3 rounded-xl hover:bg-white/5 border border-transparent hover:border-white/10 transition flex items-center justify-between text-left group"
                    >
                      <div className="flex-1 min-w-0 mr-3">
                        <p className="text-sm font-medium text-white group-hover:text-blue-400 transition truncate">{targetTask.title}</p>
                        <p className="text-[10px] text-white/40 truncate">{targetTask.department?.replace('_', ' ')} • {targetTask.status}</p>
                      </div>
                      <svg className="w-4 h-4 text-white/20 group-hover:text-blue-400 transition" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7m0 0l-7 7m7-7H6" />
                      </svg>
                    </button>
                  ))}
                {tasks.filter(t => t.id !== forwardingComment.taskId && t.title.toLowerCase().includes(forwardSearch.toLowerCase())).length === 0 && (
                  <div className="py-10 text-center text-white/30 text-xs">No matching tasks found</div>
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
              <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>

            <div className="w-full h-full flex items-center justify-center p-4">
              {fullscreenMedia.type === 'image' ? (
                <img src={fullscreenMedia.url} alt={fullscreenMedia.name} className="max-w-full max-h-full object-contain" />
              ) : (
                <video src={fullscreenMedia.url} controls autoPlay className="max-w-full max-h-full" />
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
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Download {fullscreenMedia.type === 'image' ? 'Image' : 'Video'}
              </a>
            </div>
          </div>
        )}
      </>
    </RequireAuth>
  );
}
