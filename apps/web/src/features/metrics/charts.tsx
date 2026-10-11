// Hand-built SVG charts for the metrics (no chart library). Each chart measures its container and draws
// at real pixel size, so axis text stays readable (≥ 13 px) on phones. Monsoon Night tokens, mono
// tabular numbers, labelled axes, and a one-line text summary under every chart for screen readers.

import { useLayoutEffect, useRef, useState, type JSX, type ReactNode } from "react";
import styles from "./metrics.module.css";

const FONT = 13;
const C = {
  ink: "var(--ink)",
  dim: "var(--ink-dim)",
  rule: "var(--rule)",
  jal: "var(--jal)",
  neem: "var(--neem)",
  haldi: "var(--haldi)",
  neel: "var(--neel)",
  sindoor: "var(--sindoor)",
};

function useWidth<T extends HTMLElement>(): [React.RefObject<T | null>, number] {
  const ref = useRef<T>(null);
  const [w, setW] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof ResizeObserver === "undefined") {
      const raf = requestAnimationFrame(() => setW(el.clientWidth || 600));
      return () => cancelAnimationFrame(raf);
    }
    const ro = new ResizeObserver(([e]) => setW(Math.floor(e?.contentRect.width ?? 0)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

/** A titled chart card: the drawing, its one-line summary, or "No runs yet". */
export function ChartCard({
  title,
  summary,
  empty,
  emptyText = "No runs yet",
  children,
}: {
  title: string;
  summary: string;
  empty: boolean;
  /** what is missing when empty (defaults to "No runs yet") */
  emptyText?: string;
  children: (width: number) => ReactNode;
}): JSX.Element {
  const [ref, w] = useWidth<HTMLDivElement>();
  return (
    <figure className={styles.card}>
      <figcaption className={styles.cardTitle}>{title}</figcaption>
      <div ref={ref} className={styles.plot}>
        {empty ? <p className={styles.empty}>{emptyText}</p> : w > 0 && children(w)}
      </div>
      {!empty && <p className={styles.summary}>{summary}</p>}
    </figure>
  );
}

function niceMax(v: number): number {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  const m = v / p;
  return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * p;
}

function shortDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" });
}

type Pad = { l: number; r: number; t: number; b: number };

function Axes({
  w,
  h,
  pad,
  max,
  format,
  xLabels,
  yTitle,
  xTitle,
  integer = false,
}: {
  w: number;
  h: number;
  pad: Pad;
  max: number;
  format: (n: number) => string;
  xLabels: { x: number; text: string }[];
  yTitle: string;
  xTitle: string;
  integer?: boolean;
}): JSX.Element {
  // Count axes show whole-number ticks only (a 2.5 gridline would be mislabelled after rounding).
  const ticks = [0, max / 2, max].filter((t) => !integer || Number.isInteger(t));
  return (
    <g fontFamily="var(--font-num)" fontSize={FONT} fill={C.dim}>
      {ticks.map((t) => {
        const y = pad.t + (h - pad.t - pad.b) * (1 - t / max);
        return (
          <g key={t}>
            <line x1={pad.l} x2={w - pad.r} y1={y} y2={y} stroke={C.rule} strokeDasharray="2 4" />
            <text x={pad.l - 6} y={y + 4} textAnchor="end">
              {format(t)}
            </text>
          </g>
        );
      })}
      <line x1={pad.l} x2={w - pad.r} y1={h - pad.b} y2={h - pad.b} stroke={C.rule} />
      {xLabels.map((l) => (
        <text key={`${l.x}${l.text}`} x={l.x} y={h - pad.b + 17} textAnchor="middle">
          {l.text}
        </text>
      ))}
      <text x={pad.l} y={12} fill={C.dim}>
        {yTitle}
      </text>
      <text x={w - pad.r} y={h - 4} textAnchor="end" fill={C.dim}>
        {xTitle}
      </text>
    </g>
  );
}

function dayLabels(dates: readonly string[], x: (i: number) => number, w: number) {
  const every = w < 480 ? 10 : 7;
  return dates
    .map((d, i) => ({ i, d }))
    .filter(({ i }) => (dates.length - 1 - i) % every === 0)
    .map(({ i, d }) => ({ x: x(i), text: shortDate(d) }));
}

/** Line + area over the last 30 days. */
export function AreaChart({
  width,
  dates,
  values,
  format,
  yTitle,
  color = C.jal,
}: {
  width: number;
  dates: readonly string[];
  values: readonly number[];
  format: (n: number) => string;
  yTitle: string;
  color?: string;
}): JSX.Element {
  const h = 210;
  const pad = { l: 84, r: 30, t: 24, b: 40 };
  const max = niceMax(Math.max(...values, 0));
  const x = (i: number) => pad.l + ((width - pad.l - pad.r) * i) / Math.max(1, values.length - 1);
  const y = (v: number) => pad.t + (h - pad.t - pad.b) * (1 - v / max);
  const line = values.map((v, i) => `${x(i)},${y(v)}`).join(" ");
  const area = `${x(0)},${y(0)} ${line} ${x(values.length - 1)},${y(0)}`;
  return (
    <svg width={width} height={h} role="img" aria-label={yTitle}>
      <Axes
        w={width}
        h={h}
        pad={pad}
        max={max}
        format={format}
        xLabels={dayLabels(dates, x, width)}
        yTitle={yTitle}
        xTitle="day (IST)"
      />
      <polygon points={area} fill={color} opacity={0.18} />
      <polyline points={line} fill="none" stroke={color} strokeWidth={2} />
      {values.map((v, i) =>
        v > 0 ? <rect key={i} x={x(i) - 3} y={y(v) - 3} width={6} height={6} fill={color} /> : null,
      )}
    </svg>
  );
}

/** Two bars per day (e.g. found vs resolved). */
export function GroupedBars({
  width,
  dates,
  series,
  yTitle,
}: {
  width: number;
  dates: readonly string[];
  series: { name: string; color: string; values: readonly number[] }[];
  yTitle: string;
}): JSX.Element {
  const h = 210;
  const pad = { l: 44, r: 30, t: 24, b: 40 };
  const max = niceMax(Math.max(0, ...series.flatMap((s) => s.values)));
  const n = dates.length;
  const slot = (width - pad.l - pad.r) / n;
  const bw = Math.max(1.5, (slot * 0.8) / series.length);
  const x = (i: number) => pad.l + slot * i + slot / 2;
  const y = (v: number) => pad.t + (h - pad.t - pad.b) * (1 - v / max);
  return (
    <svg width={width} height={h} role="img" aria-label={yTitle}>
      <Axes
        w={width}
        h={h}
        pad={pad}
        max={max}
        format={(v) => String(Math.round(v))}
        integer
        xLabels={dayLabels(dates, x, width)}
        yTitle={yTitle}
        xTitle="day (IST)"
      />
      {series.map((s, si) =>
        s.values.map((v, i) =>
          v > 0 ? (
            <rect
              key={`${si}-${i}`}
              x={x(i) - (bw * series.length) / 2 + si * bw}
              y={y(v)}
              width={bw}
              height={y(0) - y(v)}
              fill={s.color}
            />
          ) : null,
        ),
      )}
      <g fontFamily="var(--font-num)" fontSize={FONT}>
        {series.map((s, si) => (
          <g key={s.name} transform={`translate(${width - 12 - 96 * (series.length - si)}, 6)`}>
            <rect width={10} height={10} fill={s.color} />
            <text x={15} y={10} fill={C.ink}>
              {s.name}
            </text>
          </g>
        ))}
      </g>
    </svg>
  );
}

const RADAR_AXES = [
  { key: "W", label: "Water lost" },
  { key: "E", label: "Evidence" },
  { key: "C", label: "Critical site" },
  { key: "K", label: "Signals agree" },
] as const;

/** The average score profile (0–1 per component) of resolved leaks. */
export function Radar({
  width,
  profile,
}: {
  width: number;
  profile: { W: number; E: number; C: number; K: number };
}): JSX.Element {
  const h = 230;
  const cx = width / 2;
  const cy = h / 2 + 4;
  // leave room for the side labels ("Signals agree 0.67" is ~18 characters of 13 px mono)
  const r = Math.max(40, Math.min(width / 2 - 100, h / 2 - 30));
  const pt = (i: number, v: number) => {
    const a = -Math.PI / 2 + (i * Math.PI * 2) / RADAR_AXES.length;
    return { x: cx + Math.cos(a) * r * v, y: cy + Math.sin(a) * r * v };
  };
  const poly = RADAR_AXES.map((a, i) => pt(i, profile[a.key]))
    .map((p) => `${p.x},${p.y}`)
    .join(" ");
  return (
    <svg width={width} height={h} role="img" aria-label="Score profile of resolved leaks">
      {[0.25, 0.5, 0.75, 1].map((ring) => (
        <polygon
          key={ring}
          points={RADAR_AXES.map((axis) => pt(RADAR_AXES.indexOf(axis), ring))
            .map((p) => `${p.x},${p.y}`)
            .join(" ")}
          fill="none"
          stroke={C.rule}
        />
      ))}
      {RADAR_AXES.map((a, i) => {
        const end = pt(i, 1);
        const lab = pt(i, 1.18);
        return (
          <g key={a.key} fontFamily="var(--font-num)" fontSize={FONT}>
            <line x1={cx} y1={cy} x2={end.x} y2={end.y} stroke={C.rule} />
            <text x={lab.x} y={lab.y + 4} textAnchor="middle" fill={C.ink}>
              {a.label} {profile[a.key].toFixed(2)}
            </text>
          </g>
        );
      })}
      <polygon points={poly} fill={C.neem} opacity={0.25} stroke={C.neem} strokeWidth={2} />
    </svg>
  );
}

/** Tiny 30-day trend for a KPI tile (decorative; the tile states the number). */
export function Sparkline({
  values,
  color = C.jal,
}: {
  values: readonly number[];
  color?: string;
}): JSX.Element {
  const w = 120;
  const h = 28;
  const max = Math.max(1, ...values);
  const pts = values
    .map((v, i) => `${(w * i) / Math.max(1, values.length - 1)},${h - 2 - ((h - 4) * v) / max}`)
    .join(" ");
  return (
    <svg
      className={styles.spark}
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <polyline
        points={pts}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

/** Horizontal bars with a label and a count (funnel steps, AI labels). */
export function HBars({
  width,
  items,
  showShare = false,
}: {
  width: number;
  items: { label: string; value: number; color: string }[];
  /** show each value as a share of the first (for a funnel) */
  showShare?: boolean;
}): JSX.Element {
  const row = 34;
  const labelW = Math.min(150, width * 0.38);
  const numW = showShare ? 110 : 56;
  const h = items.length * row + 6;
  const max = Math.max(1, ...items.map((i) => i.value));
  const first = items[0]?.value || 1;
  return (
    <svg width={width} height={h} role="img" aria-label={items.map((i) => i.label).join(", ")}>
      {items.map((it, i) => {
        const y = 4 + i * row;
        const bar = ((width - labelW - numW - 8) * it.value) / max;
        return (
          <g key={it.label} fontFamily="var(--font-num)" fontSize={FONT}>
            <text x={0} y={y + 18} fill={C.ink}>
              {it.label}
            </text>
            <rect x={labelW} y={y + 4} width={Math.max(2, bar)} height={20} fill={it.color} />
            <text x={labelW + Math.max(2, bar) + 6} y={y + 18} fill={C.ink}>
              {it.value.toLocaleString("en-IN")}
              {showShare && i > 0 ? ` (${Math.round((100 * it.value) / first)}%)` : ""}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/** Vertical histogram over fixed bins. */
export function Histogram({
  width,
  bins,
  color,
  xTitle,
  binLabel,
}: {
  width: number;
  bins: readonly { from: number; to: number; count: number }[];
  color: string;
  xTitle: string;
  binLabel: (b: { from: number; to: number }) => string;
}): JSX.Element {
  const h = 200;
  const pad = { l: 40, r: 12, t: 24, b: 40 };
  const max = niceMax(Math.max(0, ...bins.map((b) => b.count)));
  const slot = (width - pad.l - pad.r) / Math.max(1, bins.length);
  const y = (v: number) => pad.t + (h - pad.t - pad.b) * (1 - v / max);
  const every = Math.max(1, Math.ceil((bins.length * 56) / (width - pad.l - pad.r)));
  return (
    <svg width={width} height={h} role="img" aria-label={xTitle}>
      <Axes
        w={width}
        h={h}
        pad={pad}
        max={max}
        format={(v) => String(Math.round(v))}
        xLabels={bins
          .map((b, i) => ({ b, i }))
          .filter(({ i }) => i % every === 0)
          .map(({ b, i }) => ({ x: pad.l + slot * i + slot / 2, text: binLabel(b) }))}
        yTitle="incidents"
        xTitle={xTitle}
        integer
      />
      {bins.map((b, i) =>
        b.count > 0 ? (
          <rect
            key={b.from}
            x={pad.l + slot * i + 1}
            y={y(b.count)}
            width={Math.max(1, slot - 2)}
            height={y(0) - y(b.count)}
            fill={color}
          />
        ) : null,
      )}
    </svg>
  );
}

export const CHART_COLORS = C;
