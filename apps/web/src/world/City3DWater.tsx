// City3D PART 1b: the water network and everything that happens on it. Pipes that CONNECT (reservoir →
// trunk → avenue main → service pipe → inlet meter → distribution line → a lateral to every building),
// flow cubes in X-ray, the X-ray fade, suspected-sector rings + amber drips (never a precise point),
// visible-leak fountains + puddles, the confirmed "!" marker, the crew truck on the road grid, the
// verified burst, and report pins. One useFrame per animated layer, no per-frame allocations.

import { memo, useEffect, useMemo, useRef, useState, type JSX } from "react";
import { useFrame, type RootState } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";
import { FACILITIES, RESERVOIR, SECTORS, TRUNK_MAIN, type SectorId } from "@leakspot/core/world";
import type { IncidentView, RecentReport, SectorStatus } from "../state/view-types";
import type { CrewMarker } from "./CityView";
import { InstancedBoxes, type BoxItem } from "./InstancedBoxes";
import type { Building3D } from "./city3d-geometry";
import { HEX } from "./palette";
import { labelWord } from "../ui/words";
import { lakh } from "../ui/format";
import styles from "./City3D.module.css";

const AVENUE_X = 50;
const STREETS_X = [2, 25, 50, 75, 98];
const STREETS_Z = [12, 34, 56, 78, 101];
const DEPOT = FACILITIES.find((f) => f.kind === "depot")?.at ?? { x: 14, z: 102 };
const PIPE_Y = 0.16;

const reducedMotion =
  typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

type P = { x: number; z: number };
type Seg = { a: P; b: P; kind: "trunk" | "main" | "service" | "lateral"; sector?: SectorId };

/** The connected network, built once from the world layout + the seeded buildings. */
export function buildNetwork(buildings: readonly (Building3D & { sector: SectorId })[]): Seg[] {
  const segs: Seg[] = [];
  segs.push({ a: { x: RESERVOIR.x, z: RESERVOIR.z }, b: TRUNK_MAIN.to, kind: "trunk" });
  const zs = SECTORS.map((s) => s.inlet.z);
  segs.push({
    a: { x: AVENUE_X, z: Math.min(TRUNK_MAIN.to.z, ...zs) },
    b: { x: AVENUE_X, z: Math.max(TRUNK_MAIN.to.z, ...zs) },
    kind: "main",
  });
  for (const s of SECTORS) {
    segs.push({ a: { x: AVENUE_X, z: s.inlet.z }, b: s.inlet, kind: "service", sector: s.id });
    const mine = buildings.filter((b) => b.sector === s.id);
    if (mine.length === 0) continue;
    // distribution line along the inlet row, then a lateral from it to every building
    const xs = mine.map((b) => b.cx);
    const far = s.inlet.x > AVENUE_X ? Math.max(...xs) : Math.min(...xs);
    segs.push({ a: s.inlet, b: { x: far, z: s.inlet.z }, kind: "lateral", sector: s.id });
    for (const b of mine) {
      segs.push({
        a: { x: b.cx, z: s.inlet.z },
        b: { x: b.cx, z: b.cz },
        kind: "lateral",
        sector: s.id,
      });
    }
  }
  return segs;
}

function segBox(seg: Seg, y: number, thick: number): BoxItem {
  const dx = seg.b.x - seg.a.x;
  const dz = seg.b.z - seg.a.z;
  const len = Math.hypot(dx, dz) + thick;
  return {
    p: [(seg.a.x + seg.b.x) / 2, y, (seg.a.z + seg.b.z) / 2],
    s: [len, thick, thick],
    ry: -Math.atan2(dz, dx),
  };
}

const THICK = { trunk: 0.9, main: 0.7, service: 0.45, lateral: 0.24 } as const;

/** Skip per-frame work while the tab is hidden or the loop is stopped. */
function paused(state: RootState): boolean {
  return document.hidden || state.frameloop === "never";
}

// ---------- pipes ----------

