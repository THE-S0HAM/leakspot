// City3D: the 3D view of Jaldhara (react-three-fiber). Same props/callbacks as CityView, so the
// Command Centre and Landing don't change. Reads run state + the static @leakspot/core/world layout
// only (no API, no leaks). PART 1a: scene, orthographic iso camera + MapControls, sim-time lighting,
// a floating diorama slab, roads, instanced buildings with Indian-city variety, landmarks, trees, and
// drei <Html> labels for non-normal / hovered / selected sectors. Water, crew and effects are PART 1b.

import { memo, useEffect, useMemo, useState, type JSX } from "react";
import { Canvas, useThree, type ThreeEvent } from "@react-three/fiber";
import { Html, MapControls, Stars } from "@react-three/drei";
import * as THREE from "three";
import { FACILITIES, RESERVOIR, SECTORS, WORLD_BOUNDS, type SectorId } from "@leakspot/core/world";
import type { CityViewProps } from "./CityView";
import type { SectorStatus } from "../state/view-types";
import { STATUS_WORD } from "./status";
import { HEX, STATUS_HEX, ZONE_GROUND } from "./palette";
import { InstancedBoxes } from "./InstancedBoxes";
import { dressCity, dressRoads } from "./city3d-dressing";
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

const prefersReducedMotion =
  typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

// ---------- camera + controls ----------

/** Zoom that fits the whole diorama in the canvas (orthographic: pixels per world unit). */
export function fitZoom(width: number, height: number): number {
  return Math.max(1.5, Math.min(width / 158, height / 118));
}

function setZoom(camera: THREE.Camera, zoom: number): void {
  if (camera instanceof THREE.OrthographicCamera) {
    camera.zoom = zoom;
    camera.updateProjectionMatrix();
  }
}

function IsoCamera({ rotationStep, fitKey }: { rotationStep: number; fitKey: number }): null {
  const { camera, size } = useThree();
  useEffect(() => {
    setZoom(camera, fitZoom(size.width, size.height));
  }, [camera, size.width, size.height, fitKey]);
  const target = useMemo(() => new THREE.Vector3(CX, 0, CZ), []);
  useEffect(() => {
    // Orthographic iso: look down from a fixed quarter angle, rotated in 90° steps around the target.
    const angle = (rotationStep * Math.PI) / 2 + Math.PI / 4;
    const dist = 150;
    camera.position.set(target.x + Math.cos(angle) * dist, 130, target.z + Math.sin(angle) * dist);
    camera.lookAt(target);
    camera.updateProjectionMatrix();
  }, [camera, rotationStep, target]);
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
      <InstancedBoxes items={ROAD_DRESS.zebras}>
        <meshStandardMaterial color="#eef2f5" />
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
  const hospital = FACILITIES.find((f) => f.kind === "hospital")?.at ?? { x: 12, z: 94 };
  const school = FACILITIES.find((f) => f.kind === "school")?.at ?? { x: 55, z: 32 };
  const depot = { x: 14, z: 102 };
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
        <mesh position={[-1, 0.1, 4.2]} receiveShadow>
          <boxGeometry args={[7, 0.1, 3.2]} />
          <meshStandardMaterial color="#c98a4b" />
        </mesh>
        {[-3.6, 1.6].map((gx) => (
          <mesh key={gx} position={[gx, 0.6, 4.2]}>
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
        <mesh position={[0, 1.2, 2.55]}>
          <boxGeometry args={[3.4, 2.4, 0.1]} />
          <meshStandardMaterial color="#c9ccd4" />
        </mesh>
      </group>

      {/* Park: lawn, pond, benches (trees come from the instanced greenery) */}
      <group position={[39, 0, 67]}>
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
        const show = status !== "normal" || hovered === s.id || selected === s.id;
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

// ---------- lighting ----------

function SceneLighting({
  label,
  shadows,
}: {
  label: string | undefined;
  shadows: boolean;
}): JSX.Element {
  const sky = useMemo(() => skyFor(label), [label]);
  return (
    <group>
      {/* a small constant floor so the city is never near-black, even at the 05:45 night start */}
      <ambientLight intensity={0.6} />
      <hemisphereLight
        color={sky.hemi.sky}
        groundColor={sky.hemi.ground}
        intensity={sky.hemi.intensity}
      />
      <directionalLight
        color={sky.sun.color}
        intensity={sky.sun.intensity}
        position={sky.sun.position}
        castShadow={shadows}
        shadow-mapSize-width={shadows ? 1024 : 0}
        shadow-mapSize-height={shadows ? 1024 : 0}
      />
      {sky.night && <Stars radius={200} depth={50} count={1200} factor={4} fade speed={0} />}
    </group>
  );
}

// ---------- the component ----------

export type City3DProps = CityViewProps & {
  simClock?: { day: number; slotIndex: number; label: string };
  /** bump to re-fit the camera ("Fit city") */
  fitKey?: number;
};

export function City3D(props: City3DProps): JSX.Element {
  const {
    sectorStatus,
    xray = false,
    spectator = false,
    simClock,
    onSelectSector,
    onHoverSector,
  } = props;

  const [hovered, setHovered] = useState<SectorId | null>(null);
  const [selected, setSelected] = useState<SectorId | null>(null);
  const [rotationStep, setRotationStep] = useState(0);
  const fitKey = props.fitKey ?? 0;

  const label = simClock?.label;
  const sky = useMemo(() => skyFor(label), [label]);
  const glow = windowsGlow(label);

  // Soft shadows only on big screens with plenty of cores (plan PART 1a).
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
        orthographic
        camera={{ zoom: 7, near: -500, far: 1000, position: [CX + 150, 130, CZ + 150] }}
        dpr={[1, 1.75]}
        shadows={shadows}
        gl={{ alpha: true, antialias: true }}
      >
        <IsoCamera rotationStep={rotationStep} fitKey={fitKey} />
        <MapControls
          makeDefault
          enableRotate={false}
          minZoom={1.5}
          maxZoom={24}
          target={[CX, 0, CZ]}
          enableDamping
          dampingFactor={0.15}
        />
        <SceneLighting label={label} shadows={shadows} />

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
        {!spectator && (
          <SectorLabels sectorStatus={sectorStatus} hovered={hovered} selected={selected} />
        )}
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
