// Component test for the web shell: proves it renders exactly one level-1 "LeakSpot" heading (Req 10.5).
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { App } from "./App";

// vitest.config.ts sets globals: false, so Testing Library's auto-cleanup is not registered; do it explicitly.
afterEach(() => {
  cleanup();
});

describe("App shell", () => {
  it("renders a level-1 heading named LeakSpot", () => {
    render(<App />);
    const heading = screen.getByRole("heading", { level: 1, name: "LeakSpot" });
    expect(heading).not.toBeNull();
    expect(heading.textContent).toBe("LeakSpot");
  });

  it("renders exactly one level-1 heading", () => {
    render(<App />);
    const headings = screen.getAllByRole("heading", { level: 1 });
    expect(headings).toHaveLength(1);
  });
});
