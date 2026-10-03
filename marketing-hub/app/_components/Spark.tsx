"use client";

/** Tiny inline bar sparkline (oldest first). The last `hot` bars are tinted: red when the series fell, ink when it rose. */
export default function Spark({ values, down, hot = 3, width = 72, height = 18 }: { values: number[] | null | undefined; down?: boolean; hot?: number; width?: number; height?: number }) {
  if (!values || values.length < 4) return null;
  const max = Math.max(...values, 0.0001), n = values.length, gap = 1, bw = Math.max(2, (width - gap * (n - 1)) / n);
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true" style={{ verticalAlign: "middle", flex: "none" }}>
      {values.map((v, i) => {
        const h = Math.max(1, (v / max) * height);
        const recent = i >= n - hot;
        return <rect key={i} x={i * (bw + gap)} y={height - h} width={bw} height={h} fill={recent ? (down ? "var(--alert)" : "var(--ink)") : "var(--ink-faint)"} />;
      })}
    </svg>
  );
}
