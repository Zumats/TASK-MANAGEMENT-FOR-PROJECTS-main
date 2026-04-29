"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { apiGet, apiPatch, apiPost } from "@/lib/api";
import type { TaskItem } from "@/lib/types";
import { useDocumentTheme } from "@/hooks/useDocumentTheme";
import { Card } from "@/components/Card";
import {
  FileText,
  Timer,
  Search,
  MessageSquareText,
  CheckCircle2,
  Clock,
  XCircle,
  ShieldCheck,
  AlertTriangle,
} from "lucide-react";

// Dynamic import for SweetAlert2 (client-side only)
async function swal() {
  const Swal = (await import("sweetalert2")).default;
  return Swal;
}

type UserRec = {
  id: number;
  email: string;
  name?: string | null;
  avatarUrl?: string | null;
};

type ReportRow = {
  id: number;
  elapsedSeconds: number;
  stopNote: string | null;
  createdAt: number;
  userEmail: string;
  userName: string | null;
};

function assigneeDisplay(t: TaskItem, users: UserRec[]) {
  const fromApi = {
    email: t.assignedToEmail,
    name: t.assignedToName,
    avatar: t.assignedToAvatarUrl,
  };
  const uid = Number(t.assignedTo);
  const u = Number.isFinite(uid) ? users.find((x) => x.id === uid) : undefined;
  const email = fromApi.email ?? u?.email ?? "";
  const name = fromApi.name ?? u?.name ?? null;
  const avatarUrl = fromApi.avatar ?? u?.avatarUrl ?? null;
  const label = name?.trim() || email.split("@")[0] || "User";
  return { email, name, avatarUrl, label };
}

/**
 * Returns the display status for ADMIN USERS TASKS view.
 * - complete + admin_approved = true  → "Approved" (green)
 * - complete + admin_approved = false → "Done (Pending)" (amber - awaiting admin decision)
 * - other statuses → normal label
 */
function adminStatusInfo(t: TaskItem): {
  label: string;
  colorClass: string;
  icon: React.ReactNode;
  isPending: boolean;
  isApproved: boolean;
} {
  const status = String(t.status);
  const adminApproved = Boolean(t.adminApproved);

  if (status === "complete") {
    if (adminApproved) {
      return {
        label: "Approved",
        colorClass: "bg-emerald-500/15 text-emerald-400 border border-emerald-500/20",
        icon: <ShieldCheck className="h-3 w-3" />,
        isPending: false,
        isApproved: true,
      };
    } else {
      return {
        label: "Done (Pending Review)",
        colorClass: "bg-amber-500/15 text-amber-400 border border-amber-500/20",
        icon: <Clock className="h-3 w-3" />,
        isPending: true,
        isApproved: false,
      };
    }
  }

  if (status === "blocked")
    return {
      label: "Blocked",
      colorClass: "bg-orange-500/15 text-orange-400 border border-orange-500/20",
      icon: <XCircle className="h-3 w-3" />,
      isPending: false,
      isApproved: false,
    };
  if (status === "in_process")
    return {
      label: "In Process",
      colorClass: "bg-blue-500/15 text-blue-400 border border-blue-500/20",
      icon: <Timer className="h-3 w-3" />,
      isPending: false,
      isApproved: false,
    };
  if (status === "pending" || status === "not_started")
    return {
      label: "Pending",
      colorClass: "bg-slate-500/15 text-slate-400 border border-slate-500/20",
      icon: <AlertTriangle className="h-3 w-3" />,
      isPending: false,
      isApproved: false,
    };

  return {
    label: status.replace(/_/g, " "),
    colorClass: "bg-white/5 text-white/60 border border-white/10",
    icon: null,
    isPending: false,
    isApproved: false,
  };
}

