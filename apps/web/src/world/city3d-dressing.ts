// Turns the seeded city (city3d-geometry) into box instances per layer: walls, roof slabs + parapets,
// window panes (a grid on every face), balconies, shop awnings, lift rooms, rooftop tanks, gardens,
// trees, lane dashes, zebra stripes and footpaths. Pure and deterministic (seeded), computed once.

import type { BoxItem } from "./InstancedBoxes";
import type { Building3D, Garden, Road } from "./city3d-geometry";
import { APARTMENT_WALLS, AWNINGS, HOUSE_WALLS, SHOP_WALLS, ZONE_BUILDING } from "./palette";

/** Floor height in world units (1 unit = 10 m, so a 3 m floor would be tiny; exaggerated for read). */
export const FLOOR_H = 1.1;

function pickBy<T>(arr: readonly T[], v: number): T {
  return arr[Math.floor(v * arr.length) % arr.length] as T;
}

export type Dressing = {
  walls: BoxItem[];
  roofs: BoxItem[];
  windows: BoxItem[];
  /** index into `windows` → glows at night (seeded ~40%) */
  windowGlow: boolean[];
  balconies: BoxItem[];
  awnings: BoxItem[];
  tanks: BoxItem[];
  lawns: BoxItem[];
  trunks: BoxItem[];
  canopies: BoxItem[];
};

export function buildingHeight(b: Building3D): number {
  return b.floors * FLOOR_H;
}

export function dressCity(
  buildings: readonly Building3D[],
  gardens: readonly Garden[],
  streetTrees: readonly { x: number; z: number }[],
): Dressing {
  const out: Dressing = {
    walls: [],
    roofs: [],
    windows: [],
    windowGlow: [],
    balconies: [],
    awnings: [],
    tanks: [],
    lawns: [],
    trunks: [],
    canopies: [],
  };
  let wSeed = 0;
  const nextSeed = (): number => {
    // cheap deterministic hash for per-window glow
    wSeed = (wSeed * 9301 + 49297) % 233280;
    return wSeed / 233280;
  };

  for (const b of buildings) {
    const h = buildingHeight(b);
    const wall =
      b.type === "house"
        ? pickBy(HOUSE_WALLS, b.glowSeed)
        : b.type === "apartment"
          ? pickBy(APARTMENT_WALLS, b.glowSeed)
          : pickBy(SHOP_WALLS, b.glowSeed);
    out.walls.push({ p: [b.cx, h / 2, b.cz], s: [b.w, h, b.d], c: wall });

    // roof slab + parapet ring (houses/apartments), plain slab for shops
    const roof = ZONE_BUILDING[b.zone].roof;
    out.roofs.push({ p: [b.cx, h + 0.05, b.cz], s: [b.w, 0.1, b.d], c: "#8c8a86" });
    if (b.type !== "shop") {
      const ph = 0.35;
      const t = 0.18;
      out.roofs.push({ p: [b.cx, h + ph / 2, b.cz - b.d / 2 + t / 2], s: [b.w, ph, t], c: wall });
      out.roofs.push({ p: [b.cx, h + ph / 2, b.cz + b.d / 2 - t / 2], s: [b.w, ph, t], c: wall });
      out.roofs.push({ p: [b.cx - b.w / 2 + t / 2, h + ph / 2, b.cz], s: [t, ph, b.d], c: wall });
      out.roofs.push({ p: [b.cx + b.w / 2 - t / 2, h + ph / 2, b.cz], s: [t, ph, b.d], c: wall });
    } else {
      out.roofs.push({ p: [b.cx, h + 0.12, b.cz], s: [b.w * 1.02, 0.12, b.d * 1.02], c: roof });
    }
    if (b.type === "apartment") {
      // lift room on the roof
      out.roofs.push({
        p: [b.cx + b.w * 0.2, h + 0.6, b.cz + b.d * 0.2],
        s: [b.w * 0.28, 1.2, b.d * 0.28],
        c: wall,
      });
    }
    if (b.tank) {
      out.tanks.push({ p: [b.cx - b.w * 0.22, h + 0.55, b.cz - b.d * 0.22], s: [0.9, 0.9, 0.9] });
    }

    // window grid on all four faces
    const perFloorX = b.type === "apartment" ? Math.max(2, Math.floor(b.w / 1.4)) : 2;
    const perFloorZ = b.type === "apartment" ? Math.max(2, Math.floor(b.d / 1.4)) : 2;
    const firstFloor = b.type === "shop" ? 1 : 0; // shops have shutters, not windows, at street level
    for (let f = firstFloor; f < b.floors; f += 1) {
      const y = f * FLOOR_H + FLOOR_H * 0.55;
      for (let i = 0; i < perFloorX; i += 1) {
        const x = b.cx - b.w / 2 + ((i + 0.5) * b.w) / perFloorX;
        for (const side of [-1, 1]) {
          out.windows.push({ p: [x, y, b.cz + side * (b.d / 2 + 0.02)], s: [0.42, 0.5, 0.04] });
          out.windowGlow.push(nextSeed() < 0.4);
        }
      }
      for (let i = 0; i < perFloorZ; i += 1) {
        const z = b.cz - b.d / 2 + ((i + 0.5) * b.d) / perFloorZ;
        for (const side of [-1, 1]) {
          out.windows.push({ p: [b.cx + side * (b.w / 2 + 0.02), y, z], s: [0.04, 0.5, 0.42] });
          out.windowGlow.push(nextSeed() < 0.4);
        }
      }
    }

    if (b.type === "house" && b.floors >= 2) {
      // small balcony on the first floor, street side (+z)
      out.balconies.push({
        p: [b.cx, FLOOR_H + 0.1, b.cz + b.d / 2 + 0.35],
        s: [b.w * 0.5, 0.12, 0.7],
        c: "#d7d2c8",
      });
      out.balconies.push({
        p: [b.cx, FLOOR_H + 0.4, b.cz + b.d / 2 + 0.68],
        s: [b.w * 0.5, 0.5, 0.06],
        c: "#3b3f46",
      });
    }
    if (b.type === "shop") {
      // coloured awning over the shop front + a grey shutter
      out.awnings.push({
        p: [b.cx, FLOOR_H * 0.85, b.cz + b.d / 2 + 0.45],
        s: [b.w * 0.9, 0.12, 0.9],
        c: pickBy(AWNINGS, (b.glowSeed * 7) % 1),
      });
      out.balconies.push({
        p: [b.cx, FLOOR_H * 0.4, b.cz + b.d / 2 + 0.02],
        s: [b.w * 0.7, FLOOR_H * 0.7, 0.04],
        c: "#9aa3ad",
      });
    }
  }

  // gardens: lawn + a tree or two
  gardens.forEach((g, i) => {
    out.lawns.push({ p: [g.cx, 0.09, g.cz], s: [g.w, 0.12, g.d], c: "#5fae4e" });
    const n = 1;
    for (let k = 0; k < n; k += 1) {
      const tx = g.cx + (k === 0 ? -g.w * 0.2 : g.w * 0.22);
      const tz = g.cz + (k === 0 ? -g.d * 0.15 : g.d * 0.2);
      pushTree(out, tx, tz, i + k);
    }
  });
  streetTrees.forEach((t, i) => pushTree(out, t.x, t.z, i + 3));
  return out;
}

