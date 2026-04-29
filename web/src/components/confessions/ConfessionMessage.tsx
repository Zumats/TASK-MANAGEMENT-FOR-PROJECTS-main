import { useState } from "react";
import { ReactionBar, ReactionData } from "./ReactionBar";
import { formatDistanceToNow } from "date-fns";
import { apiPost, apiPatch, apiDelete } from "@/lib/api";

export type ConfessionItem = {
  id: string;
  body: string;
  aliasId: string;
  isPinned: boolean;
  isManualPin: boolean;
  isHidden: boolean;
  flagCount: number;
  replyToId: string | null;
  totalReacts: number;
  createdAt: number;
  alias: {
    name: string;
    color: string;
  };
  reactions: ReactionData[];
};

export function ConfessionMessage({
  item,
  isAdmin,
  isDark = true,
  isOwnMessage = false,
  replyToItem,
  onReply,
  onHideToggle,
  isReply = false
}: {
  item: ConfessionItem;
  isAdmin: boolean;
  isDark?: boolean;
  isOwnMessage?: boolean;
  replyToItem?: ConfessionItem | null;
  onReply: (id: string, aliasName: string) => void;
  onHideToggle?: (id: string, currentHidden: boolean) => void;
  isReply?: boolean;
}) {
  const [flagging, setFlagging] = useState(false);
  const [hiding, setHiding] = useState(false);

  const handleFlag = async () => {
    if (confirm("Flag this confession as inappropriate?")) {
      setFlagging(true);
      try {
        await apiPost(`/api/confessions/${item.id}/flag`, {});
        alert("Flagged successfully. Moderators will review.");
      } catch (e) {
        alert("Failed to flag.");
      } finally {
        setFlagging(false);
      }
    }
  };

  const handleHide = async () => {
    if (!onHideToggle) return;
    setHiding(true);
    try {
      await apiPatch(`/api/confessions/${item.id}/hide`, { action: item.isHidden ? "unhide" : "hide" });
      onHideToggle(item.id, item.isHidden);
    } catch (e) {
      alert("Failed to toggle visibility.");
    } finally {
      setHiding(false);
    }
  };

  // If hidden and not admin, it shouldn't be rendered by the list, but just in case:
  if (item.isHidden && !isAdmin) {
    return (
      <div className={`flex items-center gap-3 py-3 px-4 rounded-2xl bg-white/5 border border-white/5 mt-4 ${isOwnMessage ? 'self-end flex-row-reverse' : ''}`}>
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/10 text-xs">
          🚫
        </div>
        <div className={"text-sm italic " + (isDark ? "text-white/30" : "text-slate-500")}>[Removed by moderator]</div>
      </div>
    );
  }

  return (
    <div className={`group relative flex w-full flex-col mb-4 ${isOwnMessage ? 'items-end' : 'items-start'}`}>
      {replyToItem && (
        <div
          className={`flex items-center mb-1 text-[10px] italic ${isOwnMessage ? "mr-10" : "ml-10"} ${isDark ? "text-white/30" : "text-slate-500"}`}
        >
          <svg className="h-2.5 w-2.5 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
          </svg>
          Replying to {replyToItem.alias.name}
        </div>
      )}
      <div className={`flex items-end gap-2 max-w-[85%] ${isOwnMessage ? 'flex-row-reverse' : 'flex-row'}`}>

      {/* Avatar */}
      {!isOwnMessage && (
        <div 
          className="flex shrink-0 items-center justify-center rounded-full font-bold shadow-lg h-8 w-8 text-[10px] border border-white/10"
          style={{ backgroundColor: item.alias.color, color: "#fff", opacity: item.isHidden ? 0.3 : 1 }}
        >
          {item.alias.name.substring(0, 2).toUpperCase()}
        </div>
      )}

      <div className={`flex flex-col min-w-0 ${item.isHidden ? 'opacity-50' : ''}`}>
        {/* Header - Only show for others or if it's a important context */}
        {!isOwnMessage && (
          <div className="flex items-baseline gap-2 mb-1 ml-1">
            <span className="font-bold text-[11px] tracking-wide" style={{ color: item.alias.color }}>
              {item.alias.name}
            </span>
            <span className={"text-[9px] uppercase " + (isDark ? "text-white/30" : "text-slate-500")}>
              {formatDistanceToNow(new Date(item.createdAt), { addSuffix: true })}
            </span>
          </div>
        )}

        {/* Message Body (Bubble) */}
        <div
          className={`relative px-4 py-2.5 text-[14px] leading-relaxed whitespace-pre-wrap break-words shadow-md ${
            isOwnMessage
              ? "bg-blue-600 text-white rounded-2xl rounded-tr-none"
              : isDark
                ? "bg-[#1e1e2d] text-white/95 rounded-2xl rounded-tl-none border border-white/5"
                : "bg-white text-slate-800 rounded-2xl rounded-tl-none border border-slate-200 shadow-sm"
          } ${isAdmin && item.flagCount >= 3 ? "border-2 border-yellow-500/50" : ""}`}
        >
          
          <div className={`absolute top-0 flex items-center gap-2 opacity-0 transition-opacity group-hover:opacity-100 py-1 px-2 rounded-lg bg-black/40 backdrop-blur-md z-30 ${isOwnMessage ? 'right-full mr-2' : 'left-full ml-2'}`}>
            <button
              onClick={() => onReply(item.id, item.alias.name)}
              className="text-[10px] font-bold uppercase text-white/60 hover:text-white transition-colors"
            >
              Reply
            </button>
            <button
              onClick={handleFlag}
              disabled={flagging}
              className="text-white/40 hover:text-yellow-400 transition-colors text-xs"
              title="Flag"
            >
              ⚠️
            </button>
            {isAdmin && (
              <button onClick={handleHide} disabled={hiding} className="text-white/40 hover:text-white text-[10px] uppercase font-bold">
                {item.isHidden ? "Show" : "Hide"}
              </button>
            )}
            {(isOwnMessage || isAdmin) && (
              <button
                onClick={async () => {
                  if (!confirm("Delete this message?")) return;
                  try {
                    await apiDelete(`/api/confessions/${item.id}`);
                    if (onHideToggle) onHideToggle(item.id, item.isHidden);
                  } catch {
                    alert("Failed to delete.");
                  }
                }}
                className="text-white/40 hover:text-rose-400 text-[10px] uppercase font-bold"
              >
                Del
              </button>
            )}
          </div>

          {item.body}
        </div>

        {/* Footer info for own messages */}
        {isOwnMessage && (
           <div className="flex justify-end mt-1 mr-1">
             <span className={"text-[9px] uppercase " + (isDark ? "text-white/30" : "text-slate-500")}>
                {formatDistanceToNow(new Date(item.createdAt), { addSuffix: true })}
             </span>
           </div>
        )}

        {/* Admin context: Flag count indicator */}
        {isAdmin && item.flagCount > 0 && (
          <div className="mt-1 text-[9px] font-bold text-red-400/80 flex items-center gap-1 uppercase tracking-tighter">
            🚩 {item.flagCount} Flags
          </div>
        )}

        {/* Reactions */}
        <div className={`mt-1.5 flex ${isOwnMessage ? 'justify-end' : 'justify-start'}`}>
          <ReactionBar confessionId={item.id} initialReactions={item.reactions} />
        </div>
      </div>
      </div>
    </div>
  );
}
