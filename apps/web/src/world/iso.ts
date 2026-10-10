// Isometric projection helpers for CityView. World coordinates are x (east 0–100) and z (south 0–104);
// we project to 2D screen space with a 2:1 isometric transform. Height lifts a point up the screen.
// The viewBox is computed from the projected bounds of everything drawn (+ padding) so the whole city
// always fits, with no clipping and no empty gutter. Pure math, no React.

import { RESERVOIR, SECTORS, WORLD_BOUNDS } from "@leakspot/core/world";

export type Iso = { sx: number; sy: number };

// Tile size in screen px per world unit along each iso axis.
export const ISO_X = 5.2;
export const ISO_Y = 2.7;
export const HEIGHT_UNIT = 4.4; // screen px lifted per unit of block height

// Max block height anything reaches in world units (tallest building ~7, facility poles 3, lifted tanks).
const MAX_HEIGHT = 8;
const PAD = 28;

/** Project a world point (x, z) at a given height to raw screen coordinates (pre-viewBox origin). */
function raw(x: number, z: number, height = 0): Iso {
  return { sx: (x - z) * ISO_X, sy: (x + z) * ISO_Y - height * HEIGHT_UNIT };
}

// Compute the projected bounding box of the whole world (ground corners + tallest roofs), once.
const BOUNDS = (() => {
  const pts: Iso[] = [];
  const { xMin, xMax, zMin, zMax } = WORLD_BOUNDS;
  for (const h of [0, MAX_HEIGHT]) {
    pts.push(raw(xMin, zMin, h), raw(xMax, zMin, h), raw(xMax, zMax, h), raw(xMin, zMax, h));
  }
  // Include every sector inlet and the reservoir so markers near edges are never clipped.
  for (const s of SECTORS) pts.push(raw(s.inlet.x, s.inlet.z, 0));
  pts.push(raw(RESERVOIR.x, RESERVOIR.z, 0));
  const minX = Math.min(...pts.map((p) => p.sx));
  const maxX = Math.max(...pts.map((p) => p.sx));
  const minY = Math.min(...pts.map((p) => p.sy));
  const maxY = Math.max(...pts.map((p) => p.sy));
  return { minX, maxX, minY, maxY };
})();

// Screen origin that places the projected world inside the viewBox with uniform padding.
export const ORIGIN_X = PAD - BOUNDS.minX;
export const ORIGIN_Y = PAD - BOUNDS.minY;

export const VIEW_W = BOUNDS.maxX - BOUNDS.minX + PAD * 2;
export const VIEW_H = BOUNDS.maxY - BOUNDS.minY + PAD * 2;

/** The base viewBox string that fits the whole city. CityView may animate a different one for pan. */
export const BASE_VIEWBOX = `0 0 ${VIEW_W} ${VIEW_H}`;

/** Project a world point (x, z) at a given height to viewBox coordinates. */
export function project(x: number, z: number, height = 0): Iso {
  return { sx: ORIGIN_X + (x - z) * ISO_X, sy: ORIGIN_Y + (x + z) * ISO_Y - height * HEIGHT_UNIT };
}

/** The four top-face corners of an axis-aligned world box, projected (for a ground tile / roof). */
export function faceTop(
  xMin: number,
  xMax: number,
  zMin: number,
  zMax: number,
  height = 0,
): string {
  const a = project(xMin, zMin, height);
  const b = project(xMax, zMin, height);
  const c = project(xMax, zMax, height);
  const d = project(xMin, zMax, height);
  return `${a.sx},${a.sy} ${b.sx},${b.sy} ${c.sx},${c.sy} ${d.sx},${d.sy}`;
}