function pushTree(out: Dressing, x: number, z: number, i: number): void {
  const big = i % 3 === 0;
  out.trunks.push({ p: [x, 0.9, z], s: [0.4, 1.8, 0.4] });
  out.canopies.push({
    p: [x, 2.2, z],
    s: big ? [2.8, 1.8, 2.8] : [2.3, 1.5, 2.3],
    c: i % 2 ? "#3f9a4a" : "#57b356",
  });
  out.canopies.push({
    p: [x, 3.1, z],
    s: big ? [1.9, 1.3, 1.9] : [1.5, 1.1, 1.5],
    ry: 0.4,
    c: i % 2 ? "#4fb05a" : "#6cc464",
  });
}

/** Lane dashes, zebra stripes and raised footpaths for the road grid. */
export function dressRoads(
  roads: readonly Road[],
  junctions: readonly { x: number; z: number }[],
): { dashes: BoxItem[]; zebras: BoxItem[]; footpaths: BoxItem[] } {
  const dashes: BoxItem[] = [];
  const zebras: BoxItem[] = [];
  const footpaths: BoxItem[] = [];
  for (const r of roads) {
    const len = r.horizontal ? r.w : r.d;
    const count = Math.floor(len / 4);
    for (let i = 0; i < count; i += 1) {
      const t = (i + 0.5) * 4 - len / 2;
      const x = r.horizontal ? r.cx + t : r.cx;
      const z = r.horizontal ? r.cz : r.cz + t;
      // skip dashes inside junctions
      if (junctions.some((j) => Math.abs(j.x - x) < 2.5 && Math.abs(j.z - z) < 2.5)) continue;
      dashes.push({ p: [x, 0.11, z], s: r.horizontal ? [1.6, 0.02, 0.22] : [0.22, 0.02, 1.6] });
    }
    // footpaths both sides
    const half = (r.horizontal ? r.d : r.w) / 2 + 0.45;
    for (const side of [-1, 1]) {
      footpaths.push(
        r.horizontal
          ? { p: [r.cx, 0.12, r.cz + side * half], s: [r.w, 0.24, 0.9] }
          : { p: [r.cx + side * half, 0.12, r.cz], s: [0.9, 0.24, r.d] },
      );
    }
  }
  for (const j of junctions) {
    for (let n = -2; n <= 2; n += 1) {
      zebras.push({ p: [j.x + n * 0.7, 0.11, j.z - 3.2], s: [0.35, 0.02, 1.6] });
      zebras.push({ p: [j.x + n * 0.7, 0.11, j.z + 3.2], s: [0.35, 0.02, 1.6] });
    }
  }
  return { dashes, zebras, footpaths };
}
