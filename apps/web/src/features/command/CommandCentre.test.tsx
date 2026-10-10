// Proves the Command Centre wiring: render with a fake API client and click the whole loop —
// code gate → New run → ticks until C3 appears → Dispatch on C3 → 2 ticks (en route → on site) →
// Mark repaired → 3 ticks (verifying 1/2/3) → VERIFIED banner. If any button is wired to the wrong
// endpoint or the card state machine is wrong, this fails.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { RunStateView } from "../../state/view-types";

// ---- a scripted fake run the fake client walks through ----
let slot = -1;
let crew: RunStateView["crew"] = { status: "idle" };
let c3status: RunStateView["incidents"][number]["status"] = "open";
let verifyPasses = 0;

function c3(): RunStateView["incidents"][number] {
  return {
    id: "#2",
    kind: "visible",
    sectorId: "C3",
    status: c3status,
    verdict: "CONFIRMED",
    pin: { x: 13, z: 85 },
    score: { W: 0.9, E: 1, C: 1, K: 1, P: 96 },
    why: "Excess 1.8 lakh L/day, hospital 90 m away",
    verifyPasses,
  };
}

function snapshot(): RunStateView {
  const incidents = slot >= 2 ? [c3()] : [];
  return {
    runId: "K7Q2X",
    cycle: 1,
    simClock: { day: 15, slotIndex: slot, label: slot < 0 ? "05:45" : `slot-${slot}` },
    supplyOn: slot >= 0,
    autopilot: false,
    crew,
    cityHealth: 70,
    waterRecoveredLitres: c3status === "verified" ? 180000 : 0,
    sectors: [
      {
        id: "C3",
        status: slot >= 2 ? "confirmed" : "normal",
        lossRatio: 0.4,
        baselineRatio: 0.15,
        excessLitresPerDay: 180000,
      },
    ],
    incidents,
    recentEvents: [
      { at: { day: 15, slotIndex: slot, label: "07:00" }, label: "C3 confirmed", kind: "sector" },
    ],
  };
}

function advance(): void {
  slot += 1;
  // crew lifecycle driven by ETA, like the real engine
  if (crew.status === "dispatched") {
    const eta = (crew.etaSlots ?? 1) - 1;
    crew =
      eta <= 0
        ? { status: "onsite", incidentId: "#2" }
        : { status: "dispatched", incidentId: "#2", etaSlots: eta };
    if (crew.status === "onsite") c3status = "onsite";
  }
  if (c3status === "verifying") {
    verifyPasses += 1;
    if (verifyPasses >= 3) c3status = "verified";
  }
}

vi.mock("../../api/client", () => ({
  ApiCallError: class extends Error {},
  checkCode: vi.fn(async () => ({ ok: true })),
  createRun: vi.fn(async () => {
    slot = -1;
    crew = { status: "idle" };
    c3status = "open";
    verifyPasses = 0;
    return { runId: "K7Q2X" };
  }),
  getState: vi.fn(async () => snapshot()),
  tickRun: vi.fn(async () => {
    advance();
    return snapshot();
  }),
  setAutopilot: vi.fn(async () => snapshot()),
  dispatchCrew: vi.fn(async () => {
    crew = { status: "dispatched", incidentId: "#2", etaSlots: 2 };
    c3status = "dispatched";
    return snapshot();
  }),
  repairIncident: vi.fn(async () => {
    c3status = "verifying";
    verifyPasses = 0;
    return snapshot();
  }),
}));

// qrcode is loaded by QrJoin on the Impact tab; stub it so the test never touches it.
vi.mock("qrcode", () => ({ default: { toDataURL: vi.fn(async () => "data:,") } }));

import { CommandCentre } from "./CommandCentre";

beforeEach(() => {
  slot = -1;
  crew = { status: "idle" };
  c3status = "open";
  verifyPasses = 0;
});
afterEach(() => cleanup());

function getSlotLabel(): string {
  const clock = screen.queryByText(/Day 15/);
  return clock?.textContent ?? "05:45";
}

describe("Command Centre loop", () => {
  it("runs new run → ticks → dispatch C3 → 2 ticks → mark repaired → 3 ticks → VERIFIED", async () => {
    render(<CommandCentre />);

    // Code gate: fill 8 cells and enter.
    const cells = screen.getAllByLabelText(/Code character/);
    "ABCDEFGH".split("").forEach((ch, i) => {
      const cell = cells[i];
      if (cell) fireEvent.change(cell, { target: { value: ch } });
    });
    fireEvent.click(screen.getByRole("button", { name: /Enter/ }));

    // New run loaded → Step past 07:00 (slot 4) so the crew is on duty and C3 is present. Await each
    // step so the async tick state settles before the next click.
    const step = await screen.findByRole("button", { name: /^Step$/ });
    for (let i = 0; i < 6; i += 1) {
      const before = getSlotLabel();
      fireEvent.click(step);
      await waitFor(() => expect(getSlotLabel()).not.toBe(before));
    }

    // C3 card is present; dispatch it (button enabled now the crew is on duty).
    const dispatch = (await screen.findByRole("button", {
      name: /Dispatch crew/,
    })) as HTMLButtonElement;
    await waitFor(() => expect(dispatch.disabled).toBe(false));
    fireEvent.click(dispatch);

    // Two ticks: en route → on site.
    fireEvent.click(step);
    fireEvent.click(step);

    // Mark repaired becomes available on site.
    const repair = (await screen.findByRole("button", {
      name: /Mark repaired/,
    })) as HTMLButtonElement;
    fireEvent.click(repair);

    // Three ticks: verifying 1/2/3 → VERIFIED banner.
    fireEvent.click(step);
    fireEvent.click(step);
    fireEvent.click(step);

    await waitFor(() => {
      expect(screen.getByText(/Verified by meters/)).toBeTruthy();
    });
  });
});
