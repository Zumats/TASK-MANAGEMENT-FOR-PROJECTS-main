"use client";

import { useEffect, useMemo, useState } from "react";
import { apiGet } from "@/lib/api";

type TaskLike = {
  id: string;
  title: string;
  startDate: number | null;
  dueDate: number | null;
  status?: string;
};

type CalendarEvent = {
  id: string;
  kind: "task" | "meeting" | "announcement";
  title: string;
  when: number;
  durationMin?: number;
  location?: string;
  meta?: string;
  raw?: any;
};

type MeetingLike = {
  id: string;
  title: string;
  startsAt: number;
  durationMin: number;
  location?: string;
  done?: boolean;
};

type AnnouncementLike = {
  id: string;
  title: string;
  event_start: number | null;
};

const MEETING_STORAGE_KEY = "tm_admin_meetings_v1";

function loadMeetings(): MeetingLike[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(MEETING_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((m) => m && typeof m === "object")
      .map((m: any) => ({
        id: String(m.id ?? ""),
        title: String(m.title ?? ""),
        startsAt: Number(m.startsAt ?? 0),
        durationMin: Number(m.durationMin ?? 30),
        location: m.location ? String(m.location) : "",
        done: Boolean(m.done ?? false),
      }))
      .filter((m) => m.id && Number.isFinite(m.startsAt));
  } catch {
    return [];
  }
}

