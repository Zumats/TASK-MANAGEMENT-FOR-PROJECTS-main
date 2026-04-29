import { useState, useEffect, useMemo } from "react";
import { Alert, Image, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View, ActivityIndicator, SafeAreaView, Platform, LayoutAnimation, UIManager, Animated, TouchableOpacity } from "react-native";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { apiDelete, apiGet, apiPatch, apiPost, requestMultipart, setToken, apiBaseUrl, getToken } from "../lib/api";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import type { TaskItem, TaskPriority, TaskStatus } from "../lib/types";
import { TaskConversation } from "../components/TaskConversation";
import { TaskInlineReports } from "../components/TaskInlineReports";
import { DarkSelectModal } from "../components/DarkSelectModal";
import { BulletinBoardScreen } from "./BulletinBoardScreen";
import { ConfessionChatScreen } from "./ConfessionChatScreen";

if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
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

function pad2(n: number) {
  return String(Math.max(0, Math.floor(n))).padStart(2, "0");
}

function formatHms(totalSeconds: number) {
  const s = Math.max(0, Math.floor(totalSeconds));
  const hh = Math.floor(s / 3600);
  const mm = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  return `${pad2(hh)}:${pad2(mm)}:${pad2(ss)}`;
}

type Tab =
  | "profile"
  | "tasks"
  | "bulletin"
  | "confessions"
  | "notifications"
  | "settings";

type NotificationItem = {
  id: string;
  title: string;
  message: string;
  createdAtMs: number;
  taskId: string | null;
  read: boolean;
};

type TaskChecklistViewItem = {
  id: string;
  text: string;
  done: boolean;
};

type TaskAttachmentViewItem = {
  id: number;
  name: string;
  url: string;
  contentType: string;
  size: number;
  createdAt: number;
  uploadedBy: number;
  checklistItemId?: number | null;
};

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
    status: (row.status as any) ?? "in_process",
    progress,
    priority: (row.priority as any) ?? "medium",
    startDate,
    dueDate,
    createdAt: Number(row.created_at ?? Date.now()),
    updatedAt: Number(row.updated_at ?? Date.now()),
    type: (row.type as any) ?? "project",
    department: (row.department as any) ?? "other",
    tags: Array.isArray(row.tags)
      ? (row.tags as unknown[]).map(String)
      : typeof row.tags === "string"
        ? String(row.tags)
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
        : [],
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

