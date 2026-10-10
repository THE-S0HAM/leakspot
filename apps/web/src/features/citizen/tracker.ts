// Pure derivation of the citizen 5-block ticket tracker from the ticket status + incident status.
// Blocks: Received → Checked → Crew assigned → Repaired → Confirmed by meters. Each block is "done",
// "active" or "todo". Rejected and self-reported are handled; a closed_logged incident shows the last
// block as "Repair logged". Unit-tested for every case.

import type { TicketView } from "../../state/view-types";

export type BlockState = "done" | "active" | "todo";
export type TrackerBlock = { key: string; state: BlockState };

export type Tracker = {
  blocks: [TrackerBlock, TrackerBlock, TrackerBlock, TrackerBlock, TrackerBlock];
  rejected: boolean;
  /** block 5 shows "Repair logged" instead of "Confirmed by meters" for a below-resolution close. */
  loggedNotVerified: boolean;
  /** true once the report reached a terminal state (stop polling). */
  terminal: boolean;
};

const KEYS = ["received", "checked", "crewAssigned", "repaired", "confirmedByMeters"] as const;

function blocks(doneCount: number, activeIndex: number): Tracker["blocks"] {
  return KEYS.map((key, i) => ({
    key,
    state: i < doneCount ? "done" : i === activeIndex ? "active" : "todo",
  })) as Tracker["blocks"];
}

/** Derive the tracker. `ticket.incident` carries the incident status when the report was fused. */
export function deriveTracker(ticket: TicketView): Tracker {
  // Rejected: received + checked done, then stop (never assigned a crew).
  if (ticket.rejected) {
    return {
      blocks: blocks(2, -1),
      rejected: true,
      loggedNotVerified: false,
      terminal: true,
    };
  }

  const incidentStatus = ticket.incident?.status;

  // No incident yet (pending classification, or not matched): Received done, Checked active.
  if (!incidentStatus) {
    const checkedDone = ticket.status === "done";
    return {
      blocks: blocks(checkedDone ? 2 : 1, checkedDone ? 2 : 1),
      rejected: false,
      loggedNotVerified: false,
      terminal: false,
    };
  }

  switch (incidentStatus) {
    case "open":
    case "reopened":
      return { blocks: blocks(2, 2), rejected: false, loggedNotVerified: false, terminal: false };
    case "dispatched":
    case "onsite":
      return { blocks: blocks(3, 3), rejected: false, loggedNotVerified: false, terminal: false };
    case "repaired":
    case "verifying":
      return { blocks: blocks(4, 4), rejected: false, loggedNotVerified: false, terminal: false };
    case "verified":
      return { blocks: blocks(5, -1), rejected: false, loggedNotVerified: false, terminal: true };
    case "closed_logged":
      return { blocks: blocks(5, -1), rejected: false, loggedNotVerified: true, terminal: true };
    default:
      return { blocks: blocks(2, 2), rejected: false, loggedNotVerified: false, terminal: false };
  }
}
