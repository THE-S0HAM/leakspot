// City3D: the 3D view of Jaldhara (react-three-fiber). Same props/callbacks as CityView, so the
// Command Centre and Landing don't change. Reads run state + the static @leakspot/core/world layout
// only (no API, no leaks): the scene, the camera and controls, sim-time lighting,
// a floating diorama slab, roads, instanced buildings with Indian-city variety, landmarks, trees, and
// drei <Html> labels for non-normal / hovered / selected sectors. Water, crew and effects live in City3DWater.

import { memo, useEffect, useMemo, useRef, useState, type JSX } from "react";
import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { Environment, Html, Lightformer, OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { RESERVOIR, SECTORS, WORLD_BOUNDS, type SectorId } from "@leakspot/core/world";
import type { CityViewProps } from "./CityView";
import type { IncidentView, SectorStatus } from "../state/view-types";
import { verdictWord } from "../ui/words";
import { STATUS_WORD } from "./status";
import { HEX, STATUS_HEX, ZONE_GROUND } from "./palette";
import { InstancedBoxes } from "./InstancedBoxes";
import { CityLife } from "./City3DLife";
import { dressCity, dressRoads } from "./city3d-dressing";
import { DEPOT, HOSPITAL, PARK, SCHOOL, SCHOOL_GROUND } from "./landmarks";
import {
  buildNetwork,
  CrewTruck,
  FlowCubes,
  LeakEffects,
  Pipes,
  ReportPins,
  SuspectEffects,
  XrayFade,
} from "./City3DWater";
import { skyFor, windowsGlow } from "./sky";
import { buildCity3D, buildRoads, junctions, treeSpots } from "./city3d-geometry";
import styles from "./City3D.module.css";

// World centre (for camera target + slab). x east 0–100, z south 0–104.
const CX = (WORLD_BOUNDS.xMin + WORLD_BOUNDS.xMax) / 2;
const CZ = (WORLD_BOUNDS.zMin + WORLD_BOUNDS.zMax) / 2;

const CITY = buildCity3D(42);
const ALL_BUILDINGS = CITY.flatMap((c) => c.buildings);
const ROADS = buildRoads();
const JUNCTIONS = junctions();
const DRESS = dressCity(
  ALL_BUILDINGS,
  CITY.flatMap((c) => c.gardens),
  treeSpots(),
);
const ROAD_DRESS = dressRoads(ROADS, JUNCTIONS);
const NETWORK = buildNetwork(
  CITY.flatMap((c) => c.buildings.map((b) => ({ ...b, sector: c.sector.id }))),
);

const prefersReducedMotion =
  typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

// ---------- camera + controls ----------

// Perspective camera (fov 35) + OrbitControls: free 360° orbit, polar angle clamped to 20°–65°, pan
// clamped to the city. Q/E and the HUD buttons add a 90° snap animated over 300 ms; Fit city frames
// the whole slab.
const FOV = 35;
const START_POLAR = (50 * Math.PI) / 180;
const MIN_POLAR = (20 * Math.PI) / 180;
const MAX_POLAR = (65 * Math.PI) / 180;

/** Camera distance that frames the whole slab at this aspect ratio. */
export function fitDistance(aspect: number): number {
  const half = (FOV * Math.PI) / 360;
  return (83 / Math.tan(half)) * 0.72 * Math.max(1, 1.45 / Math.max(0.3, aspect));
}

type Orbit = { target: THREE.Vector3; update: () => void };

function frameCity(camera: THREE.Camera, controls: Orbit | null, aspect: number): void {
  const d = fitDistance(aspect);
  const az = controls ? Math.atan2(camera.position.x - CX, camera.position.z - CZ) : Math.PI / 4;
  camera.position.set(
    CX + d * Math.sin(START_POLAR) * Math.sin(az),
    d * Math.cos(START_POLAR),
    CZ + d * Math.sin(START_POLAR) * Math.cos(az),
  );
  controls?.target.set(CX, 0, CZ);
  camera.lookAt(CX, 0, CZ);
  controls?.update();
}

function CameraRig({
  rotationStep,
  fitKey,
  focus,
}: {
  rotationStep: number;
  fitKey: number;
  focus: { x: number; z: number } | null;
}): null {
  // Ease the orbit target to `focus` over 700 ms (camera keeps its offset), instant on reduced motion.
  const ease = useRef<{ from: THREE.Vector3 | null; to: THREE.Vector3; t: number } | null>(null);
  const focusKey = focus ? `${focus.x},${focus.z}` : "";
  useEffect(() => {
    if (!focus) return;
    ease.current = { from: null, to: new THREE.Vector3(focus.x, 0, focus.z), t: 0 };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusKey]);
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as unknown as Orbit | null;
  const size = useThree((s) => s.size);
  useEffect(() => {
    frameCity(camera, controls, size.width / Math.max(1, size.height));
  }, [camera, controls, size.width, size.height, fitKey]);
  const last = useRef(rotationStep);
  const pending = useRef(0);
  useFrame((state, dt) => {
    if (document.hidden) return;
    const c = state.controls as unknown as Orbit | null;
    if (!c) return;
    if (last.current !== rotationStep) {
      pending.current += ((rotationStep - last.current) * Math.PI) / 2;
      last.current = rotationStep;
    }
    const cam = state.camera;
    const e = ease.current;
    if (e) {
      e.from ??= c.target.clone();
      e.t = prefersReducedMotion ? 1 : Math.min(1, e.t + dt / 0.7);
      const k = 1 - Math.pow(1 - e.t, 3);
      const nx = e.from.x + (e.to.x - e.from.x) * k;
      const nz = e.from.z + (e.to.z - e.from.z) * k;
      cam.position.x += nx - c.target.x;
      cam.position.z += nz - c.target.z;
      c.target.set(nx, 0, nz);
      c.update();
      if (e.t >= 1) ease.current = null;
    }
    if (pending.current !== 0) {
      const speed = Math.PI / 2 / 0.3;
      const step = prefersReducedMotion
        ? pending.current
        : Math.sign(pending.current) * Math.min(Math.abs(pending.current), speed * dt);
      pending.current -= step;
      if (Math.abs(pending.current) < 1e-4) pending.current = 0;
      const ox = cam.position.x - c.target.x;
      const oz = cam.position.z - c.target.z;
      const cos = Math.cos(step);
      const sin = Math.sin(step);
      cam.position.x = c.target.x + ox * cos - oz * sin;
      cam.position.z = c.target.z + ox * sin + oz * cos;
      c.update();
    }
    // keep the pan target on the city
    const tx = Math.min(WORLD_BOUNDS.xMax, Math.max(WORLD_BOUNDS.xMin, c.target.x));
    const tz = Math.min(WORLD_BOUNDS.zMax, Math.max(WORLD_BOUNDS.zMin, c.target.z));
    if (tx !== c.target.x || tz !== c.target.z || c.target.y !== 0) {
      cam.position.x += tx - c.target.x;
      cam.position.z += tz - c.target.z;
      cam.position.y -= c.target.y;
      c.target.set(tx, 0, tz);
    }
  });
  return null;
}

// ---------- static layers (memoised) ----------

const Slab = memo(function Slab(): JSX.Element {
  // Floating diorama: grass top + earth sides, a soft dark shadow disc under it.
  const w = WORLD_BOUNDS.xMax - WORLD_BOUNDS.xMin + 16;
  const d = WORLD_BOUNDS.zMax - WORLD_BOUNDS.zMin + 16;
  const depth = 10;
  return (
    <group>
      <mesh position={[CX, -0.2, CZ]} receiveShadow>
        <boxGeometry args={[w, 0.4, d]} />
        <meshStandardMaterial color="#5b9a48" roughness={1} />
      </mesh>
      <mesh position={[CX, -depth / 2 - 0.4, CZ]}>
        <boxGeometry args={[w, depth, d]} />
        <meshStandardMaterial color="#6b4a30" roughness={1} />
      </mesh>
    </group>
  );
});

const Roads = memo(function Roads(): JSX.Element {
  return (
    <group>
      {ROADS.map((r, i) => (
        <mesh key={i} position={[r.cx, 0.05, r.cz]} receiveShadow>
          <boxGeometry args={[r.w, 0.1, r.d]} />
          <meshStandardMaterial color="#3a414b" roughness={0.95} />
        </mesh>
      ))}
      <InstancedBoxes items={ROAD_DRESS.footpaths} receiveShadow>
        <meshStandardMaterial color="#b9bec4" roughness={0.9} />
      </InstancedBoxes>
      <InstancedBoxes items={ROAD_DRESS.dashes}>
        <meshStandardMaterial color="#f2f5f8" />
      </InstancedBoxes>
    </group>
  );
});

// All building parts, each layer one instanced draw call. Window panes glow (seeded ~40%) at night.
const Buildings = memo(function Buildings({ glow }: { glow: boolean }): JSX.Element {
  const windows = useMemo(
    () =>
      DRESS.windows.map((w, i) => ({
        ...w,
        c: glow && DRESS.windowGlow[i] ? "#ffcf6a" : glow ? "#2b3a52" : "#5b7590",
      })),
    [glow],
  );
  return (
    <group>
      <InstancedBoxes items={DRESS.walls} castShadow receiveShadow>
        <meshStandardMaterial roughness={0.85} />
      </InstancedBoxes>
      <InstancedBoxes items={DRESS.roofs} castShadow receiveShadow>
        <meshStandardMaterial roughness={0.9} />
      </InstancedBoxes>
      <InstancedBoxes items={windows}>
        <meshStandardMaterial
          emissive="#ffb24a"
          emissiveIntensity={glow ? 0.35 : 0}
          roughness={0.3}
          metalness={0.1}
        />
      </InstancedBoxes>
      <InstancedBoxes items={DRESS.balconies} castShadow>
        <meshStandardMaterial roughness={0.8} />
      </InstancedBoxes>
      <InstancedBoxes items={DRESS.awnings} castShadow>
        <meshStandardMaterial roughness={0.7} />
      </InstancedBoxes>
      <InstancedBoxes
        items={DRESS.tanks}
        castShadow
        geometry={<cylinderGeometry args={[0.5, 0.5, 1, 10]} />}
      >
        <meshStandardMaterial color="#15191f" roughness={0.6} />
      </InstancedBoxes>
    </group>
  );
});

// Gardens and trees (trunk + two stacked canopies), instanced.
const Greenery = memo(function Greenery(): JSX.Element {
  return (
    <group>
      <InstancedBoxes items={DRESS.lawns} receiveShadow>
        <meshStandardMaterial roughness={1} />
      </InstancedBoxes>
      <InstancedBoxes items={DRESS.trunks} castShadow>
        <meshStandardMaterial color="#6b4a2e" />
      </InstancedBoxes>
      <InstancedBoxes items={DRESS.canopies} castShadow>
        <meshStandardMaterial roughness={0.9} flatShading />
      </InstancedBoxes>
    </group>
  );
});

// ---------- landmarks ----------

function Landmarks(): JSX.Element {
  const hospital = HOSPITAL;
  const school = SCHOOL;
  const depot = DEPOT;
  const ground = { x: SCHOOL_GROUND.x - SCHOOL.x, z: SCHOOL_GROUND.z - SCHOOL.z };
  return (
    <group>
      {/* Hospital: white block, red cross on the roof */}
      <group position={[hospital.x, 0, hospital.z]}>
        <mesh position={[0, 3.5, 0]} castShadow receiveShadow>
          <boxGeometry args={[7, 7, 6]} />
          <meshStandardMaterial color="#f3f6f8" />
        </mesh>
        {/* red cross on the street wall */}
        <mesh position={[0, 5, 3.02]}>
          <boxGeometry args={[1.6, 0.5, 0.05]} />
          <meshStandardMaterial color={HEX.sindoor} />
        </mesh>
        <mesh position={[0, 5, 3.02]}>
          <boxGeometry args={[0.5, 1.6, 0.05]} />
          <meshStandardMaterial color={HEX.sindoor} />
        </mesh>
        {/* ambulance parked out front */}
        <mesh position={[2.2, 0.6, 4.4]} castShadow>
          <boxGeometry args={[2.2, 1.1, 1.1]} />
          <meshStandardMaterial color="#ffffff" />
        </mesh>
        <mesh position={[2.2, 0.62, 4.96]}>
          <boxGeometry args={[1.6, 0.18, 0.02]} />
          <meshStandardMaterial color={HEX.sindoor} />
        </mesh>
        <mesh position={[0, 7.1, 0]}>
          <boxGeometry args={[2.4, 0.2, 0.7]} />
          <meshStandardMaterial
            color={HEX.sindoor}
            emissive={HEX.sindoor}
            emissiveIntensity={0.3}
          />
        </mesh>
        <mesh position={[0, 7.1, 0]}>
          <boxGeometry args={[0.7, 0.2, 2.4]} />
          <meshStandardMaterial
            color={HEX.sindoor}
            emissive={HEX.sindoor}
            emissiveIntensity={0.3}
          />
        </mesh>
      </group>

      {/* School: yellow block + flag pole */}
      <group position={[school.x, 0, school.z]}>
        <mesh position={[0, 2, 0]} castShadow receiveShadow>
          <boxGeometry args={[6, 4, 5]} />
          <meshStandardMaterial color="#f2c84b" />
        </mesh>
        <mesh position={[ground.x, 0.1, ground.z]} receiveShadow>
          <boxGeometry args={[8, 0.1, 5]} />
          <meshStandardMaterial color="#c98a4b" />
        </mesh>
        {[-3.6, 3.6].map((gx) => (
          <mesh key={gx} position={[ground.x + gx, 0.6, ground.z]}>
            <boxGeometry args={[0.1, 1.2, 1.2]} />
            <meshStandardMaterial color="#f4f4f4" />
          </mesh>
        ))}
        <mesh position={[2.6, 5, 0]}>
          <boxGeometry args={[0.12, 2.4, 0.12]} />
          <meshStandardMaterial color="#8a6a30" />
        </mesh>
        <mesh position={[3.1, 5.7, 0]}>
          <boxGeometry args={[1, 0.6, 0.08]} />
          <meshStandardMaterial color={HEX.neem} />
        </mesh>
      </group>

      {/* Reservoir: elevated water tower on 4 legs */}
      <group position={[RESERVOIR.x, 0, RESERVOIR.z]}>
        {[
          [-2, -2],
          [2, -2],
          [-2, 2],
          [2, 2],
        ].map(([lx, lz], i) => (
          <mesh key={i} position={[lx as number, 3, lz as number]}>
            <boxGeometry args={[0.5, 6, 0.5]} />
            <meshStandardMaterial color={HEX.rule} />
          </mesh>
        ))}
        <mesh position={[0, 7, 0]} castShadow>
          <cylinderGeometry args={[3.6, 3.6, 3, 12]} />
          <meshStandardMaterial color="#8aa0b4" />
        </mesh>
        <mesh position={[0, 6.6, 0]}>
          <cylinderGeometry args={[3.4, 3.4, 1.6, 12]} />
          <meshStandardMaterial color={HEX.jal} transparent opacity={0.85} />
        </mesh>
      </group>

      {/* Depot / pump house with a roll-up door */}
      <group position={[depot.x, 0, depot.z]}>
        <mesh position={[0, 1.6, 0]} castShadow receiveShadow>
          <boxGeometry args={[7, 3.2, 5]} />
          <meshStandardMaterial color="#55607a" />
        </mesh>
        <mesh position={[0, 1.2, -2.55]}>
          <boxGeometry args={[3.4, 2.4, 0.1]} />
          <meshStandardMaterial color="#c9ccd4" />
        </mesh>
      </group>

      {/* Park: lawn, pond, benches (trees come from the instanced greenery) */}
      <group position={[PARK.x, 0, PARK.z]}>
        <mesh position={[0, 0.08, 0]} receiveShadow>
          <boxGeometry args={[12, 0.1, 10]} />
          <meshStandardMaterial color="#6cbf57" />
        </mesh>
        <mesh position={[1.5, 0.15, 1]} rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[2.4, 20]} />
          <meshStandardMaterial color="#3aa6c9" roughness={0.2} metalness={0.1} />
        </mesh>
        {[
          [-3.5, -3],
          [-3.5, 3],
        ].map(([bx, bz]) => (
          <mesh key={`${bx}${bz}`} position={[bx as number, 0.35, bz as number]}>
            <boxGeometry args={[1.6, 0.2, 0.5]} />
            <meshStandardMaterial color="#8a5a34" />
          </mesh>
        ))}
      </group>
    </group>
  );
}

