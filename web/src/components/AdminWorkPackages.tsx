"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { apiDelete, apiPatch, apiPost } from "@/lib/api";
import { Search, ChevronDown, Filter as FilterIcon, History, Edit2 } from "lucide-react";
import type { TaskItem, Project } from "@/lib/types";

export function AdminWorkPackages({
  tasks,
  allUsers,
  projects,
  filterType,
  setFilterType,
  onShowTask,
  onEditTask,
}: {
  tasks: TaskItem[];
  allUsers: Array<{ id: string | number; email: string; name?: string | null; avatarUrl?: string | null; role?: string }>;
  projects: Project[];
  filterType: string;
  setFilterType: (v: string) => void;
  onShowTask: (task: any) => void;
  onEditTask: (id: string) => void;
}) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [projectFilter, setProjectFilter] = useState("all");
  const [assigneeMenuFor, setAssigneeMenuFor] = useState<string | number | null>(null);
  const [assigneeSearch, setAssigneeSearch] = useState("");
  const assigneeMenuRef = useRef<HTMLDivElement | null>(null);
  const [baselineOpen, setBaselineOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const baselineBtnRef = useRef<HTMLDivElement | null>(null);
  const filtersBtnRef = useRef<HTMLDivElement | null>(null);

  // advanced filters state (shown in Filter dropdown)
  const [statusFilter, setStatusFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [assigneeFilter, setAssigneeFilter] = useState("all");

  // baseline state (stored in localStorage)
  const [baselineId, setBaselineId] = useState("none");
  const [baselineOptions, setBaselineOptions] = useState<Array<{ id: string; label: string }>>([]);
  const [baselineMap, setBaselineMap] = useState<Record<string, { status?: string; assignedTo?: string | number | null; priority?: string }>>({});

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return tasks.filter((t) => {
      if (projectFilter !== "all" && String(t.projectId) !== projectFilter) return false;
      if (statusFilter !== "all" && String(t.status) !== statusFilter) return false;
      if (priorityFilter !== "all" && String(t.priority) !== priorityFilter) return false;
      if (assigneeFilter !== "all" && String(t.assignedTo ?? "") !== assigneeFilter) return false;
      if (!q) return true;
      const title = (t.title ?? "").toLowerCase();
      const desc = (t.description ?? "").toLowerCase();
      return title.includes(q) || desc.includes(q);
    });
  }, [projectFilter, search, tasks, statusFilter, priorityFilter, assigneeFilter]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      const n = e.target as Node;
      if (assigneeMenuRef.current && !assigneeMenuRef.current.contains(n)) setAssigneeMenuFor(null);
      if (baselineBtnRef.current && !baselineBtnRef.current.contains(n)) setBaselineOpen(false);
      if (filtersBtnRef.current && !filtersBtnRef.current.contains(n)) setFiltersOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const prefix = "tm_work_overview_baseline_";
    const opts: Array<{ id: string; label: string }> = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (!k || !k.startsWith(prefix)) continue;
      const id = k.slice(prefix.length);
      const num = Number(id);
      const label = Number.isFinite(num) ? new Date(num).toLocaleString() : id;
      opts.push({ id, label });
    }
    opts.sort((a, b) => Number(b.id) - Number(a.id));
    setBaselineOptions(opts);
  }, [baselineId]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (baselineId === "none") {
      setBaselineMap({});
      return;
    }
    try {
      const raw = window.localStorage.getItem(`tm_work_overview_baseline_${baselineId}`);
      const parsed = raw ? JSON.parse(raw) : {};
      setBaselineMap(parsed && typeof parsed === "object" ? parsed : {});
    } catch {
      setBaselineMap({});
    }
  }, [baselineId]);

  const saveCurrentAsBaseline = () => {
    if (typeof window === "undefined") return;
    const id = Date.now().toString();
    const snapshot: Record<string, { status?: string; assignedTo?: string | number | null; priority?: string }> = {};
    tasks.forEach((t) => {
      snapshot[String(t.id)] = { status: String(t.status), assignedTo: t.assignedTo ?? "", priority: String(t.priority) };
    });
    window.localStorage.setItem(`tm_work_overview_baseline_${id}`, JSON.stringify(snapshot));
    setBaselineId(id);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "not_started": return "text-white/60 bg-white/5 border-white/10";
      case "pending": return "text-yellow-400 bg-yellow-500/10 border-yellow-500/20";
      case "blocked": return "text-orange-400 bg-orange-500/10 border-orange-500/20";
      case "in_process": return "text-blue-400 bg-blue-500/10 border-blue-500/20";
      case "complete": return "text-green-400 bg-green-500/10 border-green-500/20";
      case "failed": return "text-red-400 bg-red-500/10 border-red-500/20";
      default: return "text-gray-400 bg-gray-500/10 border-gray-500/20";
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "easy": return "text-emerald-400";
      case "medium": return "text-emerald-400"; // Based on screenshot Low relates to green dot
      case "low": return "text-emerald-400";
      case "high": return "text-yellow-400";
      case "very_high": return "text-orange-400";
      case "critical": return "text-red-400";
      default: return "text-gray-400";
    }
  };

  const handleInlineUpdate = async (taskId: string | number, updates: Partial<TaskItem>) => {
    try {
      await apiPatch(`/api/tasks/${taskId}`, updates);
      router.refresh();
    } catch (err) {
      console.error("Inline update failed:", err);
    }
  };

  const handleShareToggle = async (taskId: string | number, toUserId: string | number, shouldShare: boolean) => {
    try {
      if (shouldShare) {
        await apiPost(`/api/tasks/${taskId}/share`, { to_user_id: Number(toUserId) });
      } else {
        await apiDelete(`/api/tasks/${taskId}/share?to_user_id=${Number(toUserId)}`);
      }
      router.refresh();
    } catch (err) {
      console.error("Share update failed:", err);
    }
  };

  const userLabel = (u: { email: string; name?: string | null }) => {
    const name = (u.name ?? "").trim();
    if (name) return name;
    const email = (u.email ?? "").trim();
    if (!email) return "Unknown";
    return email.split("@")[0] || email;
  };

  const initials = (label: string) => {
    const t = (label || "").trim();
    if (!t) return "NA";
    const parts = t.split(/\s+/).filter(Boolean);
    const first = parts[0]?.[0] ?? t[0] ?? "N";
    const second = parts.length > 1 ? (parts[1]?.[0] ?? "") : (t[1] ?? "");
    return (first + second).toUpperCase();
  };

  const accountableUser = useMemo(() => {
    return (
      allUsers.find((u) => u.role === "admin") ??
      allUsers.find((u) => (u.role ?? "").toLowerCase().includes("admin")) ??
      null
    );
  }, [allUsers]);

  return (
    <div className="flex flex-col h-full bg-[#191922]">
      {/* Header Area */}
      <div className="px-6 py-5 flex items-center justify-between"> 
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-bold text-white tracking-tight">Work Overview</h2>
          <span className="text-white/40">&gt;</span>
          <span className="text-sm font-medium text-white/60">All Open</span>
        </div>
        <div className="flex items-center gap-3">
          <div ref={baselineBtnRef} className="relative">
            <button
              type="button"
              onClick={() => setBaselineOpen((v) => !v)}
              className="flex items-center gap-2 rounded-md border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-white/70 hover:bg-white/10 transition-colors"
            >
              <History size={14} />
              Baseline: {baselineId === "none" ? "None" : "Saved"}
              <ChevronDown size={14} className="ml-1 text-white/40" />
            </button>
            {baselineOpen ? (
              <div className="absolute right-0 top-[calc(100%+8px)] z-50 w-72 rounded-xl border border-white/10 bg-[#14141c] shadow-2xl overflow-hidden">
                <button
                  type="button"
                  onClick={() => {
                    saveCurrentAsBaseline();
                    setBaselineOpen(false);
                  }}
                  className="w-full px-3 py-2 text-left text-xs font-semibold text-blue-300 hover:bg-white/5 transition-colors"
                >
                  + Save current as baseline
                </button>
                <div className="h-px bg-white/10" />
                <button
                  type="button"
                  onClick={() => { setBaselineId("none"); setBaselineOpen(false); }}
                  className="w-full px-3 py-2 text-left text-xs text-white/70 hover:bg-white/5 transition-colors"
                >
                  None
                </button>
                <div className="max-h-64 overflow-y-auto">
                  {baselineOptions.map((b) => (
                    <button
                      key={b.id}
                      type="button"
                      onClick={() => { setBaselineId(b.id); setBaselineOpen(false); }}
                      className={"w-full px-3 py-2 text-left text-xs transition-colors " + (baselineId === b.id ? "bg-blue-500/10 text-blue-200" : "text-white/70 hover:bg-white/5")}
                    >
                      {b.label}
                    </button>
                  ))}
                  {baselineOptions.length === 0 ? (
                    <div className="px-3 py-3 text-xs text-white/40 italic">
                      No baselines yet. Click “Save current as baseline”.
                    </div>
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>

          <div ref={filtersBtnRef} className="relative">
            <button
              type="button"
              onClick={() => setFiltersOpen((v) => !v)}
              className="flex items-center gap-2 rounded-md border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-white/70 hover:bg-white/10 transition-colors"
            >
              <FilterIcon size={14} />
              Filter
              <ChevronDown size={14} className="ml-1 text-white/40" />
            </button>
            {filtersOpen ? (
              <div className="absolute right-0 top-[calc(100%+8px)] z-50 w-80 rounded-xl border border-white/10 bg-[#14141c] shadow-2xl overflow-hidden p-3">
                <div className="grid gap-3">
                  <div className="grid gap-1.5">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-white/40">Status</div>
                    <select
                      value={statusFilter}
                      onChange={(e) => setStatusFilter(e.target.value)}
                      className="rounded-md border border-white/10 bg-[#101014] px-2.5 py-2 text-xs text-white/75 outline-none focus:border-blue-500/50"
                    >
                      <option value="all" className="bg-[#13131f]">All status</option>
                      <option value="not_started" className="bg-[#13131f]">Not Started</option>
                      <option value="in_process" className="bg-[#13131f]">In Process</option>
                      <option value="pending" className="bg-[#13131f]">Pending</option>
                      <option value="blocked" className="bg-[#13131f]">Blocked</option>
                      <option value="complete" className="bg-[#13131f]">Complete</option>
                      <option value="failed" className="bg-[#13131f]">Failed</option>
                    </select>
                  </div>

                  <div className="grid gap-1.5">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-white/40">Priority</div>
                    <select
                      value={priorityFilter}
                      onChange={(e) => setPriorityFilter(e.target.value)}
                      className="rounded-md border border-white/10 bg-[#101014] px-2.5 py-2 text-xs text-white/75 outline-none focus:border-blue-500/50"
                    >
                      <option value="all" className="bg-[#13131f]">All priority</option>
                      <option value="easy" className="bg-[#13131f]">Low</option>
                      <option value="medium" className="bg-[#13131f]">Medium</option>
                      <option value="high" className="bg-[#13131f]">High</option>
                      <option value="very_high" className="bg-[#13131f]">Very High</option>
                      <option value="critical" className="bg-[#13131f]">Critical</option>
                    </select>
                  </div>

                  <div className="grid gap-1.5">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-white/40">Assignee</div>
                    <select
                      value={assigneeFilter}
                      onChange={(e) => setAssigneeFilter(e.target.value)}
                      className="rounded-md border border-white/10 bg-[#101014] px-2.5 py-2 text-xs text-white/75 outline-none focus:border-blue-500/50"
                    >
                      <option value="all" className="bg-[#13131f]">All assignees</option>
                      {allUsers.map((u) => (
                        <option key={u.id} value={String(u.id)} className="bg-[#13131f]">
                          {userLabel(u)}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="flex items-center justify-between pt-1">
                    <button
                      type="button"
                      onClick={() => { setStatusFilter("all"); setPriorityFilter("all"); setAssigneeFilter("all"); }}
                      className="text-xs text-white/50 hover:text-white transition-colors"
                    >
                      Reset
                    </button>
                    <button
                      type="button"
                      onClick={() => setFiltersOpen(false)}
                      className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-500 transition-colors"
                    >
                      Done
                    </button>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {/* Filters Area */}
      <div className="px-6 py-4 flex items-center gap-3 border-b border-white/5 border-b-transparent">
        <div className="relative w-64">
          <input
            type="text"
            placeholder="Filter by text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-md border border-white/10 bg-[#101014] pl-3 pr-8 py-1.5 text-xs text-white placeholder:text-white/30 focus:border-blue-500/50 outline-none transition-colors"
          />
          <Search className="absolute right-2.5 top-1/2 -translate-y-1/2 text-white/30" size={14} />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-white/50">Project Filter:</span>
          
          <div className="relative">
            <select
              className="appearance-none rounded-md border-[#101014] bg-[#101014] pl-2 pr-6 py-1.5 text-xs font-medium text-white outline-none cursor-pointer"
              value={projectFilter}
              onChange={(e) => setProjectFilter(e.target.value)}
              
            >
              <option value="all" className="bg-[#13131f]">All projects</option>
              {projects.map(p => (
                <option key={p.id} value={String(p.id)} className="bg-[#13131f]">{p.name}</option>
              ))}
            </select>
            <ChevronDown size={14} className="absolute right-1 top-1/2 -translate-y-1/2 text-white/50 pointer-events-none" />
          </div>
        </div>

        <div className="flex items-center gap-2 ml-2">
          <span className="text-xs text-white/50">Status:</span>
          <div className="relative">
            <select
              className="appearance-none rounded-md border-[#101014] bg-[#101014] pl-2 pr-6 py-1.5 text-xs font-medium text-white outline-none cursor-pointer"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="all" className="bg-[#13131f]">All</option>
              <option value="not_started" className="bg-[#13131f]">Not Started</option>
              <option value="pending" className="bg-[#13131f]">Pending</option>
              <option value="in_process" className="bg-[#13131f]">In Process</option>
              <option value="blocked" className="bg-[#13131f]">Blocked</option>
              <option value="complete" className="bg-[#13131f]">Complete</option>
              <option value="failed" className="bg-[#13131f]">Failed</option>
            </select>
            <ChevronDown size={14} className="absolute right-1 top-1/2 -translate-y-1/2 text-white/50 pointer-events-none" />
          </div>
        </div>
      </div>

      {/* Table Container */}
      <div className="flex-1 px-6 pb-10 overflow-hidden flex flex-col">
        <div className="flex-1 rounded-xl border border-white/10 bg-[#14141c] overflow-hidden flex flex-col">
          <div ref={assigneeMenuRef} className="overflow-x-auto flex-1">
            <table className="w-full text-left whitespace-nowrap">
              <thead className="sticky top-0 z-10 bg-black/30 backdrop-blur border-b border-white/10">
                <tr>
                  <th className="px-4 py-3 text-[10px] font-semibold uppercase tracking-wider text-white/100 w-16">ID</th>
                  <th className="px-4 py-3 text-[10px] font-semibold uppercase tracking-wider text-white/100">SUBJECT</th>
                  <th className="px-4 py-3 text-[10px] font-semibold uppercase tracking-wider text-white/100 min-w-[140px]">PROJECT</th>
                  <th className="px-4 py-3 text-[10px] font-semibold uppercase tracking-wider text-white/100 min-w-[140px]">STATUS</th>
                  <th className="px-4 py-3 text-[10px] font-semibold uppercase tracking-wider text-white/100 min-w-[180px]">ASSIGNEE</th>
                  <th className="px-4 py-3 text-[10px] font-semibold uppercase tracking-wider text-white/100 min-w-[140px]">ACCOUNTABLE</th>
                  <th className="px-4 py-3 text-[10px] font-semibold uppercase tracking-wider text-white/100">PRIORITY</th>
                  <th className="px-4 py-3 text-[10px] font-semibold uppercase tracking-wider text-white/100">START DATE</th>
                  <th className="px-4 py-3 text-[10px] font-semibold uppercase tracking-wider text-white/100 leading-none">
                    FINISH DATE
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filtered.map((task) => {
                  const assigneeObj = allUsers.find(u => String(u.id) === String(task.assignedTo));
                  const assigneeName = assigneeObj ? userLabel(assigneeObj) : "No assigned yet";

                  const accName = accountableUser ? userLabel(accountableUser) : "Admin";
                  const accInitials = initials(accName);
                  const projectName =
                    projects.find((p) => String(p.id) === String(task.projectId))?.name ??
                    (task.projectName ? String(task.projectName) : "") ??
                    "";
                  const base = baselineMap[String(task.id)];
                  const isChanged =
                    baselineId !== "none" &&
                    Boolean(base) &&
                    (
                      String(base?.status ?? "") !== String(task.status ?? "") ||
                      String(base?.priority ?? "") !== String(task.priority ?? "") ||
                      String(base?.assignedTo ?? "") !== String(task.assignedTo ?? "")
                    );
                  
                  return (
                    <tr key={task.id} className="hover:bg-white/[0.02] transition-colors group">
                      <td className="px-4 py-3 text-xs font-semibold text-blue-500">#{task.id}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <button 
                            onClick={() => onShowTask(task)}
                            className="w-3.5 h-3.5 rounded-full border border-white/20 hover:border-white/40 transition-colors" 
                          />
                          <button
                            type="button"
                            onClick={() => onShowTask(task)}
                            className="text-sm font-semibold tracking-wide text-blue-400 hover:text-blue-300 transition-colors"
                          >
                            {task.title}
                          </button>
                          {isChanged ? (
                            <span className="ml-2 rounded-full border border-yellow-500/20 bg-yellow-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-yellow-300">
                              Changed
                            </span>
                          ) : null}
                          <button
                            onClick={() => onEditTask(String(task.id))}
                            className="ml-2 p-1 rounded-md opacity-0 group-hover:opacity-100 hover:bg-white/10 transition-all text-white/40 hover:text-white"
                          >
                            <Edit2 size={12} />
                          </button>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-xs font-medium text-white/70">
                          {projectName || "No project"}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="relative">
                          {/* 
                            Work Overview status logic:
                            - If task is "complete" but admin_approved is false/undefined → show as "in_process" 
                            - Only show "complete" when admin has explicitly approved (adminApproved = true)
                          */}
                          {(() => {
                            const rawStatus = String(task.status);
                            const isAdminApproved = Boolean((task as any).adminApproved);
                            // Tasks marked done by user but not yet approved → show as in_process in Work Overview
                            const displayStatus = rawStatus === "complete" && !isAdminApproved
                              ? "in_process"
                              : rawStatus;

                            return (
                              <div className="flex flex-col gap-1">
                                <select
                                  className={`w-full appearance-none rounded-md border px-3 py-1.5 text-xs font-semibold outline-none cursor-pointer focus:border-blue-500/50 ${getStatusColor(displayStatus)}`}
                                  value={displayStatus}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    const updates: any = { status: val };
                                    if (val === "complete") {
                                      updates.adminApproved = true;
                                      updates.progress = 100;
                                    } else {
                                      updates.adminApproved = false;
                                    }
                                    handleInlineUpdate(task.id, updates);
                                  }}
                                >
                                  <option value="not_started" className="bg-[#191922]">Not Started</option>
                                  <option value="in_process" className="bg-[#191922]">In Progress</option>
                                  <option value="pending" className="bg-[#191922]">Pending</option>
                                  <option value="blocked" className="bg-[#191922]">Blocked</option>
                                  <option value="complete" className="bg-[#191922]">Complete</option>
                                  <option value="failed" className="bg-[#191922]">Failed</option>
                                </select>
                                {rawStatus === "complete" && !isAdminApproved && (
                                  <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/25 bg-amber-500/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-amber-400">
                                    ⏳ Pending Admin Review
                                  </span>
                                )}
                              </div>
                            );
                          })()}
                          <ChevronDown size={14} className="absolute right-2 top-[10px] text-white/40 pointer-events-none" />
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="relative">
                          <button
                            type="button"
                            onClick={() =>
                              setAssigneeMenuFor((cur) => {
                                const next = String(cur) === String(task.id) ? null : task.id;
                                if (next) setAssigneeSearch("");
                                return next;
                              })
                            }
                            className="w-full bg-transparent px-0 py-1 text-xs text-white/80 transition-colors flex items-center gap-2 hover:text-white"
                          >
                            <div className="h-5 w-5 rounded-full overflow-hidden bg-white/10 border border-white/10 flex items-center justify-center text-[9px] font-bold text-white/70 shrink-0">
                              {assigneeObj?.avatarUrl ? (
                                <img src={assigneeObj.avatarUrl} alt="" className="h-full w-full object-cover" />
                              ) : (
                                initials(assigneeName)
                              )}
                            </div>
                            <span className="truncate flex-1 text-left">
                              {assigneeName}
                              {(task.sharedWith?.length ?? 0) > 0 ? (
                                <span className="ml-1 text-white/50">
                                  (+{task.sharedWith?.length})
                                </span>
                              ) : null}
                            </span>
                            <ChevronDown size={14} className="text-white/35 shrink-0" />
                          </button>

                          {String(assigneeMenuFor) === String(task.id) ? (
                            <div className="absolute left-0 right-0 top-[calc(100%+6px)] z-50 rounded-xl border border-white/10 bg-[#14141c] shadow-2xl overflow-hidden">
                              <div className="p-2 border-b border-white/10">
                                <input
                                  type="text"
                                  value={assigneeSearch}
                                  onChange={(e) => setAssigneeSearch(e.target.value)}
                                  placeholder="Search username or email..."
                                  className="w-full rounded-md border border-white/10 bg-[#101014] px-2.5 py-1.5 text-xs text-white placeholder:text-white/35 outline-none focus:border-blue-500/50"
                                />
                              </div>
                              <button
                                type="button"
                                className="w-full px-3 py-2 text-left text-xs text-white/70 hover:bg-white/5 transition-colors flex items-center gap-2"
                                onClick={() => {
                                  setAssigneeMenuFor(null);
                                  void handleInlineUpdate(task.id, { assignedTo: "" as any });
                                }}
                              >
                                <div className="h-6 w-6 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-[10px] text-white/50">
                                  —
                                </div>
                                No assigned yet
                              </button>
                              <div className="max-h-64 overflow-y-auto scrollbar-thin">
                                {allUsers
                                  .filter((u) => {
                                    const q = assigneeSearch.trim().toLowerCase();
                                    if (!q) return true;
                                    const label = userLabel(u).toLowerCase();
                                    return label.includes(q) || String(u.email).toLowerCase().includes(q);
                                  })
                                  .map((u) => {
                                  const label = userLabel(u);
                                  const isSelected = String(task.assignedTo) === String(u.id);
                                  const isShared = Boolean(task.sharedWith?.some((s) => String(s.id) === String(u.id)));
                                  return (
                                    <div
                                      key={u.id}
                                      role="button"
                                      tabIndex={0}
                                      className={
                                        "w-full px-3 py-2 text-left text-xs transition-colors flex items-center gap-2 cursor-pointer " +
                                        (isSelected ? "bg-blue-500/10 text-blue-300" : "text-white/70 hover:bg-white/5")
                                      }
                                      onClick={() => {
                                        setAssigneeMenuFor(null);
                                        void handleInlineUpdate(task.id, { assignedTo: String(u.id) as any });
                                      }}
                                      onKeyDown={(e) => {
                                        if (e.key === "Enter" || e.key === " ") {
                                          e.preventDefault();
                                          setAssigneeMenuFor(null);
                                          void handleInlineUpdate(task.id, { assignedTo: String(u.id) as any });
                                        }
                                      }}
                                    >
                                      <div className="h-6 w-6 rounded-full overflow-hidden bg-white/10 border border-white/10 flex items-center justify-center text-[10px] font-bold text-white/70 shrink-0">
                                        {u.avatarUrl ? (
                                          <img src={u.avatarUrl} alt="" className="h-full w-full object-cover" />
                                        ) : (
                                          initials(label)
                                        )}
                                      </div>
                                      <div className="min-w-0">
                                        <div className="truncate">{label}</div>
                                        <div className="truncate text-[10px] text-white/40">{u.email}</div>
                                      </div>
                                      <button
                                        type="button"
                                        className={
                                          "ml-auto rounded-md border px-2 py-1 text-[10px] font-semibold transition-colors " +
                                          (isShared
                                            ? "border-purple-500/30 bg-purple-500/10 text-purple-300 hover:bg-purple-500/20"
                                            : "border-white/15 bg-white/5 text-white/60 hover:bg-white/10")
                                        }
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          void handleShareToggle(task.id, u.id, !isShared);
                                        }}
                                      >
                                        {isShared ? "Shared" : "Add"}
                                      </button>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-xs text-white/70 truncate">{accName}</span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className={`w-1.5 h-1.5 rounded-full bg-current ${getPriorityColor(task.priority)}`} />
                          <span className="text-xs text-white/70 capitalize">
                            {task.priority === "easy" ? "Low" :
                             task.priority === "medium" ? "Medium" :
                             task.priority.replace("_", " ")}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs text-white/60">
                        {task.startDate ? new Date(task.startDate).toLocaleDateString(undefined, { month: 'numeric', day: 'numeric', year: 'numeric' }) : "-"}
                      </td>
                      <td className="px-4 py-3 text-xs text-white/60">
                        {task.dueDate ? new Date(task.dueDate).toLocaleDateString(undefined, { month: 'numeric', day: 'numeric', year: 'numeric' }) : "-"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Footer Pagination */}
          <div className="px-4 py-3 border-t border-white/10 bg-[#0e0e14] flex items-center justify-between">
            <div className="text-xs text-white/100">
              Showing 1 to {filtered.length} of {filtered.length} items
            </div>
            <div className="flex items-center gap-4 text-xs">
              <div className="flex items-center gap-2 text-white/100">
                <button className="hover:text-white transition-colors cursor-not-allowed">Previous</button>
                <div className="px-2 py-1 rounded bg-white/10 text-white font-medium">1</div>
                <button className="hover:text-white transition-colors cursor-not-allowed">Next</button>
              </div>
              <div className="flex items-center gap-1 text-white/100">
                <span>20 / page</span>
                <ChevronDown size={12} className="text-white/40" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
