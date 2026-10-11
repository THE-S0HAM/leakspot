import { describe, expect, it } from "vitest";
import { createRun, runScenario } from "@leakspot/core";
import { istDateOf, runCreatedAt, summarizeRun, summarySortKey, ulidTime } from "./run-summary";
import { newReportId } from "./ids";

const TIMES = { createdAt: "2026-10-11T03:00:00.000Z", updatedAt: "2026-10-11T03:05:00.000Z" };

describe("summarizeRun", () => {
  it("a fresh run has nothing yet", () => {
    const s = summarizeRun("K7Q2X", createRun(42).state, TIMES);
    expect(s).toMatchObject({
      runId: "K7Q2X",
      istDate: "2026-10-11",
      clock: "05:45",
      dayCompleted: false,
      incidents: { detected: 0, dispatched: 0, repaired: 0, verified: 0, closedLogged: 0 },
      litresRecoveredPerDay: 0,
      phoneReports: 0,
      simulatedReports: 0,
      scores: [],
    });
  });

  it("the scripted day on autopilot: C3 and B2 verified, timings and profiles recorded", () => {
    const { state } = runScenario(42);
    const s = summarizeRun("K7Q2X", state, TIMES);
    expect(s.dayCompleted).toBe(true);
    expect(s.incidents.detected).toBe(state.incidents.length);
    expect(s.incidents.verified).toBe(2);
    expect(s.incidents.closedLogged).toBe(2); // A1 and D4 close as "repair logged"
    expect(s.incidents.repaired).toBe(4);
    expect(s.incidents.dispatched).toBe(4);
    expect(s.litresRecoveredPerDay).toBe(Math.round(state.waterRecoveredLitres));
    expect(s.foundByMetersAlone).toBeGreaterThanOrEqual(1);
    expect(s.simulatedReports).toBe(state.reports.filter((r) => r.scripted).length);
    expect(s.phoneReports).toBe(0);
    expect(s.aiChecks).toEqual({}); // scripted reports never reach the vision model
    expect(s.scores).toHaveLength(state.incidents.length);
    expect(s.minutesToVerify).toHaveLength(2);
    expect(s.minutesToVerify).toContain(90); // C3: confirmed 06:45, verified 08:15
    expect(s.verifiedProfiles).toHaveLength(2);
    for (const v of [...s.minutesToVerify, ...s.scores]) expect(v).toBeGreaterThanOrEqual(0);
  });

  it("counts phone reports and AI checks per label, but not self-reported or scripted ones", () => {
    const { state } = runScenario(42);
    const id = newReportId(Date.parse("2026-10-11T04:00:00Z"));
    state.reports.push(
      {
        id,
        type: "leak_photo",
        sectorId: "C2",
        rejected: false,
        selfReported: false,
        label: "burst",
      },
      {
        id: newReportId(),
        type: "leak_photo",
        sectorId: "C2",
        rejected: false,
        selfReported: true,
      },
      {
        id: newReportId(),
        type: "low_water",
        sectorId: "C2",
        rejected: false,
        selfReported: false,
      },
    );
    const s = summarizeRun("K7Q2X", state, TIMES);
    expect(s.phoneReports).toBe(3);
    expect(s.aiChecks).toEqual({ burst: 1 });
  });
});

describe("run dates", () => {
  it("IST date rolls over at 18:30 UTC", () => {
    expect(istDateOf("2026-10-10T18:29:00Z")).toBe("2026-10-10");
    expect(istDateOf("2026-10-10T18:30:00Z")).toBe("2026-10-11");
  });

  it("reads the time out of a ULID report id", () => {
    const at = Date.parse("2026-10-11T04:00:00Z");
    expect(ulidTime(newReportId(at))).toBe(at);
    expect(ulidTime("not-a-ulid")).toBeUndefined();
  });

  it("an old run without createdAt is dated by its earliest phone report, else undated", () => {
    const { state } = createRun(42);
    expect(runCreatedAt(state)).toBeNull();
    const later = newReportId(Date.parse("2026-10-11T05:00:00Z"));
    const earlier = newReportId(Date.parse("2026-10-11T04:00:00Z"));
    for (const id of [later, earlier]) {
      state.reports.push({
        id,
        type: "low_water",
        sectorId: "A1",
        rejected: false,
        selfReported: false,
      });
    }
    expect(runCreatedAt(state)).toBe("2026-10-11T04:00:00.000Z");
    expect(runCreatedAt(state, TIMES.createdAt)).toBe(TIMES.createdAt);
  });

  it("sort keys are chronological, undated first", () => {
    expect(summarySortKey({ createdAt: null, runId: "AAAAA" })).toBe("RUN#0000-undated#AAAAA");
    expect(summarySortKey({ createdAt: TIMES.createdAt, runId: "K7Q2X" })).toBe(
      `RUN#${TIMES.createdAt}#K7Q2X`,
    );
  });
});
