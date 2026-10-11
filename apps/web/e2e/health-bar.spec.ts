// The City-water-health bar must actually render a filled, coloured segment. The fill's
// width ≈ track width × health/100 (±2% of the track), and its background-color differs from the track.
import { expect, test } from "@playwright/test";
import { startRun } from "./helpers";

test("health bar renders a filled, coloured segment matching the value", async ({ page }) => {
  await startRun(page);

  const bar = page.getByTestId("health-bar");
  const fill = page.getByTestId("health-fill");
  await expect(bar).toBeVisible();
  await expect(fill).toBeVisible();

  // Read the displayed health number from the HUD (next to the bar).
  const healthText = await page.locator('[data-testid="health-bar"] + *').first().textContent();
  const health = Number((healthText ?? "").replace(/\D/g, "")) || 100;

  const barBox = await bar.boundingBox();
  const fillBox = await fill.boundingBox();
  expect(barBox).not.toBeNull();
  expect(fillBox).not.toBeNull();
  if (!barBox || !fillBox) return;

  // The track has a 1px border each side; allow ±2% of the track width.
  const expected = (barBox.width - 2) * (health / 100);
  expect(Math.abs(fillBox.width - expected)).toBeLessThanOrEqual(barBox.width * 0.02 + 2);
  expect(fillBox.width).toBeGreaterThan(0);

  // Fill colour differs from the track colour.
  const trackBg = await bar.evaluate((el) => getComputedStyle(el).backgroundColor);
  const fillBg = await fill.evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(fillBg).not.toBe(trackBg);
  expect(fillBg).not.toBe("rgba(0, 0, 0, 0)");
});