export function ProfileScreen() {
  const [tab, setTab] = useState<Tab>("profile");
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [notifs, setNotifs] = useState<NotificationItem[]>([]);
  const [unreadDot, setUnreadDot] = useState(false);
  const [email, setEmail] = useState<string | null>(null);
  const [userId, setUserId] = useState<number | null>(null);
  const [name, setName] = useState<string>("");
  const [age, setAge] = useState<string>("");
  const [bio, setBio] = useState<string>("");
  const [savedName, setSavedName] = useState<string>("");
  const [savedAge, setSavedAge] = useState<string>("");
  const [savedBio, setSavedBio] = useState<string>("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [savingProfile, setSavingProfile] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [selectedTask, setSelectedTask] = useState<TaskItem | null>(null);
  const [openingAttachmentId, setOpeningAttachmentId] = useState<number | null>(null);
  const [uploadingWork, setUploadingWork] = useState(false);

  // Work Timer state
  const [localTimerState, setLocalTimerState] = useState<Record<string, { startedAt: number; baseElapsed: number }>>({});
  const [nowTick, setNowTick] = useState(0);

  // Stop report modal state (shown when timer is stopped)
  type StopReportModal = { taskId: string; elapsed: number };
  const [stopReportModalMobile, setStopReportModalMobile] = useState<StopReportModal | null>(null);
  const [stopReportNoteMobile, setStopReportNoteMobile] = useState("");
  const [stopReportSavingMobile, setStopReportSavingMobile] = useState(false);

  // Reports view modal - support both camelCase and snake_case from API
  type TimerReport = { 
    id: number; 
    taskId?: string; 
    task_id?: string;
    userId?: number; 
    user_id?: number;
    elapsedSeconds?: number; 
    elapsed_seconds?: number;
    stopNote?: string | null; 
    stop_note?: string | null;
    createdAt?: number; 
    created_at?: number;
    userEmail?: string; 
    user_email?: string;
    userName?: string | null;
    user_name?: string | null;
  };
  const [reportsModalMobile, setReportsModalMobile] = useState<{ taskId: string; taskTitle: string } | null>(null);
  const [reportsDataMobile, setReportsDataMobile] = useState<TimerReport[]>([]);
  const [reportsLoadingMobile, setReportsLoadingMobile] = useState(false);

  // Status modal tracking active task ID
  const [showStatusModalId, setShowStatusModalId] = useState<string | null>(null);
  const [expandedTaskIds, setExpandedTaskIds] = useState<Set<string>>(new Set());

  const listOpacity = useState(new Animated.Value(0))[0];
  const listTranslateY = useState(new Animated.Value(20))[0];

  useEffect(() => {
    if (tab === "tasks" && tasks.length > 0) {
      Animated.parallel([
        Animated.timing(listOpacity, { toValue: 1, duration: 400, useNativeDriver: true }),
        Animated.spring(listTranslateY, { toValue: 0, friction: 8, tension: 40, useNativeDriver: true }),
      ]).start();
    }
  }, [tab, tasks.length]);

  const toggleTaskExpansion = (taskId: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpandedTaskIds((prev: Set<string>) => {
      const next = new Set(prev);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      return next;
    });
  };

  // Track which tasks are in "stopped" state locally (timer was running, now stopped, but not done)
  // This is needed because the backend timerRunning=false doesn't distinguish never-started vs stopped
  const [stoppedTaskIds, setStoppedTaskIds] = useState<Set<string>>(new Set());

  // Tick every second to update live timer display
  useEffect(() => {
    const id = setInterval(() => setNowTick((x: number) => x + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const getDisplayElapsed = (task: TaskItem) => {
    void nowTick; // consumed to trigger re-render every second
    const base = Number(task.elapsedSeconds) || 0;
    const local = localTimerState[task.id];
    if (task.timerRunning && local) {
      const delta = Math.floor((Date.now() - local.startedAt) / 1000);
      return base + delta;
    }
    return base;
  };

  const handleStartTimer = async (task: TaskItem) => {
    const elapsed = Number(task.elapsedSeconds) || 0;
    try {
      await apiPatch(`/api/tasks/${task.id}`, {
        timerRunning: true,
        elapsedSeconds: elapsed,
        status: "in_process",
      });
      setLocalTimerState((prev: any) => ({
        ...prev,
        [task.id]: { startedAt: Date.now(), baseElapsed: elapsed },
      }));
      // Remove from stopped set when resuming
      setStoppedTaskIds((prev: Set<string>) => {
        const next = new Set(prev);
        next.delete(task.id);
        return next;
      });
      setTasks((prev: any[]) =>
        prev.map((x: any) => (x.id === task.id ? { ...x, timerRunning: true, elapsedSeconds: elapsed, status: "in_process" } : x))
      );
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to start timer";
      Alert.alert("Error", msg);
    }
  };

  // handleStopTimer: stops the timer but does NOT mark the task as done.
  // Opens the stop report modal for the user to write a note.
  const handleStopTimer = async (task: TaskItem) => {
    const local = localTimerState[task.id];
    const base = Number(task.elapsedSeconds) || 0;
    let finalElapsed = base;
    if (local) {
      const delta = Math.floor((Date.now() - local.startedAt) / 1000);
      finalElapsed = base + delta;
    }
    try {
      await apiPatch(`/api/tasks/${task.id}`, {
        timerRunning: false,
        elapsedSeconds: finalElapsed,
        status: "in_process", // Keep in_process - NOT setting to complete
      });
      setLocalTimerState((prev: any) => {
        const next = { ...prev };
        delete next[task.id];
        return next;
      });
      // Mark as stopped so we know Resume vs Start
      setStoppedTaskIds((prev: Set<string>) => new Set([...prev, task.id]));
      setTasks((prev: any[]) =>
        prev.map((x: any) => (x.id === task.id ? { ...x, timerRunning: false, elapsedSeconds: finalElapsed, status: "in_process" } : x))
      );
      // Open stop report modal
      setStopReportNoteMobile("");
      setStopReportModalMobile({ taskId: task.id, elapsed: finalElapsed });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to stop timer";
      Alert.alert("Error", msg);
    }
  };

  const submitStopReportMobile = async () => {
    if (!stopReportModalMobile) return;
    setStopReportSavingMobile(true);
    try {
      await apiPost(`/api/tasks/${stopReportModalMobile.taskId}/reports`, {
        elapsed_seconds: stopReportModalMobile.elapsed,
        stop_note: stopReportNoteMobile.trim() || null,
      });
    } catch {
      // Ignore - note is optional
    } finally {
      setStopReportSavingMobile(false);
      setStopReportModalMobile(null);
      setStopReportNoteMobile("");
    }
  };

  const openReportsMobile = async (taskId: string, taskTitle: string) => {
    setReportsLoadingMobile(true);
    setReportsDataMobile([]); // Clear old data first
    setReportsModalMobile({ taskId, taskTitle }); // Show modal
    try {
      const data = await apiGet<{ items: TimerReport[] } | any>(`/api/tasks/${taskId}/reports`);
      console.log("[Reports] Raw response:", JSON.stringify(data, null, 2));
      
      // Handle both { items: [...] } and direct array responses
      let items: TimerReport[] = [];
      if (data && typeof data === "object") {
        if (Array.isArray(data.items)) {
          items = data.items;
        } else if (Array.isArray(data)) {
          items = data;
        }
      }
      console.log("[Reports] Parsed items:", items.length, items);
      setReportsDataMobile(items);
    } catch (err: unknown) {
      console.error("[Reports] Error:", err);
      Alert.alert("Reports Error", err instanceof Error ? err.message : "Failed to load reports");
      setReportsDataMobile([]);
    } finally {
      setReportsLoadingMobile(false);
    }
  };


  const refreshTasksOnce = async () => {
    const tRes = await apiGet<{ items: unknown[] }>("/api/tasks");
    const nextTasks = tRes.items
      .filter((x): x is Record<string, unknown> => Boolean(x) && typeof x === "object")
      .map(mapTaskRow)
      .sort((a, b) => b.createdAt - a.createdAt);
    setTasks(nextTasks);
    setSelectedTask((prev: any) => {
      if (!prev) return prev;
      const updated = nextTasks.find((t) => String(t.id) === String(prev.id));
      return updated ?? prev;
    });
  };

  const pickAndUploadWork = async (taskId: string, checklistItemId?: string) => {
    setUploadingWork(true);
    try {
      const res = await DocumentPicker.getDocumentAsync({ multiple: false, copyToCacheDirectory: true });
      if (res.canceled) {
        setUploadingWork(false);
        return;
      }
      const asset = res.assets[0];
      if (!asset?.uri) {
        Alert.alert("Error", "No file selected");
        setUploadingWork(false);
        return;
      }

      // Create file object for React Native FormData
      const fileObj = {
        uri: asset.uri,
        name: asset.name || "upload",
        type: asset.mimeType || "application/octet-stream",
      };

      const fd = new FormData();
      fd.append("taskId", String(taskId));
      if (checklistItemId) fd.append("checklistItemId", String(checklistItemId));
      fd.append("file", fileObj as any);

      console.log("ProfileScreen uploading:", taskId, checklistItemId, asset.name);
      await requestMultipart<{ id: number }>("/api/files", fd);
      await refreshTasksOnce();
      Alert.alert("Success", "File uploaded successfully");
    } catch (e: unknown) {
      console.error("Task upload error:", e);
      const msg = e instanceof Error ? e.message : "Upload failed";
      if (msg === "OFFLINE_NO_MULTIPART") {
        Alert.alert("Offline", "File uploads can't be queued. Please try again when you're back online.");
      } else {
        Alert.alert("Error", msg);
      }
    } finally {
      setUploadingWork(false);
    }
  };

  const toggleChecklistDone = async (taskId: string, itemId: string) => {
    const current = selectedTask;
    const checklist = ((current?.checklist ?? []) as unknown as TaskChecklistViewItem[]).map((c) => ({
      id: String(c.id),
      text: String(c.text),
      done: Boolean(c.done),
    }));
    const next = checklist.map((c) => (String(c.id) === String(itemId) ? { ...c, done: !c.done } : c));

    try {
      await apiPatch(`/api/tasks/${taskId}`, { checklist: next });
      setSelectedTask((prev: any) => {
        if (!prev) return prev;
        return { ...prev, checklist: next as any };
      });
      setTasks((prev) => prev.map((t) => (String(t.id) === String(taskId) ? ({ ...t, checklist: next as any } as any) : t)));
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to update subtask";
      if (msg === "OFFLINE_QUEUED") {
        // Update local state optimistically
        setSelectedTask((prev: any) => {
          if (!prev) return prev;
          return { ...prev, checklist: next as any };
        });
        setTasks((prev: any[]) => prev.map((t: any) => (String(t.id) === String(taskId) ? ({ ...t, checklist: next as any } as any) : t)));
        Alert.alert("Offline", "Changes saved locally and will sync when you're back online.");
      } else {
        Alert.alert("Error", msg);
      }
    }
  };

  const removeAttachment = async (attachmentId: string | number) => {
    Alert.alert("Remove attachment", "Remove this file?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: async () => {
          try {
            await apiDelete(`/api/files/${attachmentId}`);
            await refreshTasksOnce();
          } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : "Failed to remove file";
            if (msg === "OFFLINE_QUEUED") {
              Alert.alert("Offline", "Delete queued and will sync when you're back online.");
            } else {
              Alert.alert("Error", msg);
            }
          }
        },
      },
    ]);
  };

  const canRemoveAttachment = (a: TaskAttachmentViewItem) => {
    if (!userId) return false;
    return Number(a.uploadedBy) === Number(userId);
  };

  useEffect(() => {
    let cancelled = false;
    let first = true;
    const tick = async () => {
      try {
        const [me, tRes, nRes] = await Promise.all([
          apiGet<{ user: { id: number; email: string; name?: string | null; age?: number | null; bio?: string | null; avatarUrl?: string | null; avatar_url?: string | null } | null }>("/api/auth/me"),
          apiGet<{ items: unknown[] }>("/api/tasks"),
          apiGet<{ items: unknown[] }>("/api/notifications"),
        ]);
        if (cancelled) return;
        setEmail(me.user?.email ?? null);
        setUserId(me.user?.id ?? null);
        const userName = me.user?.name ?? "";
        const userAge = me.user?.age?.toString() ?? "";
        const userBio = me.user?.bio ?? "";
        // Only set input values on first load to avoid overwriting while typing
        if (first) {
          setName(userName);
          setAge(userAge);
          setBio(userBio);
        }
        setSavedName(userName);
        setSavedAge(userAge);
        setSavedBio(userBio);
        setAvatarUrl(me.user?.avatarUrl ?? me.user?.avatar_url ?? null);

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
        if (!first) {
          setUnreadDot((prev: boolean) => prev || nextNotifs.length > 0);
        }
        first = false;
      } catch {
        // Silent refresh
      }
    };

    void tick();
    const id = setInterval(tick, 3000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const getFullAvatarUrl = (url: string | null) => {
    if (!url) return null;
    return url.startsWith("http") ? url : `${apiBaseUrl()}${url}`;
  };

  const formatDue = (dueDate: number | null) => {
    if (!dueDate) return "No due date";
    const d = new Date(dueDate);
    const month = d.toLocaleString("en-US", { month: "short" });
    const day = d.getDate();
    const hour = d.toLocaleString("en-US", { hour: "numeric" });
    const minute = d.toLocaleString("en-US", { minute: "2-digit" });
    return `Due ${month} ${day}, ${hour}:${minute}`;
  };

  const openAttachment = async (a: TaskAttachmentViewItem) => {
    setOpeningAttachmentId(a.id);
    try {
      const token = await getToken();
      if (!token) throw new Error("Not authenticated");

      const remoteUrl = a.url.startsWith("http") ? a.url : `${apiBaseUrl()}${a.url}`;
      const safeName = (a.name || `file_${a.id}`)
        .replace(/[^a-zA-Z0-9._-]+/g, "_")
        .slice(0, 80);
      const localUri = `${FileSystem.cacheDirectory ?? FileSystem.documentDirectory ?? ""}${Date.now()}_${safeName}`;
      if (!localUri) throw new Error("No local storage available");

      const result = await FileSystem.downloadAsync(remoteUrl, localUri, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!result?.uri) throw new Error("Download failed");
      if (result.status && result.status >= 400) {
        throw new Error(`Download failed (${result.status})`);
      }

      const uri = Platform.OS === "android" ? await FileSystem.getContentUriAsync(result.uri) : result.uri;

      const canShare = await Sharing.isAvailableAsync();
      if (!canShare) {
        Alert.alert("Downloaded", uri);
        return;
      }
      await Sharing.shareAsync(uri, {
        mimeType: a.contentType || undefined,
        dialogTitle: a.name || "Open attachment",
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to open file";
      Alert.alert("Error", msg);
    } finally {
      setOpeningAttachmentId(null);
    }
  };

  const renderProfile = () => (
    <ScrollView style={styles.tabContent} showsVerticalScrollIndicator={false}>
      {/* Header Card with Avatar */}
      <View style={styles.headerCard}>
        <View style={styles.avatarContainer}>
          {avatarUrl ? (
            <Image source={{ uri: getFullAvatarUrl(avatarUrl) || undefined }} style={styles.avatar} />
          ) : (
            <View style={styles.avatarPlaceholder}>
              <Text style={styles.avatarEmoji}>👤</Text>
            </View>
          )}
          {uploadingAvatar && (
            <View style={styles.avatarOverlay}>
              <ActivityIndicator color="white" />
            </View>
          )}
          <Pressable
            style={({ pressed }) => [styles.changePhotoBtn, pressed && styles.changePhotoBtnPressed]}
            onPress={async () => {
              try {
                const result = await ImagePicker.launchImageLibraryAsync({
                  mediaTypes: ImagePicker.MediaTypeOptions.Images,
                  allowsEditing: true,
                  aspect: [1, 1],
                  quality: 0.8,
                });
                if (result.canceled || !result.assets?.[0]) return;
                setUploadingAvatar(true);
                const asset = result.assets[0];
                const formData = new FormData();
                formData.append("file", { uri: asset.uri, name: asset.fileName || "avatar.jpg", type: asset.mimeType || "image/jpeg" } as any);
                const data = await requestMultipart<{ avatarUrl: string }>("/api/auth/avatar", formData);
                setAvatarUrl(data.avatarUrl);
                Alert.alert("Success", "Profile picture updated");
              } catch (e: unknown) {
                const msg = e instanceof Error ? e.message : "Failed to upload";
                if (msg === "OFFLINE_NO_MULTIPART") {
                  Alert.alert("Offline", "File uploads can't be queued. Please try again when you're back online.");
                } else {
                  Alert.alert("Error", msg);
                }
              } finally {
                setUploadingAvatar(false);
              }
            }}
            disabled={uploadingAvatar}
          >
            <Text style={styles.changePhotoText}>Change Photo</Text>
          </Pressable>
        </View>

        <Text style={styles.userName}>{savedName || "Your Name"}</Text>
        <Text style={styles.userEmail}>{email || "email@example.com"}</Text>

        {/* Display saved profile info */}
        <View style={{ marginTop: 12, alignItems: "center" }}>
          <Text style={{ color: "rgba(255,255,255,0.6)", fontSize: 14 }}>
            {savedName ? `Name: ${savedName}` : "Name: —"}
          </Text>
          <Text style={{ color: "rgba(255,255,255,0.6)", fontSize: 14, marginTop: 4 }}>
            {savedAge ? `Age: ${savedAge}` : "Age: —"}
          </Text>
          <Text style={{ color: "rgba(255,255,255,0.6)", fontSize: 14, marginTop: 4 }}>
            {savedBio ? `Bio: ${savedBio}` : "Bio: —"}
          </Text>
        </View>
      </View>

      {/* Info Cards */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Personal Info</Text>

        <View style={styles.field}>
          <Text style={styles.label}>Name</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="Enter your name"
            placeholderTextColor="rgba(255,255,255,0.4)"
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Age</Text>
          <TextInput
            style={styles.input}
            value={age}
            onChangeText={setAge}
            placeholder="Enter your age"
            placeholderTextColor="rgba(255,255,255,0.4)"
            keyboardType="numeric"
            maxLength={3}
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Bio</Text>
          <TextInput
            style={[styles.input, styles.bioInput]}
            value={bio}
            onChangeText={setBio}
            placeholder="Tell us about yourself"
            placeholderTextColor="rgba(255,255,255,0.4)"
            multiline
            numberOfLines={4}
          />
        </View>

        <Pressable
          style={({ pressed }) => [styles.saveBtn, pressed && styles.saveBtnPressed, savingProfile && styles.saveBtnDisabled]}
          onPress={async () => {
            setSavingProfile(true);
            try {
              const ageNum = age ? Number(age) : null;
              await apiPatch("/api/auth/profile", {
                name: name.trim() || null,
                age: ageNum && ageNum > 0 ? ageNum : null,
                bio: bio.trim() || null,
              });
              // Update saved values after successful save
              setSavedName(name);
              setSavedAge(age);
              setSavedBio(bio);
              Alert.alert("Success", "Profile updated successfully");
            } catch (e: unknown) {
              const msg = e instanceof Error ? e.message : "Failed to update profile";
              if (msg === "OFFLINE_QUEUED") {
                // Update saved values optimistically
                setSavedName(name);
                setSavedAge(age);
                setSavedBio(bio);
                Alert.alert("Offline", "Changes saved locally and will sync when you're back online.");
              } else {
                Alert.alert("Error", msg);
              }
            } finally {
              setSavingProfile(false);
            }
          }}
          disabled={savingProfile}
        >
          <Text style={styles.saveBtnText}>{savingProfile ? "Saving..." : "Save Changes"}</Text>
        </Pressable>
      </View>

      {/* Account Info */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Account</Text>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>User ID</Text>
          <Text style={styles.infoValue}>{userId ?? "—"}</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Email</Text>
          <Text style={styles.infoValue} numberOfLines={1}>{email ?? "—"}</Text>
        </View>
      </View>

      <View style={{ height: 100 }} />
    </ScrollView>
  );

  const renderTasks = () => {
    const dashStats = (() => {
      let inProcess = 0, complete = 0, failed = 0, activeSum = 0, activeCount = 0;
      for (const t of tasks) {
        const s = String(t.status);
        if (s === "in_process" || s === "pending" || s === "not_started") {
          if (t.dueDate && Date.now() > t.dueDate) failed++; else inProcess++;
        } else if (s === "complete") complete++;
        else if (s === "failed" || s === "blocked") failed++;
        if (s !== "complete" && s !== "failed") { activeSum += (t.progress || 0); activeCount++; }
      }
      return { 
        inProcess, complete, failed, 
        avgProgress: activeCount ? Math.round(activeSum / activeCount) : 0 
      };
    })();

    const dueSoonCount = tasks.filter((t: any) => t.dueDate && t.dueDate <= Date.now() + 7 * 24 * 3600 * 1000 && t.status !== "complete").length;

    return (
      <ScrollView style={styles.tabContent} showsVerticalScrollIndicator={false}>
        {/* Banner */}
        <View style={cs.dueSoonBanner}>
          <View style={cs.dueSoonLeft}>
            <Text style={cs.dueSoonTitle}>Due soon</Text>
            <Text style={cs.dueSoonSub}>
              {dueSoonCount > 0 ? `${dueSoonCount} task${dueSoonCount !== 1 ? "s" : ""} due this week` : "No work coming up immediately"}
            </Text>
          </View>
          <Text style={cs.dueSoonLink}>📋</Text>
        </View>

        {/* Stats */}
        <View style={cs.statsStrip}>
          {[
            { label: "Assigned", value: dashStats.inProcess, color: "#1a73e8" },
            { label: "Turned In", value: dashStats.complete, color: "#188038" },
            { label: "Missing", value: dashStats.failed, color: "#c5221f" },
            { label: "Avg %", value: `${dashStats.avgProgress}%`, color: "#e37400" },
          ].map((s) => (
            <View key={s.label} style={cs.statCard}>
              <Text style={[cs.statValue, { color: s.color }]}>{s.value}</Text>
              <Text style={cs.statLabel}>{s.label}</Text>
            </View>
          ))}
        </View>

        <Text style={cs.taskCount}>{tasks.length} assignment{tasks.length !== 1 ? "s" : ""}</Text>

        <Animated.View style={{ opacity: listOpacity, transform: [{ translateY: listTranslateY }] }}>
          {tasks.length ? (
            tasks.map((t: any) => {
              const isComplete = t.status === "complete";
              const isApproved = Boolean(t.adminApproved);
              const isRunning = Boolean(t.timerRunning);
              const isExpanded = expandedTaskIds.has(t.id);
              const accentColor = PRIORITY_COLORS[t.priority] ?? "#1a73e8";
              
              // New Approval Logic Display
              let statusLabel = STATUS_LABELS[t.status] ?? t.status;
              let statusColor = STATUS_COLORS[t.status] ?? "#5f6368";
              
              if (isComplete && !isApproved) {
                statusLabel = "Pending Review";
                statusColor = "#e37400"; // Amber
              } else if (isComplete && isApproved) {
                statusLabel = "Approved";
                statusColor = "#188038"; // Green
              }

              const isLate = t.dueDate && Date.now() > t.dueDate && !isComplete;
              const checklist = (t.checklist || []) as any[];
              const doneCount = checklist.filter(c => c.done).length;
              const totalChecklist = checklist.length;
              const displayElapsed = getDisplayElapsed(t);

              return (
                <View key={t.id} style={[cs.classCard, { borderTopColor: accentColor }]}>
                  <View style={[cs.classCardHeader, { backgroundColor: accentColor + "15" }]}>
                    <View style={cs.classCardHeaderLeft}>
                      <View style={[cs.classIcon, { backgroundColor: accentColor }]}>
                        <Text style={cs.classIconText}>{(t.title || "?")[0].toUpperCase()}</Text>
                      </View>
                      <View style={cs.classHeaderMeta}>
                        <Text style={cs.classTitle} numberOfLines={isExpanded ? 0 : 1}>{t.title}</Text>
                        <Text style={cs.classSub}>{t.projectName || String(t.department ?? "Other").replace("_", " ")}</Text>
                      </View>
                    </View>
                    <View style={[cs.statusChip, { backgroundColor: statusColor + "20", borderColor: statusColor + "40" }]}>
                      <Text style={[cs.statusChipText, { color: statusColor }]}>{statusLabel}</Text>
                    </View>
                  </View>

                  <View style={cs.classCardBody}>
                    <View style={cs.dueDateRow}>
                      <Text style={cs.dueIcon}>{isLate ? "⚠️" : "🗓️"}</Text>
                      <Text style={[cs.dueText, isLate ? { color: "#c5221f" } : null]}>
                        {formatDue(t.dueDate)}
                      </Text>
                      {isLate && <Text style={cs.lateBadge}>LATE</Text>}
                    </View>

                    <View style={cs.chipRow}>
                      {totalChecklist > 0 && <View style={cs.chip}><Text style={cs.chipText}>☑ {doneCount}/{totalChecklist}</Text></View>}
                      {t.attachments.length > 0 && <View style={cs.chip}><Text style={cs.chipText}>📎 {t.attachments.length}</Text></View>}
                      {t.comments.length > 0 && <View style={cs.chip}><Text style={cs.chipText}>💬 {t.comments.length}</Text></View>}
                      {isRunning && (
                        <View style={[cs.chip, { backgroundColor: "rgba(34,197,94,0.15)", borderColor: "rgba(34,197,94,0.3)" }]}>
                          <Text style={[cs.chipText, { color: "#22c55e" }]}>⏱ {formatHms(displayElapsed)}</Text>
                        </View>
                      )}
                    </View>

                    <TouchableOpacity style={cs.expandBtn} onPress={() => toggleTaskExpansion(t.id)}>
                      <Text style={cs.expandBtnText}>{isExpanded ? "▲ Show less" : "▼ View assignment"}</Text>
                    </TouchableOpacity>

                    {isExpanded && (
                      <View style={cs.expandedContent}>
                        {t.description ? <Text style={cs.descText}>{t.description}</Text> : null}
                        
                        {totalChecklist > 0 && (
                          <View style={cs.sectionBox}>
                            <Text style={cs.sectionTitle}>SUBTASKS</Text>
                            {checklist.map((item) => (
                              <Pressable key={item.id} style={cs.checkItem} onPress={() => toggleChecklistDone(t.id, item.id)}>
                                <View style={[cs.checkbox, item.done && cs.checkboxDone]}>{item.done && <Text style={cs.checkboxCheck}>✓</Text>}</View>
                                <Text style={[cs.checkItemText, item.done && cs.checkItemDone]}>{item.text}</Text>
                              </Pressable>
                            ))}
                          </View>
                        )}

                        <View style={cs.timerBox}>
                          <View style={cs.timerTopRow}>
                            <Text style={cs.timerLabel}>Work Timer</Text>
                            <Text style={[cs.timerTime, isRunning && { color: "#22c55e" }]}>{formatHms(displayElapsed)}</Text>
                          </View>
                          <View style={cs.timerBtns}>
                            <Pressable style={[cs.timerBtn, cs.timerBtnStart, isRunning && { opacity: 0.4 }]} onPress={() => handleStartTimer(t)} disabled={isRunning}>
                              <Text style={cs.timerBtnText}>▶ {isRunning ? "Running" : "Start"}</Text>
                            </Pressable>
                            <Pressable style={[cs.timerBtn, cs.timerBtnStop, !isRunning && { opacity: 0.4 }]} onPress={() => handleStopTimer(t)} disabled={!isRunning}>
                              <Text style={[cs.timerBtnText, { color: "#d93025" }]}>■ Stop</Text>
                            </Pressable>
                            <Pressable style={[cs.timerBtn, { flex: 0, paddingHorizontal: 12, backgroundColor: "rgba(255,255,255,0.05)" }]} onPress={() => void openReportsMobile(t.id, t.title)}>
                              <Text style={{ fontSize: 14 }}>📊</Text>
                            </Pressable>
                          </View>
                        </View>

                        <View style={cs.actionBar}>
                          <Pressable 
                            style={[cs.actionBtnSecondary, (isComplete && !isApproved) && { opacity: 0.5 }]} 
                            onPress={() => !isComplete && pickAndUploadWork(t.id)} 
                            disabled={isComplete}
                          >
                            <Text style={cs.actionBtnSecondaryText}>+ Add work</Text>
                          </Pressable>
                          <Pressable 
                            style={[cs.actionBtnPrimary, isComplete && { backgroundColor: "#188038" }]} 
                            onPress={async () => {
                              try {
                                if (isComplete && isApproved) {
                                  Alert.alert("Approved", "This task has already been approved and cannot be unmarked.");
                                  return;
                                }
                                const nextStatus = isComplete ? "in_process" : "complete";
                                const nextProgress = isComplete ? 0 : 100;
                                
                                if (!isComplete) {
                                  Alert.alert(
                                    "Turn in assignment?",
                                    "This will send your work for review. You won't be able to edit or comment until reviewed.",
                                    [
                                      { text: "Cancel", style: "cancel" },
                                      { 
                                        text: "Turn In", 
                                        onPress: async () => {
                                          await apiPatch(`/api/tasks/${t.id}`, { status: "complete", progress: 100, timerRunning: false });
                                          await refreshTasksOnce();
                                        } 
                                      }
                                    ]
                                  );
                                } else {
                                  // Unmark
                                  await apiPatch(`/api/tasks/${t.id}`, { status: "in_process", progress: 0 });
                                  await refreshTasksOnce();
                                }
                              } catch (e) { Alert.alert("Error", "Update failed"); }
                            }}
                          >
                            <Text style={cs.actionBtnPrimaryText}>{isComplete ? "↩ Unmark" : "✓ Mark done"}</Text>
                          </Pressable>
                        </View>

                        {/* Inline Task Conversation - Only if not pending review or if admin */}
                        <View style={{ marginTop: 16 }}>
                          {(isComplete && !isApproved) ? (
                            <View style={{ padding: 12, backgroundColor: "rgba(255,255,255,0.05)", borderRadius: 12, alignItems: "center" }}>
                              <Text style={{ color: "rgba(255,255,255,0.5)", fontSize: 13, textAlign: "center" }}>
                                Comments are disabled while pending review.
                              </Text>
                            </View>
                          ) : (
                            <TaskConversation
                              taskId={String(t.id)}
                              comments={(t.comments ?? []) as any}
                              currentUserId={String(userId ?? "")}
                              currentUserEmail={String(email ?? "")}
                              onCommentsChange={refreshTasksOnce}
                            />
                          )}
                        </View>
                      </View>
                    )}
                  </View>
                </View>
              );
            })
          ) : (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyEmoji}>📋</Text>
              <Text style={styles.emptyTitle}>No tasks yet</Text>
              <Text style={styles.emptySubtitle}>Check back later for new assignments</Text>
            </View>
          )}
        </Animated.View>

      <View style={{ height: 100 }} />
    </ScrollView>
  );
};

  const renderNotifications = () => (
    <ScrollView style={styles.tabContent} showsVerticalScrollIndicator={false}>
      <Text style={styles.pageTitle}>Notifications</Text>
      {notifs.length ? (
        notifs.map((n: any) => (
          <Pressable 
            key={n.id} 
            style={({ pressed }) => [
              styles.notifCard,
              pressed && { opacity: 0.85 },
              !n.read ? { borderColor: "rgba(59,130,246,0.5)", backgroundColor: "rgba(59,130,246,0.15)" } : {},
            ]}
            onPress={async () => {
              setUnreadDot(false);
              if (!n.read) {
                try {
                  await apiPatch(`/api/notifications/${n.id}`, { read: true });
                  setNotifs((prev: any[]) => prev.map((x: any) => x.id === n.id ? { ...x, read: true } : x));
                } catch (e) { /* ignore */ }
              }
              if (n.taskId) {
                setTab("tasks");
              }
            }}
          >
            <View style={styles.notifHeader}>
              {!n.read ? <View style={[styles.notifDot, { backgroundColor: "#3b82f6" }]} /> : <View style={styles.notifDot} />}
              <Text style={[styles.notifTitle, !n.read && { fontWeight: "bold" }]}>{n.title}</Text>
            </View>
            {n.message ? <Text style={styles.notifMessage}>{n.message}</Text> : null}
            {n.taskId ? (
              <Text style={{ color: "#60a5fa", fontSize: 11, marginTop: 4 }}>📋 Tap to view task</Text>
            ) : null}
            <Text style={styles.notifTime}>{new Date(n.createdAtMs).toLocaleString()}</Text>
            <Pressable
              style={({ pressed }) => [styles.dismissBtn, pressed && styles.dismissBtnPressed]}
              onPress={async (e) => {
                e.stopPropagation?.();
                try {
                  await apiDelete(`/api/notifications/${n.id}`);
                  setNotifs((prev: any[]) => prev.filter((x: any) => x.id !== n.id));
                } catch {
                  // ignore
                }
              }}
            >
              <Text style={styles.dismissText}>Dismiss</Text>
            </Pressable>
          </Pressable>
        ))
      ) : (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyEmoji}>🔔</Text>
          <Text style={styles.emptyTitle}>No notifications</Text>
          <Text style={styles.emptySubtitle}>You're all caught up!</Text>
        </View>
      )}
      <View style={{ height: 100 }} />
    </ScrollView>
  );

  const renderBulletin = () => (
    <ScrollView style={styles.tabContent} showsVerticalScrollIndicator={false}>
      <Text style={styles.pageTitle}>Bulletin Board</Text>
      <BulletinBoardScreen isAdmin={false} />
      <View style={{ height: 100 }} />
    </ScrollView>
  );

  const renderConfessions = () => (
    <ScrollView style={styles.tabContent} showsVerticalScrollIndicator={false}>
      <Text style={styles.pageTitle}>Confessions</Text>
      <ConfessionChatScreen isAdmin={false} userId={userId || undefined} />
      <View style={{ height: 100 }} />
    </ScrollView>
  );

  const renderSettings = () => (
    <ScrollView style={styles.tabContent} showsVerticalScrollIndicator={false}>
      <Text style={styles.pageTitle}>Settings</Text>

      <View style={styles.card}>
        <Pressable
          style={({ pressed }) => [styles.logoutBtn, pressed && styles.logoutBtnPressed]}
          onPress={async () => {
            try {
              await apiPost("/api/auth/logout");
            } catch {
              // ignore
            }
            await setToken(null);
          }}
        >
          <Text style={styles.logoutBtnText}>Log Out</Text>
        </Pressable>
      </View>

      <View style={{ height: 100 }} />
    </ScrollView>
  );

  const tabs: { key: Tab; icon: string; label: string; hasBadge?: boolean }[] = [
    { key: "profile", icon: "👤", label: "Profile" },
    { key: "tasks", icon: "📋", label: "Tasks" },
    { key: "bulletin", icon: "📣", label: "Bulletin" },
    { key: "confessions", icon: "💬", label: "Chat" },
    { key: "notifications", icon: "🔔", label: "Alerts", hasBadge: unreadDot },
    { key: "settings", icon: "⚙️", label: "Settings" },
  ];

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        {tab === "profile" && renderProfile()}
        {tab === "tasks" && renderTasks()}
        {tab === "bulletin" && renderBulletin()}
        {tab === "confessions" && renderConfessions()}
        {tab === "notifications" && renderNotifications()}
        {tab === "settings" && renderSettings()}
      </View>

      {/* Bottom Tab Bar */}
      <View style={styles.tabBar}>
        {tabs.map((t) => (
          <Pressable
            key={t.key}
            style={({ pressed }) => [styles.tabItem, tab === t.key && styles.tabItemActive, pressed && styles.tabItemPressed]}
            onPress={() => {
              setTab(t.key);
              if (t.key === "notifications") setUnreadDot(false);
            }}
          >
            <Text style={[styles.tabIcon, tab === t.key && styles.tabIconActive]}>{t.icon}</Text>
            <Text style={[styles.tabLabel, tab === t.key && styles.tabLabelActive]}>{t.label}</Text>
            {t.hasBadge && <View style={styles.tabBadge} />}
          </Pressable>
        ))}
      </View>

      {/* ===== STOP REPORT MODAL ===== */}
      <Modal
        visible={!!stopReportModalMobile}
        transparent
        animationType="slide"
        onRequestClose={() => { setStopReportModalMobile(null); setStopReportNoteMobile(""); }}
      >
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.65)", justifyContent: "center", alignItems: "center", padding: 20 }}>
          <View style={{ width: "100%", backgroundColor: "#0f0f1a", borderRadius: 20, padding: 24, borderWidth: 1, borderColor: "rgba(255,255,255,0.12)" }}>
            <Text style={{ fontSize: 18, fontWeight: "700", color: "white", marginBottom: 4 }}>⏹ Timer Stopped</Text>
            <Text style={{ fontSize: 13, color: "rgba(255,255,255,0.55)", marginBottom: 16 }}>
              Time recorded:{" "}
              <Text style={{ fontFamily: "monospace", fontWeight: "600", color: "white" }}>
                {stopReportModalMobile ? formatHms(stopReportModalMobile.elapsed) : ""}
              </Text>
              {"\n"}Write a note about where you left off (optional).
            </Text>
            <TextInput
              style={{
                backgroundColor: "rgba(255,255,255,0.07)",
                borderRadius: 12,
                borderWidth: 1,
                borderColor: "rgba(255,255,255,0.12)",
                color: "white",
                padding: 14,
                fontSize: 14,
                minHeight: 90,
                textAlignVertical: "top",
                marginBottom: 16,
              }}
              value={stopReportNoteMobile}
              onChangeText={setStopReportNoteMobile}
              placeholder="e.g. Finished the login form, still need to connect to the API..."
              placeholderTextColor="rgba(255,255,255,0.3)"
              multiline
              numberOfLines={4}
            />
            <View style={{ flexDirection: "row", gap: 12 }}>
              <Pressable
                style={({ pressed }) => [{ flex: 1, backgroundColor: "#2563eb", borderRadius: 12, paddingVertical: 14, alignItems: "center", opacity: stopReportSavingMobile ? 0.6 : pressed ? 0.85 : 1 }]}
                onPress={() => void submitStopReportMobile()}
                disabled={stopReportSavingMobile}
              >
                <Text style={{ color: "white", fontWeight: "700", fontSize: 15 }}>{stopReportSavingMobile ? "Saving..." : "Save & Close"}</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [{ backgroundColor: "rgba(255,255,255,0.08)", borderRadius: 12, paddingVertical: 14, paddingHorizontal: 20, alignItems: "center", opacity: pressed ? 0.75 : 1 }]}
                onPress={() => { setStopReportModalMobile(null); setStopReportNoteMobile(""); }}
              >
                <Text style={{ color: "rgba(255,255,255,0.65)", fontWeight: "600", fontSize: 15 }}>Skip</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* ===== VIEW REPORTS MODAL ===== */}
      <Modal
        visible={!!reportsModalMobile}
        transparent
        animationType="slide"
        onRequestClose={() => setReportsModalMobile(null)}
      >
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.65)", justifyContent: "flex-end" }}>
          <View style={{ backgroundColor: "#0f0f1a", borderTopLeftRadius: 24, borderTopRightRadius: 24, borderWidth: 1, borderColor: "rgba(255,255,255,0.12)", maxHeight: "78%", paddingBottom: 30 }}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 20, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.08)" }}>
              <View>
                <Text style={{ fontSize: 18, fontWeight: "700", color: "white" }}>📊 Timer Reports</Text>
                <Text style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", marginTop: 2 }} numberOfLines={1}>
                  {reportsModalMobile?.taskTitle}
                </Text>
              </View>
              <Pressable
                style={({ pressed }) => [{ backgroundColor: "rgba(255,255,255,0.08)", borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8, opacity: pressed ? 0.75 : 1 }]}
                onPress={() => setReportsModalMobile(null)}
              >
                <Text style={{ color: "rgba(255,255,255,0.7)", fontWeight: "600" }}>Close</Text>
              </Pressable>
            </View>
            <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, gap: 12 }}>
              {(() => {
                console.log("[Reports RENDER] loading:", reportsLoadingMobile, "data length:", reportsDataMobile.length, "first item:", reportsDataMobile[0]);
                return null;
              })()}
              {reportsLoadingMobile ? (
                <View style={{ alignItems: "center", paddingVertical: 40 }}>
                  <ActivityIndicator color="white" />
                  <Text style={{ color: "rgba(255,255,255,0.4)", marginTop: 12 }}>Loading reports...</Text>
                </View>
              ) : (
                <>
                  {reportsDataMobile.length === 0 && (
                    <View style={{ alignItems: "center", paddingVertical: 20 }}>
                      <Text style={{ fontSize: 32 }}>📊</Text>
                      <Text style={{ color: "rgba(255,255,255,0.45)", fontSize: 15, marginTop: 8, fontWeight: "600" }}>No reports yet</Text>
                    </View>
                  )}
                  {reportsDataMobile.map((r: any, idx: number) => (
                    <View key={String(r.id) || idx} style={{ backgroundColor: "rgba(255,255,255,0.06)", borderRadius: 14, padding: 14, borderWidth: 1, borderColor: "rgba(255,255,255,0.09)" }}>
                      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                          <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: "rgba(59,130,246,0.2)", alignItems: "center", justifyContent: "center" }}>
                            <Text style={{ fontSize: 16 }}>⏱</Text>
                          </View>
                          <View>
                            <Text style={{ fontFamily: "monospace", fontSize: 16, fontWeight: "700", color: "white" }}>
                              {formatHms(r.elapsedSeconds || r.elapsed_seconds || 0)}
                            </Text>
                            <Text style={{ fontSize: 11, color: "rgba(255,255,255,0.45)" }}>
                              {r.userName || r.user_name || r.userEmail || r.user_email || "You"}
                            </Text>
                          </View>
                        </View>
                        <Text style={{ fontSize: 11, color: "rgba(255,255,255,0.35)" }}>
                          {(r.createdAt || r.created_at) ? new Date(r.createdAt || r.created_at || 0).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "-"}
                        </Text>
                      </View>
                      {(r.stopNote || r.stop_note) ? (
                        <View style={{ backgroundColor: "rgba(255,255,255,0.05)", borderRadius: 10, padding: 10 }}>
                          <Text style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginBottom: 4 }}>Stop note:</Text>
                          <Text style={{ fontSize: 13, color: "rgba(255,255,255,0.8)" }}>{r.stopNote || r.stop_note}</Text>
                        </View>
                      ) : null}
                    </View>
                  ))}
                </>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0b0b10" },
  content: { flex: 1 },
  tabContent: { flex: 1, paddingHorizontal: 16 },

  // Header Card
  headerCard: {
    alignItems: "center",
    paddingVertical: 24,
    marginTop: 8,
  },
  avatarContainer: {
    alignItems: "center",
  },
  avatar: {
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 4,
    borderColor: "rgba(255,255,255,0.15)",
  },
  avatarPlaceholder: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: "rgba(255,255,255,0.1)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 4,
    borderColor: "rgba(255,255,255,0.15)",
  },
  avatarEmoji: {
    fontSize: 50,
  },
  avatarOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
    justifyContent: "center",
  },
  changePhotoBtn: {
    marginTop: 12,
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.12)",
  },
  changePhotoBtnPressed: {
    backgroundColor: "rgba(255,255,255,0.2)",
  },
  changePhotoText: {
    color: "white",
    fontWeight: "600",
    fontSize: 14,
  },
  userName: {
    color: "white",
    fontSize: 24,
    fontWeight: "700",
    marginTop: 16,
  },
  userEmail: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 14,
    marginTop: 4,
  },

  // Cards
  card: {
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: 20,
    padding: 20,
    marginBottom: 12,
  },
  cardTitle: {
    color: "white",
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 16,
  },
  pageTitle: {
    color: "white",
    fontSize: 28,
    fontWeight: "700",
    marginTop: 16,
    marginBottom: 20,
  },
  pageHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 16,
    marginBottom: 20,
  },
  assignedCount: {
    color: "rgba(255,255,255,0.6)",
    fontSize: 13,
    fontWeight: "600",
  },

  // Form Fields
  field: {
    marginBottom: 16,
  },
  label: {
    color: "rgba(255,255,255,0.6)",
    fontSize: 13,
    fontWeight: "500",
    marginBottom: 8,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  input: {
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: "white",
    fontSize: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  bioInput: {
    height: 100,
    textAlignVertical: "top",
    paddingTop: 14,
  },

  // Info Rows
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.08)",
  },
  infoLabel: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 14,
  },
  infoValue: {
    color: "white",
    fontSize: 14,
    fontWeight: "500",
    flex: 1,
    textAlign: "right",
    marginLeft: 16,
  },

  // Buttons
  saveBtn: {
    backgroundColor: "#3b82f6",
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
    marginTop: 8,
  },
  saveBtnPressed: {
    backgroundColor: "#2563eb",
  },
  saveBtnDisabled: {
    opacity: 0.6,
  },
  saveBtnText: {
    color: "white",
    fontSize: 16,
    fontWeight: "600",
  },
  logoutBtn: {
    backgroundColor: "#ef4444",
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
  },
  logoutBtnPressed: {
    backgroundColor: "#dc2626",
  },
  logoutBtnText: {
    color: "white",
    fontSize: 16,
    fontWeight: "600",
  },

  // Task Cards
  taskCardWrap: {
    position: "relative",
    overflow: "hidden",
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
  },
  taskLeftBar: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: 6,
  },
  taskInner: {
    padding: 16,
    paddingLeft: 18,
  },
  taskTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    marginBottom: 10,
  },
  deptText: {
    color: "rgba(255,255,255,0.55)",
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.6,
    flex: 1,
  },
  statusPill: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
  },
  statusPillText: {
    fontSize: 11,
    fontWeight: "800",
  },
  statusBadge: {
    alignSelf: "flex-start",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginBottom: 10,
  },
  statusText: {
    color: "white",
    fontSize: 11,
    fontWeight: "600",
    textTransform: "capitalize",
  },
  taskTitle: {
    color: "white",
    fontSize: 17,
    fontWeight: "600",
    marginBottom: 6,
  },
  taskDesc: {
    color: "rgba(255,255,255,0.6)",
    fontSize: 14,
    marginBottom: 12,
  },
  dueRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 10,
  },
  dueIcon: {
    fontSize: 14,
    opacity: 0.7,
  },
  dueText: {
    color: "rgba(255,255,255,0.65)",
    fontSize: 13,
    fontWeight: "600",
    flex: 1,
  },
  dueTextLate: {
    color: "#fca5a5",
    fontWeight: "800",
  },
  lateText: {
    color: "#f87171",
    fontSize: 12,
    fontWeight: "700",
  },
  subtasksBox: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    backgroundColor: "rgba(255,255,255,0.05)",
    padding: 12,
    marginBottom: 10,
  },
  subtasksHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  subtasksTitle: {
    color: "rgba(255,255,255,0.55)",
    fontSize: 11,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  subtasksCount: {
    color: "rgba(255,255,255,0.45)",
    fontSize: 11,
    fontWeight: "700",
  },
  subtaskRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 3,
  },
  subtaskMark: {
    fontSize: 14,
    opacity: 0.9,
  },
  subtaskText: {
    color: "rgba(255,255,255,0.85)",
    fontSize: 13,
    fontWeight: "600",
    flex: 1,
  },
  subtaskTextDone: {
    color: "rgba(255,255,255,0.40)",
    textDecorationLine: "line-through",
  },
  moreSubtasksText: {
    marginTop: 6,
    color: "rgba(255,255,255,0.4)",
    fontSize: 12,
    fontWeight: "600",
  },
  attachmentsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 10,
  },
  sectionLabel: {
    color: "rgba(255,255,255,0.55)",
    fontSize: 12,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  attachmentChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.06)",
    paddingHorizontal: 10,
    paddingVertical: 6,
    maxWidth: 320,
  },
  attachmentChipPress: {
    minWidth: 60,
    flexShrink: 1,
  },
  attachmentChipText: {
    color: "rgba(255,255,255,0.78)",
    fontSize: 12,
    fontWeight: "700",
    flexShrink: 1,
  },
  attachmentRemoveBtn: {
    marginLeft: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: "rgba(239,68,68,0.18)",
    borderWidth: 1,
    borderColor: "rgba(239,68,68,0.25)",
  },
  attachmentRemoveText: {
    color: "rgba(255,255,255,0.9)",
    fontSize: 12,
    fontWeight: "900",
  },
  addWorkBtnCard: {
    flex: 1,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.06)",
    paddingHorizontal: 12,
    paddingVertical: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  addWorkBtnCardDisabled: {
    opacity: 0.6,
  },
  addWorkBtnCardText: {
    color: "rgba(255,255,255,0.9)",
    fontSize: 12,
    fontWeight: "800",
  },
  cardActionsRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.10)",
  },
  markDoneBtnCard: {
    flex: 1,
    borderRadius: 12,
    backgroundColor: "#3b82f6",
    paddingHorizontal: 14,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  markDoneBtnCardDone: {
    backgroundColor: "rgba(34,197,94,0.25)",
    borderWidth: 1,
    borderColor: "rgba(34,197,94,0.35)",
  },
  markDoneBtnCardText: {
    color: "white",
    fontSize: 13,
    fontWeight: "900",
  },
  subtaskAddWorkPill: {
    marginLeft: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.06)",
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  subtaskAddWorkPillText: {
    color: "rgba(255,255,255,0.9)",
    fontSize: 12,
    fontWeight: "900",
  },
  progressBar: {
    height: 6,
    backgroundColor: "rgba(255,255,255,0.1)",
    borderRadius: 3,
    marginBottom: 6,
  },
  progressFill: {
    height: 6,
    borderRadius: 3,
  },
  progressText: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 12,
  },

  // Notification Cards
  notifCard: {
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
  },
  notifHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  notifDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#3b82f6",
    marginRight: 10,
  },
  notifTitle: {
    color: "white",
    fontSize: 16,
    fontWeight: "600",
  },
  notifMessage: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 14,
    marginBottom: 8,
  },
  notifTime: {
    color: "rgba(255,255,255,0.4)",
    fontSize: 12,
    marginBottom: 12,
  },
  dismissBtn: {
    alignSelf: "flex-start",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: "rgba(255,255,255,0.1)",
  },
  dismissBtnPressed: {
    backgroundColor: "rgba(255,255,255,0.15)",
  },
  dismissText: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 13,
    fontWeight: "500",
  },
  cardDivider: {
    height: 1,
    backgroundColor: "rgba(255,255,255,0.08)",
    marginVertical: 4,
  },

  // Empty State
  emptyCard: {
    alignItems: "center",
    paddingVertical: 60,
  },
  emptyEmoji: {
    fontSize: 48,
    marginBottom: 16,
  },
  emptyTitle: {
    color: "white",
    fontSize: 18,
    fontWeight: "600",
    marginBottom: 8,
  },
  emptySubtitle: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 14,
  },

  // Bottom Tab Bar
  tabBar: {
    flexDirection: "row",
    backgroundColor: "rgba(255,255,255,0.05)",
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.1)",
    paddingBottom: 20,
    paddingTop: 12,
  },
  tabItem: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  tabItemActive: {
    // Active styling
  },
  tabItemPressed: {
    opacity: 0.7,
  },
  tabIcon: {
    fontSize: 22,
    marginBottom: 4,
    opacity: 0.5,
  },
  tabIconActive: {
    opacity: 1,
  },
  tabLabel: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 11,
    fontWeight: "500",
  },
  tabLabelActive: {
    color: "white",
  },
  tabBadge: {
    position: "absolute",
    top: 0,
    right: "25%",
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#ef4444",
  },

  // Task Modal
  modalOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.7)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  modalContent: {
    backgroundColor: "#0f1117",
    borderRadius: 20,
    padding: 20,
    width: "100%",
    maxHeight: "80%",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  modalTitle: {
    color: "white",
    fontSize: 20,
    fontWeight: "700",
  },
  modalClose: {
    padding: 8,
  },
  modalFieldTitle: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 12,
    fontWeight: "600",
    textTransform: "uppercase",
    marginTop: 12,
    marginBottom: 4,
  },
  modalFieldValue: {
    color: "white",
    fontSize: 16,
    fontWeight: "500",
  },
  modalMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 6,
  },
  modalMetaIcon: {
    fontSize: 14,
  },
  modalMetaText: {
    color: "rgba(255,255,255,0.60)",
    fontSize: 13,
    fontWeight: "600",
    flex: 1,
  },
  modalCloseBtn: {
    backgroundColor: "#3b82f6",
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 24,
  },
  modalCloseBtnText: {
    color: "white",
    fontSize: 16,
    fontWeight: "600",
  },
  modalSubtaskRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    paddingVertical: 4,
  },
  modalSubtaskMark: {
    fontSize: 16,
    marginTop: 1,
  },
  modalSubtaskText: {
    color: "rgba(255,255,255,0.85)",
    fontSize: 14,
    fontWeight: "600",
    flex: 1,
  },
  modalSubtaskTextDone: {
    color: "rgba(255,255,255,0.40)",
    textDecorationLine: "line-through",
  },
  subtaskToggle: {
    paddingRight: 2,
    paddingVertical: 2,
  },
  subtaskTextPress: {
    flex: 1,
    paddingVertical: 2,
  },
  modalActionsRow: {
    marginTop: 18,
  },
  modalActionBtn: {
    backgroundColor: "#3b82f6",
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
  },
  modalActionBtnText: {
    color: "white",
    fontSize: 15,
    fontWeight: "800",
  },
  workLink: {
    alignSelf: "flex-start",
    paddingVertical: 8,
  },
  workLinkDisabled: {
    opacity: 0.6,
  },
  workLinkText: {
    color: "rgba(255,255,255,0.65)",
    fontSize: 12,
    fontWeight: "700",
  },
});

