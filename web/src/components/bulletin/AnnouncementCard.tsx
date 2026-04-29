import { useState, useEffect, useRef } from "react";
import { Announcement } from "@/lib/schemas/bulletin";

export const TYPE_STYLES = {
  ANNOUNCEMENT: { bg: "rgba(59,130,246,0.15)", text: "#93c5fd", border: "rgba(59,130,246,0.3)", icon: "📢", label: "Announcement" },
  EVENT:        { bg: "rgba(168,85,247,0.15)", text: "#d8b4fe", border: "rgba(168,85,247,0.3)", icon: "🗓️", label: "Event" },
  DEADLINE:     { bg: "rgba(239,68,68,0.15)",  text: "#fca5a5", border: "rgba(239,68,68,0.3)",  icon: "⏳", label: "Deadline" },
  HOLIDAY:      { bg: "rgba(34,197,94,0.15)",  text: "#86efac", border: "rgba(34,197,94,0.3)",  icon: "🎉", label: "Holiday" },
  URGENT:       { bg: "rgba(249,115,22,0.15)", text: "#fdba74", border: "rgba(249,115,22,0.6)",  icon: "🚨", label: "Urgent" },
};

function relativeTime(ms: number) {
  const diff = Date.now() - ms;
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d === 1) return `Yesterday`;
  return `${d}d ago`;
}

export function AnnouncementCard({
  item,
  isAdmin,
  index = 0,
  onEdit,
  onDelete,
  onPin,
}: {
  item: any;
  isAdmin: boolean;
  index?: number;
  onEdit: () => void;
  onDelete: () => void;
  onPin: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const style = TYPE_STYLES[item.type as keyof typeof TYPE_STYLES] || TYPE_STYLES.ANNOUNCEMENT;

  const isUrgent = item.type === "URGENT";
  const isNew = Date.now() - item.created_at < 24 * 60 * 60 * 1000;

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    if (menuOpen) window.addEventListener("click", handleClick);
    return () => window.removeEventListener("click", handleClick);
  }, [menuOpen]);

  return (
    <div
      className={`relative group rounded-2xl border p-5 transition-all ${
        item.is_pinned
          ? "bg-white/5 border-white/20 shadow-lg shadow-white/5"
          : "bg-[#0d0d1a] border-white/10 hover:border-white/20 hover:bg-white-[0.02]"
      } ${isUrgent ? "animate-pulse-subtle border-orange-500/50" : ""}`}
      style={{
        animationDelay: `${index * 50}ms`,
        animationFillMode: "both",
      }}
    >
      <style jsx>{`
        @keyframes pulse-subtle {
          0% { box-shadow: 0 0 0 0 rgba(249, 115, 22, 0.2); }
          50% { box-shadow: 0 0 0 4px rgba(249, 115, 22, 0); }
          100% { box-shadow: 0 0 0 0 rgba(249, 115, 22, 0); }
        }
        .animate-pulse-subtle {
          animation: pulse-subtle 2s infinite;
        }
      `}</style>
      
      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-3">
        <div className="flex flex-wrap items-center gap-2">
          {item.is_pinned && <span className="text-sm">📌</span>}
          <span
            className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold tracking-wide uppercase"
            style={{ background: style.bg, color: style.text, border: `1px solid ${style.border}` }}
          >
            <span>{style.icon}</span> {style.label}
          </span>
          {isNew && (
            <span className="rounded-full bg-blue-500 px-2 py-0.5 text-[10px] font-bold text-white uppercase tracking-widest">
              New
            </span>
          )}
          {!item.is_published && isAdmin && (
            <span className="rounded-full bg-white/10 border border-white/20 px-2.5 py-1 text-[10px] font-bold text-white/50 uppercase tracking-widest">
              Draft
            </span>
          )}
        </div>

        {/* Admin Menu */}
        {isAdmin && (
          <div className="relative" ref={menuRef}>
            <button
              onClick={(e) => { e.stopPropagation(); setMenuOpen(!menuOpen); }}
              className="p-1 rounded-lg text-white/40 hover:text-white hover:bg-white/10 transition-colors"
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
              </svg>
            </button>
            {menuOpen && (
              <div className="absolute right-0 top-full mt-1 w-36 rounded-xl bg-[#1a1a2e] border border-white/10 shadow-2xl z-20 py-1 overflow-hidden">
                <button
                  onClick={(e) => { e.stopPropagation(); setMenuOpen(false); onEdit(); }}
                  className="w-full text-left px-4 py-2 text-sm text-white/90 hover:bg-white/10 transition-colors"
                >
                  ✎ Edit
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); setMenuOpen(false); onPin(); }}
                  className="w-full text-left px-4 py-2 text-sm text-white/90 hover:bg-white/10 transition-colors"
                >
                  {item.is_pinned ? "⊘ Unpin" : "📌 Pin to top"}
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); setMenuOpen(false); onDelete(); }}
                  className="w-full text-left px-4 py-2 text-sm text-red-400 hover:bg-red-500/20 transition-colors"
                >
                  ✕ Delete
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      <h3 className="text-xl font-bold text-white mb-2 leading-snug">{item.title}</h3>
      
      {item.cover_image && (
        <img src={item.cover_image} alt="Cover" className="w-full h-48 object-cover rounded-xl mb-4 border border-white/10" />
      )}

      <p className="text-white/70 text-sm leading-relaxed whitespace-pre-wrap line-clamp-4">
        {item.body}
      </p>

      {item.type === "EVENT" && (item.event_start || item.event_end) && (
        <div className="mt-4 flex items-center gap-2 rounded-xl bg-white/5 border border-white/10 px-4 py-3">
          <span className="text-lg">📅</span>
          <div>
            <div className="text-xs text-white/50 font-semibold uppercase tracking-wider">Event Time</div>
            <div className="text-sm text-white font-medium">
              {item.event_start ? new Date(item.event_start).toLocaleString() : "TBD"}
              {item.event_end ? ` — ${new Date(item.event_end).toLocaleString()}` : ""}
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="mt-5 pt-4 border-t border-white/10 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-[10px] font-bold text-white border border-white/20">
            {item.author.name.charAt(0)}
          </div>
          <span className="text-xs text-white/60 font-medium">{item.author.name}</span>
        </div>
        <span className="text-xs text-white/40">{relativeTime(item.created_at)}</span>
      </div>
    </div>
  );
}
