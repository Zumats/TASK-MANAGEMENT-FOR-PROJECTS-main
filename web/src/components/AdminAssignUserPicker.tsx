"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useDocumentTheme } from "@/hooks/useDocumentTheme";
import type { TaskPriority } from "@/lib/types";

export type AssignPickerUser = {
  id: number;
  email: string;
  name?: string | null;
  avatarUrl?: string | null;
};

export type LastAssignTemplate = {
  assignedTo: string;
  sharedWith: number[];
  projectId: number | "";
  priority: TaskPriority;
  startDate: string;
  dueDate: string;
  department: string;
};

const LAST_ASSIGN_KEY = "hyperaccess_last_assign_template_v1";

export function loadLastAssignTemplate(): LastAssignTemplate | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(LAST_ASSIGN_KEY);
    if (!raw) return null;
    const o = JSON.parse(raw) as Partial<LastAssignTemplate>;
    if (!o || typeof o !== "object") return null;
    return {
      assignedTo: typeof o.assignedTo === "string" ? o.assignedTo : "",
      sharedWith: Array.isArray(o.sharedWith)
        ? o.sharedWith.map((n) => Number(n)).filter((n) => Number.isFinite(n) && n > 0)
        : [],
      projectId:
        o.projectId === "" || o.projectId == null
          ? ""
          : Number.isFinite(Number(o.projectId))
            ? Number(o.projectId)
            : "",
      priority:
        o.priority === "easy" ||
        o.priority === "medium" ||
        o.priority === "high" ||
        o.priority === "very_high" ||
        o.priority === "critical"
          ? o.priority
          : "medium",
      startDate: typeof o.startDate === "string" ? o.startDate : "",
      dueDate: typeof o.dueDate === "string" ? o.dueDate : "",
      department: typeof o.department === "string" ? o.department : "other",
    };
  } catch {
    return null;
  }
}

export function saveLastAssignTemplate(t: LastAssignTemplate) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LAST_ASSIGN_KEY, JSON.stringify(t));
  } catch {
    /* ignore */
  }
}

function avatarSrc(url: string | null | undefined): string | null {
  if (!url) return null;
  const u = String(url);
  if (u.startsWith("http") || u.startsWith("data:") || u.startsWith("blob:")) return u;
  return u.startsWith("/") ? u : `/${u}`;
}

function labelFor(u: AssignPickerUser) {
  const n = u.name?.trim();
  return n || u.email;
}

/** Order selected ids by picker list order (email sort). First = primary assignee, rest = shared. */
export function splitPrimaryAndShared(
  selectedIds: number[],
  users: AssignPickerUser[],
): { primary: number | null; shared: number[] } {
  const set = new Set(selectedIds);
  const ordered = users.filter((u) => set.has(u.id)).map((u) => u.id);
  if (!ordered.length) return { primary: null, shared: [] };
  return { primary: ordered[0], shared: ordered.slice(1) };
}