const detailStyles = StyleSheet.create({
  sectionBox: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    backgroundColor: "rgba(255,255,255,0.05)",
    padding: 14,
    marginBottom: 12,
  },
  sectionRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  sectionLabel: {
    color: "rgba(255,255,255,0.6)",
    fontSize: 12,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  statusValue: {
    fontSize: 12,
    fontWeight: "700",
  },
  statusDropdown: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
    backgroundColor: "rgba(255,255,255,0.08)",
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  statusDropdownText: {
    color: "white",
    fontSize: 14,
    fontWeight: "600",
    flex: 1,
  },
  timerDisplay: {
    color: "white",
    fontSize: 18,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
    letterSpacing: 1,
  },
  timerBtns: {
    flexDirection: "row",
    gap: 10,
  },
  timerStartBtn: {
    flex: 1,
    borderRadius: 10,
    backgroundColor: "#16a34a",
    paddingVertical: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  timerStopBtn: {
    flex: 1,
    borderRadius: 10,
    backgroundColor: "#dc2626",
    paddingVertical: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  timerBtnDisabled: {
    opacity: 0.35,
  },
  timerBtnText: {
    color: "white",
    fontWeight: "700",
    fontSize: 14,
  },
  markDoneBtnDone: {
    backgroundColor: "#16a34a",
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

  actionBar: { flexDirection: "row", gap: 10, marginBottom: 16 },
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
