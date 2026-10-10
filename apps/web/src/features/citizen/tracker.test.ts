import { describe, expect, it } from "vitest";
import type { TicketView } from "../../state/view-types";
import { deriveTracker } from "./tracker";

function ticket(over: Partial<TicketView>): TicketView {
  return {
    reportId: "0000000000RPT0000000000001",
    ticketCode: "K7Q2X-0001",
    type: "leak_photo",
    sectorId: "C3",
    rejected: false,
    selfReported: false,
    label: "burst",
    status: "done",
    mergedCount: 0,
    stages: [],
    ...over,
  };
}

describe("deriveTracker", () => {
  it("rejected: received+checked done, terminal, flagged rejected", () => {
    const tr = deriveTracker(ticket({ rejected: true }));
    expect(tr.rejected).toBe(true);
    expect(tr.terminal).toBe(true);
    expect(tr.blocks.map((b) => b.state)).toEqual(["done", "done", "todo", "todo", "todo"]);
  });

  it("self-reported, matched to an open incident: Checked + Crew-assigned pending", () => {
    const tr = deriveTracker(
      ticket({ selfReported: true, incident: { id: "#2", status: "open", verdict: "LOCAL_LEAK" } }),
    );
    expect(tr.rejected).toBe(false);
    expect(tr.blocks[1].state).toBe("done"); // checked
    expect(tr.blocks[2].state).toBe("active"); // crew assigned (next)
    expect(tr.terminal).toBe(false);
  });

  it("merged into a dispatched incident: crew-assigned done, repaired active", () => {
    const tr = deriveTracker(
      ticket({
        mergedCount: 5,
        incident: { id: "#2", status: "dispatched", verdict: "CONFIRMED" },
      }),
    );
    expect(tr.blocks[2].state).toBe("done");
    expect(tr.blocks[3].state).toBe("active");
  });

  it("verifying: four blocks done, last active", () => {
    const tr = deriveTracker(
      ticket({ incident: { id: "#2", status: "verifying", verdict: "CONFIRMED" } }),
    );
    expect(tr.blocks[3].state).toBe("done");
    expect(tr.blocks[4].state).toBe("active");
    expect(tr.terminal).toBe(false);
  });

  it("verified: all five done, terminal, not logged", () => {
    const tr = deriveTracker(
      ticket({ incident: { id: "#2", status: "verified", verdict: "CONFIRMED" } }),
    );
    expect(tr.blocks.every((b) => b.state === "done")).toBe(true);
    expect(tr.terminal).toBe(true);
    expect(tr.loggedNotVerified).toBe(false);
  });

  it("closed_logged: all five done, terminal, block 5 shows Repair logged", () => {
    const tr = deriveTracker(
      ticket({ incident: { id: "#3", status: "closed_logged", verdict: "LOCAL_LEAK" } }),
    );
    expect(tr.blocks.every((b) => b.state === "done")).toBe(true);
    expect(tr.terminal).toBe(true);
    expect(tr.loggedNotVerified).toBe(true);
  });

  it("no incident yet, still pending: Received done, Checked active, not terminal", () => {
    const tr = deriveTracker(ticket({ status: "pending", incident: undefined, label: undefined }));
    expect(tr.blocks[0].state).toBe("done");
    expect(tr.blocks[1].state).toBe("active");
    expect(tr.terminal).toBe(false);
  });
});
