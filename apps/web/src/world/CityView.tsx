// CityView: the living isometric block city, the product's hero. Pure view of API data + the static
// Jaldhara layout (@leakspot/core/world). No API calls, no domain logic, no scripted leak data. SVG +
// CSS animation only; respects prefers-reduced-motion and scales from 360 px up.

import { useMemo, type JSX } from "react";
import { FACILITIES, RESERVOIR, SECTORS, TRUNK_MAIN, type SectorId } from "@leakspot/core/world";
import type { IncidentView, SectorStatus } from "../state/view-types";
import { buildCity, ZONE_TINT } from "./city-geometry";
import { faceTop, project, VIEW_H, VIEW_W } from "./iso";
import { STATUS_COLOR, STATUS_WORD } from "./status";
import styles from "./CityView.module.css";

export type CrewMarker = { x: number; z: number; repairing: boolean } | null;

export type CityViewProps = {
  sectorStatus: Record<SectorId, SectorStatus>;
  incidents?: IncidentView[];
  crew?: CrewMarker;
  xray?: boolean;
  showLabels?: boolean;
  spectator?: boolean;
  onSelectSector?: (id: SectorId) => void;
};

const city = buildCity(42);
const BUILDING_SIDE_DARKEN = 0.72;

function shade(hex: string, factor: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.round(((n >> 16) & 255) * factor);
  const g = Math.round(((n >> 8) & 255) * factor);
  const b = Math.round((n & 255) * factor);
  return `rgb(${r},${g},${b})`;
}

/** One stacked-block building: top roof + two visible side faces (left darker than right). */
function Building({
  x,
  z,
  w,
  d,
  height,
  wall,
  roof,
}: {
  x: number;
  z: number;
  w: number;
  d: number;
  height: number;
  wall: string;
  roof: string;
}): JSX.Element {
  const topFace = faceTop(x, x + w, z, z + d, height);
  // Right wall (east, +x edge) and front wall (south, +z edge).
  const r1 = project(x + w, z, height);
  const r2 = project(x + w, z + d, height);
  const r3 = project(x + w, z + d, 0);
  const r4 = project(x + w, z, 0);
  const f1 = project(x, z + d, height);
  const f2 = project(x + w, z + d, height);
  const f3 = project(x + w, z + d, 0);
  const f4 = project(x, z + d, 0);
  return (
    <g>
      <polygon
        points={`${f1.sx},${f1.sy} ${f2.sx},${f2.sy} ${f3.sx},${f3.sy} ${f4.sx},${f4.sy}`}
        fill={shade(wall, BUILDING_SIDE_DARKEN)}
      />
      <polygon
        points={`${r1.sx},${r1.sy} ${r2.sx},${r2.sy} ${r3.sx},${r3.sy} ${r4.sx},${r4.sy}`}
        fill={wall}
      />
      <polygon points={topFace} fill={roof} />
    </g>
  );
}

