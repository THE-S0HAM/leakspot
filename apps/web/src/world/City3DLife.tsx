// City3D PART 1c: life. Seeded decoration, NOT data: 12 cars and auto-rickshaws looping on the
// streets (slowing near junctions), traffic lights at the main junctions cycling every 6 s, 20
// citizens walking footpath loops with a small bob, and street lamps that glow at dawn/dusk/night.
// Reduced motion: no traffic and no people (lights and lamps stay, static).

import { memo, useMemo, useRef, type JSX } from "react";
import { useFrame, type RootState } from "@react-three/fiber";
import * as THREE from "three";
import { SECTORS } from "@leakspot/core/world";
import { InstancedBoxes, type BoxItem } from "./InstancedBoxes";

const STREETS_X = [2, 25, 50, 75, 98];
const STREETS_Z = [12, 34, 56, 78, 101];
const LIGHT_JUNCTIONS = [
  { x: 50, z: 34 },
  { x: 50, z: 56 },
  { x: 50, z: 78 },
  { x: 25, z: 56 },
  { x: 75, z: 56 },
];

const reducedMotion =
  typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

function paused(state: RootState): boolean {
  return document.hidden || state.frameloop === "never";
}

function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- traffic ----------

type Vehicle = {
  horizontal: boolean;
  line: number; // the street's fixed coordinate
  lane: number; // ±offset from the centre line
  dir: 1 | -1;
  speed: number;
  phase: number;
  auto: boolean;
  color: string;
};

const CAR_COLORS = ["#d94141", "#f2f2f2", "#3b6fd4", "#2b2f36", "#9aa3ad", "#e08a2e"];

function makeVehicles(): Vehicle[] {
  const r = rng(99);
  return [...Array(12).keys()].map((i) => {
    const horizontal = i % 2 === 0;
    const streets = horizontal ? STREETS_Z : STREETS_X;
    const dir: 1 | -1 = r() < 0.5 ? 1 : -1;
    const auto = i % 3 === 0;
    return {
      horizontal,
      line: streets[1 + Math.floor(r() * 3)] ?? 50,
      lane: dir * 0.6,
      dir,
      speed: auto ? 5 : 7 + r() * 3,
      phase: r() * 100,
      auto,
      color: auto ? "#b9d531" : (CAR_COLORS[i % CAR_COLORS.length] ?? "#ffffff"),
    };
  });
}

function nearJunction(v: number, streets: readonly number[]): number {
  let d = Infinity;
  for (const s of streets) d = Math.min(d, Math.abs(s - v));
  return d;
}

const Traffic = memo(function Traffic(): JSX.Element {
  const vehicles = useMemo(() => makeVehicles(), []);
  const bodyRef = useRef<THREE.InstancedMesh>(null);
  const cabRef = useRef<THREE.InstancedMesh>(null);
  const pos = useRef<number[]>(vehicles.map((v) => v.phase));
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const colors = useMemo<BoxItem[]>(
    () => vehicles.map((v) => ({ p: [0, -50, 0], s: [1, 1, 1], c: v.color })),
    [vehicles],
  );
  const cabs = useMemo<BoxItem[]>(
    () =>
      vehicles.map((v) => ({ p: [0, -50, 0], s: [1, 1, 1], c: v.auto ? "#1f2a1a" : "#2b3a52" })),
    [vehicles],
  );
  useFrame((state, dt) => {
    const body = bodyRef.current;
    const cab = cabRef.current;
    if (!body || !cab || paused(state)) return;
    const step = Math.min(dt, 0.1);
    vehicles.forEach((v, i) => {
      let p = pos.current[i] ?? 0;
      // slow down near junctions (cross streets of the other axis)
      const cross = v.horizontal ? STREETS_X : STREETS_Z;
      const slow = nearJunction(p, cross) < 4 ? 0.45 : 1;
      p += v.dir * v.speed * slow * step;
      if (p > 102) p = -2;
      if (p < -2) p = 102;
      pos.current[i] = p;
      const x = v.horizontal ? p : v.line + v.lane;
      const z = v.horizontal ? v.line + v.lane : p;
      const ry = v.horizontal ? (v.dir > 0 ? 0 : Math.PI) : v.dir > 0 ? -Math.PI / 2 : Math.PI / 2;
      const len = v.auto ? 1.1 : 1.7;
      dummy.position.set(x, 0.42, z);
      dummy.rotation.set(0, ry, 0);
      dummy.scale.set(len, 0.55, 0.85);
      dummy.updateMatrix();
      body.setMatrixAt(i, dummy.matrix);
      dummy.position.set(x, 0.86, z);
      dummy.scale.set(len * 0.55, 0.38, 0.75);
      dummy.updateMatrix();
      cab.setMatrixAt(i, dummy.matrix);
    });
    body.instanceMatrix.needsUpdate = true;
    cab.instanceMatrix.needsUpdate = true;
  });
  return (
    <group>
      <InstancedBoxes items={colors} meshRef={bodyRef} castShadow>
        <meshStandardMaterial roughness={0.5} />
      </InstancedBoxes>
      <InstancedBoxes items={cabs} meshRef={cabRef}>
        <meshStandardMaterial roughness={0.3} />
      </InstancedBoxes>
    </group>
  );
});