export function AdminUsersTasks({
  tasks,
  allUserRecords,
  focusUserId,
  onTaskPatched,
}: {
  tasks: TaskItem[];
  allUserRecords: UserRec[];
  focusUserId?: string | null;
  onTaskPatched?: (taskId: string, patch: Partial<TaskItem>) => void;
}) {
  const isDark = useDocumentTheme() === "dark";
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [userFilter, setUserFilter] = useState<string>("all");
  const [reportsTask, setReportsTask] = useState<{ id: string; title: string } | null>(null);
  const [reports, setReports] = useState<ReportRow[] | null>(null);
  const [reportsLoading, setReportsLoading] = useState(false);
  const [detailsTaskId, setDetailsTaskId] = useState<string | null>(null);
  const [decisionBusy, setDecisionBusy] = useState<string | null>(null);
  const [chatText, setChatText] = useState("");
  const [sendingChat, setSendingChat] = useState(false);

  useEffect(() => {
    if (focusUserId) setUserFilter(String(focusUserId));
  }, [focusUserId]);

  const assigneeOptions = useMemo(() => {
    const m = new Map<string, string>();
    for (const t of tasks) {
      const { label, email } = assigneeDisplay(t, allUserRecords);
      const id = String(t.assignedTo);
      if (!m.has(id)) m.set(id, label + (email ? ` (${email})` : ""));
    }
    return Array.from(m.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [tasks, allUserRecords]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return tasks.filter((t) => {
      if (statusFilter !== "all" && String(t.status) !== statusFilter) return false;
      if (userFilter !== "all" && String(t.assignedTo) !== userFilter) return false;
      if (!q) return true;
      const { label, email } = assigneeDisplay(t, allUserRecords);
      const blob = [t.title, t.description, t.projectName, label, email].join(" ").toLowerCase();
      return blob.includes(q);
    });
  }, [tasks, query, statusFilter, userFilter, allUserRecords]);

  // Count tasks pending admin review
  const pendingCount = useMemo(
    () => tasks.filter((t) => String(t.status) === "complete" && !t.adminApproved).length,
    [tasks]
  );

  const openReports = async (taskId: string, title: string) => {
    setReportsTask({ id: taskId, title });
    setReportsLoading(true);
    setReports(null);
    try {
      const data = await apiGet<{ items: ReportRow[] }>(`/api/tasks/${taskId}/reports`);
      setReports(data.items ?? []);
    } catch {
      setReports([]);
    } finally {
      setReportsLoading(false);
    }
  };

  const rootCls =
    "aut-root p-6 space-y-6 " + (isDark ? "bg-[#0b0b10] text-white" : "bg-slate-50 text-slate-900");

  const detailsTask = useMemo(() => {
    if (!detailsTaskId) return null;
    return tasks.find((t) => String(t.id) === String(detailsTaskId)) ?? null;
  }, [detailsTaskId, tasks]);

  const handleApprove = async () => {
    if (!detailsTask) return;
    const Swal = await swal();
    const result = await Swal.fire({
      title: "Approve Task?",
      html: `<p style="color:#a0a0b0;margin-top:8px">Mark <strong style="color:#fff">"${detailsTask.title}"</strong> as fully complete.<br/>This will update the Work Overview to <strong style="color:#22c55e">Complete</strong>.</p>`,
      icon: "question",
      background: "#191922",
      color: "#ffffff",
      confirmButtonColor: "#22c55e",
      cancelButtonColor: "#3b3b4f",
      confirmButtonText: "✓ Approve & Complete",
      cancelButtonText: "Cancel",
      showCancelButton: true,
      customClass: {
        popup: "swal-dark-popup",
      },
    });
    if (!result.isConfirmed) return;
    setDecisionBusy(String(detailsTask.id));
    try {
      await apiPatch(`/api/tasks/${detailsTask.id}`, {
        status: "complete",
        progress: 100,
        adminApproved: true,
      });
      onTaskPatched?.(String(detailsTask.id), {
        status: "complete",
        progress: 100,
        adminApproved: true,
      });
      await Swal.fire({
        title: "Task Approved!",
        text: "Work Overview has been updated to Complete.",
        icon: "success",
        background: "#191922",
        color: "#ffffff",
        confirmButtonColor: "#22c55e",
        timer: 2000,
        timerProgressBar: true,
      });
      setDetailsTaskId(null);
    } finally {
      setDecisionBusy(null);
    }
  };

  const handleDecline = async () => {
    if (!detailsTask) return;
    const Swal = await swal();
    const result = await Swal.fire({
      title: "Send Back to In Process?",
      html: `<p style="color:#a0a0b0;margin-top:8px">This will send <strong style="color:#fff">"${detailsTask.title}"</strong> back to <strong style="color:#3b82f6">In Process</strong>.<br/>The user will be notified.</p>`,
      icon: "warning",
      background: "#191922",
      color: "#ffffff",
      confirmButtonColor: "#ef4444",
      cancelButtonColor: "#3b3b4f",
      confirmButtonText: "↩ Send Back",
      cancelButtonText: "Cancel",
      showCancelButton: true,
    });
    if (!result.isConfirmed) return;
    setDecisionBusy(String(detailsTask.id));
    try {
      await apiPatch(`/api/tasks/${detailsTask.id}`, {
        status: "in_process",
        progress: 0,
        adminApproved: false,
      });
      onTaskPatched?.(String(detailsTask.id), {
        status: "in_process",
        progress: 0,
        adminApproved: false,
      });
      await Swal.fire({
        title: "Task Sent Back",
        text: "The task status has been reset to In Process.",
        icon: "info",
        background: "#191922",
        color: "#ffffff",
        confirmButtonColor: "#3b82f6",
        timer: 2000,
        timerProgressBar: true,
      });
      setDetailsTaskId(null);
    } finally {
      setDecisionBusy(null);
    }
  };

  return (
    <div className={rootCls}>
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className={"text-2xl font-bold tracking-tight " + (isDark ? "text-white" : "text-slate-900")}>
            Users Tasks
          </h2>
          <p className={"mt-1 text-sm " + (isDark ? "text-white/50" : "text-slate-600")}>
            Every assignee's workload: status, progress, files, and timer reports.
          </p>
        </div>
        {/* Pending review badge */}
        {pendingCount > 0 && (
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2"
          >
            <Clock className="h-4 w-4 text-amber-400" />
            <span className="text-sm font-semibold text-amber-400">
              {pendingCount} task{pendingCount !== 1 ? "s" : ""} awaiting review
            </span>
          </motion.div>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-end">
        <div className="relative flex-1 min-w-[200px]">
          <Search
            className={"absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 " + (isDark ? "text-white/35" : "text-slate-400")}
          />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter by task, project, assignee…"
            className={
              "w-full rounded-xl border py-2.5 pl-10 pr-3 text-sm outline-none " +
              (isDark
                ? "border-white/10 bg-white/5 text-white placeholder:text-white/30"
                : "border-slate-200 bg-white text-slate-900 placeholder:text-slate-400")
            }
          />
        </div>
        <div className="grid gap-2 sm:grid-cols-2 lg:flex lg:gap-3">
          <div className="grid gap-1">
            <label className={"text-[11px] font-semibold uppercase " + (isDark ? "text-white/45" : "text-slate-500")}>
              Status
            </label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className={
                "rounded-xl border px-3 py-2 text-sm outline-none " +
                (isDark ? "border-white/10 bg-white/5 text-white" : "border-slate-200 bg-white text-slate-900")
              }
              style={{ colorScheme: isDark ? "dark" : "light" }}
            >
              <option value="all">All statuses</option>
              <option value="pending">Pending</option>
              <option value="not_started">Not started</option>
              <option value="in_process">In process</option>
              <option value="blocked">Blocked</option>
              <option value="complete">Done / Complete</option>
              <option value="failed">Failed</option>
            </select>
          </div>
          <div className="grid gap-1 min-w-[200px]">
            <label className={"text-[11px] font-semibold uppercase " + (isDark ? "text-white/45" : "text-slate-500")}>
              Assignee
            </label>
            <select
              value={userFilter}
              onChange={(e) => setUserFilter(e.target.value)}
              className={
                "rounded-xl border px-3 py-2 text-sm outline-none " +
                (isDark ? "border-white/10 bg-white/5 text-white" : "border-slate-200 bg-white text-slate-900")
              }
              style={{ colorScheme: isDark ? "dark" : "light" }}
            >
              <option value="all">All users</option>
              {assigneeOptions.map(([id, label]) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className={"text-xs " + (isDark ? "text-white/45" : "text-slate-500")}>
        Showing {filtered.length} of {tasks.length} tasks
      </div>

      {/* Task Cards */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <AnimatePresence>
          {filtered.length === 0 ? (
            <div className={"col-span-full py-16 text-center text-sm " + (isDark ? "text-white/40" : "text-slate-500")}>
              No tasks match your filters.
            </div>
          ) : (
            filtered.map((t, i) => {
              const a = assigneeDisplay(t, allUserRecords);
              const mainAtt =
                t.attachments?.filter((x) => x.checklistItemId == null || x.checklistItemId === 0) ?? [];
              const subAttCount = (t.attachments?.length ?? 0) - mainAtt.length;
              const statusInfo = adminStatusInfo(t);

              return (
                <motion.div
                  key={t.id}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.2, delay: i * 0.03 }}
                >
                  <Card
                    className={
                      "flex flex-col gap-3 border p-4 h-full " +
                      (statusInfo.isPending
                        ? "border-amber-500/20 " + (isDark ? "bg-[#1c1910]" : "bg-amber-50")
                        : isDark
                        ? "border-white/10 bg-[#191922]"
                        : "border-slate-200 bg-white shadow-sm")
                    }
                  >
                    {/* Card Header */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className={"text-xs font-mono " + (isDark ? "text-white/40" : "text-slate-500")}>#{t.id}</div>
                        <h3 className={"mt-1 line-clamp-2 font-semibold " + (isDark ? "text-white" : "text-slate-900")}>
                          {t.title}
                        </h3>
                        {t.projectName ? (
                          <div className={"mt-1 text-xs " + (isDark ? "text-blue-400" : "text-blue-600")}>
                            Project: {t.projectName}
                          </div>
                        ) : null}
                      </div>
                      <span
                        className={
                          "shrink-0 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase " +
                          statusInfo.colorClass
                        }
                      >
                        {statusInfo.icon}
                        {statusInfo.label}
                      </span>
                    </div>

                    {/* Assignee */}
                    <div className="flex items-center gap-3">
                      {a.avatarUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={a.avatarUrl}
                          alt=""
                          className="h-10 w-10 rounded-full object-cover border border-white/10"
                        />
                      ) : (
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-500/20 text-xs font-bold text-blue-400">
                          {a.label.slice(0, 2).toUpperCase()}
                        </div>
                      )}
                      <div className="min-w-0">
                        <div className={"truncate text-sm font-medium " + (isDark ? "text-white" : "text-slate-900")}>
                          {a.label}
                        </div>
                        <div className={"truncate text-xs " + (isDark ? "text-white/50" : "text-slate-500")}>{a.email}</div>
                      </div>
                    </div>

                    {/* Progress */}
                    <div>
                      <div className={"mb-1 flex justify-between text-[10px] font-semibold uppercase " + (isDark ? "text-white/40" : "text-slate-500")}>
                        <span>Progress</span>
                        <span>{t.progress}%</span>
                      </div>
                      <div className={"h-2 w-full overflow-hidden rounded-full " + (isDark ? "bg-white/10" : "bg-slate-200")}>
                        <div
                          className={
                            "h-full rounded-full " +
                            (statusInfo.isPending ? "bg-amber-500" : statusInfo.isApproved ? "bg-emerald-500" : "bg-blue-500")
                          }
                          style={{ width: `${t.progress}%` }}
                        />
                      </div>
                    </div>

                    {/* Meta */}
                    <div className={"flex flex-wrap gap-3 text-xs " + (isDark ? "text-white/55" : "text-slate-600")}>
                      <span className="inline-flex items-center gap-1">
                        <FileText className="h-3.5 w-3.5" />
                        {mainAtt.length} file{mainAtt.length !== 1 ? "s" : ""}
                        {subAttCount > 0 ? ` (+${subAttCount} subtask)` : ""}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <Timer className="h-3.5 w-3.5" />
                        {t.timerRunning ? "Timer on" : "Timer off"}
                      </span>
                      {statusInfo.isPending && (
                        <span className="inline-flex items-center gap-1 text-amber-400">
                          <AlertTriangle className="h-3.5 w-3.5" />
                          Needs review
                        </span>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="mt-auto grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setDetailsTaskId(String(t.id))}
                        className={
                          "w-full rounded-xl border py-2 text-xs font-semibold hover:bg-white/10 transition-colors " +
                          (statusInfo.isPending
                            ? "border-amber-500/30 bg-amber-500/10 text-amber-400"
                            : "border-white/10 bg-white/5 text-white/80")
                        }
                      >
                        {statusInfo.isPending ? "⚡ Review" : "View details"}
                      </button>
                      <button
                        type="button"
                        onClick={() => void openReports(t.id, t.title)}
                        className="w-full rounded-xl border border-white/10 bg-white/5 py-2 text-xs font-semibold text-white/80 hover:bg-white/10 transition-colors"
                      >
                        Timer reports
                      </button>
                    </div>
                  </Card>
                </motion.div>
              );
            })
          )}
        </AnimatePresence>
      </div>

      {/* ===== DETAILS MODAL ===== */}
      {detailsTask &&
        createPortal(
          <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 8 }}
              transition={{ duration: 0.2 }}
              className="max-h-[90vh] w-full max-w-3xl overflow-hidden flex flex-col rounded-2xl border bg-[#191922] border-white/10"
            >
              {/* Modal header */}
              <div className="flex items-start justify-between gap-4 border-b border-white/10 p-4">
                <div className="min-w-0 flex-1">
                  <div className="text-xs text-white/45">Task #{detailsTask.id}</div>
                  <div className="mt-0.5 font-semibold text-white line-clamp-2">{detailsTask.title}</div>
                  {detailsTask.projectName ? (
                    <div className="mt-1 text-xs text-blue-400">Project: {detailsTask.projectName}</div>
                  ) : null}
                </div>
                {/* Status badge in modal */}
                <div className="flex items-center gap-2">
                  {(() => {
                    const si = adminStatusInfo(detailsTask);
                    return (
                      <span className={"inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold uppercase " + si.colorClass}>
                        {si.icon}
                        {si.label}
                      </span>
                    );
                  })()}
                  <button
                    type="button"
                    className="text-2xl leading-none text-white/50 hover:text-white"
                    onClick={() => setDetailsTaskId(null)}
                  >
                    ×
                  </button>
                </div>
              </div>

              <div className="overflow-y-auto p-4 space-y-6">
                {/* Stats */}
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-white/40">Status</div>
                    <div className="mt-1 text-sm text-white/90">{adminStatusInfo(detailsTask).label}</div>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-white/40">Progress</div>
                    <div className="mt-1 text-sm text-white/90">{detailsTask.progress}%</div>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-white/40">Assignee</div>
                    <div className="mt-1 text-sm text-white/90">
                      {assigneeDisplay(detailsTask, allUserRecords).label}
                    </div>
                  </div>
                </div>

                {/* Submitted files */}
                <div>
                  <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-white/40">
                    <FileText className="h-4 w-4" /> Files submitted
                  </div>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    {(detailsTask.attachments ?? [])
                      .filter((a) => a.checklistItemId == null || Number(a.checklistItemId) === 0)
                      .map((a) => (
                        <a
                          key={a.id}
                          href={a.url}
                          target="_blank"
                          rel="noreferrer"
                          className="rounded-xl border border-white/10 bg-white/5 p-3 text-sm text-white/85 hover:bg-white/10 transition-colors"
                          title={a.name}
                        >
                          <div className="truncate font-medium">{a.name}</div>
                          <div className="mt-0.5 text-[10px] text-white/40 truncate">Open / download</div>
                        </a>
                      ))}
                    {(detailsTask.attachments ?? []).filter(
                      (a) => a.checklistItemId == null || Number(a.checklistItemId) === 0
                    ).length === 0 ? (
                      <div className="col-span-full rounded-xl border border-white/10 bg-white/5 p-4 text-sm text-white/50">
                        No files submitted yet.
                      </div>
                    ) : null}
                  </div>
                </div>

                {/* Conversation */}
                <div>
                  <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-white/40">
                    <MessageSquareText className="h-4 w-4" /> Task conversation
                  </div>
                  <div className="mt-3 flex gap-2">
                    <input
                      value={chatText}
                      onChange={(e) => setChatText(e.target.value)}
                      placeholder="Write a message…"
                      className="flex-1 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/85 outline-none focus:border-blue-500/50"
                    />
                    <button
                      type="button"
                      disabled={!chatText.trim() || sendingChat}
                      onClick={async () => {
                        if (!detailsTask) return;
                        const msg = chatText.trim();
                        if (!msg) return;
                        setSendingChat(true);
                        try {
                          const res = await apiPost<{ comment: any }>(`/api/tasks/${detailsTask.id}/comments`, { message: msg });
                          setChatText("");
                          const nextComments = [...(detailsTask.comments ?? []), res.comment].sort(
                            (a, b) => Number(a.createdAt) - Number(b.createdAt)
                          );
                          onTaskPatched?.(String(detailsTask.id), { comments: nextComments as any });
                        } finally {
                          setSendingChat(false);
                        }
                      }}
                      className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-500 disabled:opacity-50"
                    >
                      {sendingChat ? "Sending…" : "Send"}
                    </button>
                  </div>
                  <div className="mt-3 space-y-2">
                    {(detailsTask.comments ?? []).length ? (
                      (detailsTask.comments ?? []).map((c) => (
                        <div key={c.id} className="rounded-xl border border-white/10 bg-white/5 p-3">
                          <div className="flex items-center justify-between gap-3 text-[11px] text-white/45">
                            <span className="truncate">{c.createdByEmail ?? "User"}</span>
                            <span className="shrink-0">{new Date(c.createdAt).toLocaleString()}</span>
                          </div>
                          {c.text ? <div className="mt-1 text-sm text-white/85 whitespace-pre-wrap">{c.text}</div> : null}
                          {c.attachments?.length ? (
                            <div className="mt-2 text-[11px] text-white/50">
                              {c.attachments.length} attachment{c.attachments.length !== 1 ? "s" : ""}
                            </div>
                          ) : null}
                        </div>
                      ))
                    ) : (
                      <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-sm text-white/50">
                        No conversation yet.
                      </div>
                    )}
                  </div>
                </div>

                {/* ===== ADMIN DECISION: shown when user marked as done but not yet approved ===== */}
                {String(detailsTask.status) === "complete" && !detailsTask.adminApproved ? (
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="rounded-2xl border border-amber-500/30 bg-amber-500/8 p-4"
                  >
                    <div className="flex items-center gap-2">
                      <Clock className="h-4 w-4 text-amber-400" />
                      <div className="text-xs font-bold uppercase tracking-wider text-amber-400">Admin Decision Required</div>
                    </div>
                    <div className="mt-2 text-sm text-white/70">
                      The user marked this task as <strong className="text-amber-300">done</strong>. Review the submitted files and conversation above, then approve to mark it complete in Work Overview, or decline to send it back.
                    </div>
                    <div className="mt-4 grid gap-2 sm:grid-cols-2">
                      <button
                        type="button"
                        disabled={decisionBusy === String(detailsTask.id)}
                        onClick={handleApprove}
                        className="flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-emerald-500 disabled:opacity-50 transition-colors"
                      >
                        <CheckCircle2 className="h-4 w-4" />
                        Approve (keep complete)
                      </button>
                      <button
                        type="button"
                        disabled={decisionBusy === String(detailsTask.id)}
                        onClick={handleDecline}
                        className="flex items-center justify-center gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-2.5 text-sm font-bold text-rose-200 hover:bg-rose-500/20 disabled:opacity-50 transition-colors"
                      >
                        <XCircle className="h-4 w-4" />
                        Decline (back to in process)
                      </button>
                    </div>
                  </motion.div>
                ) : String(detailsTask.status) === "complete" && detailsTask.adminApproved ? (
                  <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/8 p-4 flex items-center gap-3">
                    <ShieldCheck className="h-5 w-5 text-emerald-400 shrink-0" />
                    <div>
                      <div className="text-xs font-bold uppercase tracking-wider text-emerald-400">Task Approved</div>
                      <div className="mt-1 text-sm text-white/70">You approved this task. It is marked Complete in Work Overview.</div>
                    </div>
                  </div>
                ) : null}
              </div>
            </motion.div>
          </div>,
          document.body
        )}

      {/* ===== TIMER REPORTS MODAL ===== */}
      {reportsTask &&
        createPortal(
          <div className="fixed inset-0 z-[140] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
            <Card className={"max-h-[85vh] w-full max-w-lg overflow-hidden flex flex-col " + (isDark ? "bg-[#191922] border-white/10" : "bg-white")}>
              <div className="flex items-center justify-between border-b border-white/10 p-4">
                <div>
                  <div className="text-xs text-white/45">Timer reports</div>
                  <div className="font-semibold text-white line-clamp-2">{reportsTask.title}</div>
                </div>
                <button
                  type="button"
                  className="text-2xl leading-none text-white/50 hover:text-white"
                  onClick={() => {
                    setReportsTask(null);
                    setReports(null);
                  }}
                >
                  ×
                </button>
              </div>
              <div className="overflow-y-auto p-4 space-y-3">
                {reportsLoading ? (
                  <div className="py-8 text-center text-sm text-white/50">Loading…</div>
                ) : !reports?.length ? (
                  <div className="py-8 text-center text-sm text-white/50">No reports yet for this task.</div>
                ) : (
                  reports.map((r) => (
                    <div key={r.id} className="rounded-xl border border-white/10 bg-white/5 p-3 text-sm">
                      <div className="flex justify-between text-xs text-white/45">
                        <span>{new Date(r.createdAt).toLocaleString()}</span>
                        <span>{Math.floor(r.elapsedSeconds / 3600)}h {Math.floor((r.elapsedSeconds % 3600) / 60)}m</span>
                      </div>
                      <div className="mt-1 font-medium text-white">
                        {r.userName?.trim() || r.userEmail}
                      </div>
                      {r.stopNote ? <div className="mt-2 text-xs text-white/70">{r.stopNote}</div> : null}
                    </div>
                  ))
                )}
              </div>
            </Card>
          </div>,
          document.body
        )}
    </div>
  );
}
