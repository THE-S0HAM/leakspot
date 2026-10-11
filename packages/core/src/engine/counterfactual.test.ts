import { describe, expect, it } from "vitest";
import { counterfactual, DEFAULT_SLIDERS } from "./counterfactual";

describe("counterfactual", () => {
  it("saves (hiddenRunDays − actual days) × size for a repaired hidden leak", () => {
    const result = counterfactual(
      [
        {
          id: "#1",
          kind: "hidden",
          excessLitresPerDay: 120000,
          firstEvidenceSimHours: 15 * 24 + 6, // day 15, 06:00
          repairedSimHours: 15 * 24 + 8, // day 15, 08:00 → 2 h ≈ 0.0833 days
        },
      ],
      DEFAULT_SLIDERS,
    );
    const row = result.rows[0];
    expect(row).toBeDefined();
    // (30 − 2/24) × 120000
    expect(row?.litresSaved).toBeCloseTo((30 - 2 / 24) * 120000, 0);
    expect(result.totalTankers).toBeCloseTo(result.totalLitres / 10000, 6);
  });

  it("saves nothing for an unrepaired incident", () => {
    const result = counterfactual([
      { id: "#2", kind: "visible", label: "major_leak", firstEvidenceSimHours: 100 },
    ]);
    expect(result.totalLitres).toBe(0);
  });

  it("falls back to the nominal size by label when meter excess is unknown", () => {
    const result = counterfactual([
      {
        id: "#3",
        kind: "visible",
        label: "burst",
        firstEvidenceSimHours: 0,
        repairedSimHours: 24, // 1 day with LeakSpot vs reportedDelayDays (3)
      },
    ]);
    // (3 − 1) × 50000 nominal burst
    expect(result.rows[0]?.litresSaved).toBeCloseTo(2 * 50000, 0);
  });
});