// ---------- traffic lights ----------

const LAMP_COLORS = ["#ff4d4d", "#ffb020", "#3ee07a"] as const;

const TrafficLights = memo(function TrafficLights(): JSX.Element {
  const lamps = useRef<(THREE.MeshBasicMaterial | null)[]>([]);
  const poles = useMemo<BoxItem[]>(
    () => LIGHT_JUNCTIONS.map((j) => ({ p: [j.x + 2.6, 1.3, j.z + 2.6], s: [0.18, 2.6, 0.18] })),
    [],
  );
  const heads = useMemo<BoxItem[]>(
    () => LIGHT_JUNCTIONS.map((j) => ({ p: [j.x + 2.6, 2.9, j.z + 2.6], s: [0.4, 1.1, 0.4] })),
    [],
  );
  useFrame((state) => {
    if (paused(state)) return;
    // red → green → amber, 2 s each: a full cycle every 6 s
    const phase = Math.floor((state.clock.elapsedTime % 6) / 2);
    const on = phase === 0 ? 0 : phase === 1 ? 2 : 1;
    lamps.current.forEach((m, i) => {
      if (!m) return;
      const k = i % 3;
      m.color.set(k === on ? (LAMP_COLORS[k] ?? "#fff") : "#2a2f36");
    });
  });
  return (
    <group>
      <InstancedBoxes items={poles}>
        <meshStandardMaterial color="#3a3f46" />
      </InstancedBoxes>
      <InstancedBoxes items={heads}>
        <meshStandardMaterial color="#1b1f24" />
      </InstancedBoxes>
      {LIGHT_JUNCTIONS.map((j, ji) =>
        [0, 1, 2].map((k) => (
          <mesh key={`${ji}-${k}`} position={[j.x + 2.6, 3.25 - k * 0.34, j.z + 2.81]}>
            <boxGeometry args={[0.24, 0.24, 0.04]} />
            <meshBasicMaterial
              ref={(m) => {
                lamps.current[ji * 3 + k] = m;
              }}
              color="#2a2f36"
              toneMapped={false}
            />
          </mesh>
        )),
      )}
    </group>
  );
});

// ---------- citizens ----------

const SHIRTS = ["#e25d3f", "#3f8fe2", "#f2c23a", "#8e5bd6", "#2fae6b", "#f2f2f2", "#d6457a"];

