// src/components/ui/Sparkline.tsx
// Minimal SVG sparkline. No chart library dependency.

interface SparklinePoint {
  value: number;
  date: string;
}

interface SparklineProps {
  data: SparklinePoint[];
  width?: number;
  height?: number;
  optimalLow?: number | null;
  optimalHigh?: number | null;
  color?: string;
  showOptimalBand?: boolean;
}

export const Sparkline = ({
  data, width = 120, height = 32, optimalLow, optimalHigh,
  color = '#1B4332', showOptimalBand = true,
}: SparklineProps) => {
  if (!data || data.length === 0) {
    return <div style={{ width, height }} className="bg-clinical-cream rounded" />;
  }

  // Determine value range — use data + optimal band for context
  const values = data.map(d => d.value);
  const candidates: number[] = [...values];
  if (optimalLow != null) candidates.push(optimalLow);
  if (optimalHigh != null) candidates.push(optimalHigh);

  const min = Math.min(...candidates);
  const max = Math.max(...candidates);
  const range = max - min || 1; // avoid divide by zero

  const padding = 4;
  const innerW = width - padding * 2;
  const innerH = height - padding * 2;

  // Map value → y coordinate (flip: high value = low y)
  const yFor = (v: number) => padding + innerH - ((v - min) / range) * innerH;

  // Build path
  const points = data.map((d, i) => {
    const x = data.length === 1 ? width / 2 : padding + (i / (data.length - 1)) * innerW;
    const y = yFor(d.value);
    return { x, y, ...d };
  });

  const path = points.length === 1
    ? `M ${points[0].x} ${points[0].y}`
    : 'M ' + points.map(p => `${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(' L ');

  // Optimal band rectangle
  const showBand = showOptimalBand && optimalLow != null && optimalHigh != null;
  const bandTop = showBand ? yFor(optimalHigh!) : 0;
  const bandBottom = showBand ? yFor(optimalLow!) : 0;

  const lastPoint = points[points.length - 1];
  const inOptimal = optimalLow != null && optimalHigh != null
    && lastPoint.value >= optimalLow && lastPoint.value <= optimalHigh;
  const lastDotColor = inOptimal ? '#2A9D8F' : color;

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      {/* Optimal range band */}
      {showBand && (
        <rect
          x={padding} y={bandTop}
          width={innerW} height={Math.abs(bandBottom - bandTop)}
          fill="#2A9D8F" fillOpacity="0.10"
        />
      )}
      {/* Line */}
      <path d={path} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      {/* Last point dot */}
      <circle cx={lastPoint.x} cy={lastPoint.y} r="2.5" fill={lastDotColor} />
    </svg>
  );
};
