interface Props {
  score: number;
  size?: number;
}

export function ConfidenceRing({ score, size = 44 }: Props) {
  const s = Math.max(0, Math.min(100, score));
  const stroke = 4;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - s / 100);
  const color =
    s >= 80 ? "#FF2442" : s >= 60 ? "#FFB800" : s >= 40 ? "#94A3B8" : "#CBD5E1";

  return (
    <div className="relative inline-flex" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="#F2F2F2"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeDasharray={c}
          strokeDashoffset={offset}
          strokeLinecap="round"
        />
      </svg>
      <div
        className="absolute inset-0 grid place-items-center text-xs font-bold"
        style={{ color }}
      >
        {s}
      </div>
    </div>
  );
}
