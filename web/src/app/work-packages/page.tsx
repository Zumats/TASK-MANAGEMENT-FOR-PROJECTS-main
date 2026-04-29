"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { apiGet, apiPatch } from "@/lib/api";

type TaskItem = {
  id: string;
  title: string;
  description: string;
  status: "in_process" | "complete" | "failed";
  progress: number;
  priority: "easy" | "medium" | "high" | "very_high" | "critical";
  startDate: number | null;
  dueDate: number | null;
  createdAt: number;
  department?: string;
  assignedTo?: string;
};

// Extracted mapping function matching existing logic
function mapTaskRow(row: Record<string, unknown>): TaskItem {
  const rawProgress = Number(row.progress);
  const progress = Number.isFinite(rawProgress) ? Math.max(0, Math.min(100, rawProgress)) : 0;
  const status = row.status === "complete" || row.status === "failed" || row.status === "in_process" ? (row.status as "in_process" | "complete" | "failed") : "in_process";
  const rawPriority = String(row.priority ?? "medium");
  const priority: TaskItem["priority"] =
    rawPriority === "easy" || rawPriority === "medium" || rawPriority === "high" || rawPriority === "very_high" || rawPriority === "critical"
      ? rawPriority
      : "medium";

  return {
    id: String(row.id ?? ""),
    title: String(row.title ?? "Untitled Task"),
    description: String(row.description ?? ""),
    status,
    progress,
    priority,
    startDate: row.start_date == null ? null : Number(row.start_date),
    dueDate: row.due_date == null ? null : Number(row.due_date),
    createdAt: Number(row.created_at ?? Date.now()),
    department: row.department == null ? undefined : String(row.department),
    assignedTo: String(row.assigned_to ?? ""),
  };
}