export function AdminAssignUserPicker({
  users,
  selectedIds,
  onChange,
}: {
  users: AssignPickerUser[];
  selectedIds: number[];
  onChange: (ids: number[]) => void;
}) {
  const isDark = useDocumentTheme() === "dark";
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (rootRef.current && !rootRef.current.contains(t)) setOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, []);

  const q = filter.trim().toLowerCase();
  const filtered = useMemo(() => {
    return users.filter((u) => {
      if (!q) return true;
      const blob = `${u.email} ${u.name ?? ""}`.toLowerCase();
      return blob.includes(q);
    });
  }, [users, q]);

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  const toggle = (id: number) => {
    if (selectedSet.has(id)) {
      onChange(selectedIds.filter((x) => x !== id));
    } else {
      onChange([...selectedIds, id]);
    }
  };

  const panelClass =
    "absolute z-[90] mt-1 max-h-72 w-full overflow-auto rounded-xl border py-1 shadow-2xl " +
    (isDark ? "border-white/15 bg-[#14141c]" : "border-slate-200 bg-white");

  const rowClass = (checked: boolean) =>
    "flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left text-sm transition-colors " +
    (checked
      ? isDark
        ? "bg-blue-500/15 text-white"
        : "bg-blue-50 text-slate-900"
      : isDark
        ? "text-white/85 hover:bg-white/5"
        : "text-slate-800 hover:bg-slate-50");

  const inputClass =
    "w-full rounded-lg border px-2 py-1.5 text-xs outline-none " +
    (isDark
      ? "border-white/15 bg-white/5 text-white placeholder:text-white/35"
      : "border-slate-200 bg-white text-slate-900 placeholder:text-slate-400");

  const selectedUsers = useMemo(
    () => selectedIds.map((id) => users.find((u) => u.id === id)).filter(Boolean) as AssignPickerUser[],
    [users, selectedIds],
  );

  return (
    <div className="relative space-y-2" ref={rootRef}>
      <label
        className={"mb-1 block text-xs font-medium " + (isDark ? "text-white/55" : "text-slate-600")}
      >
        Assign to
      </label>
      <button
        type="button"
        onClick={() => {
          setOpen((o) => !o);
          setFilter("");
        }}
        className={
          "flex w-full items-center gap-2 rounded-xl border px-3 py-3 text-left text-sm outline-none transition-colors " +
          (isDark
            ? "border-white/15 bg-white/10 text-white hover:bg-white/15"
            : "border-slate-200 bg-white text-slate-900 hover:bg-slate-50")
        }
      >
        <span className="min-w-0 flex-1">
          {selectedIds.length ? (
            <span className="font-medium">
              {selectedIds.length} user{selectedIds.length === 1 ? "" : "s"} selected
            </span>
          ) : (
            <span className={isDark ? "text-white/45" : "text-slate-500"}>Choose users…</span>
          )}
        </span>
        <span className={"shrink-0 text-xs " + (isDark ? "text-white/40" : "text-slate-400")}>▾</span>
      </button>

      {selectedUsers.length ? (
        <div className="flex flex-wrap gap-1.5">
          {selectedUsers.map((u) => (
            <span
              key={u.id}
              className={
                "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] " +
                (isDark ? "border-white/15 bg-white/5 text-white/85" : "border-slate-200 bg-slate-100 text-slate-700")
              }
            >
              {avatarSrc(u.avatarUrl) ? (
                <img src={avatarSrc(u.avatarUrl)!} alt="" className="h-4 w-4 rounded-full object-cover" />
              ) : null}
              <span className="max-w-[160px] truncate">{labelFor(u)}</span>
            </span>
          ))}
        </div>
      ) : null}

      {open ? (
        <div className={panelClass}>
          <div className="sticky top-0 z-[1] border-b border-white/10 bg-inherit p-2">
            <input
              className={inputClass}
              placeholder="Search by name or email…"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              autoFocus
            />
          </div>
          {!filtered.length ? (
            <div className={"px-3 py-4 text-center text-xs " + (isDark ? "text-white/45" : "text-slate-500")}>
              No matches
            </div>
          ) : (
            filtered.map((u) => {
              const checked = selectedSet.has(u.id);
              return (
                <label key={u.id} className={rowClass(checked) + " cursor-pointer"}>
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggle(u.id)}
                    className="h-4 w-4 shrink-0 rounded border-white/20 accent-blue-500"
                  />
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white/10 text-[10px] font-bold">
                    {avatarSrc(u.avatarUrl) ? (
                      <img src={avatarSrc(u.avatarUrl)!} alt="" className="h-full w-full object-cover" />
                    ) : (
                      u.email.slice(0, 2).toUpperCase()
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{labelFor(u)}</span>
                    <span className={"block truncate text-[11px] " + (isDark ? "text-white/45" : "text-slate-500")}>
                      {u.email}
                    </span>
                  </span>
                </label>
              );
            })
          )}
        </div>
      ) : null}
    </div>
  );
}
