"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Project } from "@/lib/types";
import { Card } from "./Card";

type Meeting = {
  id: string;
  title: string;
  startsAt: number; // ms
  durationMin: number;
  location: string;
  agenda: string;
  attendees: string;
  project: string;
  reminderMin: number; // minutes before
  done?: boolean;
};

const STORAGE_KEY = "tm_admin_meetings_v1";

function safeParseMeetings(raw: string | null): Meeting[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    if (!Array.isArray(v)) return [];
    return v
      .filter((x) => x && typeof x === "object")
      .map((m: any) => ({
        id: String(m.id ?? ""),
        title: String(m.title ?? ""),
        startsAt: Number(m.startsAt ?? 0),
        durationMin: Number(m.durationMin ?? 30),
        location: String(m.location ?? ""),
        agenda: String(m.agenda ?? ""),
        attendees: String(m.attendees ?? ""),
        project: String(m.project ?? ""),
        reminderMin: Number(m.reminderMin ?? 15),
        done: Boolean(m.done ?? false),
      }))
      .filter((m) => m.id && m.title && Number.isFinite(m.startsAt));
  } catch {
    return [];
  }
}

function nowMs() {
  return Date.now();
}

function toLocalInputValue(ms: number) {
  const d = new Date(ms);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}T${hh}:${min}`;
}

function fmtWhen(ms: number) {
  const d = new Date(ms);
  return d.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function AdminMeetings({ 
  allUsers = [], 
  projects = [] 
}: { 
  allUsers?: Array<{ id: string | number; email: string; name?: string | null; avatarUrl?: string | null }>;
  projects?: Project[];
}) {
  const [items, setItems] = useState<Meeting[]>(() => {
    if (typeof window === "undefined") return [];
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return safeParseMeetings(raw);
  });
  const [modalOpen, setModalOpen] = useState(false);

  const [title, setTitle] = useState("");
  const [startsAt, setStartsAt] = useState(() =>
    toLocalInputValue(nowMs() + 60 * 60 * 1000),
  );
  const [durationMin, setDurationMin] = useState(30);
  const [projectId, setProjectId] = useState<string>("");
  const [location, setLocation] = useState("Online");
  const [attendees, setAttendees] = useState<string[]>([]);
  const [agenda, setAgenda] = useState("");
  const [reminderMin, setReminderMin] = useState(15);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(items.slice(0, 300)),
    );
    window.dispatchEvent(new Event("storage"));
  }, [items]);

  const upcoming = useMemo(() => {
    return items.filter((m) => !m.done).sort((a, b) => a.startsAt - b.startsAt);
  }, [items]);

  const overdue = useMemo(() => {
    const n = nowMs();
    return items
      .filter((m) => !m.done)
      .filter((m) => m.startsAt + (m.durationMin || 30) * 60_000 < n)
      .sort((a, b) => b.startsAt - a.startsAt);
  }, [items]);

  const nextMeeting =
    upcoming.find(
      (m) => m.startsAt + (m.durationMin || 30) * 60_000 >= nowMs(),
    ) ??
    upcoming[0] ??
    null;

  const createMeeting = () => {
    const safeTitle = title.trim();
    if (!safeTitle) {
      setToast("Meeting title is required");
      setTimeout(() => setToast(null), 2500);
      return;
    }
    const startMs = new Date(startsAt).getTime();
    if (!Number.isFinite(startMs)) {
      setToast("Invalid date/time");
      setTimeout(() => setToast(null), 2500);
      return;
    }

    const selectedProjectName = projects.find(p => String(p.id) === projectId)?.name || "General";

    const m: Meeting = {
      id: `${Date.now()}_${Math.random().toString(16).slice(2)}`,
      title: safeTitle,
      startsAt: startMs,
      durationMin: Math.max(1, Math.min(480, Number(durationMin) || 30)),
      project: selectedProjectName,
      location: location.trim(),
      attendees: attendees.map(id => {
        const u = allUsers.find(user => String(user.id) === id);
        return u ? (u.name || u.email) : id;
      }).join(", "),
      agenda: agenda.trim(),
      reminderMin: Math.max(0, Math.min(240, Number(reminderMin) || 15)),
      done: false,
    };
    setItems((prev) => [m, ...prev]);
    setModalOpen(false);
    setTitle("");
    setAgenda("");
    setAttendees([]);
    setProjectId("");
    setToast("Meeting added");
    setTimeout(() => setToast(null), 2500);
  };

  const toggleDone = (id: string) => {
    setItems((prev) =>
      prev.map((m) => (m.id === id ? { ...m, done: !m.done } : m)),
    );
  };

  const removeMeeting = (id: string) => {
    setItems((prev) => prev.filter((m) => m.id !== id));
  };

  return (
    <div className="p-4">
      <div className="flex flex-wrap items-start justify-between gap-6 mb-8">
        <div>
          <h2 className="text-xl font-bold text-white">Admin Meetings</h2>
          <p className="mt-1 text-sm text-white/50">
            Schedule and manage project synchronization meetings.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          className="flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2 text-sm font-semibold text-white transition-all hover:bg-blue-500 active:scale-95"
        >
          <span className="text-lg">+</span>
          New Meeting
        </button>
      </div>

      {toast ? (
        <div className="mb-6 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-2 text-sm text-emerald-400 flex items-center gap-2 font-medium">
          <span className="text-emerald-400">✓</span> {toast}
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-12">
        {/* Sidebar: Next up and Overdue */}
        <div className="lg:col-span-4 space-y-6">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-6 flex flex-col">
            <div className="text-xs font-bold uppercase tracking-wider text-white/30 mb-4 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-blue-500" />
              Focus Meeting
            </div>
            {nextMeeting ? (
              <div className="flex-1 flex flex-col">
                <div className="text-lg font-bold text-white mb-2 leading-tight">
                  {nextMeeting.title}
                </div>
                <div className="flex items-center gap-2 text-sm text-white/50 mb-4">
                  <span className="text-blue-400">{fmtWhen(nextMeeting.startsAt)}</span>
                  <span className="w-1 h-1 rounded-full bg-white/20" />
                  <span>{nextMeeting.durationMin} min</span>
                </div>
                
                <div className="flex flex-wrap gap-2 mb-6">
                  <div className="flex items-center gap-2 text-xs text-white/60 bg-white/5 px-2 py-1 rounded-lg border border-white/5">
                    <span className="text-blue-400">#</span> {nextMeeting.project || "General"}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-white/60 bg-white/5 px-2 py-1 rounded-lg border border-white/5">
                    <span className="text-emerald-400">📍</span> {nextMeeting.location || "Online"}
                  </div>
                </div>

                {nextMeeting.agenda ? (
                  <div className="text-sm text-white/40 bg-black/20 p-4 rounded-xl border border-white/5 italic flex-1 min-h-[80px]">
                    "{nextMeeting.agenda}"
                  </div>
                ) : <div className="flex-1" />}

                <button
                  type="button"
                  onClick={() => toggleDone(nextMeeting.id)}
                  className="mt-6 w-full rounded-xl bg-blue-600 py-2.5 text-sm font-semibold text-white hover:bg-blue-500 transition-all active:scale-[0.98]"
                >
                  Mark as Completed
                </button>
              </div>
            ) : (
              <div className="py-12 text-center">
                <p className="text-sm text-white/30 italic font-medium">No active meetings</p>
              </div>
            )}
          </div>

          {overdue.length > 0 && (
            <div className="rounded-2xl border border-amber-500/20 bg-gradient-to-b from-amber-500/10 to-amber-500/[0.02] p-6 overflow-hidden">
              <div className="flex items-center justify-between gap-3 mb-4">
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-amber-500/70">
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                  Overdue Meetings
                </div>
                <div className="text-[10px] font-bold text-amber-500/60 bg-amber-500/10 border border-amber-500/20 px-2 py-1 rounded-full">
                  {overdue.length} total
                </div>
              </div>
              <div className="space-y-2">
                {overdue.slice(0, 3).map((m) => (
                  <div
                    key={m.id}
                    className="p-3 rounded-2xl bg-black/20 border border-white/5 flex items-center justify-between gap-3 hover:border-amber-500/20 hover:bg-black/30 transition-all"
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-white/90 truncate">
                        {m.title}
                      </div>
                      <div className="mt-1 flex items-center gap-2 text-[10px] text-white/40">
                        <span className="text-amber-400/70 font-semibold">
                          {fmtWhen(m.startsAt)}
                        </span>
                        <span className="w-1 h-1 rounded-full bg-white/15" />
                        <span className="truncate">{m.project || "General"}</span>
                      </div>
                    </div>
                    <button
                      onClick={() => toggleDone(m.id)}
                      className="h-8 w-8 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-500 hover:bg-amber-500 hover:text-white transition-all text-xs flex items-center justify-center"
                      title="Mark completed"
                    >
                      ✓
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Main Content: Schedule List */}
        <div className="lg:col-span-8">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-6 min-h-[500px] flex flex-col">
            <div className="flex items-center justify-between mb-6">
              <div className="text-xs font-bold uppercase tracking-wider text-white/30">
                Strategic Timeline
              </div>
              <div className="px-2 py-1 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-400 text-[10px] font-bold">
                {upcoming.length} Upcoming
              </div>
            </div>

            <div className="space-y-3 overflow-y-auto max-h-[600px] pr-2 scrollbar-thin">
              {upcoming.map((m) => (
                <div
                  key={m.id}
                  className="group rounded-2xl border border-white/5 bg-white/[0.02] p-4 flex items-center gap-4 transition-all hover:bg-white/[0.05] hover:border-white/10"
                >
                  <div className="w-12 h-12 rounded-xl bg-white/5 flex flex-col items-center justify-center border border-white/5 flex-shrink-0">
                    <span className="text-[10px] text-white/30 font-bold uppercase">
                      {new Date(m.startsAt).toLocaleDateString(undefined, { month: 'short' })}
                    </span>
                    <span className="text-base font-bold text-white leading-none">
                      {new Date(m.startsAt).getDate()}
                    </span>
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                      <h4 className="text-sm font-semibold text-white">
                        {m.title}
                      </h4>
                      <span className="px-1.5 py-0.5 rounded-md bg-blue-500/10 text-blue-400 text-[9px] font-bold uppercase">
                        {m.project}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-[11px] text-white/40 font-medium whitespace-nowrap overflow-hidden">
                      <span>{new Date(m.startsAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}</span>
                      <span>•</span>
                      <span>{m.durationMin}m</span>
                      <span>•</span>
                      <span className="truncate">{m.location || 'Online'}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-all">
                    <button
                      onClick={() => toggleDone(m.id)}
                      className="h-8 w-8 rounded-lg flex items-center justify-center bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 hover:bg-emerald-500 hover:text-white transition-all shadow-lg shadow-emerald-500/5"
                    >
                      ✓
                    </button>
                    <button
                      onClick={() => removeMeeting(m.id)}
                      className="h-8 w-8 rounded-lg flex items-center justify-center bg-rose-500/10 border border-rose-500/20 text-rose-400 hover:bg-rose-500 hover:text-white transition-all"
                    >
                      🗑
                    </button>
                  </div>
                </div>
              ))}
              
              {upcoming.length === 0 && (
                <div className="py-20 text-center flex flex-col items-center gap-3 grayscale opacity-30">
                  <div className="w-16 h-16 rounded-full border-2 border-dashed border-white/20 flex items-center justify-center text-2xl">
                    🗓️
                  </div>
                  <p className="text-sm font-semibold text-white">Quiet schedule</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {modalOpen && typeof document !== "undefined" && createPortal(
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/80 backdrop-blur-sm px-4 p-6">
          <div className="w-full max-w-xl rounded-2xl border border-white/10 bg-[#191922] overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
            <div className="p-6 border-b border-white/5 flex items-center justify-between">
              <div>
                <h3 className="text-xl font-bold text-white">Schedule Meeting</h3>
                <p className="text-xs text-white/40 mt-1">Fill in the details for the new meeting sync.</p>
              </div>
              <button
                onClick={() => setModalOpen(false)}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-white/40 hover:bg-white/10 hover:text-white transition-all"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-6 scrollbar-thin">
                <div className="grid gap-4">
                  <div className="grid gap-1.5">
                    <label className="text-xs font-semibold text-white/50 ml-1">Meeting Title</label>
                    <input
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white outline-none focus:border-blue-500/50 transition-all font-medium"
                      placeholder="e.g. Q3 Roadmap Deep-Dive"
                    />
                  </div>

                  <div className="grid sm:grid-cols-2 gap-4">
                    <div className="grid gap-1.5">
                      <label className="text-xs font-semibold text-white/50 ml-1">Start Date/Time</label>
                      <input
                        type="datetime-local"
                        value={startsAt}
                        onChange={(e) => setStartsAt(e.target.value)}
                        className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white outline-none focus:border-blue-500/50 [color-scheme:dark]"
                      />
                    </div>
                    <div className="grid gap-1.5">
                      <label className="text-xs font-semibold text-white/50 ml-1">Duration (Min)</label>
                      <input
                        type="number"
                        value={durationMin}
                        onChange={(e) => setDurationMin(Number(e.target.value))}
                        className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white outline-none focus:border-blue-500/50"
                        min={10}
                      />
                    </div>
                  </div>

                  <div className="grid sm:grid-cols-2 gap-4">
                    <div className="grid gap-1.5">
                      <label className="text-xs font-semibold text-white/50 ml-1">Strategic Project</label>
                      <select
                        value={projectId}
                        onChange={(e) => setProjectId(e.target.value)}
                        className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white outline-none focus:border-blue-500/50 appearance-none transition-all font-medium"
                      >
                        <option value="" className="bg-[#191922]">General / None</option>
                        {projects.map((p) => (
                          <option key={p.id} value={p.id} className="bg-[#191922]">{p.name}</option>
                        ))}
                      </select>
                    </div>
                    <div className="grid gap-1.5">
                      <label className="text-xs font-semibold text-white/50 ml-1">Venue / Platform</label>
                      <input
                        value={location}
                        onChange={(e) => setLocation(e.target.value)}
                        className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white outline-none focus:border-blue-500/50 transition-all font-medium"
                        placeholder="Online / Room 4"
                      />
                    </div>
                  </div>

                  <div className="grid gap-1.5">
                    <label className="text-xs font-semibold text-white/50 ml-1">Participants ({attendees.length})</label>
                    <div className="flex flex-wrap gap-2 max-h-[150px] overflow-y-auto rounded-xl border border-white/10 bg-black/20 p-3 scrollbar-thin">
                      {allUsers.map((u) => (
                        <button
                          key={u.id}
                          type="button"
                          onClick={() => {
                            if (attendees.includes(String(u.id))) setAttendees(attendees.filter(id => id !== String(u.id)));
                            else setAttendees([...attendees, String(u.id)]);
                          }}
                          className={`flex items-center gap-2 p-1.5 rounded-lg border transition-all ${
                            attendees.includes(String(u.id))
                              ? "bg-blue-600/20 border-blue-500/40 text-white"
                              : "bg-white/5 border-white/5 text-white/50 hover:border-white/20"
                          }`}
                        >
                          <div className="w-5 h-5 rounded-md overflow-hidden bg-white/10 flex items-center justify-center text-[10px]">
                            {u.avatarUrl ? <img src={u.avatarUrl} alt="" className="w-full h-full object-cover" /> : (u.name || u.email)[0].toUpperCase()}
                          </div>
                          <span className="text-[10px] whitespace-nowrap">{u.name || u.email.split('@')[0]}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="grid gap-1.5">
                    <label className="text-xs font-semibold text-white/50 ml-1">Agenda / Context</label>
                    <textarea
                      value={agenda}
                      onChange={(e) => setAgenda(e.target.value)}
                      className="w-full min-h-[100px] rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none focus:border-blue-500/50 transition-all font-medium resize-none"
                      placeholder="Meeting objectives..."
                    />
                  </div>
                </div>
            </div>

            <div className="p-6 border-t border-white/5 bg-black/10 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="px-4 py-2 text-sm font-semibold text-white/40 hover:text-white transition-all"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={createMeeting}
                className="rounded-xl bg-blue-600 px-6 py-2.5 text-sm font-bold text-white transition-all hover:bg-blue-500 active:scale-95"
              >
                Schedule Sync
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