export const Pipes = memo(function Pipes({
  network,
  xray,
}: {
  network: readonly Seg[];
  xray: boolean;
}): JSX.Element {
  const items = useMemo(
    () =>
      network.map((s) =>
        segBox(s, xray ? PIPE_Y + 0.25 : PIPE_Y, THICK[s.kind] * (xray ? 1.3 : 0.6)),
      ),
    [network, xray],
  );
  const meters = useMemo<BoxItem[]>(
    () => SECTORS.map((s) => ({ p: [s.inlet.x, 0.5, s.inlet.z], s: [1.1, 1, 1.1] })),
    [],
  );
  const dials = useMemo<BoxItem[]>(
    () => SECTORS.map((s) => ({ p: [s.inlet.x, 1.02, s.inlet.z], s: [0.7, 0.06, 0.7] })),
    [],
  );
  return (
    <group>
      <InstancedBoxes items={items}>
        <meshStandardMaterial
          color={HEX.jal}
          emissive={HEX.jal}
          emissiveIntensity={xray ? 1.1 : 0.35}
          transparent
          opacity={xray ? 1 : 0.7}
          toneMapped={!xray}
          depthTest={!xray}
        />
      </InstancedBoxes>
      <InstancedBoxes items={meters} castShadow>
        <meshStandardMaterial color="#3d5a78" />
      </InstancedBoxes>
      <InstancedBoxes items={dials}>
        <meshStandardMaterial color="#f2f5f8" emissive="#ffffff" emissiveIntensity={0.3} />
      </InstancedBoxes>
    </group>
  );
});

// ---------- flow cubes (X-ray) ----------

const FLOW_PER_SEG = { trunk: 8, main: 10, service: 4, lateral: 0 } as const;