// ---------- sector tiles (interactive) + status overlays ----------

function SectorTiles({
  sectorStatus,
  spectator,
  hovered,
  selected,
  onHover,
  onSelect,
}: {
  sectorStatus: Record<SectorId, SectorStatus>;
  spectator: boolean;
  hovered: SectorId | null;
  selected: SectorId | null;
  onHover?: (id: SectorId | null) => void;
  onSelect?: (id: SectorId) => void;
}): JSX.Element {
  return (
    <group>
      {SECTORS.map((s) => {
        const status = sectorStatus[s.id] ?? "normal";
        const w = s.box.xMax - s.box.xMin;
        const d = s.box.zMax - s.box.zMin;
        const isActive = status !== "normal";
        const highlight = hovered === s.id || selected === s.id;
        const click = spectator ? undefined : onSelect;
        const hover = spectator ? undefined : onHover;
        return (
          <group key={s.id}>
            {/* ground tint + hit area */}
            <mesh
              position={[s.centroid.x, 0.03, s.centroid.z]}
              rotation={[-Math.PI / 2, 0, 0]}
              onPointerOver={
                hover
                  ? (e: ThreeEvent<PointerEvent>) => {
                      e.stopPropagation();
                      hover(s.id);
                    }
                  : undefined
              }
              onPointerOut={hover ? () => hover(null) : undefined}
              onClick={
                click
                  ? (e: ThreeEvent<MouseEvent>) => {
                      e.stopPropagation();
                      click(s.id);
                    }
                  : undefined
              }
            >
              <planeGeometry args={[w - 0.5, d - 0.5]} />
              <meshStandardMaterial
                color={ZONE_GROUND[s.zone]}
                emissive={highlight ? HEX.jal : "#000000"}
                emissiveIntensity={highlight ? 0.25 : 0}
                roughness={1}
              />
            </mesh>
            {/* status overlay for non-normal sectors */}
            {isActive && (
              <mesh position={[s.centroid.x, 0.09, s.centroid.z]} rotation={[-Math.PI / 2, 0, 0]}>
                <planeGeometry args={[w - 1, d - 1]} />
                <meshStandardMaterial
                  color={STATUS_HEX[status]}
                  emissive={STATUS_HEX[status]}
                  emissiveIntensity={0.35}
                  transparent
                  opacity={0.4}
                  depthWrite={false}
                />
              </mesh>
            )}
          </group>
        );
      })}
    </group>
  );
}

