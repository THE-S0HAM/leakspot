// The road graph shared by every vehicle in City3D (cars, auto-rickshaws, the crew truck). Roads are
// the gaps between the sector boxes of @leakspot/core/world: five north-south and five east-west
// streets; the two avenues (x=50, z=56) are wider. Vehicles drive on lane centre lines on the LEFT
// (India), turn only at junctions, and never leave the road rectangles. Pure data; unit-tested.

export type P = { x: number; z: number };

export const STREETS_X = [2, 25, 50, 75, 98] as const;
export const STREETS_Z = [12, 34, 56, 78, 101] as const;
export const AVENUE_X = 50;
export const AVENUE_Z = 56;

/** Half-width of the drivable road (the gap between sector boxes is 2, avenues 8). */
function halfWidth(avenue: boolean): number {
  return avenue ? 2 : 1;
}
/** Lane centre offset from the road centre line. */
export function laneOffset(avenue: boolean): number {
  return avenue ? 1 : 0.5;
}

export type RoadRect = { xMin: number; xMax: number; zMin: number; zMax: number };

/**
 * Drivable rectangles, one per street; each runs past the outer streets by a road width so the
 * outer junction corners are covered (junction squares are covered by both crossing streets).
 */
export function roadRects(): RoadRect[] {
  const out: RoadRect[] = [];
  for (const x of STREETS_X) {
    const h = halfWidth(x === AVENUE_X);
    out.push({ xMin: x - h, xMax: x + h, zMin: STREETS_Z[0] - 1, zMax: STREETS_Z[4] + 1 });
  }
  for (const z of STREETS_Z) {
    const h = halfWidth(z === AVENUE_Z);
    out.push({ xMin: STREETS_X[0] - 1, xMax: STREETS_X[4] + 1, zMin: z - h, zMax: z + h });
  }
  return out;
}

export function onRoad(p: P, rects: readonly RoadRect[] = ROAD_RECTS): boolean {
  return rects.some((r) => p.x >= r.xMin && p.x <= r.xMax && p.z >= r.zMin && p.z <= r.zMax);
}

const ROAD_RECTS = roadRects();

// ---------- graph ----------

type Street = { vertical: boolean; at: number };

function streetOf(a: P, b: P): Street {
  return a.x === b.x ? { vertical: true, at: a.x } : { vertical: false, at: a.z };
}
function isAvenue(s: Street): boolean {
  return s.vertical ? s.at === AVENUE_X : s.at === AVENUE_Z;
}

/** Nearest point on any street centre line (clamped to the grid). */
export function snapToRoad(p: P): P {
  let best: P = { x: STREETS_X[0], z: STREETS_Z[0] };
  let bestD = Infinity;
  for (const x of STREETS_X) {
    const z = Math.min(STREETS_Z[4], Math.max(STREETS_Z[0], p.z));
    const dd = Math.hypot(p.x - x, p.z - z);
    if (dd < bestD) [bestD, best] = [dd, { x, z }];
  }
  for (const z of STREETS_Z) {
    const x = Math.min(STREETS_X[4], Math.max(STREETS_X[0], p.x));
    const dd = Math.hypot(p.x - x, p.z - z);
    if (dd < bestD) [bestD, best] = [dd, { x, z }];
  }
  return best;
}

function key(p: P): string {
  return `${p.x.toFixed(3)},${p.z.toFixed(3)}`;
}