export function FlowCubes({
  network,
  supplyOn,
  sectorStatus,
}: {
  network: readonly Seg[];
  supplyOn: boolean;
  sectorStatus: Record<SectorId, SectorStatus>;
}): JSX.Element | null {
  const ref = useRef<THREE.InstancedMesh>(null);
  const slots = useMemo(() => {
    const out: { seg: Seg; phase: number }[] = [];
    for (const seg of network) {
      const n = FLOW_PER_SEG[seg.kind];
      for (let i = 0; i < n; i += 1) out.push({ seg, phase: i / n });
    }
    return out;
  }, [network]);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const t = useRef(0);
  useFrame((state, dt) => {
    const mesh = ref.current;
    if (!mesh || paused(state)) return;
    // still in dry hours; a suspected sector's service pipe runs visibly "thin" (half speed)
    if (supplyOn && !reducedMotion) t.current += dt * 0.35;
    for (let i = 0; i < slots.length; i += 1) {
      const sl = slots[i];
      if (!sl) continue;
      const slow = sl.seg.sector && sectorStatus[sl.seg.sector] !== "normal" ? 0.5 : 1;
      const f = (sl.phase + t.current * slow) % 1;
      dummy.position.set(
        sl.seg.a.x + (sl.seg.b.x - sl.seg.a.x) * f,
        PIPE_Y + 0.25,
        sl.seg.a.z + (sl.seg.b.z - sl.seg.a.z) * f,
      );
      const s = supplyOn ? 0.55 : 0;
      dummy.scale.set(s, s, s);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  });
  return (
    <instancedMesh
      ref={ref}
      args={[undefined, undefined, slots.length]}
      frustumCulled={false}
      renderOrder={2}
    >
      <boxGeometry args={[1, 1, 1]} />
      <meshBasicMaterial color="#e9fbff" toneMapped={false} depthTest={false} transparent />
    </instancedMesh>
  );
}

// ---------- X-ray fade ----------

type Snapshot = { opacity: number; transparent: boolean; depthWrite: boolean };

/**
 * Fades every material under `target` to 12% over 400 ms while X-ray is on, and back. It touches
 * materials ONLY while X-ray is on or animating: on the way in it snapshots each material's own
 * opacity/transparent/depthWrite (once per material, so shared materials are never compounded), picks
 * up meshes mounted mid-X-ray, and on reaching 0 restores the exact snapshot and forgets everything.
 */
export function XrayFade({
  target,
  xray,
}: {
  target: React.RefObject<THREE.Group | null>;
  xray: boolean;
}): null {
  const saved = useRef(new Map<THREE.Material, Snapshot>());
  const k = useRef(0);
  useFrame((state, dt) => {
    const goal = xray ? 1 : 0;
    if (k.current === 0 && goal === 0) return; // idle: never touch materials
    if (paused(state)) return;
    const g = target.current;
    if (!g) return;
    const step = reducedMotion ? 1 : dt / 0.4;
    k.current =
      goal > k.current ? Math.min(goal, k.current + step) : Math.max(goal, k.current - step);
    fadeTree(g, saved.current, k.current);
  });
  return null;
}

function fadeTree(g: THREE.Object3D, saved: Map<THREE.Material, Snapshot>, k: number): void {
  if (k === 0) {
    for (const [m, snap] of saved) {
      m.opacity = snap.opacity;
      m.depthWrite = snap.depthWrite;
      if (m.transparent !== snap.transparent) {
        m.transparent = snap.transparent;
        m.needsUpdate = true;
      }
    }
    saved.clear();
    return;
  }
  g.traverse((o) => {
    const mat = (o as THREE.Mesh).material;
    if (!mat) return;
    for (const m of Array.isArray(mat) ? mat : [mat]) {
      let snap = saved.get(m);
      if (!snap) {
        snap = { opacity: m.opacity, transparent: m.transparent, depthWrite: m.depthWrite };
        saved.set(m, snap);
      }
      m.opacity = snap.opacity * (1 - k * 0.88);
      m.depthWrite = false;
      if (!m.transparent) {
        m.transparent = true;
        m.needsUpdate = true;
      }
    }
  });
}

// ---------- suspected rings + amber drips ----------

export function SuspectEffects({
  sectorStatus,
}: {
  sectorStatus: Record<SectorId, SectorStatus>;
}): JSX.Element {
  const suspects = SECTORS.filter(
    (s) => sectorStatus[s.id] === "suspected" || sectorStatus[s.id] === "watch",
  );
  return (
    <group>
      {suspects.map((s) => (
        <SuspectRing
          key={s.id}
          x={s.centroid.x}
          z={s.centroid.z}
          r={Math.min(s.box.xMax - s.box.xMin, s.box.zMax - s.box.zMin) * 0.42}
          inlet={s.inlet}
        />
      ))}
    </group>
  );
}

function SuspectRing({
  x,
  z,
  r,
  inlet,
}: {
  x: number;
  z: number;
  r: number;
  inlet: P;
}): JSX.Element {
  const ring = useRef<THREE.Mesh>(null);
  const drips = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const N = 10;
  useFrame(({ clock }) => {
    if (document.hidden || reducedMotion) return;
    const t = clock.elapsedTime;
    const m = ring.current;
    if (m) {
      const s = 1 + 0.08 * Math.sin(t * 3);
      m.scale.set(s, s, 1);
      (m.material as THREE.MeshBasicMaterial).opacity = 0.55 + 0.3 * Math.sin(t * 3);
    }
    const d = drips.current;
    if (!d) return;
    // amber drips along the WHOLE service pipe (avenue → inlet): area known, never a point
    for (let i = 0; i < N; i += 1) {
      const f = i / (N - 1);
      const phase = (t * 0.9 + i * 0.37) % 1;
      dummy.position.set(AVENUE_X + (inlet.x - AVENUE_X) * f, 1.4 - phase * 1.2, inlet.z);
      const sc = 0.32 * (1 - phase * 0.5);
      dummy.scale.set(sc, sc, sc);
      dummy.updateMatrix();
      d.setMatrixAt(i, dummy.matrix);
    }
    d.instanceMatrix.needsUpdate = true;
  });
  return (
    <group>
      <mesh ref={ring} position={[x, 0.3, z]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[r * 0.9, r, 40]} />
        <meshBasicMaterial color={HEX.haldi} transparent opacity={0.7} toneMapped={false} />
      </mesh>
      {!reducedMotion && (
        <instancedMesh ref={drips} args={[undefined, undefined, N]} frustumCulled={false}>
          <boxGeometry args={[1, 1, 1]} />
          <meshBasicMaterial color={HEX.haldi} toneMapped={false} />
        </instancedMesh>
      )}
    </group>
  );
}

// ---------- visible leaks: fountain + puddle; confirmed "!" ----------

const ACTIVE = new Set(["open", "dispatched", "onsite", "reopened"]);

export function LeakEffects({ incidents }: { incidents: readonly IncidentView[] }): JSX.Element {
  return (
    <group>
      {incidents.map((inc) => {
        const active = ACTIVE.has(inc.status);
        const visible = inc.kind !== "hidden";
        return (
          <group key={inc.id}>
            {visible && <Puddle x={inc.pin.x} z={inc.pin.z} draining={!active} />}
            {visible && active && !reducedMotion && <Fountain x={inc.pin.x} z={inc.pin.z} />}
            {inc.verdict === "CONFIRMED" && active && <Bang x={inc.pin.x} z={inc.pin.z} />}
            {inc.status === "verified" && (
              <VerifiedBurst x={inc.pin.x} z={inc.pin.z} litres={inc.recoveredLitresPerDay} />
            )}
          </group>
        );
      })}
    </group>
  );
}

function Fountain({ x, z }: { x: number; z: number }): JSX.Element {
  const ref = useRef<THREE.InstancedMesh>(null);
  const N = 40;
  const seeds = useMemo(
    () =>
      [...Array(N).keys()].map((i) => ({
        a: (i * 2.399) % (Math.PI * 2),
        v: 0.6 + ((i * 7) % 10) / 25,
        o: i / N,
      })),
    [],
  );
  const dummy = useMemo(() => new THREE.Object3D(), []);
  useFrame(({ clock }) => {
    const m = ref.current;
    if (!m || document.hidden) return;
    const t = clock.elapsedTime;
    for (let i = 0; i < N; i += 1) {
      const s = seeds[i];
      if (!s) continue;
      const ph = (t * 0.9 + s.o) % 1; // ballistic arc, 1.1 s life
      const r = ph * 1.6 * s.v;
      dummy.position.set(
        x + Math.cos(s.a) * r,
        0.3 + 4.2 * s.v * ph - 4.6 * ph * ph,
        z + Math.sin(s.a) * r,
      );
      dummy.scale.setScalar(0.28);
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
    }
    m.instanceMatrix.needsUpdate = true;
  });
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, N]} frustumCulled={false}>
      <boxGeometry args={[1, 1, 1]} />
      <meshBasicMaterial color="#7fe6ff" toneMapped={false} />
    </instancedMesh>
  );
}

