// "Watch it work": the guided story's beats. Each beat is triggered by a REAL state change in the run
// (never a timer) and fires once. Pure: CommandCentre feeds it each new state and shows the caption.

import type { SectorId } from "@leakspot/core/world";
import type { RunStateView } from "../../state/view-types";

export type BeatId = "b2-suspected" | "c3-confirmed" | "dispatch" | "c3-verified" | "evening";

export type Beat = {
  id: BeatId;
  step: number;
  sector: SectorId | null;
  title: string;
  text: string;
};

export const BEAT_COUNT = 5;

function incidentIn(state: RunStateView, sector: SectorId) {
  return state.incidents.find((i) => i.sectorId === sector);
}

/** The next beat that has become true and not fired yet (in story order), or null. */
export function nextBeat(
  state: RunStateView,
  fired: ReadonlySet<BeatId>,
  dayOver: boolean,
): Beat | null {
  const b2 = incidentIn(state, "B2");
  const c3 = incidentIn(state, "C3");
  const b2Sector = state.sectors.find((s) => s.id === "B2");

  if (!fired.has("b2-suspected") && (b2 || (b2Sector && b2Sector.status !== "normal"))) {
    return {
      id: "b2-suspected",
      step: 1,
      sector: "B2",
      title: "A leak nobody can see",
      text: "Meters in B2 show more water going in than being used: a leak nobody can see.",
    };
  }
  if (!fired.has("c3-confirmed") && c3?.verdict === "CONFIRMED") {
    return {
      id: "c3-confirmed",
      step: 2,
      sector: "C3",
      title: "Citizens confirm a burst",
      text: `Citizens photographed a burst next to the hospital. AI checked the photos. Score ${Math.round(c3.score.P)}/100.`,
    };
  }
  if (
    !fired.has("dispatch") &&
    state.crew.status !== "idle" &&
    !!state.crew.incidentId &&
    state.crew.incidentId === c3?.id
  ) {
    return {
      id: "dispatch",
      step: 3,
      sector: "C3",
      title: "One crew, highest score first",
      text: "The one crew goes to the highest score first.",
    };
  }
  if (!fired.has("c3-verified") && c3?.status === "verified") {
    return {
      id: "c3-verified",
      step: 4,
      sector: "C3",
      title: "Verified, not just closed",
      text: "Meters confirm the loss is back to normal. Verified, not just closed.",
    };
  }
  if (!fired.has("evening") && (b2?.status === "verified" || dayOver)) {
    return {
      id: "evening",
      step: 5,
      sector: b2?.status === "verified" ? "B2" : null,
      title: "Evening",
      text:
        b2?.status === "verified"
          ? "B2's hidden leak is fixed and verified by meters too. The day report shows what was recovered."
          : "The day is over. The day report shows what was recovered.",
    };
  }
  return null;
}
