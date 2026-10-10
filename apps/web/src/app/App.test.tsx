// Smoke test for the app shell at "/": the landing renders the brand, the headline, and both actions.
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { App } from "./App";

afterEach(() => {
  cleanup();
});

describe("App shell at /", () => {
  it("renders the landing with the brand, headline and both actions", () => {
    render(<App />);
    expect(screen.getByText("LeakSpot")).toBeTruthy();
    expect(
      screen.getByRole("heading", { level: 1, name: /Find the water the city can't see/ }),
    ).toBeTruthy();
    expect(screen.getByRole("link", { name: /I see a leak/ })).toBeTruthy();
    expect(screen.getByRole("link", { name: /Enter command centre/ })).toBeTruthy();
  });
});
