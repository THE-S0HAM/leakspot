// The LIVE site after a deploy: / and /metrics at 1440x900 and 390x844, plus the README image.
// Run with `npm run shots -w @leakspot/web -- live`.
import { expect, test } from "@playwright/test";

const SITE = "https://d16l2tljxlr7ci.cloudfront.net";
const OUT = "e2e/screenshots/live";

for (const size of [
  { name: "desktop", width: 1440, height: 900 },
  { name: "phone", width: 390, height: 844 },
]) {
  test(`live site at ${size.name}`, async ({ page }) => {
    await page.setViewportSize({ width: size.width, height: size.height });
    await page.goto(`${SITE}/`);
    await expect(page.getByText("Leaks resolved")).toBeVisible({ timeout: 20_000 });
    await page.waitForTimeout(4000);
    await expect(page.getByText("Water recovered", { exact: true }).first()).toBeInViewport();
    await page.screenshot({ path: `${OUT}/${size.name}-landing-fold.png` });
    await page.screenshot({ path: `${OUT}/${size.name}-landing-full.png`, fullPage: true });
    await page.goto(`${SITE}/metrics`);
    await expect(page.getByText(/Updated \d+ s ago/)).toBeVisible({ timeout: 20_000 });
    await page.waitForTimeout(2000);
    await page.screenshot({ path: `${OUT}/${size.name}-metrics.png`, fullPage: true });
    if (size.name === "desktop") {
      await page.screenshot({
        path: "../../docs/images/metrics-live.jpg",
        type: "jpeg",
        quality: 82,
        fullPage: true,
      });
    }
  });
}
