import { useState, useEffect, useRef } from "react";
import { apiGet, apiPost } from "@/lib/api";
import { ConfessionMessage, ConfessionItem } from "./ConfessionMessage";
import { ConfessionCompose } from "./ConfessionCompose";
import { AliasWelcomeModal } from "./AliasWelcomeModal";
import { ConfessionAlias } from "@/lib/schemas/confession";
import { useDocumentTheme } from "@/hooks/useDocumentTheme";

export function ConfessionChat({ isAdmin = false }: { isAdmin?: boolean }) {
  const isDark = useDocumentTheme() === "dark";
  const [myAlias, setMyAlias] = useState<ConfessionAlias | null>(null);
  const [aliasLoading, setAliasLoading] = useState(true);
  const [showWelcome, setShowWelcome] = useState(false);
  const [confessions, setConfessions] = useState<ConfessionItem[]>([]);
  const [pinned, setPinned] = useState<ConfessionItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [replyTo, setReplyTo] = useState<{ id: string; aliasName: string } | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const isAutoScrollEnabled = useRef(true);

  const fetchAlias = async () => {
    try {
      setAliasLoading(true);
      const res = (await apiGet("/api/confessions/alias")) as any;
      if (res.alias) {
        setMyAlias(res.alias);
        setShowWelcome(false);
      } else {
        // Alias doesn't exist yet — try to auto-create it silently
        try {
          const created = (await apiPost("/api/confessions/alias", {})) as any;
          if (created.alias) {
            setMyAlias(created.alias);
            // Show welcome modal to introduce the user to their alias
            setShowWelcome(true);
          }
        } catch (e) {
          console.error("Failed to auto-create alias", e);
        }
      }
    } catch (e) {
      console.error("Failed to fetch alias", e);
    } finally {
      setAliasLoading(false);
    }
  };

  const fetchChat = async () => {
    try {
      const [{ items }, { item: pinnedItem }] = (await Promise.all([
        apiGet("/api/confessions"),
        apiGet("/api/confessions/pinned")
      ])) as any[];
      setConfessions(items || []);
      setPinned(pinnedItem || null);

      if (isAutoScrollEnabled.current && scrollRef.current) {
        // Jump directly to latest message (no animated scroll)
        requestAnimationFrame(() => {
          if (!scrollRef.current) return;
          scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        });
      }
    } catch (e) {
      console.error("Failed to fetch confessions", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAlias();
    fetchChat();
    const int = setInterval(fetchChat, 5000);
    return () => clearInterval(int);
  }, []);

  // Handle manual scrolling to disable auto-scroll if user scrolls up
  const handleScroll = () => {
    if (!scrollRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 50;
    isAutoScrollEnabled.current = isAtBottom;
  };

  if (loading && !confessions.length) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div
          className={
            "h-8 w-8 animate-spin rounded-full border-4 border-t-blue-500 " +
            (isDark ? "border-white/20" : "border-slate-200")
          }
        />
      </div>
    );
  }

  return (
    <div
      className={
        "confession-chat-root flex flex-col h-[calc(100vh-140px)] w-full rounded-2xl border overflow-hidden relative shadow-2xl " +
        (isDark ? "border-white/10 bg-[#0b0b14]" : "border-slate-200 bg-slate-50")
      }
    >
      
      {/* Show alias welcome modal (as overlay) only when first created */}
      {showWelcome && myAlias && (
        <AliasWelcomeModal 
          alias={myAlias}
          onComplete={() => setShowWelcome(false)} 
        />
      )}

      {/* Header / Pinned Banner */}
      <div
        className={
          "shrink-0 border-b px-4 py-3 flex items-center justify-between " +
          (isDark ? "bg-[#161625] border-white/5" : "bg-white border-slate-200")
        }
      >
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
          <h2 className={"text-sm font-bold uppercase tracking-wider " + (isDark ? "text-white" : "text-slate-800")}>
            Confession Room
          </h2>
        </div>
        {pinned && (
           <div className="flex items-center gap-2 text-[10px] text-yellow-500/80 bg-yellow-500/10 px-2 py-1 rounded-full border border-yellow-500/20">
             <span>📌 Pinned</span>
           </div>
        )}
      </div>

      {pinned && (
        <div className="shrink-0 border-b border-yellow-500/20 bg-yellow-500/5 px-4 py-3 z-10">
          <p className={"text-xs font-medium line-clamp-1 italic " + (isDark ? "text-white/70" : "text-slate-700")}>
            &ldquo;{pinned.body}&rdquo;
          </p>
          <div className={"mt-0.5 text-[10px] " + (isDark ? "text-white/40" : "text-slate-500")}>
            — <span style={{ color: pinned.alias.color }} className="font-semibold">{pinned.alias.name}</span>
          </div>
        </div>
      )}

      {/* Message Feed */}
      <div 
        ref={scrollRef}
        onScroll={handleScroll}
        className={
          "flex-1 overflow-y-auto p-4 md:p-6 scrollbar-thin " +
          (isDark ? "bg-gradient-to-b from-[#0b0b14] to-[#0f0f1a]" : "bg-gradient-to-b from-slate-50 to-slate-100")
        }
      >
        <div className="flex flex-col justify-end min-h-full">
          {confessions.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-4 text-center opacity-30 py-20">
              <span className="text-6xl">🤫</span>
              <div>
                <p className={"text-lg font-bold " + (isDark ? "text-white" : "text-slate-800")}>No confessions yet.</p>
                <p className={isDark ? "text-sm" : "text-sm text-slate-600"}>Be the first to share your mind anonymously.</p>
              </div>
            </div>
          ) : (
            <div className="space-y-1">
              {confessions.slice().reverse().map((msg, idx, arr) => {
                const prevMsg = idx > 0 ? arr[idx - 1] : null;
                const replyMsg = msg.replyToId ? confessions.find(c => c.id === msg.replyToId) : null;
                
                return (
                  <ConfessionMessage
                    key={msg.id}
                    item={msg}
                    isAdmin={isAdmin}
                    isDark={isDark}
                    isOwnMessage={msg.aliasId === myAlias?.id}
                    replyToItem={replyMsg}
                    onReply={(id, name) => setReplyTo({ id, aliasName: name })}
                    onHideToggle={() => fetchChat()}
                  />
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Compose Bar */}
      <div
        className={
          "shrink-0 border-t p-4 " + (isDark ? "bg-[#161625] border-white/5" : "bg-white border-slate-200")
        }
      >
        {aliasLoading ? (
          <div className="flex items-center justify-center py-4">
            <div
              className={
                "h-5 w-5 animate-spin rounded-full border-2 border-t-blue-500 " +
                (isDark ? "border-white/20" : "border-slate-200")
              }
            />
          </div>
        ) : myAlias ? (
          <ConfessionCompose
            isDark={isDark}
            myAlias={myAlias}
            replyTo={replyTo}
            onCancelReply={() => setReplyTo(null)}
            onSent={() => {
              fetchChat();
              setReplyTo(null);
              isAutoScrollEnabled.current = true;
              requestAnimationFrame(() => {
                if (!scrollRef.current) return;
                scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
              });
            }}
          />
        ) : (
          <div
            className={
              "rounded-xl border px-4 py-6 text-center " +
              (isDark ? "bg-white/5 border-white/10" : "bg-slate-100 border-slate-200")
            }
          >
            <p className={"text-sm mb-4 " + (isDark ? "text-white/50" : "text-slate-600")}>
              Setting up your anonymous alias failed. Please try again.
            </p>
            <button 
              onClick={fetchAlias}
              className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-2 rounded-xl text-sm font-bold transition-all"
            >
              Retry
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
