"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { apiGet, apiPatch, apiPost, apiPut } from "@/lib/api";

type ActivityItem = {
  id: number;
  actor: { id?: number; name: string; role: string };
  action: string;
  entity: { type: string; id?: number; title: string };
  createdAt: number;
  routePath: string;
  isRead?: boolean;
};

type FilterTab = "all" | "unread" | "tasks" | "users" | "auth";

const ACTION_DISPLAY: Record<string, { icon: string; color: string; label: string }> = {
  "task.created":        { icon: "✚", color: "#34d399", label: "created task" },
  "task.updated":        { icon: "✎", color: "#60a5fa", label: "updated task" },
  "task.deleted":        { icon: "✕", color: "#f87171", label: "deleted task" },
  "task.status_changed": { icon: "⇄", color: "#fbbf24", label: "changed status of" },
  "task.assigned":       { icon: "↗", color: "#c084fc", label: "assigned" },
  "user.created":        { icon: "👤", color: "#2dd4bf", label: "created user" },
  "user.role_changed":   { icon: "🔑", color: "#facc15", label: "changed role of" },
  "user.deactivated":    { icon: "⊖", color: "#f87171", label: "deactivated" },
  "auth.login":          { icon: "↙", color: "#86efac", label: "logged in" },
  "auth.logout":         { icon: "↗", color: "#94a3b8", label: "logged out" },
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

export function NotificationsView() {
  const router = useRouter();
  const [items, setItems] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterTab>("all");

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiGet<{ items: ActivityItem[] }>("/api/admin/activity?limit=100");
      setItems(res.items || []);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const id = setInterval(refresh, 30_000);
    return () => clearInterval(id);
  }, [refresh]);

  const markRead = async (itemId: number) => {
    await apiPatch(`/api/admin/activity/${itemId}/read`, {}).catch(() => null);
  };

  const markAllRead = async () => {
    setItems((prev) => prev.map((i) => ({ ...i, isRead: true })));
    await apiPatch("/api/admin/activity/read-all", {}).catch(() => null);
    await apiPut("/api/notifications", {}).catch(() => null);
  };

  const getSafeRoute = (routePath: string | null | undefined): string | null => {
    if (!routePath) return null;
    const trimmed = routePath.trim();
    if (!trimmed.startsWith("/")) return null;
    // Never navigate through notification clicks to auth/api routes.
    if (
      trimmed === "/login" ||
      trimmed === "/logout" ||
      trimmed === "/register" ||
      trimmed.startsWith("/api/auth/") ||
      trimmed.startsWith("/auth/")
    ) {
      return null;
    }
    return trimmed;
  };

  const handleClick = async (e: React.MouseEvent, item: ActivityItem) => {
    e.preventDefault();
    e.stopPropagation();
    
    // Mark as read immediately in UI
    setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, isRead: true } : i)));
    
    // Await the server-side mark as read
    await markRead(item.id);
    
    // Safety check: never navigate to auth/logout pages from notifications
    const target = !item.action.startsWith("auth.") ? getSafeRoute(item.routePath) : null;
    if (target) {
      router.push(target);
    }
  };

  const filtered = items.filter((i) => {
    if (filter === "unread") return !i.isRead;
    if (filter === "tasks") return i.entity.type === "task";
    if (filter === "users") return i.entity.type === "user";
    if (filter === "auth") return i.action.startsWith("auth.");
    return true;
  });

  const unreadCount = items.filter((i) => !i.isRead).length;

  const filterCounts: Record<FilterTab, number | undefined> = {
    all: items.length || undefined,
    unread: unreadCount || undefined,
    tasks: items.filter((i) => i.entity.type === "task").length || undefined,
    users: items.filter((i) => i.entity.type === "user").length || undefined,
    auth: items.filter((i) => i.action.startsWith("auth.")).length || undefined,
  };

  return (
    <div className="rounded-2xl border border-white/10 bg-[#191922] p-6 min-h-[560px] shadow-[0_12px_40px_rgba(0,0,0,0.35)]">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-semibold text-white">Notifications</h2>
          {unreadCount > 0 ? (
            <span className="rounded-full bg-red-500 px-2 py-0.5 text-[11px] font-bold text-white">
              {unreadCount} unread
            </span>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={markAllRead}
            className="rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-semibold text-white/80 hover:bg-white/10 hover:text-white transition-colors"
          >
            Mark all read
          </button>
          <button
            onClick={refresh}
            disabled={loading}
            className="rounded-lg border border-white/15 bg-blue-500/15 px-3 py-1.5 text-xs font-semibold text-blue-300 hover:bg-blue-500/25 transition-colors disabled:opacity-50"
          >
            {loading ? "Refreshing..." : "Refresh"}
          </button>
        </div>
      </div>

      <div className="mb-6 flex flex-wrap gap-2">
        {(["all", "unread", "tasks", "users", "auth"] as FilterTab[]).map((tab) => {
          const count = filterCounts[tab];
          const active = filter === tab;
          return (
            <button
              key={tab}
              onClick={() => setFilter(tab)}
              className={
                "rounded-full px-3 py-1 text-xs font-semibold capitalize transition-colors border " +
                (active
                  ? "border-blue-400/50 bg-blue-500/20 text-blue-300"
                  : "border-white/10 bg-white/5 text-white/60 hover:text-white hover:bg-white/10")
              }
            >
              {tab} {count !== undefined ? <span className="opacity-70">({count})</span> : null}
            </button>
          );
        })}
      </div>

      <div className="flex flex-col gap-2">
        {loading && items.length === 0 && (
          <p className="py-10 text-center text-white/40">Loading...</p>
        )}
        {!loading && filtered.length === 0 && (
          <p className="py-10 text-center text-white/40">No notifications here.</p>
        )}
        {filtered.map((item) => {
          const display = ACTION_DISPLAY[item.action] ?? { icon: "•", color: "rgba(255,255,255,0.6)", label: item.action };
          return (
            <div
              key={item.id}
              onClick={(e) => handleClick(e, item)}
              className={
                "group flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors " +
                (!item.isRead
                  ? "border-blue-400/30 bg-blue-500/10 hover:bg-blue-500/15"
                  : "border-white/10 bg-white/5 hover:bg-white/10")
              }
            >
              {!item.isRead ? <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-blue-400 shadow-[0_0_8px_rgba(96,165,250,0.8)]" /> : null}
              <span className="shrink-0 text-lg" style={{ color: display.color }}>{display.icon}</span>
              <div className="min-w-0 flex-1">
                <p className="text-sm leading-relaxed text-white/90">
                  <strong className="text-white">{item.actor.name}</strong>{" "}
                  <span className="text-white/60">{display.label}</span>{" "}
                  <strong style={{ color: display.color }}>{item.entity.title}</strong>
                </p>
                <p className="mt-1 text-xs text-white/45">
                  {item.routePath} · {relativeTime(item.createdAt)}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