function startOfDay(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function UserCalendar({ tasks = [] }: { tasks?: TaskLike[] }) {
  const [meetings, setMeetings] = useState<MeetingLike[]>([]);
  const [announcements, setAnnouncements] = useState<AnnouncementLike[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<CalendarEvent | null>(null);
  
  // Filtering states
  const [showTasks, setShowTasks] = useState(true);
  const [showMeetings, setShowMeetings] = useState(true);
  const [showAnnouncements, setShowAnnouncements] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const loadAll = async () => {
      setLoading(true);
      setError(null);
      try {
        setMeetings(loadMeetings());
        const res = await apiGet<{ items: any[] }>("/api/bulletin?type=EVENT");
        if (cancelled) return;
        const anns: AnnouncementLike[] = (res.items || []).map((a: any) => ({
          id: String(a.id ?? ""),
          title: String(a.title ?? ""),
          event_start: a.event_start == null ? null : Number(a.event_start),
        }));
        setAnnouncements(anns);
      } catch (e: unknown) {
        if (cancelled) return;
        const msg = e instanceof Error ? e.message : "Failed to load calendar data";
        setError(msg);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void loadAll();

    const handleStorage = () => {
      setMeetings(loadMeetings());
    };
    window.addEventListener("storage", handleStorage);

    return () => {
      cancelled = true;
      window.removeEventListener("storage", handleStorage);
    };
  }, []);

  const allEvents = useMemo<CalendarEvent[]>(() => {
    const out: CalendarEvent[] = [];
    
    // Add tasks
    tasks.forEach(t => {
      const when = t.dueDate ?? t.startDate;
      if (when) {
        out.push({
          id: `task_${t.id}`,
          kind: "task",
          title: t.title,
          when,
          raw: t,
        });
      }
    });

    // Add meetings (only if NOT done)
    meetings.filter(m => !m.done).forEach(m => {
      out.push({
        id: `meeting_${m.id}`,
        kind: "meeting",
        title: m.title || "Meeting",
        when: m.startsAt,
        durationMin: m.durationMin,
        location: m.location,
        meta: `${m.durationMin || 30} min${m.location ? ` • ${m.location}` : ""}`,
        raw: m,
      });
    });

    // Add announcements
    announcements.forEach(a => {
      if (a.event_start) {
        out.push({
          id: `ann_${a.id}`,
          kind: "announcement",
          title: a.title,
          when: a.event_start,
          raw: a,
        });
      }
    });

    return out.sort((a, b) => a.when - b.when);
  }, [tasks, meetings, announcements]);

  const filteredEvents = useMemo(() => {
    return allEvents.filter(ev => {
      if (ev.kind === "task") return showTasks;
      if (ev.kind === "meeting") return showMeetings;
      if (ev.kind === "announcement") return showAnnouncements;
      return true;
    });
  }, [allEvents, showTasks, showMeetings, showAnnouncements]);

  const days = useMemo(() => {
    const today = startOfDay(Date.now());
    // Show 14 days
    return Array.from({ length: 14 }).map((_, i) => {
      const dayMs = today + i * 24 * 60 * 60 * 1000;
      const dayEvents = filteredEvents.filter((ev) => startOfDay(ev.when) === dayMs);
      return { dayMs, events: dayEvents };
    });
  }, [filteredEvents]);

  return (
    <div className="space-y-6">
      {/* Header & Filters */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-white tracking-tight">Personalized Timeline</h2>
          <p className="text-sm text-white/50">Your unified view of work, meetings, and events.</p>
        </div>
        
        <div className="flex flex-wrap items-center gap-2 bg-white/5 p-1.5 rounded-2xl border border-white/10 backdrop-blur-md">
          <button
            onClick={() => setShowTasks(!showTasks)}
            className={`px-3 py-1.5 rounded-xl text-[10px] font-bold uppercase tracking-wider transition-all border ${
              showTasks 
                ? "bg-blue-600 border-blue-500 text-white shadow-lg shadow-blue-600/20" 
                : "bg-transparent border-transparent text-white/40 hover:text-white/60"
            }`}
          >
            Tasks
          </button>
          <button
            onClick={() => setShowMeetings(!showMeetings)}
            className={`px-3 py-1.5 rounded-xl text-[10px] font-bold uppercase tracking-wider transition-all border ${
              showMeetings 
                ? "bg-emerald-600 border-emerald-500 text-white shadow-lg shadow-emerald-600/20" 
                : "bg-transparent border-transparent text-white/40 hover:text-white/60"
            }`}
          >
            Meetings
          </button>
          <button
            onClick={() => setShowAnnouncements(!showAnnouncements)}
            className={`px-3 py-1.5 rounded-xl text-[10px] font-bold uppercase tracking-wider transition-all border ${
              showAnnouncements 
                ? "bg-amber-600 border-amber-500 text-white shadow-lg shadow-amber-600/20" 
                : "bg-transparent border-transparent text-white/40 hover:text-white/60"
            }`}
          >
            Events
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-2xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-300 flex items-center gap-3">
          <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
          {error}
        </div>
      )}

      {/* Calendar Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {days.map(({ dayMs, events: dayEvents }) => {
          const d = new Date(dayMs);
          const isToday = dayMs === startOfDay(Date.now());
          
          return (
            <div
              key={dayMs}
              className={`group flex flex-col gap-3 p-4 rounded-[2rem] border transition-all duration-300 ${
                isToday 
                  ? "bg-blue-600/10 border-blue-500/30 ring-1 ring-blue-500/20" 
                  : "bg-white/[0.02] border-white/5 hover:border-white/20 hover:bg-white/[0.04]"
              }`}
            >
              <div className="flex items-center justify-between gap-2 border-b border-white/5 pb-3">
                <div className="flex flex-col">
                  <span className={`text-[10px] font-black uppercase tracking-[0.2em] ${isToday ? "text-blue-400" : "text-white/30"}`}>
                    {d.toLocaleDateString(undefined, { weekday: "long" })}
                  </span>
                  <span className="text-sm font-bold text-white">
                    {d.toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                  </span>
                </div>
                {isToday && (
                  <span className="px-2 py-0.5 rounded-full bg-blue-500 text-[9px] font-black uppercase tracking-widest text-white">
                    Current
                  </span>
                )}
              </div>

              <div className="flex flex-col gap-2 min-h-[140px]">
                {dayEvents.length === 0 ? (
                  <div className="flex-1 flex flex-col items-center justify-center text-center opacity-20 py-4">
                    <span className="text-xl mb-1">✨</span>
                    <p className="text-[10px] font-bold text-white uppercase tracking-widest leading-none">Clear</p>
                  </div>
                ) : (
                  dayEvents.map((ev) => {
                    const time = new Date(ev.when).toLocaleTimeString(undefined, { 
                      hour: "2-digit", 
                      minute: "2-digit",
                      hour12: false
                    });
                    
                    const colorClasses = 
                      ev.kind === "task" 
                        ? "border-blue-500/20 bg-blue-500/5 text-blue-400 shadow-blue-500/5" 
                        : ev.kind === "meeting"
                        ? "border-emerald-500/20 bg-emerald-500/5 text-emerald-400 shadow-emerald-500/5"
                        : "border-amber-500/20 bg-amber-500/5 text-amber-400 shadow-amber-500/5";

                    return (
                      <button
                        key={ev.id}
                        onClick={() => setSelected(ev)}
                        className={`w-full text-left p-3 rounded-2xl border transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] ${colorClasses}`}
                      >
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <span className="text-[9px] font-black uppercase tracking-widest opacity-60">
                            {time}
                          </span>
                          <span className="text-xs">
                            {ev.kind === "task" ? "📋" : ev.kind === "meeting" ? "🗓️" : "📣"}
                          </span>
                        </div>
                        <div className="text-[11px] font-bold text-white line-clamp-1">
                          {ev.title}
                        </div>
                        {ev.location && (
                          <div className="mt-1 text-[9px] font-medium opacity-50 truncate">
                            📍 {ev.location}
                          </div>
                        )}
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Details Modal */}
      {selected && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-[#0b0b1a]/80 backdrop-blur-md animate-in fade-in duration-300">
          <div className="w-full max-w-lg rounded-[2.5rem] border border-white/10 bg-[#121225] overflow-hidden shadow-[0_0_50px_rgba(0,0,0,0.5)] animate-in zoom-in-95 duration-300">
            <div className={`p-8 border-b border-white/5 relative overflow-hidden ${
              selected.kind === "task" ? "bg-blue-600/10" : selected.kind === "meeting" ? "bg-emerald-600/10" : "bg-amber-600/10"
            }`}>
              <div className="absolute top-0 right-0 p-8 opacity-5">
                {selected.kind === "task" ? "📋" : selected.kind === "meeting" ? "🗓️" : "📣"}
              </div>
              
              <div className="flex items-start justify-between gap-6 relative">
                <div>
                  <span className={`text-[10px] font-black uppercase tracking-[0.2em] mb-2 block ${
                    selected.kind === "task" ? "text-blue-400" : selected.kind === "meeting" ? "text-emerald-400" : "text-amber-400"
                  }`}>
                    {selected.kind} Details
                  </span>
                  <h3 className="text-2xl font-black text-white tracking-tight leading-tight">
                    {selected.title}
                  </h3>
                </div>
                <button
                  onClick={() => setSelected(null)}
                  className="w-10 h-10 rounded-xl flex items-center justify-center bg-white/5 hover:bg-white/10 text-white/40 hover:text-white transition-all"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            <div className="p-8 space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 rounded-2xl border border-white/5 bg-white/[0.02]">
                  <div className="text-[10px] font-black uppercase tracking-widest text-white/30 mb-1">Scheduled</div>
                  <div className="text-xs font-bold text-white">
                    {new Date(selected.when).toLocaleDateString(undefined, { 
                      month: 'short', 
                      day: 'numeric', 
                      year: 'numeric' 
                    })}
                  </div>
                  <div className="text-[10px] font-medium text-white/50">
                    {new Date(selected.when).toLocaleTimeString(undefined, { 
                      hour: '2-digit', 
                      minute: '2-digit' 
                    })}
                  </div>
                </div>
                
                <div className="p-4 rounded-2xl border border-white/5 bg-white/[0.02]">
                  <div className="text-[10px] font-black uppercase tracking-widest text-white/30 mb-1">Reference</div>
                  <div className="text-xs font-bold text-white truncate">#{selected.id.split('_')[1]}</div>
                  <div className="text-[10px] font-medium text-white/50 uppercase tracking-tighter">System ID</div>
                </div>
              </div>

              {selected.kind === "meeting" && (
                <div className="space-y-4">
                  <div className="flex items-center gap-4 p-4 rounded-2xl bg-black/20 border border-white/5">
                    <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-400">📍</div>
                    <div>
                      <div className="text-[10px] font-black uppercase tracking-widest text-white/30">Location</div>
                      <div className="text-xs font-bold text-white">{selected.location || "Unspecified Platform"}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 p-4 rounded-2xl bg-black/20 border border-white/5">
                    <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-400">⌛</div>
                    <div>
                      <div className="text-[10px] font-black uppercase tracking-widest text-white/30">Duration</div>
                      <div className="text-xs font-bold text-white">{selected.durationMin || 30} Minutes</div>
                    </div>
                  </div>
                </div>
              )}

              {selected.kind === "task" && (
                <div className="p-4 rounded-2xl bg-black/20 border border-white/5">
                  <div className="text-[10px] font-black uppercase tracking-widest text-white/30 mb-2">Scope</div>
                  <p className="text-xs text-white/70 leading-relaxed italic">
                    This is a production work package assigned to your profile. Please refer to the Work Overview tab for full documentation.
                  </p>
                </div>
              )}
            </div>

            <div className="p-8 border-t border-white/5 bg-black/40 flex justify-end">
              <button
                onClick={() => setSelected(null)}
                className="px-10 py-3 rounded-2xl bg-white text-black text-xs font-black uppercase tracking-widest hover:bg-white/90 transition-all active:scale-95"
              >
                Close View
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
