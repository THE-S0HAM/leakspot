// PART 2: the "Judges: the access code is in the project's submission form." line on the landing page
// and the command code screen, at phone and desktop widths.
import { expect, test } from "@playwright/test";

for (const width of [390, 1440]) {
  test(`judges line at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    await page.goto("/");
    const line = page.getByText(/Judges: the access code/);
    await expect(line).toBeVisible();
    await expect(line).toBeInViewport();
    await page.waitForTimeout(2500);
    await page.screenshot({ path: `e2e/screenshots/judges-landing-${width}.png` });
    await page.goto("/command");
    await expect(page.getByText(/Judges: the access code/)).toBeVisible();
    await page.screenshot({ path: `e2e/screenshots/judges-gate-${width}.png` });
  });
}
