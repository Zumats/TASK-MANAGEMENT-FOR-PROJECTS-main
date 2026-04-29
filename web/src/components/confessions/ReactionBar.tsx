import { useState } from "react";
import { apiPost } from "@/lib/api";
import { CONFESSION_EMOJIS, ConfessionEmojiSchema } from "@/lib/schemas/confession";

const REACTION_COLORS: Record<string, { active: string; default: string }> = {
  "❤️": { active: "bg-rose-500/20 text-rose-400 border-rose-500/30 font-bold", default: "hover:bg-rose-500/10 text-white/60 border-transparent hover:border-rose-500/20" },
  "😂": { active: "bg-yellow-500/20 text-yellow-500 border-yellow-500/30 font-bold", default: "hover:bg-yellow-500/10 text-white/60 border-transparent hover:border-yellow-500/20" },
  "🔥": { active: "bg-orange-500/20 text-orange-400 border-orange-500/30 font-bold", default: "hover:bg-orange-500/10 text-white/60 border-transparent hover:border-orange-500/20" },
  "😮": { active: "bg-blue-500/20 text-blue-400 border-blue-500/30 font-bold", default: "hover:bg-blue-500/10 text-white/60 border-transparent hover:border-blue-500/20" },
  "👏": { active: "bg-green-500/20 text-green-400 border-green-500/30 font-bold", default: "hover:bg-green-500/10 text-white/60 border-transparent hover:border-green-500/20" },
  "💀": { active: "bg-gray-500/20 text-gray-400 border-gray-500/30 font-bold", default: "hover:bg-gray-500/10 text-white/60 border-transparent hover:border-gray-500/20" },
};

export type ReactionData = { emoji: string; count: number; reacted: boolean };

export function ReactionBar({
  confessionId,
  initialReactions,
  onChange
}: {
  confessionId: string;
  initialReactions: ReactionData[];
  onChange?: () => void;
}) {
  const [reactions, setReactions] = useState<ReactionData[]>(initialReactions);

  const toggleReaction = async (emojiString: string) => {
    const parseRes = ConfessionEmojiSchema.safeParse(emojiString);
    if (!parseRes.success) return;
    const emoji = parseRes.data;

    // Optimistic update
    setReactions((prev) => {
      const existing = prev.find((r) => r.emoji === emoji);
      if (existing) {
        if (existing.reacted) {
          // Remove
          return prev.map((r) => r.emoji === emoji ? { ...r, count: Math.max(0, r.count - 1), reacted: false } : r).filter(r => r.count > 0 || r.reacted);
        } else {
          // Add
          return prev.map((r) => r.emoji === emoji ? { ...r, count: r.count + 1, reacted: true } : r);
        }
      } else {
        // New emoji
        return [...prev, { emoji, count: 1, reacted: true }];
      }
    });

    try {
      await apiPost(`/api/confessions/${confessionId}/react`, { emoji });
      if (onChange) onChange();
    } catch (e) {
      console.error(e);
      // Revert not implemented for brevity, but a real app should fetch again
    }
  };

  const sorted = [...reactions].sort((a, b) => b.count - a.count);
  const top = sorted[0];
  const totalReacts = reactions.reduce((sum, r) => sum + (r.count || 0), 0);
  const getReaction = (emoji: string) => reactions.find((r) => r.emoji === emoji);

  return (
    <div className="flex flex-wrap items-center gap-2 mt-3">
      {top ? (
        <div className="flex items-center gap-1 text-[11px] px-2 py-1 rounded-full bg-white/5 border border-white/10">
          <span className="leading-none">{top.emoji}</span>
          <span className="text-white/70">{totalReacts}</span>
        </div>
      ) : null}

      {CONFESSION_EMOJIS.map((emoji) => {
        const r = getReaction(emoji);
        const count = r?.count ?? 0;
        const reacted = Boolean(r?.reacted);
        const colors = REACTION_COLORS[emoji] || REACTION_COLORS["❤️"];
        const colorClass = reacted ? colors.active : colors.default;

        return (
          <button
            key={emoji}
            onClick={() => toggleReaction(emoji)}
            className={`flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] transition-all duration-200 active:scale-90 ${colorClass}`}
            title={count ? `Reacted: ${count}` : "React"}
          >
            <span className={reacted ? "scale-110 transition-transform" : ""}>{emoji}</span>
            {count > 0 ? <span className="text-[11px]">{count}</span> : null}
          </button>
        );
      })}
    </div>
  );
}
