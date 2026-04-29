import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  Platform,
  LayoutAnimation,
  UIManager,
  Animated,
  StatusBar,
  TouchableOpacity,
} from "react-native";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { apiDelete, apiGet, apiPatch, apiPost, setToken, apiBaseUrl, getToken } from "../lib/api";
import { requestMultipart } from "../lib/api";
import * as DocumentPicker from "expo-document-picker";
import { TaskConversation } from "../components/TaskConversation";
import type { TaskItem, TaskPriority, TaskStatus } from "../lib/types";

/* ─────────────────────────── Helpers ─────────────────────────── */

function pad2(n: number) {
  return String(Math.max(0, Math.floor(n))).padStart(2, "0");
}
function formatHms(totalSeconds: number) {
  const s = Math.max(0, Math.floor(totalSeconds));
  return `${pad2(Math.floor(s / 3600))}:${pad2(Math.floor((s % 3600) / 60))}:${pad2(s % 60)}`;
}

/* ─────────────────────────── Types ─────────────────────────── */

type NotificationItem = {
  id: string;
  title: string;
  message: string;
  createdAtMs: number;
  taskId: string | null;
  read: boolean;
};
type ToastItem = { id: string; title: string; message: string };
type TaskAttachmentView = {
  id: string;
  name: string;
  url: string;
  contentType: string;
  size: number;
  uploadedAt: number;
  uploadedBy: string;
  checklistItemId: number | null;
};

/* ─────────────────────────── Mappers ─────────────────────────── */

function mapNotificationRow(row: Record<string, unknown>): NotificationItem {
  return {
    id: String(row.id),
    title: String(row.title ?? "New notification"),
    message: String(row.message ?? ""),
    createdAtMs: Number(row.created_at ?? Date.now()),
    taskId: row.task_id ? String(row.task_id) : null,
    read: Boolean(row.read),
  };
}

function mapTaskRow(row: Record<string, unknown>): TaskItem {
  const startDate = row.start_date == null ? null : Number(row.start_date);
  const dueDate = row.due_date == null ? null : Number(row.due_date);
  const checklist = Array.isArray(row.checklist)
    ? row.checklist
        .filter((x): x is Record<string, unknown> => Boolean(x) && typeof x === "object")
        .map((x) => ({ id: String(x.id ?? ""), text: String(x.text ?? ""), done: Boolean(x.done) }))
        .filter((x) => x.id && x.text)
    : [];
  const attachments = Array.isArray(row.attachments)
    ? row.attachments
        .filter((a): a is Record<string, unknown> => Boolean(a) && typeof a === "object")
        .map((a) => ({
          id: String(a.id ?? ""),
          name: String(a.name ?? ""),
          url: String(a.url ?? ""),
          contentType: String(a.contentType ?? a.content_type ?? ""),
          size: a.size == null ? 0 : Number(a.size),
          uploadedAt: a.createdAt == null ? Date.now() : Number(a.createdAt),
          uploadedBy: String(a.uploadedBy ?? ""),
          checklistItemId: a.checklistItemId == null ? null : Number(a.checklistItemId),
        }))
        .filter((a) => a.id && a.url)
    : [];
  const rawPriority = String(row.priority ?? "medium");
  const priority: TaskPriority =
    rawPriority === "easy" || rawPriority === "medium" || rawPriority === "high" || rawPriority === "very_high" || rawPriority === "critical"
      ? rawPriority
      : "medium";
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
        }))
        .filter((c) => c.id && c.text)
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
    projectId: row.project_id ? String(row.project_id) : null,
    projectName: row.project_name ? String(row.project_name) : null,
    type: "project" as any,
    department: "other" as any,
    tags: [],
    timerRunning: Boolean(row.timerRunning ?? row.timer_running),
    elapsedSeconds: Number(row.elapsedSeconds ?? row.elapsed_seconds) || 0,
    approvalStatus: "none" as any,
    checklist: checklist as any,
    attachments: attachments as any,
    comments,
  };
}

if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

/* ─────────────────────────── Constants ─────────────────────────── */

// Classroom-inspired accent colors per priority
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
  complete: "Turned In",
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

/* ─────────────────────────── Main Component ─────────────────────────── */

