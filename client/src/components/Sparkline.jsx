import { useId } from "react";

// Always draws something: a brand-new drink has no history yet, so it gets a
// flat line at its current price instead of an empty box.
export default function Sparkline({ history, fallbackPrice, width = 220, height = 56, color }) {
  const gradId = useId().replace(/:/g, "");

  let prices = (history || []).map((h) => h.price);
  if (prices.length < 2) {
    const p = prices[0] ?? fallbackPrice ?? 0;
    prices = [p, p];
  }

  const min = Math.min(...prices);
  const max = Math.max(...prices);
  // Don't blow a 2-cent wiggle up to full height: show at least a 12% span.
  const range = Math.max(max - min, max * 0.12, 0.01);
  const mid = (max + min) / 2;
  const lo = mid - range / 2;
  const pad = 4;

  const pts = prices.map((p, i) => {
    const x = (i / (prices.length - 1)) * width;
    const y = pad + (height - pad * 2) - ((p - lo) / range) * (height - pad * 2);
    return [x, y];
  });
  const line = pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = `0,${height} ${line} ${width},${height}`;

  return (
    <svg className="sparkline" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.35" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={area} fill={`url(#${gradId})`} />
      <polyline
        points={line}
        fill="none"
        stroke={color}
        strokeWidth="3"
        vectorEffect="non-scaling-stroke"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}