export function CityView(props: CityViewProps): JSX.Element {
  const {
    sectorStatus,
    incidents = [],
    crew = null,
    xray = false,
    showLabels = true,
    spectator = false,
  } = props;

  // Draw order: ground tiles → pipes (xray) → buildings (hidden in xray) → facilities → overlays →
  // leaks/pins/crew. Buildings are sorted back-to-front by (x+z) so nearer blocks overdraw farther ones.
  const buildings = useMemo(
    () =>
      city
        .flatMap(({ buildings: bs }) => bs)
        .slice()
        .sort((a, b) => a.x + a.z - (b.x + b.z)),
    [],
  );

  const reservoir = project(RESERVOIR.x, RESERVOIR.z, 0);
  const trunkA = project(TRUNK_MAIN.from.x, TRUNK_MAIN.from.z, 0);
  const trunkB = project(TRUNK_MAIN.to.x, TRUNK_MAIN.to.z, 0);

  return (
    <div className={styles.wrap}>
      <svg
        className={styles.svg}
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        role="img"
        aria-label="Isometric map of the simulated city of Jaldhara, coloured by sector status"
      >
        {/* Ground tiles coloured by status */}
        {SECTORS.map((s) => {
          const status = sectorStatus[s.id] ?? "normal";
          const pulsing = status === "suspected" || status === "confirmed";
          return (
            <g key={s.id}>
              <polygon
                points={faceTop(s.box.xMin, s.box.xMax, s.box.zMin, s.box.zMax, 0)}
                fill="#101d2e"
                stroke="var(--rule)"
                strokeWidth={1}
                style={props.onSelectSector ? { cursor: "pointer" } : undefined}
                onClick={props.onSelectSector ? () => props.onSelectSector?.(s.id) : undefined}
              />
              <polygon
                className={pulsing ? styles.pulse : undefined}
                points={faceTop(s.box.xMin, s.box.xMax, s.box.zMin, s.box.zMax, 0)}
                fill={STATUS_COLOR[status]}
                opacity={status === "normal" ? 0.12 : 0.4}
                pointerEvents="none"
              />
              {status === "verified" && (
                <polygon
                  className={styles.verified}
                  points={faceTop(s.box.xMin, s.box.xMax, s.box.zMin, s.box.zMax, 0)}
                  fill="none"
                  stroke="var(--neem)"
                  strokeWidth={2}
                  pointerEvents="none"
                />
              )}
            </g>
          );
        })}

        {/* Trunk main (always visible, under the avenue) */}
        <line
          x1={trunkA.sx}
          y1={trunkA.sy}
          x2={trunkB.sx}
          y2={trunkB.sy}
          stroke="var(--rule)"
          strokeWidth={3}
        />

        {/* X-ray: pipes with animated flow + amber drips on suspected sectors */}
        {xray &&
          SECTORS.map((s) => {
            const status = sectorStatus[s.id] ?? "normal";
            const inlet = project(s.inlet.x, s.inlet.z, 0);
            const avenue = project(50, s.inlet.z, 0);
            const suspect =
              status === "suspected" || status === "confirmed" || status === "verifying";
            return (
              <g key={`pipe-${s.id}`}>
                <line
                  x1={avenue.sx}
                  y1={avenue.sy}
                  x2={inlet.sx}
                  y2={inlet.sy}
                  stroke="var(--jal)"
                  strokeWidth={2}
                  opacity={0.5}
                />
                <line
                  className={styles.flow}
                  x1={avenue.sx}
                  y1={avenue.sy}
                  x2={inlet.sx}
                  y2={inlet.sy}
                  stroke="var(--jal)"
                  strokeWidth={2}
                />
                {suspect && (
                  <circle
                    className={styles.drip}
                    cx={(avenue.sx + inlet.sx) / 2}
                    cy={(avenue.sy + inlet.sy) / 2}
                    r={4}
                    fill="var(--haldi)"
                  />
                )}
              </g>
            );
          })}

        {/* Buildings (hidden in X-ray so pipes read clearly) */}
        {!xray &&
          buildings.map((b, i) => {
            const tint = ZONE_TINT[b.zone];
            return <Building key={i} {...b} wall={tint.wall} roof={tint.roof} />;
          })}

        {/* Facilities */}
        <Reservoir sx={reservoir.sx} sy={reservoir.sy} />
        {FACILITIES.map((f, i) => {
          if (f.kind === "depot") return <Facility key={i} at={f.at} glyph="truck" />;
          if (f.kind === "hospital") return <Facility key={i} at={f.at} glyph="plus" />;
          return <Facility key={i} at={f.at} glyph="flag" />;
        })}

        {/* Visible-leak puddles + report pins from report-led / confirmed incidents (post-detection only) */}
        {incidents.map((inc) => {
          const p = project(inc.pin.x, inc.pin.z, 0);
          const showPuddle = inc.verdict === "CONFIRMED" || inc.kind === "visible";
          return (
            <g key={`inc-${inc.id}`} className={styles.pin}>
              {showPuddle && inc.status !== "verified" && inc.status !== "closed_logged" && (
                <ellipse
                  className={styles.puddle}
                  cx={p.sx}
                  cy={p.sy}
                  rx={14}
                  ry={7}
                  fill="var(--jal)"
                  opacity={0.5}
                />
              )}
              <circle
                cx={p.sx}
                cy={p.sy - 10}
                r={5}
                fill={inc.verdict === "CONFIRMED" ? "var(--sindoor)" : "var(--haldi)"}
                stroke="var(--night)"
                strokeWidth={1}
              />
              <rect x={p.sx - 1} y={p.sy - 10} width={2} height={10} fill="var(--night)" />
            </g>
          );
        })}

        {/* Crew truck */}
        {crew && <CrewTruck x={crew.x} z={crew.z} repairing={crew.repairing} />}

        {/* Sector id labels */}
        {showLabels &&
          !spectator &&
          SECTORS.map((s) => {
            const c = project(s.centroid.x, s.centroid.z, 0);
            const status = sectorStatus[s.id] ?? "normal";
            return (
              <text
                key={`lbl-${s.id}`}
                className={styles.label}
                x={c.sx}
                y={c.sy}
                textAnchor="middle"
                pointerEvents="none"
              >
                {s.id} {STATUS_WORD[status]}
              </text>
            );
          })}
      </svg>
    </div>
  );
}