export function TasksScreen() {
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [tasksLoading, setTasksLoading] = useState(true);

  const listOpacity = useMemo(() => new Animated.Value(0), []);
  const listTranslateY = useMemo(() => new Animated.Value(20), []);

  const [unreadDot, setUnreadDot] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifs, setNotifs] = useState<NotificationItem[]>([]);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [email, setEmail] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [openConversationTaskId, setOpenConversationTaskId] = useState<string | null>(null);
  const [openingAttachmentId, setOpeningAttachmentId] = useState<string | null>(null);
  const [stoppedTasks, setStoppedTasks] = useState<Set<string>>(new Set());
  const [expandedTasks, setExpandedTasks] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState<"all" | "inProgress" | "done">("all");

  // Reports
  type TimerReport = {
    id: number;
    taskId?: string; task_id?: string;
    userId?: number; user_id?: number;
    elapsedSeconds?: number; elapsed_seconds?: number;
    stopNote?: string | null; stop_note?: string | null;
    createdAt?: number; created_at?: number;
    userEmail?: string; user_email?: string;
    userName?: string | null; user_name?: string | null;
  };
  const [reportsModal, setReportsModal] = useState<{ taskId: string; taskTitle: string } | null>(null);
  const [reportsData, setReportsData] = useState<TimerReport[]>([]);
  const [reportsLoading, setReportsLoading] = useState(false);

  // Timer
  const [localTimerState, setLocalTimerState] = useState<Record<string, { startedAt: number; baseElapsed: number }>>({});
  const [, setNowTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setNowTick((x) => x + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const toggleTaskExpansion = (taskId: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpandedTasks((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      return next;
    });
  };

  const getDisplayElapsed = (task: TaskItem) => {
    const base = Number(task.elapsedSeconds) || 0;
    const local = localTimerState[task.id];
    if (task.timerRunning && local) {
      return base + Math.floor((Date.now() - local.startedAt) / 1000);
    }
    return base;
  };

  const handleStartTimer = async (task: TaskItem) => {
    const elapsed = Number(task.elapsedSeconds) || 0;
    try {
      await apiPatch(`/api/tasks/${task.id}`, { timerRunning: true, elapsedSeconds: elapsed, status: "in_process", progress: 25 });
      setLocalTimerState((prev) => ({ ...prev, [task.id]: { startedAt: Date.now(), baseElapsed: elapsed } }));
      setTasks((prev) => prev.map((x) => x.id === task.id ? { ...x, timerRunning: true, elapsedSeconds: elapsed, status: "in_process", progress: 25 } : x));
    } catch (e: unknown) {
      Alert.alert("Error", e instanceof Error ? e.message : "Failed to start timer");
    }
  };

  const handleStopTimer = async (task: TaskItem) => {
    const local = localTimerState[task.id];
    const base = Number(task.elapsedSeconds) || 0;
    let finalElapsed = base;
    if (local) finalElapsed = base + Math.floor((Date.now() - local.startedAt) / 1000);
    try {
      await apiPatch(`/api/tasks/${task.id}`, { timerRunning: false, elapsedSeconds: finalElapsed });
      try {
        await apiPost<{ id: number }>(`/api/tasks/${task.id}/reports`, { elapsed_seconds: finalElapsed, stop_note: null });
        if (reportsModal?.taskId === task.id) void openReports(task.id, task.title);
      } catch (reportErr: unknown) {
        Alert.alert("Report Error", `Timer stopped but report failed.\n${reportErr instanceof Error ? reportErr.message : String(reportErr)}`);
      }
      setLocalTimerState((prev) => { const next = { ...prev }; delete next[task.id]; return next; });
      setStoppedTasks((prev) => new Set(prev).add(task.id));
      setTasks((prev) => prev.map((x) => x.id === task.id ? { ...x, timerRunning: false, elapsedSeconds: finalElapsed } : x));
    } catch (e: unknown) {
      Alert.alert("Error", e instanceof Error ? e.message : "Failed to stop timer");
    }
  };

  const refreshTasksOnce = async () => {
    const tRes = await apiGet<{ items: unknown[] }>("/api/tasks");
    setTasks(
      tRes.items
        .filter((x): x is Record<string, unknown> => Boolean(x) && typeof x === "object")
        .map(mapTaskRow)
        .sort((a, b) => b.createdAt - a.createdAt)
    );
  };

  const openReports = async (taskId: string, taskTitle: string) => {
    setReportsModal({ taskId, taskTitle });
    setReportsLoading(true);
    setReportsData([]);
    try {
      const data = await apiGet<{ items: TimerReport[] } | TimerReport[] | any>(`/api/tasks/${taskId}/reports`);
      let items: TimerReport[] = [];
      if (data && typeof data === "object") {
        if (Array.isArray(data.items)) items = data.items;
        else if (Array.isArray(data)) items = data;
      }
      setReportsData(items);
    } catch (err) {
      Alert.alert("Reports Error", err instanceof Error ? err.message : "Failed to load reports");
      setReportsData([]);
    } finally {
      setReportsLoading(false);
    }
  };

  const openAttachment = async (a: TaskAttachmentView) => {
    setOpeningAttachmentId(a.id);
    try {
      const token = await getToken();
      if (!token) throw new Error("Not authenticated");
      const remoteUrl = a.url.startsWith("http") ? a.url : `${apiBaseUrl()}${a.url}`;
      const safeName = (a.name || `file_${a.id}`).replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 80);
      const localUri = `${FileSystem.cacheDirectory ?? FileSystem.documentDirectory ?? ""}${Date.now()}_${safeName}`;
      if (!localUri) throw new Error("No local storage available");
      const result = await FileSystem.downloadAsync(remoteUrl, localUri, { headers: { Authorization: `Bearer ${token}` } });
      if (!result?.uri) throw new Error("Download failed");
      if (result.status && result.status >= 400) throw new Error(`Download failed (${result.status})`);
      const uri = Platform.OS === "android" ? await FileSystem.getContentUriAsync(result.uri) : result.uri;
      const canShare = await Sharing.isAvailableAsync();
      if (!canShare) { Alert.alert("Downloaded", uri); return; }
      await Sharing.shareAsync(uri, { mimeType: a.contentType || undefined, dialogTitle: a.name || "Open attachment" });
    } catch (e: unknown) {
      Alert.alert("Error", e instanceof Error ? e.message : "Failed to open file");
    } finally {
      setOpeningAttachmentId(null);
    }
  };

  useEffect(() => {
    let cancelled = false;
    let lastNotifIds = new Set<string>();
    let firstLoadToastShown = false;

    const tick = async () => {
      try {
        const [me, tRes, nRes] = await Promise.all([
          apiGet<{ user: { id: number; email: string } | null }>("/api/auth/me"),
          apiGet<{ items: unknown[] }>("/api/tasks"),
          apiGet<{ items: unknown[] }>("/api/notifications"),
        ]);
        if (cancelled) return;
        setEmail(me.user?.email ?? null);
        setUserId(String(me.user?.id ?? ""));
        const nextTasks = tRes.items
          .filter((x): x is Record<string, unknown> => Boolean(x) && typeof x === "object")
          .map(mapTaskRow)
          .sort((a, b) => b.createdAt - a.createdAt);
        setTasks(nextTasks);
        const nextNotifs = nRes.items
          .filter((x): x is Record<string, unknown> => Boolean(x) && typeof x === "object")
          .map(mapNotificationRow)
          .sort((a, b) => b.createdAtMs - a.createdAtMs)
          .slice(0, 20);
        setNotifs(nextNotifs);
        const nextIds = new Set(nextNotifs.map((n) => n.id));
        const added = nextNotifs.filter((n) => !lastNotifIds.has(n.id));
        lastNotifIds = nextIds;
        if (!firstLoadToastShown && nextNotifs.length) {
          firstLoadToastShown = true;
          const n = nextNotifs[0];
          const id = `first_${n.id}`;
          setToasts((prev) => [{ id, title: n.title, message: n.message }, ...prev].slice(0, 3));
          setTimeout(() => setToasts((prev) => prev.filter((x) => x.id !== id)), 4500);
        } else if (added.length) {
          setUnreadDot(true);
          const addedToasts = added.slice(0, 3).map((n) => ({ id: n.id, title: n.title, message: n.message }));
          setToasts((prev) => [...addedToasts, ...prev].slice(0, 3));
          for (const t of addedToasts) {
            setTimeout(() => setToasts((prev) => prev.filter((x) => x.id !== t.id)), 4500);
          }
        }
      } catch (e: unknown) {
        Alert.alert("Load error", e instanceof Error ? e.message : "Failed to load");
      } finally {
        if (!cancelled && tasksLoading) {
          setTasksLoading(false);
          Animated.parallel([
            Animated.timing(listOpacity, { toValue: 1, duration: 400, useNativeDriver: true }),
            Animated.spring(listTranslateY, { toValue: 0, friction: 8, tension: 40, useNativeDriver: true }),
          ]).start();
        }
      }
    };

    void tick();
    const id = setInterval(tick, 2500);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  /* ── Derived state ── */

  const dashStats = useMemo(() => {
    let inProcess = 0, complete = 0, failed = 0, activeSum = 0, activeCount = 0;
    let easy = 0, medium = 0, high = 0, veryHigh = 0, critical = 0;
    for (const t of tasks) {
      const s = String(t.status);
      if (s === "in_process" || s === "pending" || s === "not_started") {
        if (t.dueDate && Date.now() > t.dueDate) failed++;
        else inProcess++;
      } else if (s === "complete") { complete++; }
      else if (s === "failed" || s === "blocked") { failed++; }
      if (s !== "complete" && s !== "failed") { activeSum += (t.progress || 0); activeCount++; }
      if (t.priority === "easy") easy++;
      else if (t.priority === "medium") medium++;
      else if (t.priority === "high") high++;
      else if (t.priority === "very_high") veryHigh++;
      else if (t.priority === "critical") critical++;
    }
    return { inProcess, complete, failed, total: tasks.length, avgProgress: activeCount ? Math.round(activeSum / activeCount) : 0, easy, medium, high, veryHigh, critical };
  }, [tasks]);

  const dueSoonTasks = useMemo(() => {
    const week = Date.now() + 7 * 24 * 3600 * 1000;
    return tasks.filter((t) => t.dueDate && t.dueDate <= week && String(t.status) !== "complete").length;
  }, [tasks]);

  const filteredList = useMemo(() => {
    if (activeTab === "inProgress") return tasks.filter((t) => t.status === "in_process" || t.status === "pending" || t.status === "not_started");
    if (activeTab === "done") return tasks.filter((t) => t.status === "complete");
    return tasks;
  }, [tasks, activeTab]);

  /* ── Render helpers ── */

  const getInitials = (title: string) => {
    return title.split(" ").slice(0, 2).map((w) => w[0] ?? "").join("").toUpperCase() || "??";
  };

  const renderTaskCard = (t: TaskItem, index: number) => {
    const isComplete = t.status === "complete";
    const isRunning = Boolean(t.timerRunning);
    const wasStopped = stoppedTasks.has(t.id);
    const isExpanded = expandedTasks.has(t.id);
    const isConversationOpen = openConversationTaskId === t.id;
    const accentColor = PRIORITY_COLORS[t.priority] ?? "#1a73e8";
    const statusColor = STATUS_COLORS[t.status] ?? "#5f6368";
    const statusLabel = STATUS_LABELS[t.status] ?? t.status;
    const displayElapsed = getDisplayElapsed(t);

    const isLate = t.dueDate && Date.now() > t.dueDate && !isComplete;
    const doneCount = (t.checklist || []).filter((c) => c.done).length;
    const totalChecklist = (t.checklist || []).length;

    return (
      <View key={t.id} style={[cs.classCard, { borderTopColor: accentColor }]}>
        {/* Card Header - Classroom style colored strip + kebab action */}
        <View style={[cs.classCardHeader, { backgroundColor: accentColor + "22" }]}>
          <View style={cs.classCardHeaderLeft}>
            <View style={[cs.classIcon, { backgroundColor: accentColor }]}>
              <Text style={cs.classIconText}>{getInitials(t.title)}</Text>
            </View>
            <View style={cs.classHeaderMeta}>
              <Text style={cs.classTitle} numberOfLines={isExpanded ? 0 : 1}>{t.title}</Text>
              {t.projectName ? (
                <Text style={cs.classSub} numberOfLines={1}>{t.projectName}</Text>
              ) : null}
            </View>
          </View>
          {/* Status chip */}
          <View style={[cs.statusChip, { backgroundColor: statusColor + "22", borderColor: statusColor + "55" }]}>
            <Text style={[cs.statusChipText, { color: statusColor }]}>{statusLabel}</Text>
          </View>
        </View>

        {/* Due date row */}
        <View style={cs.classCardBody}>
          <View style={cs.dueDateRow}>
            <Text style={[cs.dueIcon]}>{isLate ? "⚠️" : "🗓️"}</Text>
            <Text style={[cs.dueText, isLate ? { color: "#c5221f" } : null]}>
              {t.dueDate ? new Date(t.dueDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }) : "No due date"}
            </Text>
            {isLate && <Text style={cs.lateBadge}>LATE</Text>}
          </View>

          {/* Quick summary chips (always visible) */}
          <View style={cs.chipRow}>
            {totalChecklist > 0 && (
              <View style={cs.chip}>
                <Text style={cs.chipText}>☑ {doneCount}/{totalChecklist}</Text>
              </View>
            )}
            {(t.attachments || []).length > 0 && (
              <View style={cs.chip}>
                <Text style={cs.chipText}>📎 {(t.attachments || []).length}</Text>
              </View>
            )}
            {(t.comments || []).length > 0 && (
              <View style={cs.chip}>
                <Text style={cs.chipText}>💬 {(t.comments || []).length}</Text>
              </View>
            )}
            {isRunning && (
              <View style={[cs.chip, { backgroundColor: "rgba(34,197,94,0.15)", borderColor: "rgba(34,197,94,0.3)" }]}>
                <Text style={[cs.chipText, { color: "#22c55e" }]}>⏱ {formatHms(displayElapsed)}</Text>
              </View>
            )}
          </View>

          {/* Progress bar */}
          <View style={cs.progressSection}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4 }}>
              <Text style={cs.progressLabel}>Progress</Text>
              <Text style={[cs.progressLabel, { color: accentColor }]}>{t.progress}%</Text>
            </View>
            <View style={cs.progressTrack}>
              <View style={[cs.progressFill, { width: `${t.progress}%` as any, backgroundColor: isComplete ? "#188038" : accentColor }]} />
            </View>
          </View>

          {/* Expand/Collapse toggle */}
          <TouchableOpacity style={cs.expandBtn} onPress={() => toggleTaskExpansion(t.id)} activeOpacity={0.7}>
            <Text style={cs.expandBtnText}>{isExpanded ? "▲ Show less" : "▼ View assignment"}</Text>
          </TouchableOpacity>

          {/* ── EXPANDED CONTENT ── */}
          {isExpanded && (
            <View style={cs.expandedContent}>
              {/* Description */}
              {t.description ? (
                <View style={cs.descSection}>
                  <Text style={cs.descText}>{t.description}</Text>
                </View>
              ) : null}

              {/* Checklist / Subtasks */}
              {totalChecklist > 0 && (
                <View style={cs.sectionBox}>
                  <View style={cs.sectionHeader}>
                    <Text style={cs.sectionTitle}>SUBTASKS</Text>
                    <Text style={cs.sectionCount}>{doneCount}/{totalChecklist} done</Text>
                  </View>
                  {(t.checklist || []).map((item) => (
                    <Pressable
                      key={item.id}
                      style={cs.checkItem}
                      onPress={async () => {
                        const updated = (t.checklist || []).map((c) => c.id === item.id ? { ...c, done: !c.done } : c);
                        await apiPatch(`/api/tasks/${t.id}`, { checklist: updated });
                        await refreshTasksOnce();
                      }}
                    >
                      <View style={[cs.checkbox, item.done && cs.checkboxDone]}>
                        {item.done && <Text style={cs.checkboxCheck}>✓</Text>}
                      </View>
                      <Text style={[cs.checkItemText, item.done && cs.checkItemDone]}>{item.text}</Text>
                    </Pressable>
                  ))}
                </View>
              )}

              {/* Attachments */}
              {(t.attachments || []).length > 0 && (
                <View style={cs.sectionBox}>
                  {(() => {
                    const isAdminUpload = (u: any) => u && (String(u).includes("admin") || String(u).includes("manager") || t.assignedBy === u);
                    const adminFiles = (t.attachments || []).filter((a) => isAdminUpload(a.uploadedBy));
                    const userFiles = (t.attachments || []).filter((a) => !isAdminUpload(a.uploadedBy));
                    return (
                      <>
                        {adminFiles.length > 0 && (
                          <>
                            <Text style={cs.sectionTitle}>MAIN TASK ATTACHMENTS</Text>
                            <View style={cs.attachRow}>
                              {adminFiles.map((a) => (
                                <Pressable key={a.id} style={cs.attachPill} onPress={() => openAttachment(a as any)}>
                                  <Text style={cs.attachPillText} numberOfLines={1}>🔗 {a.name}</Text>
                                  {openingAttachmentId === a.id && <Text style={{ fontSize: 10 }}>⏳</Text>}
                                </Pressable>
                              ))}
                            </View>
                          </>
                        )}
                        {userFiles.length > 0 && (
                          <>
                            <Text style={[cs.sectionTitle, { marginTop: 12 }]}>YOUR WORK</Text>
                            <View style={cs.attachRow}>
                              {userFiles.map((a) => (
                                <Pressable key={a.id} style={[cs.attachPill, { borderColor: "rgba(24,128,56,0.4)", backgroundColor: "rgba(24,128,56,0.1)" }]} onPress={() => openAttachment(a as any)}>
                                  <Text style={[cs.attachPillText, { color: "#188038" }]} numberOfLines={1}>📎 {a.name}</Text>
                                  {openingAttachmentId === a.id && <Text style={{ fontSize: 10 }}>⏳</Text>}
                                </Pressable>
                              ))}
                            </View>
                          </>
                        )}
                      </>
                    );
                  })()}
                </View>
              )}

              {/* Work Timer */}
              <View style={cs.timerBox}>
                <View style={cs.timerTopRow}>
                  <Text style={cs.timerLabel}>Work Timer</Text>
                  <Text style={[cs.timerTime, isRunning && { color: "#22c55e" }]}>{formatHms(displayElapsed)}</Text>
                </View>
                <View style={cs.timerBtns}>
                  <Pressable
                    style={({ pressed }) => [cs.timerBtn, cs.timerBtnStart, isRunning && cs.timerBtnDisabled, pressed && { opacity: 0.8 }]}
                    onPress={() => handleStartTimer(t)}
                    disabled={isRunning}
                  >
                    <Text style={cs.timerBtnText}>▶ {isRunning ? "Running…" : "Start timer"}</Text>
                  </Pressable>
                  <Pressable
                    style={({ pressed }) => [cs.timerBtn, cs.timerBtnStop, !isRunning && cs.timerBtnDisabled, pressed && { opacity: 0.8 }]}
                    onPress={() => handleStopTimer(t)}
                    disabled={!isRunning}
                  >
                    <Text style={[cs.timerBtnText, { color: "#d93025" }]}>■ Stop</Text>
                  </Pressable>
                  <Pressable
                    style={({ pressed }) => [cs.timerBtn, { flex: 0, paddingHorizontal: 12, backgroundColor: "rgba(255,255,255,0.06)" }, pressed && { opacity: 0.8 }]}
                    onPress={() => void openReports(t.id, t.title)}
                  >
                    <Text style={[cs.timerBtnText, { color: "rgba(255,255,255,0.5)" }]}>📊</Text>
                  </Pressable>
                </View>
              </View>

              {/* ── Action buttons (Classroom-style bottom bar) ── */}
              <View style={cs.actionBar}>
                {!wasStopped && (
                  <Pressable
                    style={({ pressed }) => [cs.actionBtnSecondary, pressed && { opacity: 0.8 }]}
                    onPress={async () => {
                      try {
                        const res = await DocumentPicker.getDocumentAsync({ multiple: false, copyToCacheDirectory: true });
                        if (res.canceled) return;
                        const asset = res.assets[0];
                        if (!asset?.uri) { Alert.alert("Error", "No file selected"); return; }
                        const fd = new FormData();
                        fd.append("taskId", String(t.id));
                        fd.append("file", { uri: asset.uri, name: asset.name || "upload", type: asset.mimeType || "application/octet-stream" } as any);
                        await requestMultipart<{ id: number }>("/api/files", fd);
                        await refreshTasksOnce();
                        Alert.alert("Attached!", "File uploaded to this task.");
                      } catch (e: unknown) {
                        Alert.alert("Upload failed", e instanceof Error ? e.message : "Upload failed");
                      }
                    }}
                  >
                    <Text style={cs.actionBtnSecondaryText}>+ Add work</Text>
                  </Pressable>
                )}

                {/* Mark as done / Unmark */}
                {isComplete ? (
                  <Pressable
                    style={({ pressed }) => [cs.actionBtnPrimary, { backgroundColor: "#188038" }, pressed && { opacity: 0.8 }]}
                    onPress={async () => {
                      try {
                        await apiPatch(`/api/tasks/${t.id}`, { status: "in_process", progress: 0 });
                        await refreshTasksOnce();
                      } catch (e: unknown) {
                        Alert.alert("Error", e instanceof Error ? e.message : "Update failed");
                      }
                    }}
                  >
                    <Text style={cs.actionBtnPrimaryText}>✓ Turned in</Text>
                  </Pressable>
                ) : (
                  <Pressable
                    style={({ pressed }) => [cs.actionBtnPrimary, pressed && { opacity: 0.8 }]}
                    onPress={async () => {
                      try {
                        await apiPatch(`/api/tasks/${t.id}`, { status: "complete", progress: 100 });
                        await refreshTasksOnce();
                      } catch (e: unknown) {
                        Alert.alert("Error", e instanceof Error ? e.message : "Update failed");
                      }
                    }}
                  >
                    <Text style={cs.actionBtnPrimaryText}>✓ Mark as done</Text>
                  </Pressable>
                )}
              </View>

              {/* Task Conversation */}
              <View style={cs.conversationSection}>
                <Pressable
                  style={({ pressed }) => [cs.conversationHeader, pressed && { opacity: 0.9 }]}
                  onPress={() => setOpenConversationTaskId((cur) => cur === t.id ? null : t.id)}
                >
                  <Text style={cs.conversationHeaderTitle}>💬 Class comments ({(t.comments?.length ?? 0)})</Text>
                  <Text style={cs.conversationChevron}>{isConversationOpen ? "▲" : "▼"}</Text>
                </Pressable>
                {isConversationOpen ? (
                  <TaskConversation
                    taskId={t.id}
                    comments={t.comments || []}
                    currentUserId={userId ?? ""}
                    currentUserEmail={email ?? ""}
                    onCommentsChange={refreshTasksOnce}
                  />
                ) : null}
              </View>
            </View>
          )}
        </View>
      </View>
    );
  };

  /* ─────────────────────────── RENDER ─────────────────────────── */

  return (
    <View style={cs.root}>
      <StatusBar barStyle="light-content" backgroundColor="#1a73e8" />

      {/* ── Toasts ── */}
      {toasts.length ? (
        <View pointerEvents="box-none" style={cs.toastLayer}>
          {toasts.map((t) => (
            <View key={t.id} style={cs.toastCard}>
              <Text style={cs.toastTitle}>{t.title}</Text>
              {t.message ? <Text style={cs.toastMsg}>{t.message}</Text> : null}
              <Pressable style={cs.toastDismiss} onPress={() => setToasts((prev) => prev.filter((x) => x.id !== t.id))}>
                <Text style={cs.toastDismissText}>Dismiss</Text>
              </Pressable>
            </View>
          ))}
        </View>
      ) : null}

      <ScrollView style={cs.scroll} contentContainerStyle={cs.scrollContent} keyboardShouldPersistTaps="handled">

        {/* ── Google Classroom-style Header ── */}
        <View style={cs.pageHeader}>
          <View>
            <Text style={cs.pageTitle}>My Tasks</Text>
            <Text style={cs.pageSubtitle}>{email ?? "Loading…"}</Text>
          </View>
          <View style={cs.headerActions}>
            <Pressable
              onPress={() => { setUnreadDot(false); setNotifOpen((v) => !v); }}
              style={({ pressed }) => [cs.iconBtn, pressed && { opacity: 0.8 }]}
            >
              <Text style={{ fontSize: 20 }}>🔔</Text>
              {unreadDot && <View style={cs.dot} />}
            </Pressable>
            <Pressable
              style={({ pressed }) => [cs.logoutBtn, pressed && { opacity: 0.8 }]}
              onPress={async () => {
                try { await apiPost("/api/auth/logout"); } catch { }
                await setToken(null);
              }}
            >
              <Text style={cs.logoutText}>Logout</Text>
            </Pressable>
          </View>
        </View>

        {/* ── Notifications Panel ── */}
        {notifOpen ? (
          <View style={cs.notifPanel}>
            <View style={cs.notifPanelHeader}>
              <Text style={cs.notifPanelTitle}>Notifications</Text>
              <Pressable onPress={() => setNotifOpen(false)}>
                <Text style={cs.notifClose}>✕ Close</Text>
              </Pressable>
            </View>
            {notifs.length ? (
              notifs.map((n) => (
                <Pressable
                  key={n.id}
                  style={[cs.notifItem, !n.read && cs.notifItemUnread]}
                  onPress={async () => {
                    setUnreadDot(false);
                    try {
                      await apiPatch(`/api/notifications/${n.id}`, { read: true });
                      setNotifs((prev) => prev.map((item) => item.id === n.id ? { ...item, read: true } : item));
                    } catch { }
                    if (n.taskId) setNotifOpen(false);
                  }}
                >
                  <Text style={cs.notifTitle}>{n.title}</Text>
                  {n.message ? <Text style={cs.notifMsg}>{n.message}</Text> : null}
                  <Text style={cs.notifTime}>{new Date(n.createdAtMs).toLocaleString()}</Text>
                  <Pressable
                    style={cs.notifDismiss}
                    onPress={async () => {
                      try { await apiDelete(`/api/notifications/${n.id}`); } catch { }
                    }}
                  >
                    <Text style={cs.notifDismissText}>Dismiss</Text>
                  </Pressable>
                </Pressable>
              ))
            ) : (
              <Text style={cs.notifEmpty}>No notifications.</Text>
            )}
          </View>
        ) : null}

        {/* ── "Due Soon" Banner (Classroom style) ── */}
        <View style={cs.dueSoonBanner}>
          <View style={cs.dueSoonLeft}>
            <Text style={cs.dueSoonTitle}>Due soon</Text>
            <Text style={cs.dueSoonSub}>
              {dueSoonTasks > 0 ? `${dueSoonTasks} task${dueSoonTasks !== 1 ? "s" : ""} due this week` : "No work coming up immediately"}
            </Text>
          </View>
          <Pressable onPress={() => setActiveTab("inProgress")}>
            <Text style={cs.dueSoonLink}>View to-do list</Text>
          </Pressable>
        </View>

        {/* ── Stats Strip ── */}
        <View style={cs.statsStrip}>
          {[
            { label: "In Progress", value: dashStats.inProcess, color: "#1a73e8" },
            { label: "Turned\xa0In", value: dashStats.complete, color: "#188038" },
            { label: "Missing", value: dashStats.failed, color: "#c5221f" },
            { label: "Avg %", value: `${dashStats.avgProgress}%`, color: "#e37400" },
          ].map((s) => (
            <View key={s.label} style={cs.statCard}>
              <Text style={[cs.statValue, { color: s.color }]}>{s.value}</Text>
              <Text style={cs.statLabel}>{s.label}</Text>
            </View>
          ))}
        </View>

        {/* ── Tabs (Classroom-style like Coursework tabs) ── */}
        <View style={cs.tabBar}>
          {(["all", "inProgress", "done"] as const).map((tab) => (
            <Pressable
              key={tab}
              style={[cs.tab, activeTab === tab && cs.tabActive]}
              onPress={() => setActiveTab(tab)}
            >
              <Text style={[cs.tabText, activeTab === tab && cs.tabTextActive]}>
                {tab === "all" ? "All" : tab === "inProgress" ? "In Progress" : "Turned In"}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* ── Task Count ── */}
        <Text style={cs.taskCount}>{filteredList.length} task{filteredList.length !== 1 ? "s" : ""}</Text>

        {/* ── Task Cards ── */}
        {tasksLoading ? (
          // Skeleton loaders
          [1, 2, 3].map((k) => (
            <View key={k} style={[cs.classCard, { opacity: 0.4 }]}>
              <View style={[cs.classCardHeader, { backgroundColor: "rgba(255,255,255,0.03)", height: 72 }]} />
              <View style={cs.classCardBody}>
                <View style={{ height: 14, backgroundColor: "rgba(255,255,255,0.05)", borderRadius: 4, width: "60%", marginBottom: 8 }} />
                <View style={{ height: 8, backgroundColor: "rgba(255,255,255,0.03)", borderRadius: 4, width: "40%" }} />
              </View>
            </View>
          ))
        ) : filteredList.length ? (
          <Animated.View style={{ opacity: listOpacity, transform: [{ translateY: listTranslateY }] }}>
            {filteredList.map((t, i) => renderTaskCard(t, i))}
          </Animated.View>
        ) : (
          <View style={cs.emptyState}>
            <Text style={cs.emptyIcon}>📋</Text>
            <Text style={cs.emptyTitle}>No tasks here</Text>
            <Text style={cs.emptyMsg}>
              {activeTab === "done" ? "You haven't turned in any tasks yet." : "All caught up!"}
            </Text>
          </View>
        )}
      </ScrollView>

      {/* ── Reports Modal ── */}
      {reportsModal && (
        <View style={cs.modalOverlay}>
          <View style={cs.modalSheet}>
            <View style={cs.modalHeader}>
              <View style={{ flex: 1, marginRight: 12 }}>
                <Text style={cs.modalTitle}>Timer Reports {reportsData.length > 0 && `(${reportsData.length})`}</Text>
                <Text style={cs.modalSubtitle} numberOfLines={1}>{reportsModal.taskTitle}</Text>
              </View>
              <Pressable style={cs.modalCloseBtn} onPress={() => setReportsModal(null)}>
                <Text style={cs.modalCloseBtnText}>Close</Text>
              </Pressable>
            </View>
            <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20, gap: 16 }}>
              {reportsLoading ? (
                <View style={cs.reportEmpty}>
                  <Text style={cs.reportEmptyText}>Loading reports…</Text>
                </View>
              ) : reportsData.length === 0 ? (
                <View style={cs.reportEmpty}>
                  <Text style={{ fontSize: 40, marginBottom: 12 }}>📊</Text>
                  <Text style={cs.reportEmptyTitle}>No reports yet</Text>
                  <Text style={cs.reportEmptyText}>Reports appear when you stop the work timer</Text>
                </View>
              ) : (
                reportsData.map((r, idx) => (
                  <View key={String(r.id) || idx} style={cs.reportCard}>
                    <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 10 }}>
                      <View style={cs.reportIcon}>
                        <Text style={{ fontSize: 22 }}>⏱</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={cs.reportTime}>{formatHms(r.elapsedSeconds || r.elapsed_seconds || 0)}</Text>
                        <Text style={cs.reportUser}>{r.userName || r.user_name || r.userEmail || r.user_email || "You"}</Text>
                      </View>
                      <Text style={cs.reportDate}>
                        {(r.createdAt || r.created_at) ? new Date(r.createdAt || r.created_at || 0).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "-"}
                      </Text>
                    </View>
                    {(r.stopNote || r.stop_note) ? (
                      <View style={cs.reportNote}>
                        <Text style={cs.reportNoteText}>{r.stopNote || r.stop_note}</Text>
                      </View>
                    ) : null}
                  </View>
                ))
              )}
            </ScrollView>
          </View>
        </View>
      )}
    </View>
  );
}

