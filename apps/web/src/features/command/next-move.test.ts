import { describe, expect, it } from "vitest";
import type { IncidentView, RunStateView } from "../../state/view-types";
import { nextMove } from "./next-move";

function baseState(over: Partial<RunStateView> = {}): RunStateView {
  return {
    runId: "K7Q2X",
    cycle: 1,
    simClock: { day: 15, slotIndex: 0, label: "06:00" },
    supplyOn: true,
    autopilot: false,
    crew: { status: "idle" },
    cityHealth: 70,
    waterRecoveredLitres: 0,
    sectors: [],
    incidents: [],
    recentEvents: [],
    recentReports: [],
    ...over,
  };
}

function incident(over: Partial<IncidentView>): IncidentView {
  return {
    id: "#1",
    kind: "visible",
    sectorId: "C3",
    status: "open",
    verdict: "LOCAL_LEAK",
    pin: { x: 14, z: 86 },
    score: { W: 0.9, E: 1, C: 1, K: 1, P: 96 },
    why: "",
    ...over,
  };
}

describe("nextMove derivation", () => {
  it("before 06:00: prompts Play", () => {
    const m = nextMove(
      baseState({ simClock: { day: 15, slotIndex: -1, label: "05:45" }, supplyOn: false }),
    );
    expect(m.text).toMatch(/Supply starts at 06:00/);
    expect(m.action).toEqual({ kind: "play" });
  });

  it("suspected hidden leak with no evidence: waiting for signals, no action", () => {
    const m = nextMove(
      baseState({
        incidents: [incident({ sectorId: "B2", kind: "hidden", verdict: "HIDDEN_SUSPECTED" })],
      }),
    );
    expect(m.text).toMatch(/B2 is losing water nobody can see/);
    expect(m.action).toBeUndefined();
  });

  it("confirmed burst before 07:00: names the hospital, says crew starts at 07:00, no action", () => {
    const m = nextMove(
      baseState({
        simClock: { day: 15, slotIndex: 3, label: "06:45" },
        incidents: [incident({ verdict: "CONFIRMED", pin: { x: 14, z: 86 } })],
      }),
    );
    expect(m.text).toMatch(/Burst confirmed at C3/);
    expect(m.text).toMatch(/hospital/);
    expect(m.text).toMatch(/Crew starts at 07:00/);
    expect(m.action).toBeUndefined();
  });

  it("confirmed and crew free after 07:00: offers Dispatch", () => {
    const m = nextMove(
      baseState({
        simClock: { day: 15, slotIndex: 4, label: "07:00" },
        incidents: [incident({ verdict: "CONFIRMED" })],
      }),
    );
    expect(m.text).toMatch(/Dispatch the crew/);
    expect(m.action).toEqual({ kind: "dispatch", incidentId: "#1" });
  });

  it("en route: shows the ETA, no action", () => {
    const m = nextMove(
      baseState({
        simClock: { day: 15, slotIndex: 4, label: "07:00" },
        crew: { status: "dispatched", incidentId: "#1", etaSlots: 2 },
        incidents: [incident({ status: "dispatched", verdict: "CONFIRMED" })],
      }),
    );
    expect(m.text).toMatch(/Crew driving to C3 · ETA 2/);
    expect(m.action).toBeUndefined();
  });

  it("on site: offers Mark repaired", () => {
    const m = nextMove(
      baseState({
        simClock: { day: 15, slotIndex: 6, label: "07:30" },
        crew: { status: "onsite", incidentId: "#1" },
        incidents: [incident({ status: "onsite", verdict: "CONFIRMED" })],
      }),
    );
    expect(m.text).toMatch(/Crew at C3/);
    expect(m.action).toEqual({ kind: "repair", incidentId: "#1" });
  });

  it("verifying: shows clean-reading progress, no action", () => {
    const m = nextMove(
      baseState({
        simClock: { day: 15, slotIndex: 7, label: "07:45" },
        incidents: [incident({ status: "verifying", verifyPasses: 2, verdict: "CONFIRMED" })],
      }),
    );
    expect(m.text).toMatch(/Meters checking C3: 2 of 3 clean readings/);
    expect(m.action).toBeUndefined();
  });

  it("nothing to do: play on to the day report", () => {
    const m = nextMove(baseState({ simClock: { day: 15, slotIndex: 8, label: "08:00" } }));
    expect(m.text).toMatch(/All clear/);
    expect(m.action).toEqual({ kind: "play" });
  });
});
