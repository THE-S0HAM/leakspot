import { describe, expect, it } from "vitest";
import { StatsResponse } from "./stats";

const zero = {
  runs: 0,
  daysCompleted: 0,
  incidentsDetected: 0,
  detectedByKind: { hidden: 0, visible: 0, cluster: 0 },
  dispatched: 0,
  repaired: 0,
  verified: 0,
  closedLogged: 0,
  litresRecoveredPerDay: 0,
  foundByMetersAlone: 0,
  phoneReports: 0,
  simulatedReports: 0,
  aiPhotoChecks: 0,
};

const valid = {
  generatedAt: "2026-10-11T06:00:00.000Z",
  totals: { ...zero, runs: 2, incidentsDetected: 6, verified: 2, litresRecoveredPerDay: 300000 },
  daily: [
    {
      date: "2026-10-11",
      runs: 2,
      detected: 6,
      verified: 2,
      litresRecoveredPerDay: 300000,
      phoneReports: 1,
      simulatedReports: 24,
      aiPhotoChecks: 1,
    },
  ],
  scoreHistogram: [{ from: 90, to: 100, count: 2 }],
  verifyHistogram: [{ from: 90, to: 105, count: 1 }],
  scoreProfile: { W: 0.75, E: 0.5, C: 0.65, K: 0.65, n: 2 },
  aiLabels: [{ label: "minor_drip", count: 1 }],
  funnel: { detected: 6, dispatched: 4, repaired: 4, verified: 2 },
  recentRuns: [
    {
      runId: "K7Q2X",
      createdAt: null,
      clock: "19:45",
      dayCompleted: true,
      detected: 4,
      verified: 2,
      litresRecoveredPerDay: 300000,
      phoneReports: 1,
    },
  ],
};

describe("StatsResponse contract", () => {
  it("accepts a well-formed response (undated runs allowed)", () => {
    expect(StatsResponse.safeParse(valid).success).toBe(true);
  });

  it("rejects negative counts, fractional counts and bad dates", () => {
    expect(
      StatsResponse.safeParse({ ...valid, totals: { ...valid.totals, runs: -1 } }).success,
    ).toBe(false);
    expect(
      StatsResponse.safeParse({ ...valid, totals: { ...valid.totals, verified: 1.5 } }).success,
    ).toBe(false);
    expect(
      StatsResponse.safeParse({ ...valid, daily: [{ ...valid.daily[0], date: "11/10/2026" }] })
        .success,
    ).toBe(false);
  });
});