/* ─────────────────────────── Styles ─────────────────────────── */

const cs = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#0f0f15" },
  scroll: { flex: 1 },
  scrollContent: { paddingTop: 56, paddingBottom: 40 },

  // Toasts
  toastLayer: { position: "absolute", right: 12, top: 10, width: 280, zIndex: 999 },
  toastCard: { backgroundColor: "rgba(26,115,232,0.95)", borderRadius: 12, padding: 12, marginBottom: 8 },
  toastTitle: { color: "#fff", fontWeight: "800", fontSize: 13 },
  toastMsg: { color: "rgba(255,255,255,0.8)", fontSize: 12, marginTop: 2 },
  toastDismiss: { alignSelf: "flex-end", marginTop: 8, borderRadius: 8, backgroundColor: "rgba(255,255,255,0.2)", paddingHorizontal: 10, paddingVertical: 4 },
  toastDismissText: { color: "#fff", fontSize: 11, fontWeight: "700" },

  // Page header
  pageHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12, backgroundColor: "#1a73e8" },
  pageTitle: { color: "#fff", fontSize: 20, fontWeight: "700" },
  pageSubtitle: { color: "rgba(255,255,255,0.8)", fontSize: 12, marginTop: 1 },
  headerActions: { flexDirection: "row", alignItems: "center", gap: 10 },
  iconBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.15)", alignItems: "center", justifyContent: "center" },
  dot: { position: "absolute", top: 8, right: 8, width: 8, height: 8, borderRadius: 4, backgroundColor: "#ea4335" },
  logoutBtn: { backgroundColor: "rgba(255,255,255,0.15)", borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8 },
  logoutText: { color: "#fff", fontSize: 13, fontWeight: "600" },

  // Notifications
  notifPanel: { backgroundColor: "#191922", margin: 12, borderRadius: 16, borderWidth: 1, borderColor: "rgba(255,255,255,0.1)", overflow: "hidden" },
  notifPanelHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 16, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.07)" },
  notifPanelTitle: { color: "#fff", fontWeight: "700", fontSize: 16 },
  notifClose: { color: "#1a73e8", fontSize: 13, fontWeight: "600" },
  notifItem: { padding: 14, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.05)" },
  notifItemUnread: { borderLeftWidth: 3, borderLeftColor: "#1a73e8", backgroundColor: "rgba(26,115,232,0.06)" },
  notifTitle: { color: "#fff", fontWeight: "600", fontSize: 14 },
  notifMsg: { color: "rgba(255,255,255,0.65)", fontSize: 13, marginTop: 3 },
  notifTime: { color: "rgba(255,255,255,0.4)", fontSize: 11, marginTop: 6 },
  notifDismiss: { marginTop: 8, alignSelf: "flex-start", borderRadius: 6, backgroundColor: "rgba(255,255,255,0.07)", paddingHorizontal: 10, paddingVertical: 4 },
  notifDismissText: { color: "rgba(255,255,255,0.7)", fontSize: 11, fontWeight: "600" },
  notifEmpty: { color: "rgba(255,255,255,0.5)", padding: 16, textAlign: "center" },

  // Due soon banner
  dueSoonBanner: { backgroundColor: "#0d1b36", marginHorizontal: 12, marginTop: 12, borderRadius: 14, padding: 16, flexDirection: "row", justifyContent: "space-between", alignItems: "center", borderWidth: 1, borderColor: "rgba(26,115,232,0.2)" },
  dueSoonLeft: { flex: 1 },
  dueSoonTitle: { color: "#fff", fontSize: 15, fontWeight: "700" },
  dueSoonSub: { color: "rgba(255,255,255,0.55)", fontSize: 12, marginTop: 2 },
  dueSoonLink: { color: "#1a73e8", fontSize: 12, fontWeight: "600", marginLeft: 8 },

  // Stats strip
  statsStrip: { flexDirection: "row", paddingHorizontal: 12, marginTop: 12, gap: 8 },
  statCard: { flex: 1, backgroundColor: "#191922", borderRadius: 12, padding: 10, alignItems: "center", borderWidth: 1, borderColor: "rgba(255,255,255,0.07)" },
  statValue: { fontSize: 20, fontWeight: "800" },
  statLabel: { color: "rgba(255,255,255,0.45)", fontSize: 9, marginTop: 2, textTransform: "uppercase", textAlign: "center" },

  // Tabs
  tabBar: { flexDirection: "row", marginHorizontal: 12, marginTop: 14, backgroundColor: "rgba(255,255,255,0.05)", borderRadius: 12, padding: 4 },
  tab: { flex: 1, paddingVertical: 8, borderRadius: 9, alignItems: "center" },
  tabActive: { backgroundColor: "#1a73e8" },
  tabText: { color: "rgba(255,255,255,0.55)", fontSize: 12, fontWeight: "600" },
  tabTextActive: { color: "#fff" },

  taskCount: { color: "rgba(255,255,255,0.35)", fontSize: 11, marginHorizontal: 16, marginTop: 10, marginBottom: 6, textTransform: "uppercase" },

  // ── Classroom Task Card ──
  classCard: {
    marginHorizontal: 12,
    marginBottom: 12,
    borderRadius: 12,
    borderTopWidth: 4,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "#191922",
    overflow: "hidden",
  },
  classCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 14,
  },
  classCardHeaderLeft: { flexDirection: "row", alignItems: "center", flex: 1, gap: 10 },
  classIcon: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  classIconText: { color: "#fff", fontWeight: "800", fontSize: 13 },
  classHeaderMeta: { flex: 1, minWidth: 0 },
  classTitle: { color: "#fff", fontSize: 15, fontWeight: "700" },
  classSub: { color: "rgba(255,255,255,0.5)", fontSize: 12, marginTop: 1 },
  statusChip: { alignSelf: "flex-start", borderRadius: 20, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 3, flexShrink: 0 },
  statusChipText: { fontSize: 10, fontWeight: "700", textTransform: "uppercase" },

  classCardBody: { paddingHorizontal: 14, paddingBottom: 14 },

  // Due date row
  dueDateRow: { flexDirection: "row", alignItems: "center", marginBottom: 8, gap: 6 },
  dueIcon: { fontSize: 13 },
  dueText: { color: "rgba(255,255,255,0.6)", fontSize: 12, flex: 1 },
  lateBadge: { backgroundColor: "#c5221f", color: "#fff", fontSize: 9, fontWeight: "800", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, textTransform: "uppercase" },

  // Chips row
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 10 },
  chip: { borderRadius: 20, borderWidth: 1, borderColor: "rgba(255,255,255,0.12)", backgroundColor: "rgba(255,255,255,0.05)", paddingHorizontal: 8, paddingVertical: 3 },
  chipText: { color: "rgba(255,255,255,0.65)", fontSize: 11 },

  // Progress
  progressSection: { marginBottom: 10 },
  progressLabel: { color: "rgba(255,255,255,0.4)", fontSize: 10, textTransform: "uppercase" },
  progressTrack: { height: 4, backgroundColor: "rgba(255,255,255,0.08)", borderRadius: 2, overflow: "hidden" },
  progressFill: { height: "100%" as any, borderRadius: 2 },

  // Expand button
  expandBtn: { alignItems: "center", paddingVertical: 8 },
  expandBtnText: { color: "#1a73e8", fontSize: 12, fontWeight: "600" },

  // Expanded content
  expandedContent: { marginTop: 4, borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.06)", paddingTop: 12 },
  descSection: { backgroundColor: "rgba(255,255,255,0.03)", borderRadius: 10, padding: 12, marginBottom: 12 },
  descText: { color: "rgba(255,255,255,0.7)", fontSize: 13, lineHeight: 20 },

  // Section boxes
  sectionBox: { backgroundColor: "rgba(255,255,255,0.03)", borderRadius: 12, padding: 12, marginBottom: 12, borderWidth: 1, borderColor: "rgba(255,255,255,0.05)" },
  sectionHeader: { flexDirection: "row", justifyContent: "space-between", marginBottom: 8 },
  sectionTitle: { color: "rgba(255,255,255,0.4)", fontSize: 10, fontWeight: "700", textTransform: "uppercase" },
  sectionCount: { color: "rgba(255,255,255,0.35)", fontSize: 11 },

  // Checklist
  checkItem: { flexDirection: "row", alignItems: "flex-start", gap: 10, paddingVertical: 8, borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.04)" },
  checkbox: { width: 18, height: 18, borderRadius: 4, borderWidth: 1.5, borderColor: "rgba(255,255,255,0.3)", alignItems: "center", justifyContent: "center", marginTop: 1 },
  checkboxDone: { backgroundColor: "#188038", borderColor: "#188038" },
  checkboxCheck: { color: "#fff", fontSize: 11, fontWeight: "800" },
  checkItemText: { color: "rgba(255,255,255,0.85)", fontSize: 14, flex: 1 },
  checkItemDone: { color: "rgba(255,255,255,0.35)", textDecorationLine: "line-through" },

  // Attachments
  attachRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 6 },
  attachPill: { borderRadius: 20, borderWidth: 1, borderColor: "rgba(255,255,255,0.15)", backgroundColor: "rgba(255,255,255,0.06)", paddingHorizontal: 10, paddingVertical: 6, flexDirection: "row", alignItems: "center", gap: 4 },
  attachPillText: { color: "rgba(255,255,255,0.75)", fontSize: 12, fontWeight: "500", maxWidth: 120 },

  // Timer box
  timerBox: { backgroundColor: "rgba(20,20,30,0.8)", borderRadius: 12, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: "rgba(255,255,255,0.07)" },
  timerTopRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
  timerLabel: { color: "rgba(255,255,255,0.4)", fontSize: 12, fontWeight: "500" },
  timerTime: { color: "#fff", fontSize: 22, fontWeight: "600", fontFamily: "monospace" },
  timerBtns: { flexDirection: "row", gap: 8 },
  timerBtn: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 8, borderRadius: 8, borderWidth: 1 },
  timerBtnStart: { backgroundColor: "rgba(24,128,56,0.15)", borderColor: "rgba(24,128,56,0.35)" },
  timerBtnStop: { backgroundColor: "rgba(217,48,37,0.15)", borderColor: "rgba(217,48,37,0.35)" },
  timerBtnDisabled: { opacity: 0.4 },
  timerBtnText: { color: "#188038", fontSize: 13, fontWeight: "600" },

  // Action bar (bottom of card, Classroom-style)
  actionBar: { flexDirection: "row", gap: 10, marginBottom: 12 },
  actionBtnSecondary: { flex: 1, alignItems: "center", justifyContent: "center", borderRadius: 8, paddingVertical: 12, borderWidth: 1, borderColor: "rgba(26,115,232,0.4)", backgroundColor: "rgba(26,115,232,0.06)" },
  actionBtnSecondaryText: { color: "#1a73e8", fontSize: 13, fontWeight: "600" },
  actionBtnPrimary: { flex: 1, alignItems: "center", justifyContent: "center", borderRadius: 8, paddingVertical: 12, backgroundColor: "#1a73e8" },
  actionBtnPrimaryText: { color: "#fff", fontSize: 13, fontWeight: "700" },

  // Conversation
  conversationSection: { borderRadius: 12, borderWidth: 1, borderColor: "rgba(255,255,255,0.07)", backgroundColor: "rgba(26,26,40,0.5)", overflow: "hidden", marginBottom: 4 },
  conversationHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 14, paddingVertical: 12 },
  conversationHeaderTitle: { color: "rgba(255,255,255,0.75)", fontSize: 13, fontWeight: "600" },
  conversationChevron: { color: "rgba(255,255,255,0.4)", fontSize: 12 },

  // Empty state
  emptyState: { alignItems: "center", paddingVertical: 64, paddingHorizontal: 32 },
  emptyIcon: { fontSize: 48, marginBottom: 16 },
  emptyTitle: { color: "#fff", fontSize: 18, fontWeight: "700", marginBottom: 6 },
  emptyMsg: { color: "rgba(255,255,255,0.45)", fontSize: 13, textAlign: "center" },

  // Reports Modal
  modalOverlay: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.85)", justifyContent: "flex-end", zIndex: 1000 },
  modalSheet: { backgroundColor: "#141420", borderTopLeftRadius: 24, borderTopRightRadius: 24, borderWidth: 1, borderColor: "rgba(255,255,255,0.12)", maxHeight: "90%", paddingBottom: 40 },
  modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 20, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.1)" },
  modalTitle: { color: "#fff", fontSize: 18, fontWeight: "800" },
  modalSubtitle: { color: "rgba(255,255,255,0.55)", fontSize: 12, marginTop: 3 },
  modalCloseBtn: { backgroundColor: "#1a73e8", borderRadius: 10, paddingHorizontal: 16, paddingVertical: 10 },
  modalCloseBtnText: { color: "#fff", fontWeight: "700", fontSize: 13 },

  // Report cards
  reportCard: { backgroundColor: "rgba(26,115,232,0.12)", borderRadius: 14, padding: 16, borderWidth: 1, borderColor: "rgba(26,115,232,0.25)", marginBottom: 12 },
  reportIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: "rgba(26,115,232,0.25)", alignItems: "center", justifyContent: "center", marginRight: 12 },
  reportTime: { fontFamily: "monospace", fontSize: 20, fontWeight: "800", color: "#fff" },
  reportUser: { color: "rgba(255,255,255,0.6)", fontSize: 13, marginTop: 2 },
  reportDate: { color: "rgba(255,255,255,0.4)", fontSize: 12, fontWeight: "600" },
  reportNote: { backgroundColor: "rgba(0,0,0,0.25)", borderRadius: 10, padding: 12, borderLeftWidth: 3, borderLeftColor: "#1a73e8", marginTop: 8 },
  reportNoteText: { color: "rgba(255,255,255,0.85)", fontSize: 13 },
  reportEmpty: { alignItems: "center", paddingVertical: 60 },
  reportEmptyTitle: { color: "#fff", fontSize: 18, fontWeight: "700", marginBottom: 6 },
  reportEmptyText: { color: "rgba(255,255,255,0.45)", fontSize: 13, textAlign: "center" },
});
