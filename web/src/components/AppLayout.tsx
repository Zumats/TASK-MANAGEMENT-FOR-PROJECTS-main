"use client";

import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Menu, Search, Bell } from "lucide-react";
import { apiGet } from "@/lib/api";

export type GlobalSearchHit = {
  type: string;
  id: string;
  title: string;
  snippet: string;
  taskId?: string;
};

export type SidebarItem = {
  id: string;
  icon: React.ReactNode;
  label: string;
  unreadCount?: number;
  isDivider?: boolean;
  children?: SidebarItem[];
};

type AppLayoutProps = {
  sidebarTitle?: string;
  sidebarItems: SidebarItem[];
  activeTab: string;
  onTabChange: (tabId: string) => void;
  sidebarOpen?: boolean;
  onSidebarToggle?: () => void;
  sidebarCustomContent?: React.ReactNode;
  children: React.ReactNode;
  topBarExtra?: React.ReactNode;
  titleOverride?: string;
  unreadCount?: number;
  /** Full-text / global search result selection (tasks, projects, users, etc.) */
  onGlobalSearchSelect?: (hit: GlobalSearchHit) => void;
};

export function AppLayout({
  sidebarTitle = "NAVIGATION",
  sidebarItems,
  activeTab,
  onTabChange,
  sidebarOpen = true,
  onSidebarToggle,
  sidebarCustomContent,
  children,
  topBarExtra,
  titleOverride,
  unreadCount = 0,
  onGlobalSearchSelect,
}: AppLayoutProps) {
  const { appUser } = useAuth();
  const router = useRouter();
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const [logoSrc, setLogoSrc] = useState<string>("/hasi.jpg");
  const [userAdminMenuOpen, setUserAdminMenuOpen] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const userAdminMenuRef = useRef<HTMLDivElement | null>(null);
  const searchRef = useRef<HTMLDivElement | null>(null);
  const searchReqId = useRef(0);
  const [globalHits, setGlobalHits] = useState<GlobalSearchHit[]>([]);
  const [globalLoading, setGlobalLoading] = useState(false);

  const activeAncestors = useMemo(() => {
    const set = new Set<string>();
    for (const item of sidebarItems) {
      if (!item.children?.length) continue;
      if (item.children.some((c) => c.id === activeTab)) set.add(item.id);
    }
    return set;
  }, [activeTab, sidebarItems]);

  const flatNavItems = useMemo(() => {
    const out: Array<{ id: string; label: string }> = [];
    for (const item of sidebarItems) {
      if (item.isDivider) continue;
      out.push({ id: item.id, label: item.label });
      if (item.children?.length) {
        for (const c of item.children) {
          if (!c.isDivider) out.push({ id: c.id, label: c.label });
        }
      }
    }
    return out;
  }, [sidebarItems]);

  const searchPreviewItems = useMemo(() => {
    const q = searchText.trim().toLowerCase();
    if (!q) return flatNavItems.slice(0, 8);
    return flatNavItems.filter((x) => x.label.toLowerCase().includes(q)).slice(0, 8);
  }, [flatNavItems, searchText]);

  useEffect(() => {
    const q = searchText.trim();
    if (q.length < 2) {
      setGlobalHits([]);
      setGlobalLoading(false);
      return;
    }
    const tid = window.setTimeout(() => {
      const rid = ++searchReqId.current;
      setGlobalLoading(true);
      void apiGet<{ items: GlobalSearchHit[] }>(
        `/api/search?q=${encodeURIComponent(q)}&limit=14`,
      )
        .then((r) => {
          if (searchReqId.current === rid) setGlobalHits(r.items ?? []);
        })
        .catch(() => {
          if (searchReqId.current === rid) setGlobalHits([]);
        })
        .finally(() => {
          if (searchReqId.current === rid) setGlobalLoading(false);
        });
    }, 280);
    return () => window.clearTimeout(tid);
  }, [searchText]);

  const notifCount = useMemo(() => {
    return unreadCount || sidebarItems.find((s) => s.id === "notifications")?.unreadCount || 0;
  }, [sidebarItems, unreadCount]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = window.localStorage.getItem("tm_theme");
    if (saved === "dark" || saved === "light") {
      setTheme(saved);
      return;
    }
    const prefersDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
    setTheme(prefersDark ? "dark" : "light");
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("tm_theme", theme);
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (userAdminMenuRef.current && !userAdminMenuRef.current.contains(t)) setUserAdminMenuOpen(false);
      if (searchRef.current && !searchRef.current.contains(t)) setSearchOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, []);

  const isDark = theme === "dark";

  return (
    <div className={"flex h-screen w-full flex-col overflow-hidden font-sans " + (isDark ? "bg-[#0b0b14] text-white" : "bg-[#f3f5fa] text-[#111827]")}>
      {/* Top Navigation Bar */}
      <header className={"flex h-16 shrink-0 shadow-2xl items-center justify-between px-6 z-20 " + (isDark ? "bg-[#121220]/80 backdrop-blur-3xl border-b border-white/[0.05]" : "bg-white border-b border-slate-200")}>
        <div className="flex items-center gap-4">
          <button
            onClick={() => {
              if (onSidebarToggle) {
                onSidebarToggle();
                return;
              }
              router.push(appUser?.role === "admin" ? "/app" : "/profile");
            }}
            className={"p-2 rounded-md transition cursor-pointer " + (isDark ? "hover:bg-white/5 text-white/70 hover:text-white" : "hover:bg-slate-100 text-slate-500 hover:text-slate-900")}
          >
            <Menu className="w-5 h-5" />
          </button>
          
          <div className="flex items-center gap-3">
            <LogoMark src={logoSrc} onProcessed={setLogoSrc} />
            <h1 className={"text-[15px] font-semibold tracking-wide hidden sm:block " + (isDark ? "text-white/90" : "text-slate-800")}>
              {titleOverride || "Hyperaccess Project Management"}
            </h1>
          </div>
        </div>

        {/* Right Nav Actions */}
        <div className="flex items-center gap-4">
          {topBarExtra}
          <button
            type="button"
            onClick={() => setTheme((v) => (v === "dark" ? "light" : "dark"))}
            className={"h-8 px-2.5 rounded-md border text-xs font-semibold transition " + (isDark ? "border-white/10 bg-white/5 text-white/80 hover:bg-white/10" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50")}
            title="Toggle theme"
          >
            {isDark ? "Light" : "Dark"}
          </button>

          <div ref={searchRef} className="flex relative flex-1 min-w-0 max-w-[min(100vw-10rem,20rem)] md:max-w-none md:w-72 md:flex-initial">
             <input
               type="text"
               placeholder="Search pages & records…"
               value={searchText}
               onChange={(e) => {
                 setSearchText(e.target.value);
                 setSearchOpen(true);
               }}
               onFocus={() => setSearchOpen(true)}
               onKeyDown={(e) => {
                 if (e.key !== "Enter") return;
                 const q = searchText.trim();
                 if (q.length >= 2 && globalHits.length && onGlobalSearchSelect) {
                   onGlobalSearchSelect(globalHits[0]);
                   setSearchOpen(false);
                   return;
                 }
                 if (searchPreviewItems.length) {
                   onTabChange(searchPreviewItems[0].id);
                   setSearchOpen(false);
                 }
               }}
               className={"w-full rounded-md py-1.5 pl-8 pr-3 text-sm focus:outline-none " + (isDark ? "bg-white/5 border border-white/10 text-white focus:border-blue-500/50 focus:bg-white/10" : "bg-white border border-slate-200 text-slate-800 focus:border-blue-400")}
             />
             <Search className={"absolute left-2.5 top-2 w-4 h-4 pointer-events-none " + (isDark ? "text-white/40" : "text-slate-400")} />
             {searchOpen ? (
               <div className={"absolute top-10 left-0 right-0 z-[80] max-h-[min(70vh,420px)] overflow-y-auto rounded-xl shadow-2xl p-2 " + (isDark ? "border border-white/10 bg-[#14141c]" : "border border-slate-200 bg-white")}>
                 {searchText.trim().length >= 2 ? (
                   <>
                     <div className={"px-2 py-1 text-[10px] uppercase tracking-wide " + (isDark ? "text-white/40" : "text-slate-400")}>
                       Full-text & records
                     </div>
                     {globalLoading ? (
                       <div className={"px-2 py-3 text-xs " + (isDark ? "text-white/50" : "text-slate-500")}>Searching…</div>
                     ) : globalHits.length ? (
                       <div className="grid gap-1 mb-2">
                         {globalHits.map((hit) => (
                           <button
                             key={`${hit.type}_${hit.id}`}
                             type="button"
                             onClick={() => {
                               if (onGlobalSearchSelect) onGlobalSearchSelect(hit);
                               setSearchOpen(false);
                             }}
                             className={"w-full rounded-lg px-2 py-2 text-left text-xs transition-colors " + (isDark ? "text-white/80 hover:bg-white/5 hover:text-white" : "text-slate-700 hover:bg-slate-100")}
                           >
                             <div className="font-semibold">
                               <span className={"mr-1.5 rounded px-1 py-0.5 text-[9px] uppercase " + (isDark ? "bg-white/10 text-white/60" : "bg-slate-100 text-slate-500")}>{hit.type}</span>
                               {hit.title}
                             </div>
                             <div className={"mt-0.5 line-clamp-2 " + (isDark ? "text-white/45" : "text-slate-500")}>{hit.snippet}</div>
                           </button>
                         ))}
                       </div>
                     ) : (
                       <div className={"px-2 py-2 text-xs mb-2 " + (isDark ? "text-white/50" : "text-slate-500")}>No record matches — try another word.</div>
                     )}
                   </>
                 ) : null}
                 <div className={"px-2 py-1 text-[10px] uppercase tracking-wide " + (isDark ? "text-white/40" : "text-slate-400")}>Pages</div>
                 {searchPreviewItems.length ? (
                   <div className="grid gap-1">
                     {searchPreviewItems.map((item) => (
                       <button
                         key={`${item.id}_${item.label}`}
                         type="button"
                         onClick={() => {
                           onTabChange(item.id);
                           setSearchOpen(false);
                         }}
                         className={"w-full rounded-lg px-2 py-2 text-left text-xs transition-colors " + (isDark ? "text-white/75 hover:bg-white/5 hover:text-white" : "text-slate-700 hover:bg-slate-100")}
                       >
                         {item.label}
                       </button>
                     ))}
                   </div>
                 ) : (
                   <div className={"px-2 py-2 text-xs " + (isDark ? "text-white/50" : "text-slate-500")}>No page matches</div>
                 )}
               </div>
             ) : null}
          </div>

          <button
            type="button"
            className={"relative h-8 w-8 flex items-center justify-center rounded-md border transition " + (isDark ? "border-white/10 bg-white/5 text-white/70 hover:bg-white/10 hover:text-white" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50")}
            onClick={() => onTabChange("notifications")}
            title="Notifications"
          >
            <Bell className="w-4 h-4" />
            {notifCount > 0 ? (
              <span className="absolute top-1 right-1 w-2.5 h-2.5 rounded-full bg-red-500 border-2 border-[#191922] shadow-[0_0_8px_rgba(239,68,68,0.5)]" />
            ) : null}
          </button>

          <div ref={userAdminMenuRef} className="relative">
            <button
              type="button"
              className="h-8 w-8 flex items-center justify-center rounded-full bg-blue-500/20 text-blue-400 font-bold border border-blue-500/30 overflow-hidden shrink-0"
              onClick={() => setUserAdminMenuOpen((v) => !v)}
              title={appUser?.email}
              aria-label="Open user/admin menu"
            >
              {appUser?.avatarUrl ? (
                <img src={appUser.avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
              ) : (
                appUser?.email ? appUser.email.substring(0, 2).toUpperCase() : "NA"
              )}
            </button>

            {userAdminMenuOpen ? (
              <div className={"absolute right-0 top-9 z-[95] w-56 rounded-xl p-2 shadow-2xl " + (isDark ? "border border-white/10 bg-[#14141c]" : "border border-slate-200 bg-white")}>
                {appUser?.role === "admin" ? (
                  <>
                    <div className={"px-2 pb-1 text-[10px] uppercase tracking-wide " + (isDark ? "text-white/40" : "text-slate-400")}>System shortcuts</div>
                    <button onClick={() => { onTabChange("dashboard"); setUserAdminMenuOpen(false); }} className={"w-full text-left rounded-lg px-2 py-2 text-xs " + (isDark ? "text-white/75 hover:bg-white/5" : "text-slate-700 hover:bg-slate-100")}>Dashboard</button>
                    <button onClick={() => { onTabChange("tasks"); setUserAdminMenuOpen(false); }} className={"w-full text-left rounded-lg px-2 py-2 text-xs " + (isDark ? "text-white/75 hover:bg-white/5" : "text-slate-700 hover:bg-slate-100")}>Navigation: Work Overview</button>
                    <button onClick={() => { onTabChange("meetings"); setUserAdminMenuOpen(false); }} className={"w-full text-left rounded-lg px-2 py-2 text-xs " + (isDark ? "text-white/75 hover:bg-white/5" : "text-slate-700 hover:bg-slate-100")}>Navigation: Meetings</button>
                    <button onClick={() => { onTabChange("settings"); setUserAdminMenuOpen(false); }} className={"w-full text-left rounded-lg px-2 py-2 text-xs " + (isDark ? "text-white/75 hover:bg-white/5" : "text-slate-700 hover:bg-slate-100")}>Settings</button>
                    <button
                      onClick={async () => {
                        setUserAdminMenuOpen(false);
                        if (typeof window !== "undefined") sessionStorage.removeItem("tm_token");
                        try {
                          const { apiPost } = await import("@/lib/api");
                          await apiPost("/api/auth/logout");
                        } catch {}
                        router.replace("/login");
                      }}
                      className="w-full text-left rounded-lg px-2 py-2 text-xs text-rose-300 hover:bg-rose-500/10"
                    >
                      Logout
                    </button>
                  </>
                ) : (
                  <>
                    <div className={"px-2 pb-1 text-[10px] uppercase tracking-wide " + (isDark ? "text-white/40" : "text-slate-400")}>User</div>
                    <button onClick={() => { onTabChange("profile"); setUserAdminMenuOpen(false); }} className={"w-full text-left rounded-lg px-2 py-2 text-xs " + (isDark ? "text-white/75 hover:bg-white/5" : "text-slate-700 hover:bg-slate-100")}>Account profile</button>
                    <button onClick={() => { onTabChange("my_tasks"); setUserAdminMenuOpen(false); }} className={"w-full text-left rounded-lg px-2 py-2 text-xs " + (isDark ? "text-white/75 hover:bg-white/5" : "text-slate-700 hover:bg-slate-100")}>Task</button>
                    <button onClick={() => { onTabChange("settings"); setUserAdminMenuOpen(false); }} className={"w-full text-left rounded-lg px-2 py-2 text-xs " + (isDark ? "text-white/75 hover:bg-white/5" : "text-slate-700 hover:bg-slate-100")}>Settings</button>
                    <button onClick={() => { onTabChange("notifications"); setUserAdminMenuOpen(false); }} className={"w-full text-left rounded-lg px-2 py-2 text-xs " + (isDark ? "text-white/75 hover:bg-white/5" : "text-slate-700 hover:bg-slate-100")}>Notification</button>
                    <button
                      onClick={async () => {
                        setUserAdminMenuOpen(false);
                        if (typeof window !== "undefined") sessionStorage.removeItem("tm_token");
                        try {
                          const { apiPost } = await import("@/lib/api");
                          await apiPost("/api/auth/logout");
                        } catch {}
                        router.replace("/login");
                      }}
                      className="w-full text-left rounded-lg px-2 py-2 text-xs text-rose-300 hover:bg-rose-500/10"
                    >
                      Logout
                    </button>
                  </>
                )}
              </div>
            ) : null}
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <div className="flex flex-1 overflow-hidden relative">
        {/* Mobile Sidebar Overlay */}
        {sidebarOpen ? (
          <button
            type="button"
            className="lg:hidden absolute inset-0 z-20 bg-black/50"
            onClick={onSidebarToggle}
            aria-label="Close sidebar overlay"
          />
        ) : null}

        {/* Left Sidebar */}
        <aside
          className={
            "flex flex-col z-30 transition-all duration-200 " +
            (sidebarOpen
              ? "w-[240px] translate-x-0 absolute lg:relative inset-y-0 left-0"
              : "w-0 -translate-x-full lg:translate-x-0 lg:w-[50px] absolute lg:relative inset-y-0 left-0") +
            (isDark ? " bg-[#14141c] border-r border-white/5" : " bg-white border-r border-slate-200")
          }
        >
           {sidebarTitle && (
             <div className={"px-4 py-4 uppercase text-[11px] font-bold tracking-widest flex items-center justify-between min-h-[52px] " + (isDark ? "text-white/40 border-b border-white/5" : "text-slate-500 border-b border-slate-200")}>
                {sidebarOpen ? sidebarTitle : "NAV"}
             </div>
           )}
           
           <div className="flex-1 overflow-y-auto py-2 scrollbar-thin">
              {sidebarItems.map((item, idx) => {
                 if (item.isDivider) {
                   return <div key={`div-${idx}`} className="h-px bg-white/5 my-2 mx-4" />;
                 }
                 const isChildActive = item.children?.some((c) => c.id === activeTab) ?? false;
                 const isActive = activeTab === item.id || isChildActive;
                 const isGroup = Boolean(item.children?.length);
                 const isOpen = isGroup ? (openGroups[item.id] ?? activeAncestors.has(item.id) ?? false) : false;
                 return (
                    <div key={item.id}>
                      <button
                        onClick={() => {
                          if (isGroup) {
                            setOpenGroups((prev) => ({ ...prev, [item.id]: !(prev[item.id] ?? activeAncestors.has(item.id)) }));
                            // also navigate to the parent
                            onTabChange(item.id);
                            return;
                          }
                          onTabChange(item.id);
                        }}
                        className={`w-full flex items-center ${sidebarOpen ? "justify-between px-4 py-2.5" : "justify-center py-2"} text-[13px] font-medium transition-colors ${
                          isActive
                            ? "bg-blue-500/10 text-blue-400 border-r-2 border-blue-500"
                            : (isDark ? "text-white/70 hover:bg-white/5 hover:text-white" : "text-slate-700 hover:bg-slate-100")
                        }`}
                      >
                        <div className={`flex items-center ${sidebarOpen ? "gap-3" : ""}`}>
                          <span className={`${isActive ? "text-blue-400" : (isDark ? "text-white/40" : "text-slate-400")} flex items-center justify-center ${!sidebarOpen ? "w-10 h-10" : ""}`}>
                            {item.icon}
                          </span>
                          {sidebarOpen ? item.label : null}
                        </div>
                        <div className="flex items-center gap-2">
                          {sidebarOpen && item.unreadCount !== undefined && item.unreadCount > 0 ? (
                            <span className="bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
                              {item.unreadCount}
                            </span>
                          ) : null}
                          {sidebarOpen && isGroup ? (
                            <span
                              className={isDark ? "text-white/40" : "text-slate-400"}
                              style={{ transition: "transform 0.2s", transform: isOpen ? "rotate(0deg)" : "rotate(-90deg)" }}
                            >
                              ▼
                            </span>
                          ) : null}
                        </div>
                      </button>

                      {sidebarOpen && isGroup ? (
                        <div
                          style={{
                            overflow: "hidden",
                            maxHeight: isOpen ? 400 : 0,
                            opacity: isOpen ? 1 : 0,
                            transition: "max-height 0.25s ease, opacity 0.2s ease",
                          }}
                          className="pl-6 pr-2"
                        >
                          <div className={"mt-1 mb-2 rounded-xl " + (isDark ? "border border-white/5 bg-white/[0.03]" : "border border-slate-200 bg-slate-50")}>
                            {item.children!.map((c) => {
                              const childActive = activeTab === c.id;
                              return (
                                <button
                                  key={c.id}
                                  onClick={() => onTabChange(c.id)}
                                  className={
                                    "w-full flex items-center gap-2 px-3 py-2 text-left text-[13px] transition-colors " +
                                    (childActive
                                      ? "bg-blue-500/20 text-blue-300"
                                      : (isDark ? "text-white/60 hover:bg-white/5 hover:text-white" : "text-slate-600 hover:bg-white"))
                                  }
                                >
                                  <span className="text-sm">{c.icon}</span>
                                  <span>{c.label}</span>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      ) : null}
                    </div>
                 );
              })}
              {sidebarOpen && sidebarCustomContent ? (
                <div className="px-3 pt-3">
                  {sidebarCustomContent}
                </div>
              ) : null}
           </div>
        </aside>

        {/* Main Work Area */}
        <main className={"flex-1 flex flex-col min-w-0 relative overflow-auto scrollbar-thin transition-all duration-200 " + (sidebarOpen ? "lg:ml-0 ml-0" : "lg:ml-0 ml-0") + (isDark ? " bg-[#101014]" : " bg-[#f8fafc]")}>
          {children}
        </main>
      </div>
      <style jsx global>{`
        :root[data-theme="light"] [class*="bg-white/"] {
          background-color: rgba(15, 23, 42, 0.06) !important;
        }
        :root[data-theme="light"] [class*="border-white/"] {
          border-color: rgba(15, 23, 42, 0.2) !important;
        }
        :root[data-theme="light"] [class*="bg-[#101014]"],
        :root[data-theme="light"] [class*="bg-[#191922]"],
        :root[data-theme="light"] [class*="bg-[#14141c]"],
        :root[data-theme="light"] [class*="bg-[#0d0d1a]"],
        :root[data-theme="light"] [class*="bg-[#1a1a2e]"],
        :root[data-theme="light"] [class*="bg-[#0b0b10]"],
        :root[data-theme="light"] [class*="bg-[#0b0b14]"],
        :root[data-theme="light"] [class*="bg-[#161625]"],
        :root[data-theme="light"] [class*="bg-[#1e1e2d]"],
        :root[data-theme="light"] [class*="bg-[#0f0f1a]"],
        :root[data-theme="light"] [class*="bg-[#0e0e14]"],
        :root[data-theme="light"] [class*="bg-[#13131f]"] {
          background-color: #ffffff !important;
        }
      `}</style>
    </div>
  );
}

function LogoMark({
  src,
  onProcessed,
}: {
  src: string;
  onProcessed: (nextSrc: string) => void;
}) {
  useEffect(() => {
    let cancelled = false;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = "/hasi.jpg";
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        const size = 64;
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        ctx.clearRect(0, 0, size, size);
        ctx.drawImage(img, 0, 0, size, size);

        // Remove "near-white" pixels to transparent (basic background removal)
        const imageData = ctx.getImageData(0, 0, size, size);
        const data = imageData.data;
        for (let i = 0; i < data.length; i += 4) {
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          // brightness + low chroma heuristic
          const max = Math.max(r, g, b);
          const min = Math.min(r, g, b);
          const isNearWhite = max > 235 && (max - min) < 18;
          if (isNearWhite) data[i + 3] = 0;
        }
        ctx.putImageData(imageData, 0, 0);
        const url = canvas.toDataURL("image/png");
        if (!cancelled) onProcessed(url);
      } catch {
        // keep original src
      }
    };
    return () => {
      cancelled = true;
    };
  }, [onProcessed]);

  return (
    <div className="flex h-8 w-8 items-center justify-center rounded-md bg-transparent overflow-hidden">
      <img
        src={src}
        alt="Logo"
        className="h-8 w-8 object-contain"
        style={{ imageRendering: "auto" }}
      />
    </div>
  );
}
