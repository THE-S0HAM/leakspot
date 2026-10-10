// Deterministic 3D city geometry generated from @leakspot/core/world only (no leaks, seed 42), so the
// 3D city, the SVG map and the engine always agree. Produces typed buildings (house/apartment/shop),
// per-building window/tank flags, the road grid (from scenario-jaldhara.md streets) and tree spots.
// Pure data; City3D turns it into instanced meshes. 1 world unit = 10 m; y is up.

import { SECTORS, type Sector, type ZoneId } from "@leakspot/core/world";

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type BuildingType = "house" | "apartment" | "shop";

export type Building3D = {
  /** centre x, z in world units */
  cx: number;
  cz: number;
  /** footprint width (x) and depth (z) */
  w: number;
  d: number;
  /** floors (1 floor ≈ 1 world unit tall) */
  floors: number;
  type: BuildingType;
  zone: ZoneId;
  /** has a black rooftop water tank */
  tank: boolean;
  /** 0..1 seeded value → whether its windows glow at night */
  glowSeed: number;
};

// Per-zone building mix and floor ranges (scenario-jaldhara.md zone styles).
const ZONE_SPEC: Record<ZoneId, { floors: [number, number]; types: BuildingType[] }> = {
  A: { floors: [2, 3], types: ["house", "house", "shop"] }, // Old City, dense low
  B: { floors: [1, 4], types: ["shop", "shop", "house"] }, // Market with shop rows
  C: { floors: [2, 5], types: ["house", "apartment", "house"] }, // Hospital Road
  D: { floors: [5, 8], types: ["apartment", "apartment", "house"] }, // New Colony towers
};

const COLS = 3;
const ROWS = 3;
const GAP = 1.4;

function pick<T>(rng: () => number, arr: readonly T[]): T {
  return arr[Math.floor(rng() * arr.length)] as T;
}

/** Build every sector's 3D buildings once (seed 42). Landmarks (hospital/school/depot) are separate. */
export type Garden = { cx: number; cz: number; w: number; d: number };

export function buildCity3D(
  seed = 42,
): { sector: Sector; buildings: Building3D[]; gardens: Garden[] }[] {
  const rng = mulberry32(seed);
  return SECTORS.map((sector) => {
    const spec = ZONE_SPEC[sector.zone];
    const { xMin, xMax, zMin, zMax } = sector.box;
    const cellW = (xMax - xMin - GAP * (COLS + 1)) / COLS;
    const cellD = (zMax - zMin - GAP * (ROWS + 1)) / ROWS;
    const buildings: Building3D[] = [];
    const gardens: Garden[] = [];
    for (let r = 0; r < ROWS; r += 1) {
      for (let c = 0; c < COLS; c += 1) {
        const cx = xMin + GAP * (c + 1) + cellW * c + cellW / 2;
        const cz = zMin + GAP * (r + 1) + cellD * r + cellD / 2;
        if (rng() < 0.14) {
          // an empty plot becomes a garden (lawn + trees)
          gardens.push({ cx, cz, w: cellW * 0.9, d: cellD * 0.9 });
          continue;
        }
        const w = cellW * (0.72 + rng() * 0.22);
        const d = cellD * (0.72 + rng() * 0.22);
        const type = pick(rng, spec.types);
        const [fMin, fMax] = spec.floors;
        const floors = type === "shop" ? 1 : fMin + Math.floor(rng() * (fMax - fMin + 1));
        buildings.push({
          cx,
          cz,
          w,
          d,
          floors,
          type,
          zone: sector.zone,
          tank: type !== "shop" && rng() < 0.8,
          glowSeed: rng(),
        });
      }
    }
    return { sector, buildings, gardens };
  });
}

// Road grid from scenario-jaldhara.md. Avenues (x=50, z=56) are wider.
const STREETS_X = [2, 25, 50, 75, 98];
const STREETS_Z = [12, 34, 56, 78, 101];
const AVENUE_X = 50;
const AVENUE_Z = 56;
const WIDE = 4;
const NARROW = 2.4;

export type Road = { cx: number; cz: number; w: number; d: number; horizontal: boolean };

/** Road strips as flat boxes along the street grid. Junctions overlap (fine for flat quads). */
export function buildRoads(): Road[] {
  const roads: Road[] = [];
  const zSpan = 104;
  const xSpan = 100;
  for (const x of STREETS_X) {
    roads.push({
      cx: x,
      cz: zSpan / 2,
      w: x === AVENUE_X ? WIDE : NARROW,
      d: zSpan,
      horizontal: false,
    });
  }
  for (const z of STREETS_Z) {
    roads.push({
      cx: xSpan / 2,
      cz: z,
      w: xSpan,
      d: z === AVENUE_Z ? WIDE : NARROW,
      horizontal: true,
    });
  }
  return roads;
}

/** Junction centres (every street-x × street-z crossing) for zebra crossings. */
export function junctions(): { x: number; z: number }[] {
  const out: { x: number; z: number }[] = [];
  for (const x of STREETS_X) for (const z of STREETS_Z) out.push({ x, z });
  return out;
}

/** Tree spots along the inner streets and in the park, seeded so they never land on a road centre. */
export function treeSpots(seed = 7): { x: number; z: number }[] {
  const rng = mulberry32(seed);
  const spots: { x: number; z: number }[] = [];
  for (const x of [25, 75]) {
    for (let z = 16; z < 100; z += 10) {
      spots.push({ x: x + (rng() - 0.5) * 2, z: z + (rng() - 0.5) * 4 });
    }
  }
  // a small park cluster in the C2 yard area
  for (let i = 0; i < 6; i += 1) {
    spots.push({ x: 34 + rng() * 10, z: 62 + rng() * 10 });
  }
  return spots;
}
