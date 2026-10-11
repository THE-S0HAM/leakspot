// Landmark placement for City3D, in one place so the scene, the plot generator (no building on a
// landmark) and the road tests agree. All footprints sit inside plots or on the slab margin, never on
// a road. The depot sits on the south margin, its door facing the z=101 street where the truck parks.

import { FACILITIES } from "@leakspot/core/world";
import type { RoadRect, P } from "./roads";

const HOSPITAL_AT = FACILITIES.find((f) => f.kind === "hospital")?.at ?? { x: 12, z: 94 };

export const HOSPITAL = { x: HOSPITAL_AT.x, z: HOSPITAL_AT.z - 1.5, w: 7, d: 6 };
export const SCHOOL = { x: 58, z: 29, w: 6, d: 5 };
export const SCHOOL_GROUND = { x: 64, z: 22, w: 8, d: 5 };
export const PARK = { x: 36, z: 67.5, w: 12, d: 10 };
export const DEPOT = { x: 14, z: 107, w: 7, d: 5 };
/** Where the crew truck parks: on the z=101 street in front of the depot door. */
export const TRUCK_HOME: P = { x: 14, z: 101 };

function rect(l: { x: number; z: number; w: number; d: number }, pad = 0.5): RoadRect {
  return {
    xMin: l.x - l.w / 2 - pad,
    xMax: l.x + l.w / 2 + pad,
    zMin: l.z - l.d / 2 - pad,
    zMax: l.z + l.d / 2 + pad,
  };
}

/** Solid landmark footprints (+ a small pad): no building is generated on them, no vehicle enters. */
export const LANDMARK_FOOTPRINTS: RoadRect[] = [
  rect(HOSPITAL, 1.5),
  rect(SCHOOL),
  rect(SCHOOL_GROUND),
  rect(PARK),
  rect(DEPOT),
];
