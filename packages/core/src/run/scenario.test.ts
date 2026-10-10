// Integration test for the scripted Jaldhara scenario (scenario-jaldhara.md "Expected outcome"),
// seed 42, autopilot on, FakeVision. Pins the whole expected story end to end.

import { describe, expect, it } from "vitest";
import type { Incident } from "../engine/incidents";
import { createRun, tick } from "./reducers";
import { runScenario } from "./scenario";
import type { RunState } from "./state";

function incidentFor(state: RunState, sectorId: string): Incident {
  const found = state.incidents.find((i) => i.sectorId === sectorId);
  if (!found) throw new Error(`no incident for ${sectorId}`);
  return found;
}

describe("Jaldhara scenario (seed 42, autopilot, FakeVision)", () => {
  const { state } = runScenario(42);

  it("produces exactly 4 incidents: C3, A1, D4 report-led plus meter-only B2", () => {
    const sectors = state.incidents.map((i) => i.sectorId).sort();
    expect(sectors).toEqual(["A1", "B2", "C3", "D4"]);
  });

  it("rejects the car-wash photo (D1) and merges the rest (12 reports, 1 rejected)", () => {
    expect(state.reports).toHaveLength(12);
    const rejected = state.reports.filter((r) => r.rejected);
    expect(rejected).toHaveLength(1);
    expect(rejected[0]?.sectorId).toBe("D1");
  });

  it("confirms C3 with the hospital burst, pin moved to the first photo (13, 85), score ≥ 90", () => {
    const c3 = incidentFor(state, "C3");
    expect(c3.verdict).toBe("CONFIRMED");
    expect(c3.pin).toEqual({ x: 13, z: 85 });
    expect(c3.score.P).toBeGreaterThanOrEqual(90);
    expect(c3.score.P).toBe(96);
  });

  it("keeps B2 a meter-only hidden incident (HIDDEN_SUSPECTED, no photo, P 39)", () => {
    const b2 = incidentFor(state, "B2");
    expect(b2.kind).toBe("hidden");
    expect(b2.hasPhoto).toBe(false);
    expect(b2.score.P).toBe(39);
  });

  it("ranks C3 > B2 > A1 > D4", () => {
    const p = (s: string) => incidentFor(state, s).score.P;
    expect(p("C3")).toBeGreaterThan(p("B2"));
    expect(p("B2")).toBeGreaterThan(p("A1"));
    expect(p("A1")).toBeGreaterThan(p("D4"));
    expect([p("C3"), p("B2"), p("A1"), p("D4")]).toEqual([96, 39, 31, 25]);
  });

  it("verifies C3 and B2 by meters and logs A1 and D4 below resolution", () => {
    expect(incidentFor(state, "C3").status).toBe("verified");
    expect(incidentFor(state, "B2").status).toBe("verified");
    expect(incidentFor(state, "A1").status).toBe("closed_logged");
    expect(incidentFor(state, "D4").status).toBe("closed_logged");
  });

  it("records water recovered from the two verified incidents", () => {
    expect(state.waterRecoveredLitres).toBeGreaterThan(0);
    const recovered =
      (incidentFor(state, "C3").recoveredLitresPerDay ?? 0) +
      (incidentFor(state, "B2").recoveredLitresPerDay ?? 0);
    expect(state.waterRecoveredLitres).toBe(recovered);
  });
});

describe("history is quiet (domain-engine.md: zero false alarms)", () => {
  it("raises no anomaly in any sector across days 1–14", () => {
    // Fast-forward a fresh run through 14 leak-free days (14 × 20 slots) and assert nothing leaves normal.
    const { state, context } = createRun(42);
    let s = state;
    // override the clock to start history at day 1.
    s = { ...s, clock: { day: 1, slotIndex: -1 } };
    let worstStatusSeen = "normal";
    for (let i = 0; i < 14 * 20; i += 1) {
      const result = tick(s, context);
      s = result.state;
      for (const sector of s.sectors) {
        if (
          sector.status === "watch" ||
          sector.status === "suspected" ||
          sector.status === "confirmed"
        ) {
          worstStatusSeen = sector.status;
        }
      }
      if (s.clock.day >= 15) break;
    }
    expect(worstStatusSeen).toBe("normal");
  });
});

describe("determinism", () => {
  it("produces identical final state for the same seed", () => {
    const a = runScenario(42).state;
    const b = runScenario(42).state;
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("keeps RunState JSON under 8 KB", () => {
    const bytes = new TextEncoder().encode(JSON.stringify(runScenario(42).state)).length;
    expect(bytes).toBeLessThanOrEqual(8192);
  });
});
