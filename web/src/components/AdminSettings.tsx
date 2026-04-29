"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/Card";
import { apiGet, apiPatch } from "@/lib/api";

// ── Null-safe helpers (BUG A fix) ────────────────────────────────────
function getInitials(name: string | null | undefined, email: string | null | undefined): string {
  if (name && typeof name === "string" && name.trim().length > 0) {
    return name.trim().split(" ").filter(Boolean).map((p) => p[0].toUpperCase()).slice(0, 2).join("");
  }
  if (email && typeof email === "string") return email[0].toUpperCase();
  return "?";
}

function getDisplayName(name: string | null | undefined, email: string | null | undefined): string {
  if (name && typeof name === "string" && name.trim().length > 0) return name.trim();
  if (email && typeof email === "string") return email;
  return "Unknown User";
}

// ── Types ─────────────────────────────────────────────────────────────
type ActivityItem = {
  id: number;
  actor: { id?: number; name: string; role: string; email?: string };
  action: string;
  entity: { type: string; id?: number; title: string };
  meta?: Record<string, unknown> | null;
  createdAt: number;
  routePath: string;
  isRead?: boolean;
};

type UserItem = {
  id: string;
  email: string | null;
  name: string | null;
  role: string;
  status: string;
  department: string;
  createdAt?: number;
};

type TabId = "audit" | "roles" | "export" | "preferences" | "reports";

type UploadedReport = {
  id: number;
  user_id: number;
  title: string;
  description?: string | null;
  file_name?: string | null;
  file_data_url?: string | null;
  created_at: number;
  user_email: string;
};

// Action-type → icon/color map
const ACTION_DISPLAY: Record<string, { icon: string; color: string; label: string }> = {
  "task.created":        { icon: "✚", color: "text-emerald-400", label: "Task Created" },
  "task.updated":        { icon: "✎", color: "text-blue-400",    label: "Task Updated" },
  "task.deleted":        { icon: "✕", color: "text-red-400",     label: "Task Deleted" },
  "task.status_changed": { icon: "⇄", color: "text-amber-400",   label: "Status Changed" },
  "task.assigned":       { icon: "↗", color: "text-purple-400",  label: "Task Assigned" },
  "user.created":        { icon: "👤", color: "text-teal-400",   label: "User Created" },
  "user.role_changed":   { icon: "🔑", color: "text-yellow-400", label: "Role Changed" },
  "user.deactivated":    { icon: "⊖", color: "text-red-400",     label: "User Deactivated" },
  "auth.login":          { icon: "↙", color: "text-green-400",   label: "Login" },
  "auth.logout":         { icon: "↗", color: "text-slate-400",   label: "Logout" },
};