// ---------- labels (drei Html) ----------

function SectorLabels({
  sectorStatus,
  hovered,
  selected,
}: {
  sectorStatus: Record<SectorId, SectorStatus>;
  hovered: SectorId | null;
  selected: SectorId | null;
}): JSX.Element {
  return (
    <group>
      {SECTORS.map((s) => {
        const status = sectorStatus[s.id] ?? "normal";
        const show = hovered === s.id || selected === s.id;
        if (!show) return null;
        return (
          <Html
            key={s.id}
            position={[s.centroid.x, 6, s.centroid.z]}
            center
            distanceFactor={90}
            zIndexRange={[10, 0]}
            pointerEvents="none"
          >
            <span className={styles.label} style={{ borderColor: STATUS_HEX[status] }}>
              <b>{s.id}</b> {STATUS_WORD[status]}
            </span>
          </Html>
        );
      })}
    </group>
  );
}

// One chip per open incident, e.g. "C3 · Confirmed burst".
const CHIP_LIVE = new Set(["open", "dispatched", "onsite", "repaired", "verifying", "reopened"]);

function IncidentChips({ incidents }: { incidents: readonly IncidentView[] }): JSX.Element {
  return (
    <group>
      {incidents
        .filter((i) => CHIP_LIVE.has(i.status))
        .map((i) => {
          const word = verdictWord(i.verdict);
          const color =
            i.verdict === "CONFIRMED"
              ? HEX.sindoor
              : i.verdict === "LOCAL_LEAK"
                ? HEX.jal
                : HEX.haldi;
          return (
            <Html
              key={i.id}
              position={[i.pin.x, 17, i.pin.z]}
              center
              zIndexRange={[10, 0]}
              pointerEvents="none"
            >
              <span className={styles.label} style={{ borderColor: color }}>
                <b>{i.sectorId}</b> · {word.charAt(0).toUpperCase() + word.slice(1)}
              </span>
            </Html>
          );
        })}
    </group>
  );
}