function Puddle({ x, z, draining }: { x: number; z: number; draining: boolean }): JSX.Element {
  const ref = useRef<THREE.Mesh>(null);
  const size = useRef(0.4);
  useFrame((state, dt) => {
    const m = ref.current;
    if (!m || paused(state)) return;
    // grows while leaking (max ~4 tiles), drains after the repair
    size.current = draining
      ? Math.max(0, size.current - dt * 0.8)
      : Math.min(4, size.current + dt * (reducedMotion ? 10 : 0.5));
    m.scale.set(size.current, size.current, 1);
    m.visible = size.current > 0.02;
  });
  return (
    <mesh ref={ref} position={[x, 0.2, z]} rotation={[-Math.PI / 2, 0, 0]}>
      <circleGeometry args={[1, 24]} />
      <meshStandardMaterial color="#2fb6e0" transparent opacity={0.75} roughness={0.1} />
    </mesh>
  );
}

function Bang({ x, z }: { x: number; z: number }): JSX.Element {
  const ref = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (!ref.current || reducedMotion) return;
    ref.current.position.y = 9 + Math.abs(Math.sin(clock.elapsedTime * 3)) * 1.2;
  });
  return (
    <group ref={ref} position={[x, 9, z]} scale={[1.7, 1.7, 1.7]}>
      <mesh position={[0, 1.1, 0]}>
        <boxGeometry args={[0.7, 1.8, 0.7]} />
        <meshBasicMaterial color={HEX.sindoor} toneMapped={false} />
      </mesh>
      <mesh position={[0, -0.3, 0]}>
        <boxGeometry args={[0.7, 0.6, 0.7]} />
        <meshBasicMaterial color={HEX.sindoor} toneMapped={false} />
      </mesh>
    </group>
  );
}

