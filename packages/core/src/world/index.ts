// Public entry for @leakspot/core/world: the Jaldhara layout only (no leaks, no scripted reports),
// safe to ship in the web bundle. A bundle test fails if any scripted leak id/position leaks here.

export type { Point, ZoneId, SectorId, Sector, Facility } from "./jaldhara";
export {
  RESERVOIR,
  TRUNK_MAIN,
  WORLD_BOUNDS,
  BUILDING_METERS_PER_SECTOR,
  SECTORS,
  SECTOR_BY_ID,
  FACILITIES,
  TOTAL_CONNECTIONS,
  distance,
  sectorAt,
  distanceToTrunkMain,
  inWorld,
} from "./jaldhara";