// ---------- lighting ----------

function SceneLighting({
  label,
  shadows,
}: {
  label: string | undefined;
  shadows: boolean;
}): JSX.Element {
  const sky = useMemo(() => skyFor(label), [label]);
  const sunTarget = useMemo(() => {
    const o = new THREE.Object3D();
    o.position.set(CX, 0, CZ);
    return o;
  }, []);
  const [sx, sy, sz] = sky.sun.position;
  return (
    <group>
      {/* a small constant floor so the city is never near-black, even at the 05:45 night start */}
      <ambientLight intensity={0.35} />
      <hemisphereLight
        color={sky.hemi.sky}
        groundColor={sky.hemi.ground}
        intensity={sky.hemi.intensity}
      />
      <primitive object={sunTarget} />
      <directionalLight
        color={sky.sun.color}
        intensity={sky.sun.intensity}
        position={[CX + sx, sy, CZ + sz - 40]}
        target={sunTarget}
        castShadow={shadows}
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.05}
        shadow-camera-left={-85}
        shadow-camera-right={85}
        shadow-camera-top={85}
        shadow-camera-bottom={-85}
        shadow-camera-near={1}
        shadow-camera-far={500}
      />
      {/* soft studio reflections from Lightformers only: no HDR download */}
      <Environment resolution={64} environmentIntensity={sky.night ? 0.15 : 0.35}>
        <Lightformer
          form="rect"
          intensity={2}
          position={[0, 10, 0]}
          rotation-x={Math.PI / 2}
          scale={[20, 20, 1]}
        />
        <Lightformer
          form="rect"
          intensity={0.8}
          color="#ffd9b0"
          position={[-10, 3, 0]}
          rotation-y={Math.PI / 2}
          scale={[20, 6, 1]}
        />
      </Environment>
      <fog attach="fog" args={[sky.hemi.ground, 380, 900]} />
    </group>
  );
}

