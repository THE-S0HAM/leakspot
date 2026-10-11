// /report component test with mocked client/upload/compress (jsdom has no canvas or createImageBitmap):
// join a run → "I see a leak" → take photo → flowing → tap the map → Send → ticket link appears.

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

vi.mock("../../api/client", () => ({
  getPublicState: vi.fn(async () => ({ runId: "K7Q2X", isShowcase: false })),
  classifyReport: vi.fn(async () => ({
    reportId: "0000000000RPT0000000000001",
    label: "minor_drip",
    confidence: 0.9,
    rejected: false,
    stages: [],
    incident: { id: "#2", status: "open", verdict: "LOCAL_LEAK" },
  })),
}));

vi.mock("./upload", () => ({
  UploadError: class extends Error {},
  postReport: vi.fn(async (...args: unknown[]) => {
    const onProgress = args[2] as (f: number) => void;
    onProgress(1);
    return { reportId: "0000000000RPT0000000000001", ticketCode: "K7Q2X-0001", stages: [] };
  }),
}));

vi.mock("./compress", () => ({
  browserEncoder: () => ({}),
  compressPhoto: vi.fn(async () => ({ base64: "AAAA", bytes: 234000, width: 1024, height: 768 })),
}));

import { MemoryRouter, Routes, Route } from "react-router";
import { SECTOR_BY_ID } from "@leakspot/core/world";
import { postReport } from "./upload";
import { ReportApp } from "./ReportApp";

function renderAt(path: string): void {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/report" element={<ReportApp />} />
        <Route path="/t/:runId/:reportId" element={<div>TICKET PAGE</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

afterEach(() => cleanup());

describe("/report leak flow", () => {
  it("photo → flowing → tap the spot → Send → See my ticket", async () => {
    renderAt("/report?run=K7Q2X&sector=D4");

    // Home: choose "I see a leak".
    fireEvent.click(await screen.findByRole("button", { name: /I see a leak/ }));

    // Take a photo (the hidden file input).
    const file = new File([new Uint8Array([1, 2, 3])], "leak.jpg", { type: "image/jpeg" });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });

    // Preview appears (size + the EXIF-removed line), then choose Flowing.
    await screen.findByText(/Location data removed/i);
    fireEvent.click(screen.getByRole("button", { name: /Water flowing/ }));

    // The spot step shows the mini-map; the ?sector=D4 link pre-selected the sector, so the pin is set.
    await screen.findByRole("img", { name: /tap where you see the problem/i });

    // Send (enabled once pin + choice + photo are set).
    const send = await screen.findByRole("button", { name: /^Send$/ });
    await waitFor(() => expect((send as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(send);

    // The ticket link appears; clicking it routes to the ticket page.
    const ticketBtn = await screen.findByRole("button", { name: /See my ticket/ });
    fireEvent.click(ticketBtn);
    expect(await screen.findByText("TICKET PAGE")).toBeTruthy();
  });

  it("a ?sector= link sends that sector's centre, never world (0, 0)", async () => {
    vi.mocked(postReport).mockClear();
    renderAt("/report?run=K7Q2X&sector=C2");
    fireEvent.click(await screen.findByRole("button", { name: /I see a leak/ }));
    const file = new File([new Uint8Array([1, 2, 3])], "leak.jpg", { type: "image/jpeg" });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });
    await screen.findByText(/Location data removed/i);
    fireEvent.click(screen.getByRole("button", { name: /Water flowing/ }));
    const send = await screen.findByRole("button", { name: /^Send$/ });
    await waitFor(() => expect((send as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(send);
    await waitFor(() => expect(vi.mocked(postReport)).toHaveBeenCalled());
    const body = vi.mocked(postReport).mock.calls[0]?.[1] as { x: number; z: number };
    expect(body.x).toBe(SECTOR_BY_ID.C2.centroid.x);
    expect(body.z).toBe(SECTOR_BY_ID.C2.centroid.z);
  });
});
