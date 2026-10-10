// Isometric projection helpers for CityView. World coordinates are x (east 0–100) and z (south 0–104);
// we project to 2D screen space with a 2:1 isometric transform. Height lifts a point up the screen.
// Pure math, no React.

export type Iso = { sx: number; sy: number };

// Tile size in screen px per world unit along each iso axis. Tuned so the whole 100×104 world fits a
// ~960×620 viewBox; the SVG then scales to any container width (works down to 360 px).
export const ISO_X = 5.2;
export const ISO_Y = 2.7;
export const HEIGHT_UNIT = 4.4; // screen px lifted per unit of block height

// Screen origin so the projected world sits inside the viewBox with margins.
export const ORIGIN_X = 300;
export const ORIGIN_Y = 70;

export const VIEW_W = 960;
export const VIEW_H = 640;

/** Project a world point (x, z) at a given height to screen coordinates. */
export function project(x: number, z: number, height = 0): Iso {
  return {
    sx: ORIGIN_X + (x - z) * ISO_X,
    sy: ORIGIN_Y + (x + z) * ISO_Y - height * HEIGHT_UNIT,
  };
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