/** Centre-line shortest route over the street graph from road point a to road point b. */
export function centreRoute(a: P, b: P): P[] {
  const nodes: P[] = [];
  for (const x of STREETS_X) for (const z of STREETS_Z) nodes.push({ x, z });
  for (const p of [a, b]) if (!nodes.some((n) => key(n) === key(p))) nodes.push(p);
  // edges: consecutive nodes along each street line
  const adj = new Map<string, { to: P; w: number }[]>();
  const link = (u: P, v: P): void => {
    const w = Math.hypot(u.x - v.x, u.z - v.z);
    if (w === 0) return;
    (adj.get(key(u)) ?? adj.set(key(u), []).get(key(u)))?.push({ to: v, w });
    (adj.get(key(v)) ?? adj.set(key(v), []).get(key(v)))?.push({ to: u, w });
  };
  for (const x of STREETS_X) {
    const line = nodes.filter((n) => n.x === x).sort((p, q) => p.z - q.z);
    for (let i = 1; i < line.length; i += 1) link(line[i - 1] as P, line[i] as P);
  }
  for (const z of STREETS_Z) {
    const line = nodes.filter((n) => n.z === z).sort((p, q) => p.x - q.x);
    for (let i = 1; i < line.length; i += 1) link(line[i - 1] as P, line[i] as P);
  }
  // Dijkstra (tiny graph)
  const dist = new Map<string, number>([[key(a), 0]]);
  const prev = new Map<string, P>();
  const open = new Map<string, P>([[key(a), a]]);
  while (open.size) {
    let uKey = "";
    let u: P | undefined;
    for (const [k, p] of open) {
      if (!u || (dist.get(k) ?? Infinity) < (dist.get(uKey) ?? Infinity)) [uKey, u] = [k, p];
    }
    if (!u) break;
    open.delete(uKey);
    if (uKey === key(b)) break;
    for (const e of adj.get(uKey) ?? []) {
      const nd = (dist.get(uKey) ?? Infinity) + e.w;
      if (nd < (dist.get(key(e.to)) ?? Infinity)) {
        dist.set(key(e.to), nd);
        prev.set(key(e.to), u);
        open.set(key(e.to), e.to);
      }
    }
  }
  const path: P[] = [b];
  let cur = b;
  while (key(cur) !== key(a)) {
    const p = prev.get(key(cur));
    if (!p) return [a, b];
    path.push(p);
    cur = p;
  }
  return simplify(path.reverse());
}

/** Drop collinear middle points so corners are only real turns. */
function simplify(pts: P[]): P[] {
  const out: P[] = [];
  for (const p of pts) {
    const n = out.length;
    if (n >= 1 && key(out[n - 1] as P) === key(p)) continue;
    if (n >= 2) {
      const a = out[n - 2] as P;
      const b = out[n - 1] as P;
      if ((a.x === b.x && b.x === p.x) || (a.z === b.z && b.z === p.z)) out[n - 1] = p;
      else out.push(p);
    } else out.push(p);
  }
  return out;
}

/** Left-hand normal of a unit direction (x east, z south): heading east → north (−z). */
function leftNormal(dx: number, dz: number): P {
  return { x: dz, z: -dx };
}

function dir(a: P, b: P): P {
  const l = Math.hypot(b.x - a.x, b.z - a.z) || 1;
  return { x: (b.x - a.x) / l, z: (b.z - a.z) / l };
}

/**
 * Offsets a centre-line polyline onto the left lane. Corners become the intersection of the two lane
 * lines (J + off1·n1 + off2·n2), so a turn stays inside the junction square. `closed` treats the
 * polyline as a loop.
 */
export function toLeftLane(centre: readonly P[], closed = false): P[] {
  const n = centre.length;
  if (n < 2) return [...centre];
  const out: P[] = [];
  for (let i = 0; i < n; i += 1) {
    const p = centre[i] as P;
    const prevP = closed ? (centre[(i - 1 + n) % n] as P) : i > 0 ? (centre[i - 1] as P) : null;
    const nextP = closed ? (centre[(i + 1) % n] as P) : i < n - 1 ? (centre[i + 1] as P) : null;
    const inc = prevP ? { d: dir(prevP, p), s: streetOf(prevP, p) } : null;
    const outg = nextP ? { d: dir(p, nextP), s: streetOf(p, nextP) } : null;
    if (inc && outg) {
      const n1 = leftNormal(inc.d.x, inc.d.z);
      const n2 = leftNormal(outg.d.x, outg.d.z);
      const o1 = laneOffset(isAvenue(inc.s));
      const o2 = laneOffset(isAvenue(outg.s));
      const dot = inc.d.x * outg.d.x + inc.d.z * outg.d.z;
      if (Math.abs(dot) > 0.99) {
        // straight on (or a U-turn): two points, one per lane line
        out.push({ x: p.x + n1.x * o1, z: p.z + n1.z * o1 });
        if (dot < 0) out.push({ x: p.x + n2.x * o2, z: p.z + n2.z * o2 });
      } else out.push({ x: p.x + n1.x * o1 + n2.x * o2, z: p.z + n1.z * o1 + n2.z * o2 });
    } else {
      const seg = inc ?? outg;
      if (!seg) continue;
      const nn = leftNormal(seg.d.x, seg.d.z);
      const o = laneOffset(isAvenue(seg.s));
      out.push({ x: p.x + nn.x * o, z: p.z + nn.z * o });
    }
  }
  return out;
}