function VerifiedBurst({
  x,
  z,
  litres,
}: {
  x: number;
  z: number;
  litres?: number;
}): JSX.Element | null {
  const [done, setDone] = useState(false);
  useEffect(() => {
    const h = setTimeout(() => setDone(true), 3200);
    return () => clearTimeout(h);
  }, []);
  if (done) return null;
  return <VerifiedBurstFx x={x} z={z} litres={litres} />;
}

function VerifiedBurstFx({ x, z, litres }: { x: number; z: number; litres?: number }): JSX.Element {
  const ring = useRef<THREE.Mesh>(null);
  const text = useRef<HTMLDivElement>(null);
  const t0 = useRef<number | null>(null);
  useFrame(({ clock }) => {
    t0.current ??= clock.elapsedTime;
    const k = Math.min(1, (clock.elapsedTime - t0.current) / 3);
    const m = ring.current;
    if (m) {
      const s = 1 + k * 10;
      m.scale.set(s, s, 1);
      (m.material as THREE.MeshBasicMaterial).opacity = 0.9 * (1 - k);
      m.visible = k < 1;
    }
    if (text.current) {
      text.current.style.transform = `translateY(${-k * 40}px)`;
      text.current.style.opacity = String(k < 0.7 ? 1 : (1 - k) / 0.3);
    }
  });
  return (
    <group>
      <mesh ref={ring} position={[x, 0.35, z]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.8, 1, 40]} />
        <meshBasicMaterial color={HEX.neem} transparent toneMapped={false} />
      </mesh>
      {
        <Html position={[x, 7, z]} center pointerEvents="none" zIndexRange={[20, 10]}>
          <div
            ref={text}
            className={styles.label}
            style={{ borderColor: HEX.neem, color: HEX.neem }}
          >
            {litres ? `+${lakh(litres)} L/day` : "Verified by meters"}
          </div>
        </Html>
      }
    </group>
  );
}

// ---------- crew truck ----------

function nearest(vals: readonly number[], v: number): number {
  let best = vals[0] ?? v;
  for (const x of vals) if (Math.abs(x - v) < Math.abs(best - v)) best = x;
  return best;
}

/** A road-following route from a to b: onto a street-x, along to the target's street-z, across, in. */
function route(a: P, b: P): P[] {
  const sx = nearest(STREETS_X, a.x);
  const sz = nearest(STREETS_Z, b.z);
  return [a, { x: sx, z: a.z }, { x: sx, z: sz }, { x: b.x, z: sz }, b];
}

