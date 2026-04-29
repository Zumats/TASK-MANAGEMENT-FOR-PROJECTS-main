interface ProgressRingProps {
  percent: number;       // 0-100
  size?: number;         // diameter in px, default 56
  strokeWidth?: number;  // default 5
  color?: string;        // default based on percent
  showLabel?: boolean;
}

export function ProgressRing({
  percent,
  size = 56,
  strokeWidth = 5,
  color,
  showLabel = true,
}: ProgressRingProps) {
  const clampedPct = Math.max(0, Math.min(100, percent));
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference - (clampedPct / 100) * circumference;

  const computedColor =
    color ??
    (clampedPct >= 100 ? "#22c55e" : clampedPct >= 60 ? "#3b82f6" : clampedPct >= 30 ? "#f59e0b" : "#ef4444");

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        {/* Track */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="rgba(255,255,255,0.08)"
          strokeWidth={strokeWidth}
        />
        {/* Progress */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={computedColor}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          style={{ transition: "stroke-dashoffset 0.5s ease, stroke 0.3s ease" }}
        />
      </svg>
      {showLabel && (
        <span
          className="absolute text-[10px] font-bold"
          style={{ color: computedColor }}
        >
          {clampedPct}%
        </span>
      )}
    </div>
  );
}
