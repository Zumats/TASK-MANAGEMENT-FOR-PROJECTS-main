import { ConfessionAlias } from "@/lib/schemas/confession";

export function AliasWelcomeModal({
  alias,
  onComplete
}: {
  alias: ConfessionAlias;
  onComplete: () => void;
}) {
  const avatarColor = alias.avatarColor || "#4f46e5";

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-300">
      <div className="relative w-full max-w-md rounded-2xl border border-white/10 bg-[#0f0f1a] p-8 text-center shadow-[0_0_80px_rgba(0,0,0,0.8)] animate-in zoom-in-95 duration-500 delay-150 fill-mode-both">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-white/5 text-2xl">
          🤫
        </div>
        <h2 className="mb-2 text-2xl font-bold tracking-tight text-white">Welcome to Confessions</h2>
        <p className="mb-8 text-sm text-white/60">
          This is a safe, completely anonymous space. Your identity is permanently hidden behind your unique alias.
        </p>
        
        <div className="mb-8 flex flex-col items-center justify-center rounded-2xl bg-white/5 py-8 border border-white/5">
          <div 
            className="mb-4 flex h-24 w-24 items-center justify-center rounded-full text-4xl font-bold shadow-2xl relative"
            style={{ backgroundColor: avatarColor, color: "#fff" }}
          >
            <div className="absolute inset-0 rounded-full bg-white/20 animate-ping opacity-20" />
            {(alias.alias || "?").substring(0, 2).toUpperCase()}
          </div>
          <div className="text-xs text-white/40 uppercase tracking-[0.2em] font-bold mb-2">
            You are joining as
          </div>
          <div 
            className="text-2xl font-black tracking-tight drop-shadow-md"
            style={{ color: avatarColor }}
          >
            {alias.alias}
          </div>
        </div>

        <button
          onClick={onComplete}
          className="w-full rounded-xl bg-white px-4 py-3.5 text-sm font-bold text-black transition-all hover:bg-gray-200 hover:scale-[1.02] active:scale-95 shadow-xl"
        >
          Enter the Chat
        </button>
      </div>
    </div>
  );
}
