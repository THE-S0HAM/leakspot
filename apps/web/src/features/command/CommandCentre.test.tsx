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
        inflowLitres: 41250,
        usedLitres: 30100,
      },
    ],
    incidents,
    recentEvents: [
      { at: { day: 15, slotIndex: slot, label: "07:00" }, label: "C3 confirmed", kind: "sector" },
    ],
    recentReports: [],
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

// The city view isn't under test here; stub it so these tests never pull the three.js chunk into the
// module graph (keeps them fast and deterministic). The real fallback choice is covered elsewhere.
vi.mock("../../world/CityCanvas", () => ({
  CityCanvas: () => null,
}));

import { MemoryRouter } from "react-router";
import { CommandCentre } from "./CommandCentre";

function renderCommand(): void {
  render(
    <MemoryRouter initialEntries={["/command"]}>
      <CommandCentre />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  try {
    sessionStorage.clear();
    localStorage.clear();
  } catch {
    // ignore
  }
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

// Long end-to-end component flows: ~0.5 s alone, but >5 s when the whole monorepo suite runs in
// parallel on a laptop. A 20 s budget; the assertions are unchanged.
describe("Command Centre loop", { timeout: 20_000 }, () => {
  it("runs new run → ticks → dispatch C3 → 2 ticks → mark repaired → 3 ticks → VERIFIED", async () => {
    renderCommand();

    // Code gate: fill 8 cells and enter.
    const cells = screen.getAllByLabelText(/Code character/);
    "ABCDEFGH".split("").forEach((ch, i) => {
      const cell = cells[i];
      if (cell) fireEvent.change(cell, { target: { value: ch } });
    });
    fireEvent.click(screen.getByRole("button", { name: /Enter/ }));

    // Lobby: start a run explicitly, then dismiss the mission briefing.
    fireEvent.click(await screen.findByRole("button", { name: /Run it yourself/ }));
    fireEvent.click(await screen.findByRole("button", { name: /^Start$/ }));

    // New run loaded → Step past 07:00 (slot 4) so the crew is on duty and C3 is present. Await each
    // step so the async tick state settles before the next click.
    const step = await screen.findByRole("button", { name: /^Step$/ });
    for (let i = 0; i < 6; i += 1) {
      const before = getSlotLabel();
      fireEvent.click(step);
      await waitFor(() => expect(getSlotLabel()).not.toBe(before));
    }

    // C3 card is present; dispatch it. Both the card and the Next-move bar expose a "Dispatch crew"
    // button (same handler); click the last one (the card's).
    await waitFor(() =>
      expect(screen.getAllByRole("button", { name: /Dispatch crew/ }).length).toBeGreaterThan(0),
    );
    const dispatches = screen.getAllByRole("button", {
      name: /Dispatch crew/,
    }) as HTMLButtonElement[];
    const dispatch = dispatches[dispatches.length - 1] as HTMLButtonElement;
    await waitFor(() => expect(dispatch.disabled).toBe(false));
    fireEvent.click(dispatch);

    // Each Step is async (a tick-in-flight guard drops overlapping clicks), so await the clock advancing
    // between clicks.
    const stepAndWait = async (): Promise<void> => {
      const before = getSlotLabel();
      fireEvent.click(step);
      await waitFor(() => expect(getSlotLabel()).not.toBe(before));
    };

    // Two ticks: en route → on site.
    await stepAndWait();
    await stepAndWait();

    // Mark repaired becomes available on site (card and possibly the Next-move bar).
    const repairs = (await screen.findAllByRole("button", {
      name: /Mark repaired/,
    })) as HTMLButtonElement[];
    const repair = repairs[repairs.length - 1] as HTMLButtonElement;
    fireEvent.click(repair);

    // Three ticks: verifying 1/2/3 → VERIFIED banner.
    await stepAndWait();
    await stepAndWait();
    await stepAndWait();

    // Once verified, the card collapses to a green "✓ C3 verified" line in the rail.
    await waitFor(() => {
      expect(screen.getByText(/✓ C3 verified/)).toBeTruthy();
    });
  });

  it("never calls createRun when getState or tick fails (429 / 500 / network)", async () => {
    const client = await import("../../api/client");
    const createSpy = vi.mocked(client.createRun);
    const tickSpy = vi.mocked(client.tickRun);
    createSpy.mockClear();

    renderCommand();
    const cells = screen.getAllByLabelText(/Code character/);
    "ABCDEFGH".split("").forEach((ch, i) => {
      const cell = cells[i];
      if (cell) fireEvent.change(cell, { target: { value: ch } });
    });
    fireEvent.click(screen.getByRole("button", { name: /Enter/ }));
    fireEvent.click(await screen.findByRole("button", { name: /Run it yourself/ }));
    fireEvent.click(await screen.findByRole("button", { name: /^Start$/ }));
    const step = await screen.findByRole("button", { name: /^Step$/ });
    expect(createSpy).toHaveBeenCalledTimes(1); // the explicit Start, nothing else

    // Make ticks fail with 429, then 500, then a network error. None must create a run.
    class ApiErr extends Error {
      constructor(
        readonly status: number,
        readonly code: string,
        msg: string,
      ) {
        super(msg);
      }
    }
    tickSpy
      .mockRejectedValueOnce(new ApiErr(429, "RATE_LIMITED", "slow down"))
      .mockRejectedValueOnce(new ApiErr(500, "INTERNAL", "boom"))
      .mockRejectedValueOnce(new ApiErr(0, "NETWORK", "offline"));

    // Each failing Step must settle (the in-flight guard drops overlapping clicks) before the next.
    for (let n = 1; n <= 3; n += 1) {
      fireEvent.click(step);
      await waitFor(() => expect(tickSpy).toHaveBeenCalledTimes(n));
    }

    expect(createSpy).toHaveBeenCalledTimes(1); // still only the explicit Start, no error path created one
  });
});