// ---------- spectator cycle ----------

const DAY_START = 5 * 60 + 45;
const DAY_LEN = 14 * 60;

function useSpectatorCycle(on: boolean): string | null {
  const [mins, setMins] = useState<number | null>(null);
  useEffect(() => {
    if (!on) return;
    const t0 = performance.now();
    const id = window.setInterval(() => {
      if (document.hidden) return;
      const k = ((performance.now() - t0) / 60_000) % 1;
      setMins(Math.round(DAY_START + 60 + k * DAY_LEN) % (24 * 60));
    }, 500);
    return () => window.clearInterval(id);
  }, [on]);
  if (!on || mins === null) return null;
  const hh = String(Math.floor(mins / 60)).padStart(2, "0");
  const mm = String(mins % 60).padStart(2, "0");
  return `${hh}:${mm}`;
}

// ---------- the component ----------

export type City3DProps = CityViewProps & {
  simClock?: { day: number; slotIndex: number; label: string };
  /** bump to re-fit the camera ("Fit city") */
  fitKey?: number;
  /** sector the camera eases to (story beats, sector selection) */
  focus?: SectorId | null;
  /** the HUD's water-recovered total (litres) */
  recoveredLitres?: number;
  /** called when the browser drops the WebGL context (CityCanvas remounts or falls back to 2D) */
  onContextLost?: () => void;
};