function Reservoir({ sx, sy }: { sx: number; sy: number }): JSX.Element {
  return (
    <g>
      <rect
        x={sx - 10}
        y={sy - 16}
        width={20}
        height={16}
        fill="var(--cloud-2)"
        stroke="var(--rule)"
      />
      <rect x={sx - 10} y={sy - 8} width={20} height={8} fill="var(--jal)" opacity={0.6} />
    </g>
  );
}

function Facility({
  at,
  glyph,
}: {
  at: { x: number; z: number };
  glyph: "plus" | "flag" | "truck";
}): JSX.Element {
  const p = project(at.x, at.z, 3);
  const ground = project(at.x, at.z, 0);
  return (
    <g>
      <line
        x1={ground.sx}
        y1={ground.sy}
        x2={p.sx}
        y2={p.sy}
        stroke="var(--rule)"
        strokeWidth={1}
      />
      {glyph === "plus" && (
        <g>
          <rect x={p.sx - 7} y={p.sy - 7} width={14} height={14} fill="var(--wall, #fff)" />
          <rect x={p.sx - 5} y={p.sy - 1.5} width={10} height={3} fill="var(--sindoor)" />
          <rect x={p.sx - 1.5} y={p.sy - 5} width={3} height={10} fill="var(--sindoor)" />
        </g>
      )}
      {glyph === "flag" && (
        <g>
          <rect x={p.sx} y={p.sy - 8} width={10} height={6} fill="var(--neem)" />
          <rect x={p.sx - 1} y={p.sy - 8} width={2} height={14} fill="var(--rule)" />
        </g>
      )}
      {glyph === "truck" && (
        <rect x={p.sx - 7} y={p.sy - 5} width={14} height={8} fill="var(--neel)" />
      )}
    </g>
  );
}

function CrewTruck({ x, z, repairing }: { x: number; z: number; repairing: boolean }): JSX.Element {
  const p = project(x, z, 0);
  return (
    <g className={styles.crew} transform={`translate(${p.sx}, ${p.sy})`}>
      <rect
        x={-8}
        y={-10}
        width={16}
        height={10}
        fill="var(--neel)"
        stroke="var(--night)"
        strokeWidth={1}
      />
      <rect x={-8} y={-14} width={9} height={5} fill="var(--neel)" />
      {repairing && <circle className={styles.drip} cx={0} cy={-18} r={4} fill="var(--haldi)" />}
    </g>
  );
}
