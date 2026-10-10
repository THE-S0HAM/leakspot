// Flat top-down mini-map for the citizen "tap the spot" step. Built from @leakspot/core/world only
// (zones, sectors, facilities) — never leaks. A tap maps SVG coordinates back to world (x, z) and the
// containing sector, so the citizen app gets a real position without importing sim/scenario.

import { useRef, type JSX } from "react";
import {
  FACILITIES,
  RESERVOIR,
  SECTORS,
  WORLD_BOUNDS,
  sectorAt,
  type SectorId,
} from "@leakspot/core/world";
import styles from "./MiniMap.module.css";

const ZONE_FILL: Record<string, string> = {
  A: "#d9c7b0",
  B: "#e0b8a6",
  C: "#cdd8dc",
  D: "#b9c4d6",
};

export type MiniMapPin = { x: number; z: number; sectorId?: SectorId };

export function MiniMap({
  pin,
  onTap,
}: {
  pin: MiniMapPin | null;
  onTap: (p: { x: number; z: number; sectorId?: SectorId }) => void;
}): JSX.Element {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const W = WORLD_BOUNDS.xMax;
  const H = WORLD_BOUNDS.zMax;

  function handle(e: React.PointerEvent<SVGSVGElement>): void {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * W;
    const z = ((e.clientY - rect.top) / rect.height) * H;
    const sector = sectorAt(x, z);
    onTap({ x: Math.round(x), z: Math.round(z), sectorId: sector?.id });
  }

  return (
    <svg
      ref={svgRef}
      className={styles.map}
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label="Top-down map of the simulated city; tap where you see the problem"
      onPointerDown={handle}
    >
      <rect x={0} y={0} width={W} height={H} fill="#eef3f6" />

      {/* sector tiles coloured by zone, with ids */}
      {SECTORS.map((s) => (
        <g key={s.id}>
          <rect
            x={s.box.xMin}
            y={s.box.zMin}
            width={s.box.xMax - s.box.xMin}
            height={s.box.zMax - s.box.zMin}
            fill={ZONE_FILL[s.zone] ?? "#ddd"}
            stroke="#8aa0ad"
            strokeWidth={0.4}
          />
          <text x={s.centroid.x} y={s.centroid.z} className={styles.sectorId} textAnchor="middle">
            {s.id}
          </text>
        </g>
      ))}

      {/* avenues */}
      <line x1={50} y1={0} x2={50} y2={H} stroke="#9fb2bd" strokeWidth={2} />
      <line x1={0} y1={56} x2={W} y2={56} stroke="#9fb2bd" strokeWidth={2} />

      {/* facilities + reservoir */}
      <circle cx={RESERVOIR.x} cy={RESERVOIR.z} r={2.4} fill="#0b5fb0" />
      {FACILITIES.map((f, i) => (
        <text key={i} x={f.at.x} y={f.at.z} className={styles.facility} textAnchor="middle">
          {f.kind === "hospital" ? "✚" : f.kind === "school" ? "⚑" : "⌂"}
        </text>
      ))}

      {/* the dropped pin */}
      {pin && (
        <g className={styles.pin}>
          <circle cx={pin.x} cy={pin.z} r={3} fill="#b4152c" stroke="#fff" strokeWidth={0.6} />
          <circle
            cx={pin.x}
            cy={pin.z}
            r={6}
            fill="none"
            stroke="#b4152c"
            strokeWidth={0.6}
            opacity={0.6}
          />
        </g>
      )}
    </svg>
  );
}
