import { useState, useRef, useEffect } from "react";
import { apiPost } from "@/lib/api";
import { ConfessionAlias } from "@/lib/schemas/confession";

export function ConfessionCompose({
  myAlias,
  onSent,
  replyTo,
  onCancelReply,
  isDark = true,
}: {
  myAlias: ConfessionAlias;
  onSent: () => void;
  replyTo?: { id: string, aliasName: string } | null;
  onCancelReply?: () => void;
  isDark?: boolean;
}) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize text area
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 150)}px`;
    }
  }, [text]);

  // Focus when replying
  useEffect(() => {
    if (replyTo && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [replyTo]);

  const handleSubmit = async () => {
    if (!text.trim() || sending) return;
    setError(null);
    setSending(true);

    try {
      await apiPost("/api/confessions", {
        body: text.trim(),
        replyToId: replyTo?.id || null
      });
      setText("");
      onSent();
      if (onCancelReply) onCancelReply();
    } catch (err: any) {
      console.error("Failed to send confession:", err);
      const msg = err?.message || "Failed to send message";
      setError(msg.includes("403") || msg.includes("alias") ? 
        "Alias not set up. Please refresh the page." : msg);
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const avatarColor = myAlias.avatarColor || "#4f46e5";

  return (
    <div
      className={
        "w-full rounded-t-3xl border-t p-4 backdrop-blur-xl " +
        (isDark
          ? "border-white/10 bg-[#0b0b14]/90 shadow-[0_-10px_40px_rgba(0,0,0,0.5)]"
          : "border-slate-200 bg-white/95 shadow-[0_-10px_40px_rgba(15,23,42,0.08)]")
      }
    >
      <div className="mx-auto max-w-3xl">
        {/* Reply Indicator */}
        {replyTo && (
          <div
            className={
              "mb-2 flex items-center justify-between rounded-lg px-3 py-1.5 text-xs border " +
              (isDark
                ? "bg-white/5 text-white/70 border-white/5"
                : "bg-slate-100 text-slate-700 border-slate-200")
            }
          >
            <div className="flex items-center gap-2">
              <svg className="h-3.5 w-3.5 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
              </svg>
              <span>
                Replying to{" "}
                <span className={"font-bold " + (isDark ? "text-white" : "text-slate-900")}>{replyTo.aliasName}</span>
              </span>
            </div>
            <button
              onClick={onCancelReply}
              className={isDark ? "rounded-full p-1 hover:bg-white/10 transition-colors" : "rounded-full p-1 hover:bg-slate-200 transition-colors text-slate-600"}
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}

        {/* Error Banner */}
        {error && (
          <div className="mb-2 flex items-center gap-2 rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2 text-xs text-red-400">
            <svg className="h-3.5 w-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            {error}
          </div>
        )}

        {/* Input Area */}
        <div
          className={
            "relative flex items-end gap-3 rounded-2xl border p-2 shadow-inner transition-colors " +
            (isDark
              ? "border-white/15 bg-black/40 focus-within:border-blue-500/50 focus-within:bg-black/60"
              : "border-slate-200 bg-slate-50 focus-within:border-blue-500 focus-within:bg-white")
          }
        >
          <div 
            className="mb-1 ml-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold shadow-md"
            style={{ backgroundColor: avatarColor, color: "#fff" }}
          >
            {(myAlias.alias || "?").substring(0, 2).toUpperCase()}
          </div>
          
          <textarea
            ref={textareaRef}
            rows={1}
            maxLength={1000}
            className={
              "max-h-[150px] w-full resize-none bg-transparent py-2 text-sm outline-none scrollbar-thin " +
              (isDark ? "text-white placeholder-white/30" : "text-slate-900 placeholder-slate-400")
            }
            placeholder={`Type ${replyTo ? "your reply" : "your anonymous confession"}...`}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          
          <button
            onClick={handleSubmit}
            disabled={!text.trim() || sending}
            className="mb-1 mr-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-600 font-bold text-white transition-all hover:bg-blue-500 active:scale-90 disabled:opacity-50 disabled:hover:scale-100 disabled:hover:bg-blue-600"
          >
            {sending ? (
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
            ) : (
              <svg className="h-4 w-4 ml-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
            )}
          </button>
        </div>

        {/* Footer Meta */}
        <div className={"mt-2 flex items-center justify-between px-2 text-[10px] " + (isDark ? "text-white/30" : "text-slate-500")}>
          <div className="flex items-center gap-1.5 uppercase tracking-wider">
            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
            Posting anonymously as <span style={{ color: avatarColor }} className="font-bold opacity-80">{myAlias.alias}</span>
          </div>
          <div className={text.length > 800 ? (text.length >= 1000 ? "text-red-400" : "text-amber-400") : ""}>
            {text.length} / 1000
          </div>
        </div>
      </div>
    </div>
  );
}
