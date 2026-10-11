// JOB 1: every vehicle path (cars, autos, the crew truck) stays on the road rectangles and never
// enters a sector plot, a building or a landmark. 500 samples along each path.
import { describe, expect, it } from "vitest";
import { FACILITIES, SECTORS } from "@leakspot/core/world";
import { buildCity3D } from "./city3d-geometry";
import { LANDMARK_FOOTPRINTS, TRUCK_HOME } from "./landmarks";
import { laneRoute, makePath, onRoad, sampleAt, vehicleLoops, type Path } from "./roads";

const PLOTS = SECTORS.map((s) => s.box);
const BUILDINGS = buildCity3D(42).flatMap((c) =>
  c.buildings.map((b) => ({
    xMin: b.cx - b.w / 2,
    xMax: b.cx + b.w / 2,
    zMin: b.cz - b.d / 2,
    zMax: b.cz + b.d / 2,
  })),
);
const SOLID = [...PLOTS, ...BUILDINGS, ...LANDMARK_FOOTPRINTS];

function inside(
  r: { xMin: number; xMax: number; zMin: number; zMax: number },
  x: number,
  z: number,
) {
  return x > r.xMin && x < r.xMax && z > r.zMin && z < r.zMax;
}

function assertOnRoad(path: Path, label: string): void {
  const p = { x: 0, z: 0, heading: 0 };
  for (let i = 0; i < 500; i += 1) {
    sampleAt(path, (path.length * i) / 499, p);
    const where = `${label} sample ${i} at (${p.x.toFixed(2)}, ${p.z.toFixed(2)})`;
    expect(onRoad(p), `${where} is off the road`).toBe(true);
    expect(
      SOLID.some((r) => inside(r, p.x, p.z)),
      `${where} is inside a plot/building`,
    ).toBe(false);
  }
}

describe("vehicle paths follow the roads", () => {
  it("every car and auto loop stays on the road", () => {
    const loops = vehicleLoops();
    expect(loops.length).toBeGreaterThanOrEqual(10);
    loops.forEach((v, i) => assertOnRoad(v.path, `vehicle ${i}`));
  });

  it("the crew truck route from the depot to every sector stays on the road", () => {
    const targets = [
      ...SECTORS.map((s) => s.centroid),
      ...SECTORS.map((s) => s.inlet),
      ...FACILITIES.map((f) => f.at),
    ];
    for (const t of targets) {
      assertOnRoad(makePath(laneRoute(TRUCK_HOME, t)), `truck to (${t.x}, ${t.z})`);
      assertOnRoad(makePath(laneRoute(t, TRUCK_HOME)), `truck back from (${t.x}, ${t.z})`);
    }
  });

  it("the check itself catches an off-road leg (the old depot-to-pin straight line)", () => {
    const old = makePath([
      { x: 17, z: 98 },
      { x: 12, z: 92 },
    ]);
    const p = { x: 0, z: 0, heading: 0 };
    let bad = 0;
    for (let i = 0; i < 500; i += 1) {
      sampleAt(old, (old.length * i) / 499, p);
      if (!onRoad(p) || SOLID.some((r) => inside(r, p.x, p.z))) bad += 1;
    }
    expect(bad).toBeGreaterThan(400);
  });

  it("keeps to the left lane (India): heading east the car is north of the centre line", () => {
    const path = makePath(laneRoute({ x: 25, z: 56 }, { x: 75, z: 56 }));
    const p = { x: 0, z: 0, heading: 0 };
    sampleAt(path, path.length / 2, p);
    expect(p.z).toBeLessThan(56);
  });
});
