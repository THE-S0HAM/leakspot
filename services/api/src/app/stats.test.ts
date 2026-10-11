import { describe, expect, it } from "vitest";
import { StatsResponse } from "@leakspot/contracts";
import { aggregateStats } from "./stats";
import type { RunSummary } from "./run-summary";

const NOW = new Date("2026-10-11T06:00:00Z"); // 11:30 IST

function run(over: Partial<RunSummary> & { runId: string }): RunSummary {
  return {
    createdAt: "2026-10-11T03:00:00.000Z",
    updatedAt: "2026-10-11T03:10:00.000Z",
    istDate: "2026-10-11",
    clock: "19:45",
    dayCompleted: true,
    incidents: {
      detected: 4,
      byKind: { hidden: 1, visible: 3, cluster: 0 },
      dispatched: 4,
      repaired: 4,
      verified: 2,
      closedLogged: 2,
    },
    litresRecoveredPerDay: 300_000,
    foundByMetersAlone: 1,
    phoneReports: 1,
    simulatedReports: 12,
    aiChecks: { minor_drip: 1 },
    scores: [96, 39, 31, 25],
    minutesToVerify: [90, 165],
    verifiedProfiles: [
      { W: 0.9, E: 1, C: 1, K: 1 },
      { W: 0.6, E: 0, C: 0.3, K: 0.3 },
    ],
    ...over,
  };
}

describe("aggregateStats", () => {
  it("is empty but well-formed with no runs", () => {
    const s = aggregateStats([], NOW);
    expect(StatsResponse.parse(s)).toBeTruthy();
    expect(s.totals.runs).toBe(0);
    expect(s.daily).toHaveLength(30);
    expect(s.daily.at(-1)?.date).toBe("2026-10-11");
    expect(s.scoreHistogram).toHaveLength(10);
    expect(s.scoreProfile.n).toBe(0);
    expect(s.recentRuns).toEqual([]);
  });

  it("sums several runs, bins scores and timings, and fills the daily series", () => {
    const s = aggregateStats(
      [
        run({ runId: "AAAAA" }),
        run({
          runId: "BBBBB",
          createdAt: "2026-10-09T10:00:00.000Z",
          updatedAt: "2026-10-09T10:20:00.000Z",
          istDate: "2026-10-09",
          clock: "07:30",
          dayCompleted: false,
          incidents: {
            detected: 2,
            byKind: { hidden: 1, visible: 1, cluster: 0 },
            dispatched: 1,
            repaired: 0,
            verified: 0,
            closedLogged: 0,
          },
          litresRecoveredPerDay: 0,
          phoneReports: 3,
          simulatedReports: 4,
          aiChecks: { burst: 2, minor_drip: 1 },
          scores: [93, 39],
          minutesToVerify: [],
          verifiedProfiles: [],
        }),
        // counted in totals, not in a day
        run({
          runId: "UNDTD",
          createdAt: null,
          istDate: null,
          updatedAt: "2026-10-01T00:00:00.000Z",
        }),
      ],
      NOW,
    );
    expect(StatsResponse.parse(s)).toBeTruthy();
    expect(s.totals).toMatchObject({
      runs: 3,
      daysCompleted: 2,
      incidentsDetected: 10,
      verified: 4,
      litresRecoveredPerDay: 600_000,
      phoneReports: 5,
      simulatedReports: 28,
      aiPhotoChecks: 5,
    });
    expect(s.funnel).toEqual({ detected: 10, dispatched: 9, repaired: 8, verified: 4 });
    expect(s.aiLabels).toEqual([
      { label: "minor_drip", count: 3 },
      { label: "burst", count: 2 },
    ]);
    const bin = (from: number) => s.scoreHistogram.find((b) => b.from === from)?.count;
    expect(bin(90)).toBe(3); // 96, 96, 93
    expect(bin(30)).toBe(5); // 39 ×3, 31 ×2
    expect(s.verifyHistogram.find((b) => b.from === 90)?.count).toBe(2);
    expect(s.scoreProfile.n).toBe(4);
    expect(s.scoreProfile.W).toBeCloseTo(0.75);
    const today = s.daily.find((d) => d.date === "2026-10-11");
    const tuesday = s.daily.find((d) => d.date === "2026-10-09");
    expect(today).toMatchObject({ runs: 1, verified: 2, litresRecoveredPerDay: 300_000 });
    expect(tuesday).toMatchObject({ runs: 1, detected: 2, phoneReports: 3 });
    expect(s.recentRuns.map((r) => r.runId)).toEqual(["AAAAA", "BBBBB", "UNDTD"]);
  });

  it("counts a run once even if it left two summary items, keeping the latest", () => {
    const s = aggregateStats(
      [
        run({ runId: "AAAAA", updatedAt: "2026-10-11T03:10:00.000Z", litresRecoveredPerDay: 1 }),
        run({ runId: "AAAAA", updatedAt: "2026-10-11T03:20:00.000Z", litresRecoveredPerDay: 2 }),
      ],
      NOW,
    );
    expect(s.totals.runs).toBe(1);
    expect(s.totals.litresRecoveredPerDay).toBe(2);
  });
});
