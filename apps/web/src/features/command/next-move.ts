// Derives the "Next move" guidance line from run state only (pure, unit-tested per case). Returns one
// sentence and, when there is an action, a button descriptor the UI wires to the same handler as the
// card. No API calls, no randomness.

import { FACILITIES } from "@leakspot/core/world";
import type { RunStateView, IncidentView } from "../../state/view-types";

export type NextAction =
  | { kind: "play" }
  | { kind: "dispatch"; incidentId: string }
  | { kind: "repair"; incidentId: string };

export type NextMove = { text: string; action?: NextAction; label?: string };

const CREW_ON_DUTY_SLOT = 4; // 07:00
const LAST_SLOT = 19;

function near(incident: IncidentView): string {
  // Mention the hospital when the pin is within 30 units of it (criticality is already in the score).
  const hospital = FACILITIES.find((f) => f.kind === "hospital");
  if (hospital) {
    const d = Math.hypot(hospital.at.x - incident.pin.x, hospital.at.z - incident.pin.z);
    if (d <= 30) return ", next to the hospital";
  }
  return "";
}

/** The single most important next move given the current state. */
export function nextMove(state: RunStateView): NextMove {
  // Before supply starts.
  if (state.simClock.slotIndex < 0) {
    return { text: "Supply starts at 06:00. Press Play.", action: { kind: "play" }, label: "Play" };
  }

  const dayOver = state.simClock.day >= 15 && state.simClock.slotIndex >= LAST_SLOT;
  if (dayOver) {
    return { text: "The day is over at 20:00. See the day report." };
  }

  const onDuty = state.simClock.slotIndex >= CREW_ON_DUTY_SLOT;
  const crew = state.crew;

  // Crew mid-task takes priority.
  if (crew.status === "dispatched" && crew.incidentId) {
    const inc = state.incidents.find((i) => i.id === crew.incidentId);
    return { text: `Crew driving to ${inc?.sectorId ?? "the site"} · ETA ${crew.etaSlots ?? 2}.` };
  }
  if (crew.status === "onsite" && crew.incidentId) {
    const inc = state.incidents.find((i) => i.id === crew.incidentId);
    return {
      text: `Crew at ${inc?.sectorId ?? "the site"}.`,
      action: { kind: "repair", incidentId: crew.incidentId },
      label: "Mark repaired",
    };
  }

  // A verifying incident.
  const verifying = state.incidents.find((i) => i.status === "verifying");
  if (verifying) {
    return {
      text: `Meters checking ${verifying.sectorId}: ${verifying.verifyPasses ?? 0} of 3 clean readings.`,
    };
  }

  // Open incidents, highest score first.
  const open = [...state.incidents]
    .filter((i) => i.status === "open" || i.status === "reopened")
    .sort((a, b) => b.score.P - a.score.P);
  const top = open[0];

  if (top) {
    if (top.verdict === "CONFIRMED") {
      if (!onDuty) {
        return { text: `Burst confirmed at ${top.sectorId}${near(top)}. Crew starts at 07:00.` };
      }
      if (crew.status === "idle") {
        return {
          text: `Burst confirmed at ${top.sectorId}${near(top)}. Dispatch the crew.`,
          action: { kind: "dispatch", incidentId: top.id },
          label: "Dispatch crew",
        };
      }
    }
    // Suspected hidden leak with no citizen evidence yet.
    if (top.kind === "hidden" && top.verdict === "HIDDEN_SUSPECTED") {
      return { text: `${top.sectorId} is losing water nobody can see. Waiting for more signals.` };
    }
    // A reported leak the crew can act on.
    if (onDuty && crew.status === "idle") {
      return {
        text: `Leak reported at ${top.sectorId}. Dispatch the crew.`,
        action: { kind: "dispatch", incidentId: top.id },
        label: "Dispatch crew",
      };
    }
    return { text: `Leak reported at ${top.sectorId}. Crew starts at 07:00.` };
  }

  return {
    text: "All clear. Play on to 20:00 for the day report.",
    action: { kind: "play" },
    label: "Play",
  };
}
