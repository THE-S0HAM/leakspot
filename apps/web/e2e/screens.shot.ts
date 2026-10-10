// Visual check for Stage 1-3D: /command at 05:45 (just started), 06:45 (after stepping) and with X-ray on,
// plus / and /report, at desktop and phone sizes. Run with `npm run shots -w @leakspot/web`, then open
// e2e/screenshots/*.png. Not part of the default e2e run (only *.spec.ts runs there).
import { expect, test, type Page } from "@playwright/test";
import { startRun } from "./helpers";

const SIZES = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "phone", width: 390, height: 844 },
] as const;

const OUT = "e2e/screenshots";

/** Let the lazy 3D chunk load and a few frames render before capturing. */
async function settle(page: Page): Promise<void> {
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(2500);
}

for (const size of SIZES) {
  test.describe(size.name, () => {
    test.use({ viewport: { width: size.width, height: size.height } });

    test("command centre", async ({ page }) => {
      await startRun(page);
      await settle(page);
      await page.screenshot({ path: `${OUT}/${size.name}-command-0545.png` });

      // Step until the HUD clock reads 06:45 (scenario: C3 confirmed).
      for (let i = 0; i < 12; i += 1) {
        if (await page.getByText(/06:45/).first().isVisible()) break;
        await page.getByRole("button", { name: /^Step$/ }).click();
        await page.waitForTimeout(400);
      }
      await expect(page.getByText(/06:45/).first()).toBeVisible();
      await settle(page);
      await page.screenshot({ path: `${OUT}/${size.name}-command-0645.png` });

      await page.getByRole("button", { name: /^X-ray$/ }).click();
      await page.waitForTimeout(1200);
      await page.screenshot({ path: `${OUT}/${size.name}-command-xray.png` });
    });

    test("landing", async ({ page }) => {
      await page.goto("/");
      await settle(page);
      await page.screenshot({ path: `${OUT}/${size.name}-landing.png` });
    });

    test("report", async ({ page }) => {
      await page.goto("/report");
      await settle(page);
      await page.screenshot({ path: `${OUT}/${size.name}-report.png` });
    });
  });
}