export function CrewTruck({ crew }: { crew: CrewMarker | undefined }): JSX.Element {
  const group = useRef<THREE.Group>(null);
  const beacon = useRef<THREE.Mesh>(null);
  const sparks = useRef<THREE.Group>(null);
  const pos = useRef<P>({ x: DEPOT.x + 3, z: DEPOT.z - 4 });
  const path = useRef<P[]>([]);
  const goal = crew ? { x: crew.x, z: crew.z } : { x: DEPOT.x + 3, z: DEPOT.z - 4 };
  const goalKey = `${goal.x.toFixed(2)},${goal.z.toFixed(2)}`;
  useEffect(() => {
    path.current = route(pos.current, goal).slice(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [goalKey]);
  useFrame(({ clock }, dt) => {
    const g = group.current;
    if (!g || document.hidden) return;
    const next = path.current[0];
    if (next) {
      const dx = next.x - pos.current.x;
      const dz = next.z - pos.current.z;
      const d = Math.hypot(dx, dz);
      const step = reducedMotion ? d : Math.min(d, dt * 14);
      if (d < 0.01) path.current.shift();
      else {
        pos.current.x += (dx / d) * step;
        pos.current.z += (dz / d) * step;
        g.rotation.y = Math.atan2(-dz, dx);
      }
    }
    g.position.set(pos.current.x, 0, pos.current.z);
    if (beacon.current)
      beacon.current.visible = !!crew && Math.floor(clock.elapsedTime * 3) % 2 === 0;
    if (sparks.current) {
      sparks.current.visible = !!crew?.repairing && !next;
      sparks.current.rotation.y = clock.elapsedTime * 4;
    }
  });
  return (
    <group ref={group} scale={[2, 2, 2]}>
      {/* body faces +x */}
      <mesh position={[1, 0.75, 0]} castShadow>
        <boxGeometry args={[1.3, 1.2, 1.4]} />
        <meshStandardMaterial color="#f2f5f8" />
      </mesh>
      <mesh position={[1.45, 0.95, 0]}>
        <boxGeometry args={[0.42, 0.5, 1.2]} />
        <meshStandardMaterial color="#2b3a52" />
      </mesh>
      <mesh position={[-0.6, 0.85, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <cylinderGeometry args={[0.7, 0.7, 2, 12]} />
        <meshStandardMaterial color="#1f6fd1" />
      </mesh>
      {[-1.1, 0.9].map((wx) =>
        [-0.72, 0.72].map((wz) => (
          <mesh key={`${wx}${wz}`} position={[wx, 0.28, wz]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.28, 0.28, 0.2, 10]} />
            <meshStandardMaterial color="#111" />
          </mesh>
        )),
      )}
      <mesh ref={beacon} position={[1, 1.5, 0]}>
        <boxGeometry args={[0.35, 0.3, 0.35]} />
        <meshBasicMaterial color={HEX.haldi} toneMapped={false} />
      </mesh>
      <group ref={sparks} position={[2.4, 0.8, 0]} visible={false}>
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <mesh key={i} position={[Math.cos(i) * 0.7, 0.3 + (i % 3) * 0.35, Math.sin(i) * 0.7]}>
            <boxGeometry args={[0.18, 0.18, 0.18]} />
            <meshBasicMaterial color="#fff2a8" toneMapped={false} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

// ---------- report pins ----------

export function reportChip(r: RecentReport): string {
  if (r.source !== "phone") return "Simulated report";
  if (r.type === "low_water") return "Phone report · low water";
  const label = r.label ? ` · ${labelWord(r.label)}` : "";
  const conf = r.confidence ? ` ${Math.round(r.confidence * 100)}%` : "";
  return `Phone photo${label}${conf}`;
}

type PinCluster = { x: number; z: number; reports: RecentReport[] };

/** Greedy clustering: reports within ~4 units share one marker. */
export function clusterReports(reports: readonly RecentReport[], radius = 4): PinCluster[] {
  const out: PinCluster[] = [];
  for (const r of reports) {
    const hit = out.find((c) => Math.hypot(c.x - r.x, c.z - r.z) < radius);
    if (hit) {
      hit.reports.push(r);
      const n = hit.reports.length;
      hit.x += (r.x - hit.x) / n;
      hit.z += (r.z - hit.z) / n;
    } else out.push({ x: r.x, z: r.z, reports: [r] });
  }
  return out;
}

export function ReportPins({
  reports,
  onSelectReport,
}: {
  reports: readonly RecentReport[];
  onSelectReport?: (id: string) => void;
}): JSX.Element {
  // A person + camera flash appears for 3 s at each NEW phone report.
  const seen = useRef<Set<string> | null>(null);
  const [fresh, setFresh] = useState<string[]>([]);
  const [hover, setHover] = useState<string | null>(null);
  useEffect(() => {
    if (seen.current === null) {
      seen.current = new Set(reports.map((r) => r.reportId));
      return;
    }
    const added = reports.filter((r) => r.source === "phone" && !seen.current?.has(r.reportId));
    for (const r of reports) seen.current.add(r.reportId);
    if (added.length === 0) return;
    setFresh((f) => [...f, ...added.map((r) => r.reportId)]);
    const ids = added.map((r) => r.reportId);
    const h = setTimeout(() => setFresh((f) => f.filter((id) => !ids.includes(id))), 3000);
    return () => clearTimeout(h);
  }, [reports]);

  const clusters = useMemo(() => clusterReports(reports), [reports]);

  return (
    <group>
      {clusters.map((c) => {
        const first = c.reports[0];
        if (!first) return null;
        const key = first.reportId;
        const phone = c.reports.some((r) => r.source === "phone");
        const many = c.reports.length > 1;
        const color = phone ? HEX.neel : "#8a96a6";
        const scale = phone ? 1 : 0.7;
        const chip = many ? `${c.reports.length} reports` : reportChip(first);
        const showChip = many || hover === key;
        const pick = c.reports.find((r) => r.source === "phone") ?? first;
        return (
          <group key={key} position={[c.x, 0, c.z]} scale={[scale, scale, scale]}>
            <group
              onPointerOver={(e) => {
                e.stopPropagation();
                setHover(key);
              }}
              onPointerOut={() => setHover((h) => (h === key ? null : h))}
              onClick={(e) => {
                e.stopPropagation();
                if (hover !== key) setHover(key); // first tap on touch shows the chip
                onSelectReport?.(pick.reportId);
              }}
            >
              <mesh position={[0, 1.2, 0]} castShadow>
                <boxGeometry args={[0.18, 2.4, 0.18]} />
                <meshStandardMaterial color={color} roughness={0.85} />
              </mesh>
              {/* icon head: a camera (photo) or a tap (low water) */}
              {first.type === "leak_photo" ? (
                <group position={[0, 2.8, 0]}>
                  <mesh>
                    <boxGeometry args={[1, 0.7, 0.5]} />
                    <meshStandardMaterial color={color} roughness={0.85} />
                  </mesh>
                  <mesh position={[0, 0, 0.28]} rotation={[Math.PI / 2, 0, 0]}>
                    <cylinderGeometry args={[0.22, 0.22, 0.12, 12]} />
                    <meshStandardMaterial color="#f2f5f8" roughness={0.3} />
                  </mesh>
                </group>
              ) : (
                <group position={[0, 2.8, 0]}>
                  <mesh>
                    <boxGeometry args={[0.9, 0.3, 0.3]} />
                    <meshStandardMaterial color={color} roughness={0.85} />
                  </mesh>
                  <mesh position={[0.35, -0.3, 0]}>
                    <boxGeometry args={[0.2, 0.4, 0.2]} />
                    <meshStandardMaterial color={color} roughness={0.85} />
                  </mesh>
                </group>
              )}
            </group>
            {showChip && (
              <Html position={[0, 4, 0]} center zIndexRange={[15, 5]} pointerEvents="none">
                <span
                  className={styles.label}
                  style={{ borderColor: color, color: phone ? undefined : "#c3ccd8" }}
                >
                  {chip}
                </span>
              </Html>
            )}
            {c.reports.some((r) => fresh.includes(r.reportId)) && <Photographer />}
          </group>
        );
      })}
    </group>
  );
}

function Photographer(): JSX.Element {
  const flash = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (flash.current) flash.current.visible = Math.floor(clock.elapsedTime * 2) % 3 === 0;
  });
  return (
    <group position={[1.4, 0, 1.2]}>
      <mesh position={[0, 0.45, 0]}>
        <boxGeometry args={[0.5, 0.9, 0.35]} />
        <meshStandardMaterial color="#d2683c" />
      </mesh>
      <mesh position={[0, 1.15, 0]}>
        <boxGeometry args={[0.38, 0.38, 0.38]} />
        <meshStandardMaterial color="#8a5a3c" />
      </mesh>
      <mesh ref={flash} position={[-0.4, 1.1, -0.3]}>
        <sphereGeometry args={[0.45, 10, 8]} />
        <meshBasicMaterial color="#ffffff" toneMapped={false} />
      </mesh>
    </group>
  );
}
