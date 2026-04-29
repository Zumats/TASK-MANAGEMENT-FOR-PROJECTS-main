export function SkeletonCard() {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-5 animate-pulse">
      {/* Header row */}
      <div className="flex items-center justify-between mb-4">
        <div className="h-4 bg-white/10 rounded-lg w-2/3" />
        <div className="h-6 bg-white/10 rounded-full w-20" />
      </div>
      {/* Description lines */}
      <div className="space-y-2 mb-4">
        <div className="h-3 bg-white/10 rounded w-full" />
        <div className="h-3 bg-white/10 rounded w-4/5" />
      </div>
      {/* Progress bar */}
      <div className="flex items-center gap-3 mb-4">
        <div className="flex-1 h-2 bg-white/10 rounded-full overflow-hidden">
          <div className="h-full w-1/3 bg-white/20 rounded-full shimmer" />
        </div>
        <div className="h-3 w-8 bg-white/10 rounded" />
      </div>
      {/* Meta row */}
      <div className="flex items-center gap-4">
        <div className="h-3 bg-white/10 rounded w-24" />
        <div className="h-3 bg-white/10 rounded w-16" />
      </div>
      <style>{`
        @keyframes shimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(400%); }
        }
        .shimmer {
          position: relative;
          overflow: hidden;
        }
        .shimmer::after {
          content: '';
          position: absolute;
          inset: 0;
          background: linear-gradient(90deg, transparent, rgba(255,255,255,0.12), transparent);
          animation: shimmer 1.5s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
}
