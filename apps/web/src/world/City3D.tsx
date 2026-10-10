// City3D: the 3D view of Jaldhara (react-three-fiber). Same props/callbacks as CityView, so the
// Command Centre and Landing don't change. Reads run state + the static @leakspot/core/world layout
// only (no API, no leaks). PART 1a: scene, orthographic iso camera + MapControls, sim-time lighting,
// a floating diorama slab, roads, instanced buildings with Indian-city variety, landmarks, trees, and
// drei <Html> labels for non-normal / hovered / selected sectors. Water, crew and effects are PART 1b.

import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState, type JSX } from "react";
import { Canvas, useThree, type ThreeEvent } from "@react-three/fiber";
import { Html, MapControls, Stars } from "@react-three/drei";
import * as THREE from "three";
import { FACILITIES, RESERVOIR, SECTORS, WORLD_BOUNDS, type SectorId } from "@leakspot/core/world";
import type { CityViewProps } from "./CityView";
import type { SectorStatus } from "../state/view-types";
import { STATUS_WORD } from "./status";
import { HEX, STATUS_HEX, ZONE_BUILDING, ZONE_GROUND } from "./palette";
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
const TREES = treeSpots();

const prefersReducedMotion =
  typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

// ---------- camera + controls ----------

function IsoCamera({ rotationStep }: { rotationStep: number }): null {
  const { camera } = useThree();
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
        <meshStandardMaterial color="#2f6b3a" />
      </mesh>
      <mesh position={[CX, -depth / 2 - 0.4, CZ]}>
        <boxGeometry args={[w, depth, d]} />
        <meshStandardMaterial color="#4a3524" />
      </mesh>
    </group>
  );
});

