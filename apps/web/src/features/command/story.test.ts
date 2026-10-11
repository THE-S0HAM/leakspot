import { describe, expect, it } from "vitest";
import type { IncidentView, RunStateView } from "../../state/view-types";
import { nextBeat, type BeatId } from "./story";

function state(over: Partial<RunStateView> = {}): RunStateView {
  return {
    runId: "K7Q2X",
    cycle: 1,
    simClock: { day: 15, slotIndex: 0, label: "06:00" },
    supplyOn: true,
    autopilot: true,
    crew: { status: "idle" },
    cityHealth: 90,
    waterRecoveredLitres: 0,
    sectors: [],
    incidents: [],
    recentEvents: [],
    recentReports: [],
    ...over,
  };
}

function inc(over: Partial<IncidentView>): IncidentView {
  return {
    id: "#1",
    kind: "hidden",
    sectorId: "B2",
    status: "open",
    verdict: "HIDDEN_SUSPECTED",
    pin: { x: 86, z: 23 },
    score: { W: 0.5, E: 0, C: 0.3, K: 0.3, P: 39 },
    why: "",
    ...over,
  };
}

const B2 = inc({});
const C3 = inc({
  id: "#2",
  sectorId: "C3",
  kind: "visible",
  verdict: "CONFIRMED",
  pin: { x: 14, z: 88 },
  score: { W: 0.9, E: 1, C: 1, K: 1, P: 96 },
});

describe("guided story beats", () => {
  it("fires nothing on a quiet city", () => {
    expect(nextBeat(state(), new Set(), false)).toBeNull();
  });

  it("walks the five beats in order, each triggered by state, each once", () => {
    const fired = new Set<BeatId>();
    const take = (s: RunStateView, over = false): BeatId | undefined => {
      const b = nextBeat(s, fired, over);
      if (b) fired.add(b.id);
      return b?.id;
    };
    expect(take(state({ incidents: [B2] }))).toBe("b2-suspected");
    expect(take(state({ incidents: [B2] }))).toBeUndefined(); // once only
    const s2 = state({ incidents: [B2, C3] });
    expect(nextBeat(s2, fired, false)?.text).toMatch(/Score 96\/100/);
    expect(take(s2)).toBe("c3-confirmed");
    expect(
      take(state({ incidents: [B2, C3], crew: { status: "dispatched", incidentId: "#2" } })),
    ).toBe("dispatch");
    expect(take(state({ incidents: [B2, { ...C3, status: "verified" }] }))).toBe("c3-verified");
    expect(
      take(
        state({
          incidents: [
            { ...B2, status: "verified" },
            { ...C3, status: "verified" },
          ],
        }),
      ),
    ).toBe("evening");
    expect(take(state(), true)).toBeUndefined();
  });

  it("the evening beat also fires when the day ends without a B2 verification", () => {
    const fired = new Set<BeatId>(["b2-suspected", "c3-confirmed", "dispatch", "c3-verified"]);
    expect(nextBeat(state({ incidents: [B2] }), fired, true)?.id).toBe("evening");
  });

  it("a crew sent elsewhere is not the C3 dispatch beat", () => {
    const fired = new Set<BeatId>(["b2-suspected", "c3-confirmed"]);
    const s = state({ incidents: [B2, C3], crew: { status: "dispatched", incidentId: "#1" } });
    expect(nextBeat(s, fired, false)).toBeNull();
  });
});