function relativeTime(ms: number): string {
  const diff = Date.now() - ms;
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

type NotifFilter = "all" | "unread" | "tasks" | "users" | "auth";

export function AdminSettings() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<TabId>("audit");

  // Notifications / audit log
  const [logs, setLogs] = useState<ActivityItem[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [notifFilter, setNotifFilter] = useState<NotifFilter>("all");

  // Users
  const [users, setUsers] = useState<UserItem[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [roleUpdating, setRoleUpdating] = useState<string | null>(null);

  // Preferences
  const [prefSaved, setPrefSaved] = useState(false);
  const [reqApproval, setReqApproval] = useState(true);
  const [strictTimers, setStrictTimers] = useState(false);
  const [defaultPriority, setDefaultPriority] = useState("medium");
  const [maxFileSize, setMaxFileSize] = useState("10");
  const [reminderWindow, setReminderWindow] = useState("2");
  const [reports, setReports] = useState<UploadedReport[]>([]);
  const [reportsLoading, setReportsLoading] = useState(false);

  const fetchLogs = useCallback(async () => {
    setLogsLoading(true);
    try {
      const res = await apiGet<{ items: ActivityItem[] }>("/api/admin/activity?limit=100");
      setLogs(res.items || []);
    } catch {
      // ignore
    } finally {
      setLogsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === "audit") {
      fetchLogs();
    } else if (activeTab === "roles") {
      setUsersLoading(true);
      apiGet<{ items: UserItem[] }>("/api/admin/users")
        .then((res) => {
          // null-safe sanitization (BUG A fix)
          const safe = (res.items || []).map((u) => ({
            ...u,
            name: u.name ?? null,
            email: u.email ?? null,
          }));
          setUsers(safe);
        })
        .catch(console.error)
        .finally(() => setUsersLoading(false));
    } else if (activeTab === "reports") {
      setReportsLoading(true);
      apiGet<{ items: UploadedReport[] }>("/api/reports")
        .then((res) => setReports(res.items || []))
        .catch(() => setReports([]))
        .finally(() => setReportsLoading(false));
    }
  }, [activeTab, fetchLogs]);

  const markRead = useCallback(async (logId: number) => {
    setLogs((prev) => prev.map((l) => (l.id === logId ? { ...l, isRead: true } : l)));
    try {
      await apiPatch(`/api/admin/activity/${logId}/read`, {});
    } catch {
      // best-effort
    }
  }, []);

  const markAllRead = useCallback(async () => {
    setLogs((prev) => prev.map((l) => ({ ...l, isRead: true })));
    try {
      await apiPatch("/api/admin/activity/read-all", {});
    } catch {
      // best-effort
    }
  }, []);

  const updateRole = async (userId: string, newRole: string) => {
    const confirm = newRole === "admin"
      ? window.confirm(`Promote to Admin? This grants elevated access to all data.`)
      : true;
    if (!confirm) return;
    setRoleUpdating(userId);
    try {
      await apiPatch(`/api/admin/users/${userId}`, { role: newRole });
      setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, role: newRole } : u)));
    } catch {
      alert("Failed to update user role");
    } finally {
      setRoleUpdating(null);
    }
  };

  const updateStatus = async (userId: string, newStatus: string) => {
    try {
      await apiPatch(`/api/admin/users/${userId}`, { status: newStatus });
      setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, status: newStatus } : u)));
    } catch {
      alert("Failed to update user status");
    }
  };

  // ── CSV export helpers ──────────────────────────────────────────────
  const downloadCsv = (filename: string, rows: string[][]) => {
    const content = rows.map((r) => r.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  };

  const exportActivityCsv = async () => {
    let data = logs;
    if (!data.length) {
      const res = await apiGet<{ items: ActivityItem[] }>("/api/admin/activity?limit=500").catch(() => ({ items: [] as ActivityItem[] }));
      data = res.items;
    }
    const rows = [["ID", "Date", "Actor", "Role", "Action", "Entity", "Entity Title", "Route"]];
    for (const l of data) {
      rows.push([
        String(l.id),
        new Date(l.createdAt).toISOString(),
        l.actor.name, l.actor.role, l.action,
        l.entity.type, l.entity.title, l.routePath,
      ]);
    }
    downloadCsv("audit-log.csv", rows);
  };

  const exportUsersCsv = () => {
    const rows = [["ID", "Email", "Name", "Role", "Status", "Department"]];
    for (const u of users) {
      rows.push([u.id, u.email ?? "", getDisplayName(u.name, u.email), u.role, u.status, u.department]);
    }
    downloadCsv("users.csv", rows);
  };

  const exportTasksCsv = async () => {
    try {
      const res = await apiGet<{ items: Record<string, unknown>[] }>("/api/tasks");
      const items = res.items || [];
      const rows = [["ID", "Title", "Status", "Priority", "Progress", "Department", "Due Date"]];
      for (const t of items) {
        rows.push([
          String(t.id ?? ""), String(t.title ?? ""), String(t.status ?? ""),
          String(t.priority ?? ""), String(t.progress ?? ""), String(t.department ?? ""),
          t.due_date ? new Date(Number(t.due_date)).toLocaleDateString() : "",
        ]);
      }
      downloadCsv("tasks.csv", rows);
    } catch { alert("Failed to export tasks"); }
  };

  // ── Filtered notifications ──────────────────────────────────────────
  const filteredLogs = logs.filter((l) => {
    if (notifFilter === "unread") return !l.isRead;
    if (notifFilter === "tasks") return l.entity.type === "task";
    if (notifFilter === "users") return l.entity.type === "user";
    if (notifFilter === "auth") return l.action.startsWith("auth.");
    return true;
  });
  const unreadCount = logs.filter((l) => !l.isRead).length;

  const TABS: { id: TabId; label: string; badge?: number }[] = [
    { id: "audit",        label: "Audit Log" },
    { id: "roles",        label: "Role Management" },
    { id: "export",       label: "Export Center" },
    { id: "preferences",  label: "System Preferences" },
    { id: "reports",      label: "Reports Archive" },
  ];

  return (
    <Card className="flex flex-col md:flex-row gap-0 p-0 overflow-hidden bg-[#0d0d1a] border-white/10 min-h-[600px]">
      {/* Sidebar */}
      <div className="w-full md:w-60 border-b border-white/10 md:border-b-0 md:border-r border-white/10 bg-white/[0.03] p-4 flex flex-col gap-1.5">
        <h2 className="text-xl font-bold text-white mb-3 px-2">Settings</h2>
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`w-full text-left px-3 py-2.5 rounded-xl text-sm font-medium transition-colors flex items-center justify-between ${
              activeTab === tab.id
                ? "bg-blue-600/20 text-blue-400 border border-blue-500/30"
                : "text-white/60 hover:bg-white/10 hover:text-white"
            }`}
          >
            <span>{tab.label}</span>
            {tab.badge ? (
              <span className="bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
                {tab.badge}
              </span>
            ) : null}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 p-6 overflow-auto">

        {/* ── Notifications Tab removed ── */}

        {/* ── Audit Log Tab ── */}
        {activeTab === "audit" && (
          <div className="space-y-4">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold text-white">Audit Log</h3>
              <button onClick={fetchLogs} disabled={logsLoading} className="text-xs bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded-lg text-white transition-colors">
                {logsLoading ? "Refreshing..." : "⟳ Refresh"}
              </button>
            </div>
            <div className="overflow-x-auto rounded-xl border border-white/10">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-white/10 bg-white/[0.03]">
                  <tr className="text-white/50">
                    <th className="py-3 px-3 font-medium">Time</th>
                    <th className="py-3 px-3 font-medium">Actor</th>
                    <th className="py-3 px-3 font-medium">Action</th>
                    <th className="py-3 px-3 font-medium">Target</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {logs.length === 0 && !logsLoading && (
                    <tr><td colSpan={4} className="py-10 text-center text-white/40">No activity recorded yet.</td></tr>
                  )}
                  {logs.map((log) => {
                    const display = ACTION_DISPLAY[log.action] ?? { icon: "•", color: "text-white/60", label: log.action };
                    return (
                      <tr
                        key={log.id}
                        className="hover:bg-white/5 transition-colors cursor-pointer"
                        onClick={() => router.push(log.routePath)}
                      >
                        <td className="py-3 px-3 text-white/50 whitespace-nowrap text-xs">
                          {new Date(log.createdAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                        </td>
                        <td className="py-3 px-3 whitespace-nowrap">
                          <div className="text-white text-sm">{log.actor.name}</div>
                          <div className="text-xs text-white/40">{log.actor.role}</div>
                        </td>
                        <td className="py-3 px-3">
                          <span className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md bg-white/5 font-mono ${display.color}`}>
                            {display.icon} {log.action}
                          </span>
                        </td>
                        <td className="py-3 px-3">
                          <div className="text-white/90 text-sm">{log.entity.title}</div>
                          <div className="text-xs text-white/40 uppercase tracking-wider">{log.entity.type}</div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── Role Management Tab ── */}
        {activeTab === "roles" && (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-white mb-4">User Roles & Access Management</h3>
            {usersLoading && <p className="text-white/50 text-sm">Loading users...</p>}
            <div className="grid gap-3">
              {users.map((u) => {
                const displayName = getDisplayName(u.name, u.email);
                const initials = getInitials(u.name, u.email);
                const isUpdating = roleUpdating === u.id;
                return (
                  <div key={u.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-xl border border-white/10 bg-white/[0.03] gap-4">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center font-bold text-sm flex-shrink-0">
                        {initials}
                      </div>
                      <div>
                        <div className="font-medium text-white">{displayName}</div>
                        <div className="text-xs text-white/50">{u.email ?? "—"}{u.department ? ` · ${u.department.replace(/_/g, " ")}` : ""}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {isUpdating && <span className="text-xs text-white/40 animate-pulse">Saving...</span>}
                      <select
                        className="bg-[#1a1a2e] border border-white/20 text-white text-xs rounded-lg px-3 py-1.5 focus:outline-none focus:border-blue-500"
                        value={u.status}
                        onChange={(e) => updateStatus(u.id, e.target.value)}
                        disabled={isUpdating}
                      >
                        <option value="approved">Approved</option>
                        <option value="pending">Pending</option>
                        <option value="rejected">Rejected</option>
                      </select>
                      <select
                        className="bg-[#1a1a2e] border border-white/20 text-white text-xs rounded-lg px-3 py-1.5 focus:outline-none focus:border-blue-500"
                        value={u.role}
                        onChange={(e) => updateRole(u.id, e.target.value)}
                        disabled={isUpdating}
                      >
                        <option value="user">User</option>
                        <option value="manager">Manager</option>
                        <option value="admin">Admin</option>
                      </select>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Export Center Tab ── */}
        {activeTab === "export" && (
          <div className="space-y-6">
            <h3 className="text-lg font-semibold text-white mb-4">Export Center</h3>
            <div className="grid md:grid-cols-3 gap-4">
              {[
                { color: "emerald", title: "Export All Tasks", desc: "Download a CSV of all tasks with status, timers, and assignments.", action: exportTasksCsv, label: "Download Tasks CSV" },
                { color: "blue",    title: "Export Audit Logs", desc: "Download system activity logs for compliance and auditing.", action: exportActivityCsv, label: "Download Audit CSV" },
                { color: "purple",  title: "Export Users", desc: "Download all user accounts, roles, and statuses as a CSV.", action: exportUsersCsv, label: "Download Users CSV" },
              ].map(({ color, title, desc, action, label }) => (
                <div key={title} className={`p-5 rounded-2xl border border-${color}-500/20 bg-${color}-500/5`}>
                  <div className={`text-${color}-400 font-medium mb-2`}>{title}</div>
                  <div className="text-sm text-white/60 mb-4">{desc}</div>
                  <button
                    className={`bg-${color}-500/20 hover:bg-${color}-500/30 text-${color}-300 px-4 py-2 rounded-xl text-sm transition-colors border border-${color}-500/30`}
                    onClick={action}
                  >{label}</button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── System Preferences Tab ── */}
        {activeTab === "preferences" && (
          <div className="space-y-6">
            <h3 className="text-lg font-semibold text-white mb-4">System Preferences</h3>
            <div className="space-y-4 max-w-lg">
              {/* Toggle rows */}
              {[
                { label: "Require Admin Approval", desc: "New users must be manually approved before login.", state: reqApproval, set: setReqApproval },
                { label: "Strict Task Timers",     desc: "Prevent completion unless the timer was started.",   state: strictTimers, set: setStrictTimers },
              ].map(({ label, desc, state, set }) => (
                <div key={label} className="flex items-center justify-between p-4 rounded-xl border border-white/10 bg-white/[0.03]">
                  <div>
                    <div className="font-medium text-white text-sm">{label}</div>
                    <div className="text-xs text-white/50 mt-0.5">{desc}</div>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer ml-4 flex-shrink-0">
                    <input type="checkbox" className="sr-only peer" checked={state} onChange={(e) => set(e.target.checked)} />
                    <div className="w-11 h-6 bg-white/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-500" />
                  </label>
                </div>
              ))}
              {/* Dropdowns */}
              <div className="p-4 rounded-xl border border-white/10 bg-white/[0.03] space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-white">Default Task Priority</span>
                  <select className="bg-[#1a1a2e] border border-white/20 text-white text-xs rounded-lg px-3 py-1.5 focus:outline-none focus:border-blue-500" value={defaultPriority} onChange={(e) => setDefaultPriority(e.target.value)}>
                    <option value="easy">Easy</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="critical">Critical</option>
                  </select>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-white">Due Date Reminder Window</span>
                  <select className="bg-[#1a1a2e] border border-white/20 text-white text-xs rounded-lg px-3 py-1.5 focus:outline-none focus:border-blue-500" value={reminderWindow} onChange={(e) => setReminderWindow(e.target.value)}>
                    {["1","2","3","7"].map((d) => <option key={d} value={d}>{d} day{d !== "1" ? "s" : ""} before</option>)}
                  </select>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-white">Max Attachment Size</span>
                  <select className="bg-[#1a1a2e] border border-white/20 text-white text-xs rounded-lg px-3 py-1.5 focus:outline-none focus:border-blue-500" value={maxFileSize} onChange={(e) => setMaxFileSize(e.target.value)}>
                    {["5","10","25","50"].map((s) => <option key={s} value={s}>{s} MB</option>)}
                  </select>
                </div>
              </div>
              <button
                onClick={() => { setPrefSaved(true); setTimeout(() => setPrefSaved(false), 2500); }}
                className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm transition-colors"
              >
                {prefSaved ? "✓ Saved!" : "Save Preferences"}
              </button>
            </div>
          </div>
        )}

        {/* ── Reports Archive Tab ── */}
        {activeTab === "reports" && (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-white mb-2">Reports Archive</h3>
            <p className="text-sm text-white/60 mb-5">
              Historical reports uploaded by users. This view is read-only; new reports are submitted from the user profile.
            </p>
            <div className="rounded-xl border border-white/10 overflow-hidden">
              <div className="px-4 py-2 text-xs uppercase tracking-wide text-white/50 bg-white/[0.03]">Uploaded reports</div>
              <div className="divide-y divide-white/10">
                {reportsLoading ? (
                  <div className="px-4 py-6 text-sm text-white/50">Loading reports...</div>
                ) : reports.length === 0 ? (
                  <div className="px-4 py-6 text-sm text-white/50">No reports uploaded yet.</div>
                ) : reports.map((r) => (
                  <div key={r.id} className="px-4 py-3 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-medium text-white">{r.title}</div>
                      <div className="text-xs text-white/45">{new Date(r.created_at).toLocaleString()}</div>
                    </div>
                    <div className="mt-0.5 text-xs text-white/55">by {r.user_email}</div>
                    {r.description ? <div className="mt-1 text-sm text-white/70">{r.description}</div> : null}
                    {r.file_data_url ? (
                      <a href={r.file_data_url} download={r.file_name ?? "report-file"} className="mt-2 inline-block rounded-md border border-blue-500/30 bg-blue-500/10 px-2.5 py-1 text-xs text-blue-300 hover:bg-blue-500/20">
                        Download {r.file_name ?? "attachment"}
                      </a>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}
