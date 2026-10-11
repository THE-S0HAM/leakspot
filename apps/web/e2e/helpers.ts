// Shared e2e helpers: enter the test command code, start a run, dismiss the briefing.
import { expect, type Page } from "@playwright/test";
import { TEST_CODE } from "../playwright.config";

/** From the command gate to a running run: type the code, Run it yourself, dismiss the briefing. */
export async function startRun(page: Page): Promise<void> {
  await page.goto("/command");
  const cells = page.getByLabel(/Code character/);
  for (let i = 0; i < TEST_CODE.length; i += 1) {
    await cells.nth(i).fill(TEST_CODE[i] ?? "");
  }
  await page.getByRole("button", { name: /Enter/ }).click();
  await page.getByRole("button", { name: /Run it yourself/ }).click();
  // The mission briefing modal opens over the HUD; dismiss it with Start.
  await page.getByRole("button", { name: /^Start$/ }).click();
  // The HUD is up once the health bar is on screen (data-testid is stable across CSS-module hashing).
  await expect(page.getByTestId("health-bar")).toBeVisible();
}