export function City3D(props: City3DProps): JSX.Element {
  const {
    sectorStatus,
    xray = false,
    spectator = false,
    simClock,
    incidents = [],
    reports = [],
    crew,
    supplyOn = false,
    onSelectSector,
    onHoverSector,
    onSelectReport,
  } = props;
  const fadeRef = useRef<THREE.Group>(null);
  const focusPoint = useMemo(() => {
    const s = props.focus ? SECTORS.find((x) => x.id === props.focus) : undefined;
    return s ? { x: s.centroid.x, z: s.centroid.z } : null;
  }, [props.focus]);

  const [hovered, setHovered] = useState<SectorId | null>(null);
  const [selected, setSelected] = useState<SectorId | null>(null);
  const [rotationStep, setRotationStep] = useState(0);
  const fitKey = props.fitKey ?? 0;

  // Spectator (landing): the sky cycles through the day every 60 s and the city makes a slow
  // quarter-turn every 20 s. Reduced motion keeps a still mid-morning.
  const spectatorLabel = useSpectatorCycle(spectator && !prefersReducedMotion);
  const label = spectatorLabel ?? simClock?.label;
  const sky = useMemo(() => skyFor(label), [label]);
  const glow = windowsGlow(label);

  // Soft shadows only on big screens with plenty of cores.
  const shadows = useMemo(() => {
    if (typeof window === "undefined") return false;
    const cores = navigator.hardwareConcurrency ?? 2;
    return window.innerWidth >= 1024 && cores > 4 && !prefersReducedMotion;
  }, []);

  const handleHover = (id: SectorId | null): void => {
    setHovered(id);
    onHoverSector?.(id);
  };
  const handleSelect = (id: SectorId): void => {
    setSelected(id);
    onSelectSector?.(id);
  };

  // Q/E rotate in 90° steps.
  useEffect(() => {
    if (spectator) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.target instanceof HTMLInputElement) return;
      if (e.key === "q" || e.key === "Q") setRotationStep((r) => r - 1);
      else if (e.key === "e" || e.key === "E") setRotationStep((r) => r + 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [spectator]);

  return (
    <div className={styles.wrap}>
      <div className={styles.sky} style={{ background: sky.gradient }} aria-hidden />
      <Canvas
        className={styles.canvas}
        camera={{ fov: FOV, near: 1, far: 2000, position: [CX + 150, 180, CZ + 150] }}
        dpr={[1, 1.75]}
        shadows={shadows}
        gl={{ alpha: true, antialias: true }}
        onCreated={({ gl }) => {
          gl.domElement.addEventListener(
            "webglcontextlost",
            (e) => {
              e.preventDefault();
              props.onContextLost?.();
            },
            { once: true },
          );
        }}
      >
        <OrbitControls
          makeDefault
          target={[CX, 0, CZ]}
          enableDamping
          dampingFactor={0.12}
          minPolarAngle={MIN_POLAR}
          maxPolarAngle={MAX_POLAR}
          minDistance={35}
          maxDistance={520}
          screenSpacePanning={false}
          enablePan={!spectator}
          enableZoom={!spectator}
          enableRotate={!spectator}
          autoRotate={spectator && !prefersReducedMotion}
          autoRotateSpeed={0.35}
        />
        <CameraRig rotationStep={rotationStep} fitKey={fitKey} focus={focusPoint} />
        <SceneLighting label={label} shadows={shadows} />

        <group ref={fadeRef}>
          <Slab />
          <Roads />
          <SectorTiles
            sectorStatus={sectorStatus}
            spectator={spectator}
            hovered={hovered}
            selected={selected}
            onHover={handleHover}
            onSelect={handleSelect}
          />
          <Buildings glow={glow && !xray} />
          <Greenery />
          <Landmarks />
        </group>
        <CityLife glow={glow} xray={xray} />
        <XrayFade target={fadeRef} xray={xray} />
        {xray && <Pipes network={NETWORK} xray />}
        {xray && <FlowCubes network={NETWORK} supplyOn={supplyOn} sectorStatus={sectorStatus} />}
        <SuspectEffects sectorStatus={sectorStatus} />
        <LeakEffects incidents={incidents} recoveredTotal={props.recoveredLitres} />
        <CrewTruck crew={crew} />
        {!spectator && <ReportPins reports={reports} onSelectReport={onSelectReport} />}
        {!spectator && (
          <SectorLabels sectorStatus={sectorStatus} hovered={hovered} selected={selected} />
        )}
        {!spectator && <IncidentChips incidents={incidents} />}
      </Canvas>

      {!spectator && (
        <div className={styles.rotateControls}>
          <button
            type="button"
            className={styles.rotateBtn}
            aria-label="Rotate left"
            onClick={() => setRotationStep((r) => r - 1)}
          >
            ⟲
          </button>
          <button
            type="button"
            className={styles.rotateBtn}
            aria-label="Rotate right"
            onClick={() => setRotationStep((r) => r + 1)}
          >
            ⟳
          </button>
        </div>
      )}
    </div>
  );
}