export default function WorkPackagesPage() {
  const { appUser } = useAuth();
  const router = useRouter();
  
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState<string>("all_open");
  const [searchText, setSearchText] = useState<string>("");
  const [projectType, setProjectType] = useState<string>("all");

  const [allUsers, setAllUsers] = useState<Array<{id: string, email: string, name: string | null}>>([]);

  useEffect(() => {
    async function init() {
      try {
        setLoading(true);
        const [resTasks, resUsers] = await Promise.all([
          apiGet<{ items: any[] }>(`/api/tasks`),
          apiGet<{ items: any[] }>(`/api/users`),
        ]);
        const mappedTasks = (resTasks.items || []).map(mapTaskRow);
        setTasks(mappedTasks.sort((a, b) => b.createdAt - a.createdAt));
        setAllUsers(resUsers.items || []);
      } catch (e) {
        console.error("Failed to fetch data", e);
      } finally {
        setLoading(false);
      }
    }
    init();
  }, [appUser]);

  // Sidebar navigation items based on screenshots
  const sidebarItems = [
    { id: 'favorites', icon: '★', label: 'Favorites' },
    { id: 'for_publish', icon: '📤', label: 'For Publish' },
    { id: 'all_open', icon: '📋', label: 'All open', default: true },
    { id: 'latest_activity', icon: '⚡', label: 'Latest activity' },
    { id: 'recently_created', icon: '⏰', label: 'Recently created' },
    { id: 'overdue', icon: '⚠️', label: 'Overdue' },
    { id: 'created_by_me', icon: '👤', label: 'Created by me' },
    { id: 'assigned_to_me', icon: '🎯', label: 'Assigned to me' },
    { id: 'shared_with_users', icon: '🤝', label: 'Shared with users' },
    { id: 'shared_with_me', icon: '📥', label: 'Shared with me' },
  ];

  // Derived filtered tasks
  const displayedTasks = tasks.filter(t => {
    // text search
    if (searchText && !t.title.toLowerCase().includes(searchText.toLowerCase())) return false;
    
    // basic filter grouping matching "All open", "Overdue" etc.
    if (filterType === 'all_open') {
      if (t.status === 'complete') return false;
    }
    if (filterType === 'overdue') {
      if (!t.dueDate) return false;
      if (t.status === 'complete') return false;
      if (Date.now() < t.dueDate) return false;
    }
    if (filterType === 'assigned_to_me') {
      if (String(t.assignedTo) !== String(appUser?.id)) return false;
    }
    if (projectType !== "all") {
      const dept = (t.department ?? "").toLowerCase();
      if (projectType === "mobile" && dept !== "mobile_development") return false;
      if (projectType === "web" && dept !== "web_development") return false;
      if (projectType === "pos" && dept !== "pos") return false;
      if (projectType === "hardware" && dept !== "hardware") return false;
      if (projectType === "erp" && dept !== "erp_system") return false;
    }
    // other filters can be expanded...
    return true;
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case "in_process": return "text-blue-400 bg-blue-500/10 border-blue-500/20";
      case "complete": return "text-green-400 bg-green-500/10 border-green-500/20";
      case "failed": return "text-red-400 bg-red-500/10 border-red-500/20";
      default: return "text-gray-400 bg-gray-500/10 border-gray-500/20";
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case "in_process": return "In Process";
      case "complete": return "Closed"; // The screenshot uses terms like "Closed"
      case "failed": return "Pending";
      default: return status;
    }
  };

  return (
    <div className="flex h-screen w-full flex-col bg-[#101014] text-white overflow-hidden font-sans">
      {/* Top Navigation Bar */}
      <header className="flex h-14 shrink-0 shadow items-center justify-between bg-[#191922] px-4 border-b border-white/10 z-20">
        <div className="flex items-center gap-4">
          <button onClick={() => router.push("/app")} className="p-2 hover:bg-white/5 rounded-md text-white/70 hover:text-white transition cursor-pointer">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          
          {/* Logo / Title area */}
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-blue-600 text-white font-bold shadow-lg shadow-blue-500/20">
              HP
            </div>
            <h1 className="text-[15px] font-semibold tracking-wide text-white/90 hidden sm:block">
              Hyperaccess Project Management
            </h1>
          </div>
        </div>

        {/* Right Nav Actions */}
        <div className="flex items-center gap-4">
          <div className="hidden md:flex relative w-64">
             <input type="text" placeholder="Search..." className="w-full bg-white/5 border border-white/10 rounded-md py-1.5 pl-8 pr-3 text-sm text-white focus:outline-none focus:border-blue-500/50 focus:bg-white/10" />
             <svg className="absolute left-2.5 top-2 w-4 h-4 text-white/40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
               <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
             </svg>
          </div>
          <button className="h-8 w-8 flex items-center justify-center rounded-full bg-blue-500/20 text-blue-400 font-bold border border-blue-500/30">
            {appUser?.email ? appUser.email.substring(0, 2).toUpperCase() : "U"}
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <div className="flex flex-1 overflow-hidden relative">
        {/* Left Sidebar */}
        <aside className="w-[240px] shrink-0 bg-[#14141c] border-r border-white/5 flex flex-col z-10 hidden lg:flex">
           {/* Work Packages Title */}
           <div className="px-4 py-4 uppercase text-[11px] font-bold tracking-widest text-white/40 border-b border-white/5">
              WORK PACKAGES
           </div>
           
           <div className="flex-1 overflow-y-auto py-2 scrollbar-thin">
              {sidebarItems.map((item) => {
                 const isActive = filterType === item.id;
                 return (
                    <button
                      key={item.id}
                      onClick={() => setFilterType(item.id)}
                      className={`w-full flex items-center gap-3 px-4 py-2 text-[13px] font-medium transition-colors ${
                        isActive 
                          ? "bg-blue-500/10 text-blue-400 border-r-2 border-blue-500" 
                          : "text-white/70 hover:bg-white/5 hover:text-white"
                      }`}
                    >
                      <span className={`text-base ${isActive ? 'text-blue-400' : 'text-white/40'}`}>
                        {item.icon}
                      </span>
                      {item.label}
                    </button>
                 );
              })}
           </div>
        </aside>

        {/* Main Work Area */}
        <main className="flex-1 flex flex-col min-w-0 bg-[#101014] relative">
          {/* Header Action / Filter Area */}
          <div className="bg-[#191922] border-b border-white/5 px-6 py-4 flex flex-col gap-4">
             {/* Top Filter Row */}
             <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                   <h2 className="text-lg font-semibold text-white truncate">Work Overview</h2>
                   <div className="flex items-center gap-2 px-2 text-white/50">
                     <span>{'>'}</span>
                     <span className="text-sm">{sidebarItems.find(s => s.id === filterType)?.label || "Filter"}</span>
                   </div>
                </div>
                
                <div className="flex items-center gap-3">
                   <button className="px-3 py-1.5 rounded bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-semibold text-white transition">
                      Cancel
                   </button>
                   <button className="px-3 py-1.5 rounded bg-blue-600 hover:bg-blue-500 border border-transparent text-xs font-semibold text-white transition flex items-center gap-1.5 shadow-[0_0_15px_rgba(37,99,235,0.4)]">
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      Save
                   </button>
                </div>
             </div>

             {/* Secondary Filter Row */}
             <div className="flex flex-wrap items-center gap-3 text-sm">
                <div className="relative">
                  <input 
                    type="text" 
                    placeholder="Filter by text" 
                    value={searchText}
                    onChange={(e) => setSearchText(e.target.value)}
                    className="w-48 bg-[#101014] border border-white/10 rounded px-3 py-1.5 text-xs text-white placeholder-white/40 focus:outline-none focus:border-blue-500"
                  />
                  <svg className="absolute right-2 top-2 w-3.5 h-3.5 text-white/30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </div>
                
                <div className="flex items-center gap-2 bg-[#101014] border border-white/10 rounded px-3 py-1.5 text-xs text-white">
                  <span className="text-white/40">Status:</span>
                  <select 
                    value={filterType} 
                    onChange={e => setFilterType(e.target.value)}
                    className="bg-transparent text-white outline-none cursor-pointer"
                  >
                     <option value="all_open" className="bg-[#191922]">open</option>
                     <option value="all" className="bg-[#191922]">all</option>
                  </select>
                </div>

                <div className="flex items-center gap-2 bg-[#101014] border border-white/10 rounded px-3 py-1.5 text-xs text-white">
                  <span className="text-white/40">Include projects:</span>
                  <select 
                    value={projectType}
                    onChange={e => setProjectType(e.target.value)}
                    className="bg-transparent text-white outline-none cursor-pointer max-w-[190px] truncate"
                  >
                     <option value="all" className="bg-[#191922]">All project types</option>
                     <option value="mobile" className="bg-[#191922]">Mobile Development</option>
                     <option value="web" className="bg-[#191922]">Web Development</option>
                     <option value="pos" className="bg-[#191922]">POS</option>
                     <option value="hardware" className="bg-[#191922]">Hardware</option>
                     <option value="erp" className="bg-[#191922]">ERP System</option>
                  </select>
                </div>

                <button className="flex items-center gap-1.5 text-blue-400 hover:text-blue-300 text-xs font-semibold uppercase tracking-wide ml-auto">
                   <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                     <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                   </svg>
                   Add Filter
                </button>
             </div>
          </div>

          {/* Table Container */}
          <div className="flex-1 overflow-auto bg-[#101014] p-6 relative">
             <div className="border border-white/10 rounded-lg overflow-hidden bg-[#191922] shadow-[0_8px_30px_rgba(0,0,0,0.5)]">
                <table className="w-full text-left border-collapse">
                   <thead>
                      <tr className="bg-black/40 border-b border-white/10 whitespace-nowrap">
                         <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-white/40 w-16">ID</th>
                         <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-white/40 min-w-[200px]">Subject</th>
                         <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-white/40 w-[140px]">Project Type</th>
                         <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-white/40 w-[140px]">Status</th>
                         <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-white/40 w-[200px]">Assignee</th>
                         <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-white/40 w-[200px]">Accountable</th>
                      </tr>
                   </thead>
                   <tbody className="divide-y divide-white/5">
                      {loading ? (
                         <tr>
                           <td colSpan={6} className="px-4 py-12 text-center text-sm text-white/40">Loading work packages...</td>
                         </tr>
                      ) : displayedTasks.length === 0 ? (
                         <tr>
                           <td colSpan={6} className="px-4 py-16 text-center text-sm text-white/40 border-b border-white/5">
                              <div className="flex justify-center mb-4">
                                <svg className="w-12 h-12 text-white/10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
                                </svg>
                              </div>
                              No work packages found matching criteria
                           </td>
                         </tr>
                      ) : (
                         displayedTasks.map((task) => {
                            const assigneeStr = String(task.assignedTo);
                            const assigneeObj = allUsers.find(u => String(u.id) === assigneeStr);
                            const assigneeName = assigneeObj?.name || assigneeObj?.email || assigneeStr;
                            
                            return (
                               <tr key={task.id} className="hover:bg-white/5 transition-colors group cursor-pointer" onClick={() => router.push(`/app`)}>
                                  <td className="px-4 py-3 text-xs text-blue-400 font-mono">#{task.id}</td>
                                  <td className="px-4 py-3 text-sm font-medium text-white group-hover:text-blue-400 transition-colors">
                                     <div className="truncate flex items-center gap-2">
                                        <div className="w-3 h-3 rounded-full border border-white/20 shrink-0" />
                                        {task.title}
                                     </div>
                                  </td>
                                  <td className="px-4 py-3 text-xs">
                                     <span className="px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-white/70 capitalize">
                                        {String(task.department || "General").replace(/_/g, " ")}
                                     </span>
                                  </td>
                                  <td className="px-4 py-3">
                                     <span className={`inline-flex px-2 py-1 items-center justify-center text-[10px] font-bold uppercase tracking-wider rounded border ${getStatusColor(task.status)}`}>
                                        {getStatusText(task.status)}
                                     </span>
                                  </td>
                                  <td className="px-4 py-3 text-xs text-white/80">
                                     <div className="flex items-center gap-2">
                                        <div className="w-5 h-5 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center text-[9px] font-bold">
                                           {assigneeName.substring(0,2).toUpperCase()}
                                        </div>
                                        <span className="truncate max-w-[140px]">{assigneeName}</span>
                                     </div>
                                  </td>
                                  <td className="px-4 py-3 text-xs text-white/80">
                                     {/* Mock Accountable user */}
                                     <div className="flex items-center gap-2">
                                        <div className="w-5 h-5 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center text-[9px] font-bold">
                                           AD
                                        </div>
                                        <span className="truncate max-w-[140px]">Admin</span>
                                     </div>
                                  </td>
                               </tr>
                            );
                         })
                      )}
                   </tbody>
                </table>

                {/* Pagination Footer */}
                <div className="border-t border-white/10 bg-black/40 px-4 py-3 flex items-center justify-between text-xs text-white/50">
                   <div>
                      Showing {displayedTasks.length > 0 ? 1 : 0} to {displayedTasks.length} of {displayedTasks.length} items
                   </div>
                   <div className="flex items-center gap-4">
                      <div className="flex gap-1">
                         <button className="px-2 py-1 rounded hover:bg-white/10 disabled:opacity-30" disabled>Previous</button>
                         <button className="px-2 py-1 rounded bg-white/10 text-white font-medium">1</button>
                         <button className="px-2 py-1 rounded hover:bg-white/10 disabled:opacity-30" disabled>Next</button>
                      </div>
                      <select className="bg-transparent text-white/70 outline-none cursor-pointer">
                         <option value="20" className="bg-[#191922]">20 / page</option>
                         <option value="50" className="bg-[#191922]">50 / page</option>
                         <option value="100" className="bg-[#191922]">100 / page</option>
                      </select>
                   </div>
                </div>
             </div>
          </div>
        </main>
      </div>
    </div>
  );
}
