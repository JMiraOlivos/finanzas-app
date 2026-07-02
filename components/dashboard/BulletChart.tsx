"use client";

type Status = "red" | "yellow" | "green" | "blue" | "gray";

export type BulletZone = {
  from: number;
  to: number;    // use Infinity for the last zone
  color: string;
};

// Actual bar color — dark & narrow so it reads over the colored zone backgrounds
const STATUS_FILL: Record<Status, string> = {
  red:    "#303030", // always dark: the zone background already communicates red
  yellow: "#303030",
  green:  "#303030",
  blue:   "#303030",
  gray:   "#B3B3B3", // no target: keep neutral bar
};

type Props = {
  actual: number | null;
  target: number | null;
  ly?: number | null;
  status: Status;
  zones?: BulletZone[];
  width?: number;
};

const H      = 28;
const TRACK_Y = (H - 10) / 2;
const TRACK_H = 10;
const BAR_Y   = (H - 14) / 2;
const BAR_H   = 14;
const TICK_H  = 20;
const TICK_Y  = (H - TICK_H) / 2;

function toX(v: number, domainMin: number, domainRange: number, w: number): number {
  return ((v - domainMin) / domainRange) * w;
}

export function BulletChart({ actual, target, ly, status, zones, width = 240 }: Props) {
  const defined = [actual, target ?? null, ly ?? null].filter((v): v is number => v !== null);

  if (defined.length === 0 || actual === null) {
    return (
      <svg width={width} height={H} aria-hidden="true">
        <rect x={0} y={TRACK_Y} width={width} height={TRACK_H} fill="#E5E7EB" />
      </svg>
    );
  }

  // Domain always includes 0
  const withZero = [...defined, 0];
  const rawMin = Math.min(...withZero);
  const rawMax = Math.max(...withZero);
  const range  = rawMax - rawMin || 1;
  const pad    = range * 0.15;

  const domainMin   = rawMin < 0 ? rawMin - pad : 0;
  const domainMax   = rawMax + pad;
  const domainRange = domainMax - domainMin;

  const px = (v: number) => toX(v, domainMin, domainRange, width);

  const zeroX   = px(0);
  const actualX = px(actual);
  const targetX = target !== null ? px(target) : null;
  const lyX     = ly !== null && ly !== undefined ? px(ly) : null;

  const barX = Math.min(zeroX, actualX);
  const barW = Math.max(Math.abs(actualX - zeroX), 1);

  return (
    <svg width={width} height={H} aria-hidden="true">
      {/* Zone backgrounds — replace gray track when target is available */}
      {zones && zones.length > 0
        ? zones.map((z, i) => {
            const x1 = Math.max(0, px(z.from));
            const x2 = Math.min(width, px(Math.min(z.to, domainMax)));
            if (x2 <= x1) return null;
            return <rect key={i} x={x1} y={0} width={x2 - x1} height={H} fill={z.color} />;
          })
        : <rect x={0} y={TRACK_Y} width={width} height={TRACK_H} fill="#E5E7EB" />
      }

      {/* Actual bar — dark, reads clearly over zone colors */}
      <rect x={barX} y={BAR_Y} width={barW} height={BAR_H} fill={STATUS_FILL[status]} />

      {/* Zero line — only when domain is negative */}
      {domainMin < 0 && (
        <line x1={zeroX} y1={0} x2={zeroX} y2={H} stroke="#FFFFFF" strokeWidth={1} opacity={0.6} />
      )}

      {/* Target marker — thick white tick for visibility over colored zones */}
      {targetX !== null && (
        <line x1={targetX} y1={TICK_Y} x2={targetX} y2={TICK_Y + TICK_H} stroke="#303030" strokeWidth={2.5} />
      )}

      {/* LY marker */}
      {lyX !== null && (
        <line
          x1={lyX} y1={TICK_Y + 2} x2={lyX} y2={TICK_Y + TICK_H - 2}
          stroke="#9CA3AF" strokeWidth={1.5} strokeDasharray="3,2"
        />
      )}
    </svg>
  );
}
