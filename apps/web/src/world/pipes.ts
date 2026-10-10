// The water network geometry for CityView, derived from @leakspot/core/world (no leaks). Trunk main
// down the central avenue, two zone mains along the cross avenues, and one service pipe from the main
// to each sector's inlet meter. Pure 2D polylines in world coordinates; CityView projects them.

import { RESERVOIR, SECTORS, TRUNK_MAIN, type SectorId } from "@leakspot/core/world";

export type Segment = { a: { x: number; z: number }; b: { x: number; z: number } };
export type ServicePipe = { sectorId: SectorId; seg: Segment };

const AVENUE_X = 50;
// Cross-avenue z-lines the zone mains follow (scenario-jaldhara.md streets z = 34 and z = 78 run
// through the sector rows; we branch each inlet off the avenue at the inlet's own z).
export const TRUNK: Segment = {
  a: { x: RESERVOIR.x, z: RESERVOIR.z },
  b: { x: TRUNK_MAIN.to.x, z: TRUNK_MAIN.to.z },
};

/** One service pipe per sector: from the avenue (at the inlet's z) to the sector inlet meter. */
export const SERVICE_PIPES: ServicePipe[] = SECTORS.map((s) => ({
  sectorId: s.id,
  seg: { a: { x: AVENUE_X, z: s.inlet.z }, b: { x: s.inlet.x, z: s.inlet.z } },
}));

/** Zone mains: horizontal runs along the avenue spanning each zone's two inlet rows. */
export const ZONE_MAINS: Segment[] = (() => {
  const zs = [...new Set(SECTORS.map((s) => s.inlet.z))].sort((a, b) => a - b);
  // A short horizontal tick on the avenue at each inlet row keeps the trunk visually "fed".
  return zs.map((z) => ({ a: { x: AVENUE_X - 1, z }, b: { x: AVENUE_X + 1, z } }));
})();
