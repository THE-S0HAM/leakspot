// CityView: the living isometric block city — the product's hero and the player's board. Pure view of
// API data + the static Jaldhara layout (@leakspot/core/world). No API calls, no domain logic, no
// scripted leak data. SVG + CSS animation only; the static layers (ground, buildings, pipe geometry)
// are memoised so a tick never re-renders the whole city. Respects prefers-reduced-motion, scales 360+.

import { memo, useMemo, type JSX } from "react";
import { FACILITIES, RESERVOIR, SECTORS, type Point, type SectorId } from "@leakspot/core/world";
import type { IncidentView, SectorStatus } from "../state/view-types";
import { STATUS_WORD } from "./status";
import { buildCity, ZONE_TINT } from "./city-geometry";
import { SERVICE_PIPES, TRUNK, ZONE_MAINS, type Segment } from "./pipes";
import { BASE_VIEWBOX, faceTop, project } from "./iso";
import styles from "./CityView.module.css";

export type CrewMarker = { x: number; z: number; repairing: boolean } | null;

export type CityViewProps = {
  sectorStatus: Record<SectorId, SectorStatus>;
  incidents?: IncidentView[];
  crew?: CrewMarker;
  supplyOn?: boolean;
  xray?: boolean;
  viewBox?: string;
  onSelectSector?: (id: SectorId) => void;
  onHoverSector?: (id: SectorId | null) => void;
};

const city = buildCity(42);
const SIDE_DARKEN = 0.72;

const STATUS_TOKEN: Record<SectorStatus, string> = {
  normal: "var(--neem)",
  watch: "var(--haldi)",
  suspected: "var(--haldi)",
  confirmed: "var(--sindoor)",
  data_gap: "var(--ink-dim)",
  verifying: "var(--jal)",
  verified: "var(--neem)",
};

