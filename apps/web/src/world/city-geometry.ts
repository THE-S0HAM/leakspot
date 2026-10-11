// Deterministic building layout for CityView, generated from @leakspot/core/world only (no leaks).
// A small local seeded RNG (seed 42) places stacked-block buildings on a grid inside each sector, with
// per-zone floor ranges. Pure; the same seed yields the same city every time.

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

// Per-zone building style: floor range (height in world units) and roof-fill token.
const ZONE_FLOORS: Record<ZoneId, [number, number]> = {
  A: [1, 3], // Old City, dense low
  B: [2, 4], // Market
  C: [2, 5], // Hospital Road
  D: [4, 7], // New Colony apartment blocks
};

export type Building = {
  x: number;
  z: number;
  w: number;
  d: number;
  height: number; // world units (1 floor ≈ 1 unit)
  zone: ZoneId;
};

export type SectorBuildings = { sector: Sector; buildings: Building[] };

const COLS = 3;
const ROWS = 3;
const GAP = 1.2;

/** Build the full city's buildings once (seed 42). */
export function buildCity(seed = 42): SectorBuildings[] {
  const rng = mulberry32(seed);
  return SECTORS.map((sector) => {
    const [floMin, floMax] = ZONE_FLOORS[sector.zone];
    const { xMin, xMax, zMin, zMax } = sector.box;
    const cellW = (xMax - xMin - GAP * (COLS + 1)) / COLS;
    const cellD = (zMax - zMin - GAP * (ROWS + 1)) / ROWS;
    const buildings: Building[] = [];
    for (let r = 0; r < ROWS; r += 1) {
      for (let c = 0; c < COLS; c += 1) {
        // skip ~15% of cells for streets/variation
        if (rng() < 0.15) continue;
        const w = cellW * (0.7 + rng() * 0.25);
        const d = cellD * (0.7 + rng() * 0.25);
        const bx = xMin + GAP * (c + 1) + cellW * c + (cellW - w) / 2;
        const bz = zMin + GAP * (r + 1) + cellD * r + (cellD - d) / 2;
        const height = floMin + Math.floor(rng() * (floMax - floMin + 1));
        buildings.push({ x: bx, z: bz, w, d, height, zone: sector.zone });
      }
    }
    return { sector, buildings };
  });
}

/** Zone roof/wall tint tokens (from the building-style palette, kept subtle under the status overlay). */
export const ZONE_TINT: Record<ZoneId, { wall: string; roof: string }> = {
  A: { wall: "#5b4a3a", roof: "#6f5a46" }, // sandstone
  B: { wall: "#7a4433", roof: "#935442" }, // terracotta
  C: { wall: "#4a5a63", roof: "#5d7079" }, // whitewash (muted at night)
  D: { wall: "#3c4a63", roof: "#4a5b78" }, // slate-blue
};