const Citizens = memo(function Citizens(): JSX.Element {
  const people = useMemo(() => {
    const r = rng(1234);
    return [...Array(20).keys()].map((i) => {
      const s = SECTORS[(i * 5) % SECTORS.length] ?? SECTORS[0];
      const box = s ? s.box : { xMin: 0, xMax: 10, zMin: 0, zMax: 10 };
      return {
        box: {
          xMin: box.xMin + 0.4,
          xMax: box.xMax - 0.4,
          zMin: box.zMin + 0.4,
          zMax: box.zMax - 0.4,
        },
        t: r(),
        speed: (0.006 + r() * 0.006) * (r() < 0.5 ? 1 : -1),
        shirt: SHIRTS[i % SHIRTS.length] ?? "#fff",
      };
    });
  }, []);
  const bodyRef = useRef<THREE.InstancedMesh>(null);
  const headRef = useRef<THREE.InstancedMesh>(null);
  const bodies = useMemo<BoxItem[]>(
    () => people.map((p) => ({ p: [0, -50, 0], s: [1, 1, 1], c: p.shirt })),
    [people],
  );
  const heads = useMemo<BoxItem[]>(
    () => people.map(() => ({ p: [0, -50, 0], s: [1, 1, 1], c: "#8a5a3c" })),
    [people],
  );
  const ts = useRef<number[]>(people.map((p) => p.t));
  const dummy = useMemo(() => new THREE.Object3D(), []);
  useFrame((state, dt) => {
    const body = bodyRef.current;
    const head = headRef.current;
    if (!body || !head || paused(state)) return;
    const el = state.clock.elapsedTime;
    people.forEach((p, i) => {
      const t = ((((ts.current[i] ?? 0) + p.speed * Math.min(dt, 0.1) * 6) % 1) + 1) % 1;
      ts.current[i] = t;
      // walk the block's footpath loop (perimeter parameterised 0..1)
      const { xMin, xMax, zMin, zMax } = p.box;
      const w = xMax - xMin;
      const d = zMax - zMin;
      let u = t * 2 * (w + d);
      let x: number;
      let z: number;
      if (u < w) [x, z] = [xMin + u, zMin];
      else if ((u -= w) < d) [x, z] = [xMax, zMin + u];
      else if ((u -= d) < w) [x, z] = [xMax - u, zMax];
      else [x, z] = [xMin, zMax - (u - w)];
      const bob = Math.abs(Math.sin(el * 8 + i)) * 0.08;
      dummy.position.set(x, 0.55 + bob, z);
      dummy.scale.set(0.38, 0.7, 0.26);
      dummy.updateMatrix();
      body.setMatrixAt(i, dummy.matrix);
      dummy.position.set(x, 1.08 + bob, z);
      dummy.scale.set(0.3, 0.3, 0.3);
      dummy.updateMatrix();
      head.setMatrixAt(i, dummy.matrix);
    });
    body.instanceMatrix.needsUpdate = true;
    head.instanceMatrix.needsUpdate = true;
  });
  return (
    <group>
      <InstancedBoxes items={bodies} meshRef={bodyRef}>
        <meshStandardMaterial roughness={0.8} />
      </InstancedBoxes>
      <InstancedBoxes items={heads} meshRef={headRef}>
        <meshStandardMaterial roughness={0.8} />
      </InstancedBoxes>
    </group>
  );
});

// ---------- street lamps ----------

const LAMP_SPOTS = (() => {
  const out: { x: number; z: number }[] = [];
  for (let z = 6; z < 104; z += 11) out.push({ x: 52.6, z }, { x: 47.4, z: z + 5 });
  for (let x = 6; x < 100; x += 11) out.push({ x, z: 58.6 }, { x: x + 5, z: 53.4 });
  return out;
})();

const StreetLamps = memo(function StreetLamps({ glow }: { glow: boolean }): JSX.Element {
  const poles = useMemo<BoxItem[]>(
    () => LAMP_SPOTS.map((l) => ({ p: [l.x, 1.4, l.z], s: [0.12, 2.8, 0.12] })),
    [],
  );
  const heads = useMemo<BoxItem[]>(
    () => LAMP_SPOTS.map((l) => ({ p: [l.x, 2.85, l.z], s: [0.42, 0.18, 0.42] })),
    [],
  );
  return (
    <group>
      <InstancedBoxes items={poles}>
        <meshStandardMaterial color="#4a5058" />
      </InstancedBoxes>
      <InstancedBoxes items={heads}>
        <meshBasicMaterial color={glow ? "#ffd27a" : "#c9ccd1"} toneMapped={!glow} />
      </InstancedBoxes>
    </group>
  );
});

export function CityLife({ glow, xray }: { glow: boolean; xray: boolean }): JSX.Element {
  return (
    <group visible={!xray}>
      <StreetLamps glow={glow} />
      <TrafficLights />
      {!reducedMotion && <Traffic />}
      {!reducedMotion && <Citizens />}
    </group>
  );
}