function shade(hex: string, factor: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgb(${Math.round(((n >> 16) & 255) * factor)},${Math.round(((n >> 8) & 255) * factor)},${Math.round((n & 255) * factor)})`;
}

// ---- memoised static layers (geometry only; never change per tick) ----

const GroundLayer = memo(function GroundLayer({
  onSelect,
  onHover,
}: {
  onSelect?: (id: SectorId) => void;
  onHover?: (id: SectorId | null) => void;
}): JSX.Element {
  return (
    <g>
      {SECTORS.map((s) => (
        <polygon
          key={s.id}
          className={onSelect ? styles.hitTile : undefined}
          points={faceTop(s.box.xMin, s.box.xMax, s.box.zMin, s.box.zMax, 0)}
          fill="#101d2e"
          stroke="var(--rule)"
          strokeWidth={1}
          onClick={onSelect ? () => onSelect(s.id) : undefined}
          onMouseEnter={onHover ? () => onHover(s.id) : undefined}
          onMouseLeave={onHover ? () => onHover(null) : undefined}
        />
      ))}
    </g>
  );
});

const BuildingsLayer = memo(function BuildingsLayer({ ghost }: { ghost: boolean }): JSX.Element {
  const buildings = useMemo(
    () =>
      city
        .flatMap(({ buildings: bs }) => bs)
        .slice()
        .sort((a, b) => a.x + a.z - (b.x + b.z)),
    [],
  );
  return (
    <g opacity={ghost ? 0.14 : 1}>
      {buildings.map((b, i) => {
        const tint = ZONE_TINT[b.zone];
        const topFace = faceTop(b.x, b.x + b.w, b.z, b.z + b.d, b.height);
        const r1 = project(b.x + b.w, b.z, b.height);
        const r2 = project(b.x + b.w, b.z + b.d, b.height);
        const r3 = project(b.x + b.w, b.z + b.d, 0);
        const r4 = project(b.x + b.w, b.z, 0);
        const f1 = project(b.x, b.z + b.d, b.height);
        const f2 = project(b.x + b.w, b.z + b.d, b.height);
        const f3 = project(b.x + b.w, b.z + b.d, 0);
        const f4 = project(b.x, b.z + b.d, 0);
        if (ghost) {
          return (
            <polygon
              key={i}
              points={topFace}
              fill="none"
              stroke="var(--jal)"
              strokeWidth={0.6}
              opacity={0.5}
            />
          );
        }
        return (
          <g key={i}>
            <polygon
              points={`${f1.sx},${f1.sy} ${f2.sx},${f2.sy} ${f3.sx},${f3.sy} ${f4.sx},${f4.sy}`}
              fill={shade(tint.wall, SIDE_DARKEN)}
            />
            <polygon
              points={`${r1.sx},${r1.sy} ${r2.sx},${r2.sy} ${r3.sx},${r3.sy} ${r4.sx},${r4.sy}`}
              fill={tint.wall}
            />
            <polygon points={topFace} fill={tint.roof} />
          </g>
        );
      })}
    </g>
  );
});

function pipePath(seg: Segment): string {
  const a = project(seg.a.x, seg.a.z, 0);
  const b = project(seg.b.x, seg.b.z, 0);
  return `M ${a.sx} ${a.sy} L ${b.sx} ${b.sy}`;
}

// ---- facilities (static) ----

const FacilitiesLayer = memo(function FacilitiesLayer(): JSX.Element {
  const reservoir = project(RESERVOIR.x, RESERVOIR.z, 0);
  return (
    <g>
      <g>
        <rect
          x={reservoir.sx - 10}
          y={reservoir.sy - 16}
          width={20}
          height={16}
          fill="var(--cloud-2)"
          stroke="var(--rule)"
        />
        <rect
          x={reservoir.sx - 10}
          y={reservoir.sy - 8}
          width={20}
          height={8}
          fill="var(--jal)"
          opacity={0.6}
        />
      </g>
      {FACILITIES.map((f, i) => (
        <FacilityGlyph key={i} at={f.at} kind={f.kind} />
      ))}
    </g>
  );
});

function FacilityGlyph({
  at,
  kind,
}: {
  at: Point;
  kind: "hospital" | "school" | "depot";
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
      {kind === "hospital" && (
        <g>
          <rect x={p.sx - 7} y={p.sy - 7} width={14} height={14} fill="#fff" />
          <rect x={p.sx - 5} y={p.sy - 1.5} width={10} height={3} fill="var(--sindoor)" />
          <rect x={p.sx - 1.5} y={p.sy - 5} width={3} height={10} fill="var(--sindoor)" />
        </g>
      )}
      {kind === "school" && (
        <g>
          <rect x={p.sx} y={p.sy - 8} width={10} height={6} fill="var(--neem)" />
          <rect x={p.sx - 1} y={p.sy - 8} width={2} height={14} fill="var(--rule)" />
        </g>
      )}
      {kind === "depot" && (
        <rect x={p.sx - 7} y={p.sy - 5} width={14} height={8} fill="var(--neel)" />
      )}
    </g>
  );
}

// ---- the component ----

export function CityView(props: CityViewProps): JSX.Element {
  const {
    sectorStatus,
    incidents = [],
    crew = null,
    supplyOn = false,
    xray = false,
    viewBox = BASE_VIEWBOX,
    onSelectSector,
    onHoverSector,
  } = props;

  const allPipes = useMemo(() => [TRUNK, ...ZONE_MAINS, ...SERVICE_PIPES.map((p) => p.seg)], []);

  return (
    <div className={styles.wrap}>
      <svg
        className={`${styles.svg} ${xray ? styles.blueprint : ""}`}
        viewBox={viewBox}
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label="Isometric map of the simulated city of Jaldhara, coloured by sector status"
        style={{ transition: "all 0.4s ease-out" }}
      >
        <GroundLayer onSelect={onSelectSector} onHover={onHoverSector} />

        {/* Status overlay tint per non-normal sector */}
        {SECTORS.map((s) => {
          const status = sectorStatus[s.id] ?? "normal";
          if (status === "normal") return null;
          return (
            <polygon
              key={`ov-${s.id}`}
              points={faceTop(s.box.xMin, s.box.xMax, s.box.zMin, s.box.zMax, 0)}
              fill={STATUS_TOKEN[status]}
              opacity={0.35}
              pointerEvents="none"
            />
          );
        })}

        {/* Pipes: tube = dark outline + cyan core + highlight; flow dashes only in supply hours. */}
        <g pointerEvents="none">
          {allPipes.map((seg, i) => {
            const d = pipePath(seg);
            const live = supplyOn;
            return (
              <g key={`pipe-${i}`}>
                <path
                  d={d}
                  stroke="#06202e"
                  strokeWidth={xray ? 5 : 4}
                  fill="none"
                  strokeLinecap="round"
                />
                <path
                  d={d}
                  stroke={live ? "var(--jal)" : "var(--rule)"}
                  strokeWidth={xray ? 3 : 2.2}
                  fill="none"
                  strokeLinecap="round"
                  opacity={live ? 0.9 : 0.5}
                />
                {live && (
                  <path
                    className={styles.flow}
                    d={d}
                    stroke="#d6fbff"
                    strokeWidth={1.2}
                    fill="none"
                  />
                )}
              </g>
            );
          })}
        </g>

        <BuildingsLayer ghost={xray} />

        <FacilitiesLayer />

        {/* Suspected: pulsing ring + amber drops from the service pipe (never a precise point). */}
        {SECTORS.map((s) => {
          const status = sectorStatus[s.id] ?? "normal";
          if (status !== "suspected" && status !== "confirmed") return null;
          const c = project(s.centroid.x, s.centroid.z, 0);
          const inlet = project(s.inlet.x, s.inlet.z, 0);
          const ringColor = status === "confirmed" ? "var(--sindoor)" : "var(--haldi)";
          return (
            <g key={`sus-${s.id}`} pointerEvents="none">
              <ellipse
                className={styles.ring}
                cx={c.sx}
                cy={c.sy}
                rx={30}
                ry={16}
                fill="none"
                stroke={ringColor}
                strokeWidth={2}
              />
              <circle
                className={styles.drop}
                cx={inlet.sx}
                cy={inlet.sy}
                r={3}
                fill="var(--haldi)"
              />
            </g>
          );
        })}

        {/* Incidents: quest "!" marker; confirmed visible burst gets a fountain + puddle. */}
        {incidents.map((inc) => {
          const p = project(inc.pin.x, inc.pin.z, 0);
          const active = inc.status !== "verified" && inc.status !== "closed_logged";
          const confirmedBurst = inc.verdict === "CONFIRMED" && active;
          const markerColor = inc.verdict === "CONFIRMED" ? "var(--sindoor)" : "var(--haldi)";
          return (
            <g key={`inc-${inc.id}`} pointerEvents="none">
              {confirmedBurst && (
                <>
                  <ellipse
                    className={styles.puddle}
                    cx={p.sx}
                    cy={p.sy + 2}
                    rx={16}
                    ry={8}
                    fill="var(--jal)"
                    opacity={0.5}
                  />
                  {[0, 1, 2].map((n) => (
                    <rect
                      key={n}
                      className={styles.spray}
                      x={p.sx - 2 + (n - 1) * 4}
                      y={p.sy - 6}
                      width={3}
                      height={3}
                      fill="#d6fbff"
                      style={{ animationDelay: `${n * 0.25}s` }}
                    />
                  ))}
                </>
              )}
              {active && (
                <text
                  className={styles.quest}
                  x={p.sx}
                  y={p.sy - 16}
                  textAnchor="middle"
                  fontSize={16}
                  fill={markerColor}
                >
                  !
                </text>
              )}
              {inc.status === "verified" && (
                <>
                  <circle
                    className={styles.burst}
                    cx={p.sx}
                    cy={p.sy}
                    r={18}
                    fill="none"
                    stroke="var(--neem)"
                    strokeWidth={3}
                  />
                  <text
                    className={styles.floatText}
                    x={p.sx}
                    y={p.sy - 14}
                    textAnchor="middle"
                    fontSize={11}
                  >
                    recovered
                  </text>
                </>
              )}
            </g>
          );
        })}

        {/* Crew truck */}
        {crew && <CrewTruck x={crew.x} z={crew.z} repairing={crew.repairing} />}

        {/* Floating pixel status badges above the buildings (hide Normal). */}
        {SECTORS.map((s) => {
          const status = sectorStatus[s.id] ?? "normal";
          if (status === "normal") return null;
          const top = project(s.centroid.x, s.centroid.z, 7);
          return (
            <text
              key={`badge-${s.id}`}
              className={`${styles.badge} ${styles.badgeFloat}`}
              x={top.sx}
              y={top.sy}
              textAnchor="middle"
              fill={STATUS_TOKEN[status]}
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

function CrewTruck({ x, z, repairing }: { x: number; z: number; repairing: boolean }): JSX.Element {
  const p = project(x, z, 0);
  return (
    <g className={styles.crew} transform={`translate(${p.sx}, ${p.sy})`} pointerEvents="none">
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
      <circle className={styles.beacon} cx={6} cy={-14} r={2.4} fill="var(--haldi)" />
      {repairing && <circle className={styles.wrench} cx={0} cy={-18} r={4} fill="var(--haldi)" />}
    </g>
  );
}