/** Road-following lane route between any two points (each snapped to the nearest street). */
export function laneRoute(from: P, to: P): P[] {
  return toLeftLane(centreRoute(snapToRoad(from), snapToRoad(to)));
}

/** A closed loop around the block rectangle between street indices (i0..i1, j0..j1). */
export function blockLoop(i0: number, i1: number, j0: number, j1: number, clockwise: boolean): P[] {
  const x0 = STREETS_X[i0] ?? 2;
  const x1 = STREETS_X[i1] ?? 98;
  const z0 = STREETS_Z[j0] ?? 12;
  const z1 = STREETS_Z[j1] ?? 101;
  const cw = [
    { x: x0, z: z0 },
    { x: x1, z: z0 },
    { x: x1, z: z1 },
    { x: x0, z: z1 },
  ];
  return toLeftLane(clockwise ? cw : [...cw].reverse(), true);
}

// ---------- sampling ----------

export type Path = { pts: P[]; cum: number[]; length: number; closed: boolean };

export function makePath(pts: readonly P[], closed = false): Path {
  const all = closed && pts.length > 0 ? [...pts, pts[0] as P] : [...pts];
  const cum = [0];
  for (let i = 1; i < all.length; i += 1) {
    const a = all[i - 1] as P;
    const b = all[i] as P;
    cum.push((cum[i - 1] ?? 0) + Math.hypot(b.x - a.x, b.z - a.z));
  }
  return { pts: all, cum, length: cum[cum.length - 1] ?? 0, closed };
}

/** Position + heading at arc length s (wrapped for loops, clamped otherwise). Writes into `out`. */
export function sampleAt(
  path: Path,
  s: number,
  out: { x: number; z: number; heading: number },
): void {
  const L = path.length;
  if (L <= 0) {
    const p = path.pts[0] ?? { x: 0, z: 0 };
    out.x = p.x;
    out.z = p.z;
    return;
  }
  let t = path.closed ? ((s % L) + L) % L : Math.min(L, Math.max(0, s));
  let i = 1;
  while (i < path.cum.length - 1 && (path.cum[i] ?? 0) < t) i += 1;
  const a = path.pts[i - 1] as P;
  const b = path.pts[i] as P;
  const segLen = (path.cum[i] ?? 0) - (path.cum[i - 1] ?? 0) || 1;
  t = (t - (path.cum[i - 1] ?? 0)) / segLen;
  out.x = a.x + (b.x - a.x) * t;
  out.z = a.z + (b.z - a.z) * t;
  if (b.x !== a.x || b.z !== a.z) out.heading = Math.atan2(-(b.z - a.z), b.x - a.x);
}

/** Distance from (x, z) to the nearest junction centre. */
export function junctionDistance(x: number, z: number): number {
  let d = Infinity;
  for (const jx of STREETS_X)
    for (const jz of STREETS_Z) d = Math.min(d, Math.hypot(x - jx, z - jz));
  return d;
}

/** Seeded car/auto loops: each loops one block rectangle, some clockwise, some not. */
export function vehicleLoops(count = 12, seed = 99): { path: Path; auto: boolean }[] {
  let a = seed >>> 0;
  const r = (): number => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return [...Array(count).keys()].map((i) => {
    // a 1-2 block rectangle somewhere on the 5 x 5 street grid
    const i0 = Math.floor(r() * 3);
    const i1 = Math.min(4, i0 + 1 + Math.floor(r() * 2));
    const j0 = Math.floor(r() * 3);
    const j1 = Math.min(4, j0 + 1 + Math.floor(r() * 2));
    return {
      path: makePath(blockLoop(i0, i1, j0, j1, r() < 0.5), true),
      auto: i % 3 === 0,
    };
  });
}