const Roads = memo(function Roads(): JSX.Element {
  return (
    <group>
      {ROADS.map((r, i) => (
        <group key={i}>
          <mesh position={[r.cx, 0.02, r.cz]} receiveShadow>
            <boxGeometry args={[r.w, 0.08, r.d]} />
            <meshStandardMaterial color="#20272f" />
          </mesh>
          {/* dashed centre line */}
          <DashedLine road={r} />
        </group>
      ))}
      {/* zebra crossings at junctions */}
      {JUNCTIONS.map((j, i) => (
        <group key={`z${i}`}>
          {[-2, -1, 0, 1, 2].map((n) => (
            <mesh key={n} position={[j.x + n * 0.8, 0.07, j.z]}>
              <boxGeometry args={[0.4, 0.02, 3]} />
              <meshStandardMaterial color="#cdd6de" />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  );
});

function DashedLine({ road }: { road: ReturnType<typeof buildRoads>[number] }): JSX.Element {
  const dashes = road.horizontal ? road.w : road.d;
  const count = Math.floor(dashes / 4);
  return (
    <group>
      {[...Array(count).keys()].map((i) => {
        const t = (i + 0.5) * 4 - dashes / 2;
        const x = road.horizontal ? road.cx + t : road.cx;
        const z = road.horizontal ? road.cz : road.cz + t;
        return (
          <mesh key={i} position={[x, 0.07, z]}>
            <boxGeometry args={road.horizontal ? [1.6, 0.02, 0.25] : [0.25, 0.02, 1.6]} />
            <meshStandardMaterial color="#e7eef7" />
          </mesh>
        );
      })}
    </group>
  );
}

// Instanced building bodies (one box each). Walls coloured per zone; roofs a separate instanced mesh.
const Buildings = memo(function Buildings({ glow }: { glow: boolean }): JSX.Element {
  const wallsRef = useRef<THREE.InstancedMesh>(null);
  const roofsRef = useRef<THREE.InstancedMesh>(null);
  const windowsRef = useRef<THREE.InstancedMesh>(null);

  // Window instances: one glowing pane per glowing building (cheap stand-in for a grid).
  const glowingBuildings = useMemo(() => ALL_BUILDINGS.filter((b) => b.glowSeed < 0.4), []);

  useLayoutEffect(() => {
    const dummy = new THREE.Object3D();
    const color = new THREE.Color();
    const walls = wallsRef.current;
    const roofs = roofsRef.current;
    if (!walls || !roofs) return;
    ALL_BUILDINGS.forEach((b, i) => {
      const h = b.floors;
      dummy.position.set(b.cx, h / 2, b.cz);
      dummy.scale.set(b.w, h, b.d);
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      walls.setMatrixAt(i, dummy.matrix);
      walls.setColorAt(i, color.set(ZONE_BUILDING[b.zone].wall));
      // roof slab just above the top
      dummy.position.set(b.cx, h + 0.15, b.cz);
      dummy.scale.set(b.w * 1.04, 0.3, b.d * 1.04);
      dummy.updateMatrix();
      roofs.setMatrixAt(i, dummy.matrix);
      roofs.setColorAt(i, color.set(ZONE_BUILDING[b.zone].roof));
    });
    walls.instanceMatrix.needsUpdate = true;
    roofs.instanceMatrix.needsUpdate = true;
    if (walls.instanceColor) walls.instanceColor.needsUpdate = true;
    if (roofs.instanceColor) roofs.instanceColor.needsUpdate = true;
  }, []);

  useLayoutEffect(() => {
    const win = windowsRef.current;
    if (!win) return;
    const dummy = new THREE.Object3D();
    glowingBuildings.forEach((b, i) => {
      // a pane facing +x, mid-height
      dummy.position.set(b.cx + b.w / 2 + 0.05, Math.max(0.8, b.floors * 0.6), b.cz);
      dummy.scale.set(0.1, 0.5, b.d * 0.5);
      dummy.updateMatrix();
      win.setMatrixAt(i, dummy.matrix);
    });
    win.instanceMatrix.needsUpdate = true;
    win.visible = glow;
  }, [glow, glowingBuildings]);

  return (
    <group>
      <instancedMesh
        ref={wallsRef}
        args={[undefined, undefined, ALL_BUILDINGS.length]}
        castShadow
        receiveShadow
      >
        <boxGeometry args={[1, 1, 1]} />
        {/* a touch of self-lit so the pastel limewash walls still read at the 05:45 night start */}
        <meshStandardMaterial
          vertexColors
          roughness={0.8}
          emissive="#20283a"
          emissiveIntensity={0.5}
        />
      </instancedMesh>
      <instancedMesh ref={roofsRef} args={[undefined, undefined, ALL_BUILDINGS.length]} castShadow>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial vertexColors roughness={0.9} />
      </instancedMesh>
      <instancedMesh
        ref={windowsRef}
        args={[undefined, undefined, Math.max(1, glowingBuildings.length)]}
      >
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial
          color="#ffd98a"
          emissive="#ffb64a"
          emissiveIntensity={glow ? 0.9 : 0}
          toneMapped={false}
        />
      </instancedMesh>
      <RooftopTanks />
    </group>
  );
});

// Black rooftop tanks on buildings flagged `tank`.
const RooftopTanks = memo(function RooftopTanks(): JSX.Element {
  const ref = useRef<THREE.InstancedMesh>(null);
  const tanks = useMemo(() => ALL_BUILDINGS.filter((b) => b.tank), []);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const dummy = new THREE.Object3D();
    tanks.forEach((b, i) => {
      dummy.position.set(b.cx - b.w * 0.25, b.floors + 0.6, b.cz - b.d * 0.25);
      dummy.scale.set(0.9, 0.8, 0.9);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
  }, [tanks]);
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, Math.max(1, tanks.length)]} castShadow>
      <cylinderGeometry args={[0.5, 0.5, 1, 8]} />
      <meshStandardMaterial color="#111820" />
    </instancedMesh>
  );
});

// Instanced trees (trunk + two canopy blocks).
const Trees = memo(function Trees(): JSX.Element {
  const trunkRef = useRef<THREE.InstancedMesh>(null);
  const canopyRef = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const trunk = trunkRef.current;
    const canopy = canopyRef.current;
    if (!trunk || !canopy) return;
    const dummy = new THREE.Object3D();
    const color = new THREE.Color();
    TREES.forEach((t, i) => {
      dummy.position.set(t.x, 0.6, t.z);
      dummy.scale.set(0.3, 1.2, 0.3);
      dummy.updateMatrix();
      trunk.setMatrixAt(i, dummy.matrix);
      dummy.position.set(t.x, 1.6, t.z);
      dummy.scale.set(1.4, 1.4, 1.4);
      dummy.updateMatrix();
      canopy.setMatrixAt(i, dummy.matrix);
      canopy.setColorAt(i, color.set(i % 2 ? "#2f7d3a" : "#3c9a47"));
    });
    trunk.instanceMatrix.needsUpdate = true;
    canopy.instanceMatrix.needsUpdate = true;
    if (canopy.instanceColor) canopy.instanceColor.needsUpdate = true;
  }, []);
  return (
    <group>
      <instancedMesh ref={trunkRef} args={[undefined, undefined, TREES.length]} castShadow>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color="#5a3f28" />
      </instancedMesh>
      <instancedMesh ref={canopyRef} args={[undefined, undefined, TREES.length]} castShadow>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial vertexColors roughness={0.9} />
      </instancedMesh>
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
        <mesh position={[0, 2.5, 0]} castShadow receiveShadow>
          <boxGeometry args={[6, 5, 6]} />
          <meshStandardMaterial color="#f3f6f8" />
        </mesh>
        <mesh position={[0, 5.1, 0]}>
          <boxGeometry args={[2.4, 0.2, 0.7]} />
          <meshStandardMaterial
            color={HEX.sindoor}
            emissive={HEX.sindoor}
            emissiveIntensity={0.3}
          />
        </mesh>
        <mesh position={[0, 5.1, 0]}>
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
      <ambientLight intensity={0.45} />
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
        <IsoCamera rotationStep={rotationStep} />
        <MapControls
          makeDefault
          enableRotate={false}
          minZoom={3}
          maxZoom={16}
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
        <Trees />
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
