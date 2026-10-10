// Guards design-system.md "human words everywhere": the rendered Command Centre text must contain no
// snake_case identifier (e.g. "major_leak", "closed_logged", "HIDDEN_SUSPECTED" survives as upper, but
// lowercase snake_case must not appear). Drives a fake run through incidents + a verified/logged state.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { RunStateView } from "../../state/view-types";

let slot = 8;

function state(): RunStateView {
  return {
    runId: "K7Q2X",
    cycle: 1,
    simClock: { day: 15, slotIndex: slot, label: "08:00" },
    supplyOn: true,
    autopilot: false,
    crew: { status: "idle" },
    cityHealth: 72,
    waterRecoveredLitres: 180000,
    sectors: [
      {
        id: "C3",
        status: "verified",
        lossRatio: 0.15,
        baselineRatio: 0.15,
        excessLitresPerDay: 0,
        inflowLitres: 41250,
        usedLitres: 30100,
      },
      {
        id: "A1",
        status: "normal",
        lossRatio: 0.14,
        baselineRatio: 0.14,
        excessLitresPerDay: 0,
        inflowLitres: 5000,
        usedLitres: 4300,
      },
    ],
    incidents: [
      {
        id: "#2",
        kind: "visible",
        sectorId: "C3",
        status: "verified",
        verdict: "CONFIRMED",
        pin: { x: 13, z: 85 },
        score: { W: 0.9, E: 1, C: 1, K: 1, P: 96 },
        why: "Excess 1.8 lakh L/day, 7 reports (burst), 3 of 3 signals agree",
        recoveredLitresPerDay: 180000,
      },
      {
        id: "#3",
        kind: "visible",
        sectorId: "A1",
        status: "closed_logged",
        verdict: "LOCAL_LEAK",
        pin: { x: 10, z: 20 },
        score: { W: 0, E: 0.6, C: 0.3, K: 0.67, P: 31 },
        why: "3 reports (major leak), 2 of 3 signals agree",
      },
    ],
    recentEvents: [
      {
        at: { day: 15, slotIndex: slot, label: "08:15" },
        label: "C3 verified by meters",
        kind: "incident",
      },
      { at: { day: 15, slotIndex: 3, label: "06:45" }, label: "C3 suspected", kind: "sector" },
    ],
    recentReports: [],
  };
}

vi.mock("../../api/client", () => ({
  ApiCallError: class extends Error {},
  checkCode: vi.fn(async () => ({ ok: true })),
  createRun: vi.fn(async () => ({ runId: "K7Q2X" })),
  getState: vi.fn(async () => state()),
  tickRun: vi.fn(async () => state()),
  setAutopilot: vi.fn(async () => state()),
  dispatchCrew: vi.fn(async () => state()),
  repairIncident: vi.fn(async () => state()),
}));
vi.mock("qrcode", () => ({ default: { toDataURL: vi.fn(async () => "data:,") } }));

import { MemoryRouter } from "react-router";
import { CommandCentre } from "./CommandCentre";

beforeEach(() => {
  slot = 8;
});
afterEach(() => cleanup());

describe("no snake_case in the Command Centre", () => {
  it("renders only human words (incidents tab + impact tab)", async () => {
    const { container } = render(
      <MemoryRouter initialEntries={["/command"]}>
        <CommandCentre />
      </MemoryRouter>,
    );
    const cells = screen.getAllByLabelText(/Code character/);
    "ABCDEFGH".split("").forEach((ch, i) => {
      const cell = cells[i];
      if (cell) fireEvent.change(cell, { target: { value: ch } });
    });
    fireEvent.click(screen.getByRole("button", { name: /Enter/ }));
    fireEvent.click(await screen.findByRole("button", { name: /Start my run/ }));
    fireEvent.click(await screen.findByRole("button", { name: /^Start$/ }));

    // Wait for the loaded state (the event feed title appears) — the Incidents tab shows collapsed
    // verified/logged lines + the feed. Then check the Impact tab text too.
    await screen.findByText(/Event feed/);
    const incidentsText = container.textContent ?? "";

    fireEvent.click(screen.getByRole("button", { name: /^Impact$/ }));
    await waitFor(() => expect(screen.getByText(/With vs without/)).toBeTruthy());
    const impactText = container.textContent ?? "";

    for (const text of [incidentsText, impactText]) {
      expect(
        text.match(/[a-z]+_[a-z]+/),
        `snake_case: ${text.match(/[a-z]+_[a-z]+/)?.[0] ?? ""}`,
      ).toBeNull();
      // No raw incident ids (#2) or scripted report ids (S15-5-10), and no "undefined".
      expect(text).not.toMatch(/#\d/);
      expect(text).not.toMatch(/S\d+-\d+-\d+/);
      expect(text).not.toContain("undefined");
    }
  });
});
