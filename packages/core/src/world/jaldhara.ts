// Jaldhara layout: zones, sectors, inlet meters, facilities and the trunk main.
// Pure typed data, NO leaks and NO scripted reports — those live only in sim/. This module is published
// to the web app as @leakspot/core/world, so it must stay free of ground truth.
// Coordinates: 1 unit = 10 m; x east 0–100, z south 0–104.

export type Point = { x: number; z: number };

export type ZoneId = "A" | "B" | "C" | "D";
export type SectorId = `${ZoneId}${1 | 2 | 3 | 4}`;

export type Sector = {
  id: SectorId;
  zone: ZoneId;
  /** Inclusive-min, exclusive-max box in world units. */
  box: { xMin: number; xMax: number; zMin: number; zMax: number };
  centroid: Point;
  /** Inlet meter at the midpoint of the sector edge closest to the central avenue (x = 50). */
  inlet: Point;
  connections: number;
  /** Background loss b (fraction 0–1). */
  backgroundLoss: number;
};

export type Facility = { kind: "hospital" | "school" | "depot"; at: Point; sector?: SectorId };

export const RESERVOIR: Point = { x: 50, z: 5 };
/** Trunk main segment under the central avenue. */
export const TRUNK_MAIN: { from: Point; to: Point } = {
  from: { x: 50, z: 8 },
  to: { x: 50, z: 100 },
};
export const WORLD_BOUNDS = { xMin: 0, xMax: 100, zMin: 0, zMax: 104 } as const;
export const BUILDING_METERS_PER_SECTOR = 15;

type SectorSpec = { id: SectorId; connections: number; backgroundLoss: number };

// Per-sector connections and background loss. Order fixed for determinism.
const SECTOR_SPECS: readonly SectorSpec[] = [
  { id: "A1", connections: 240, backgroundLoss: 0.14 },
  { id: "A2", connections: 320, backgroundLoss: 0.16 },
  { id: "A3", connections: 300, backgroundLoss: 0.15 },
  { id: "A4", connections: 280, backgroundLoss: 0.17 },
  { id: "B1", connections: 360, backgroundLoss: 0.13 },
  { id: "B2", connections: 400, backgroundLoss: 0.15 },
  { id: "B3", connections: 420, backgroundLoss: 0.18 },
  { id: "B4", connections: 380, backgroundLoss: 0.14 },
  { id: "C1", connections: 340, backgroundLoss: 0.16 },
  { id: "C2", connections: 300, backgroundLoss: 0.12 },
  { id: "C3", connections: 500, backgroundLoss: 0.15 },
  { id: "C4", connections: 360, backgroundLoss: 0.19 },
  { id: "D1", connections: 440, backgroundLoss: 0.13 },
  { id: "D2", connections: 420, backgroundLoss: 0.15 },
  { id: "D3", connections: 400, backgroundLoss: 0.16 },
  { id: "D4", connections: 320, backgroundLoss: 0.14 },
];

// Zone origin (top-left of the zone) in world units. Zones are 42 wide (x) and 40 tall (z);
// each 2x2 sector is 20 x 19 within it (A1 x4–24 z14–33, C3 x4–24 z79–98).
const ZONE_ORIGIN: Record<ZoneId, { x: number; z: number }> = {
  A: { x: 4, z: 14 },
  B: { x: 54, z: 14 },
  C: { x: 4, z: 58 },
  D: { x: 54, z: 58 },
};

const SECTOR_W = 20;
const SECTOR_H = 19;
// Horizontal gap between the two sector columns and vertical gap between the two rows inside a zone,
// chosen so the documented sector boxes line up (A1 x4–24, A2 x26–46; z14–33 top, z79–98 bottom in C).
const COL_GAP = 2;
const ROW_GAP = 2;

function zoneOf(id: SectorId): ZoneId {
  return id[0] as ZoneId;
}

function quadrant(id: SectorId): 1 | 2 | 3 | 4 {
  return Number(id[1]) as 1 | 2 | 3 | 4;
}

function buildSector(spec: SectorSpec): Sector {
  const zone = zoneOf(spec.id);
  const origin = ZONE_ORIGIN[zone];
  const q = quadrant(spec.id);
  const col = q === 1 || q === 3 ? 0 : 1; // 1,3 left; 2,4 right
  const row = q === 1 || q === 2 ? 0 : 1; // 1,2 top; 3,4 bottom
  const xMin = origin.x + col * (SECTOR_W + COL_GAP);
  const zMin = origin.z + row * (SECTOR_H + ROW_GAP);
  const box = { xMin, xMax: xMin + SECTOR_W, zMin, zMax: zMin + SECTOR_H };
  const centroid: Point = { x: xMin + SECTOR_W / 2, z: zMin + SECTOR_H / 2 };
  // Inlet at the midpoint of the vertical edge nearest the central avenue (x = 50).
  const inletX = centroid.x < 50 ? box.xMax : box.xMin;
  const inlet: Point = { x: inletX, z: centroid.z };
  return {
    id: spec.id,
    zone,
    box,
    centroid,
    inlet,
    connections: spec.connections,
    backgroundLoss: spec.backgroundLoss,
  };
}

export const SECTORS: readonly Sector[] = SECTOR_SPECS.map(buildSector);

export const SECTOR_BY_ID: Readonly<Record<SectorId, Sector>> = Object.freeze(
  Object.fromEntries(SECTORS.map((s) => [s.id, s])) as Record<SectorId, Sector>,
);

export const FACILITIES: readonly Facility[] = [
  { kind: "hospital", at: { x: 12, z: 94 }, sector: "C3" },
  { kind: "school", at: { x: 55, z: 32 }, sector: "B1" },
  { kind: "depot", at: { x: 14, z: 102 } },
];

export const TOTAL_CONNECTIONS = SECTORS.reduce((sum, s) => sum + s.connections, 0);

/** Euclidean distance in world units. */
export function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

/** The sector whose box contains (x, z), or undefined if the point is outside every sector. */
export function sectorAt(x: number, z: number): Sector | undefined {
  return SECTORS.find(
    (s) => x >= s.box.xMin && x < s.box.xMax && z >= s.box.zMin && z < s.box.zMax,
  );
}

/** Shortest distance from a point to the (vertical) trunk-main segment. */
export function distanceToTrunkMain(p: Point): number {
  const { from, to } = TRUNK_MAIN;
  const zClamped = Math.max(from.z, Math.min(to.z, p.z));
  return Math.hypot(p.x - from.x, p.z - zClamped);
}

/** Is (x, z) within the world bounds? */
export function inWorld(x: number, z: number): boolean {
  return (
    x >= WORLD_BOUNDS.xMin &&
    x <= WORLD_BOUNDS.xMax &&
    z >= WORLD_BOUNDS.zMin &&
    z <= WORLD_BOUNDS.zMax
  );
}
