import { describe, expect, it } from "vitest";
import {
  distanceToTrunkMain,
  SECTOR_BY_ID,
  sectorAt,
  TOTAL_CONNECTIONS,
  SECTORS,
} from "./jaldhara";

describe("Jaldhara layout", () => {
  it("has 16 sectors totalling 5,780 connections", () => {
    expect(SECTORS).toHaveLength(16);
    expect(TOTAL_CONNECTIONS).toBe(5780);
  });

  it("places the documented sector boxes and inlets", () => {
    expect(SECTOR_BY_ID.A1.box).toEqual({ xMin: 4, xMax: 24, zMin: 14, zMax: 33 });
    expect(SECTOR_BY_ID.A1.inlet).toEqual({ x: 24, z: 23.5 });
    expect(SECTOR_BY_ID.B2.inlet).toEqual({ x: 76, z: 23.5 });
    expect(SECTOR_BY_ID.C3.box).toEqual({ xMin: 4, xMax: 24, zMin: 79, zMax: 98 });
  });

  it("resolves a point to its sector", () => {
    expect(sectorAt(14, 86)?.id).toBe("C3"); // C3 burst site
    expect(sectorAt(88, 26)?.id).toBe("B2"); // B2 hidden site
    expect(sectorAt(10, 20)?.id).toBe("A1"); // A1 local site
    expect(sectorAt(90, 92)?.id).toBe("D4"); // D4 drip site
    expect(sectorAt(50, 5)).toBeUndefined(); // reservoir is on no sector
  });

  it("measures distance to the trunk main at x = 50", () => {
    expect(distanceToTrunkMain({ x: 50, z: 40 })).toBe(0);
    expect(distanceToTrunkMain({ x: 52, z: 40 })).toBeCloseTo(2);
  });
});
