// Live metrics: seed the local dev API with a few real runs (one full day on autopilot, two partial),
// then capture / and /metrics at 1440x900 and 390x844. Checks the KPI strip is above the fold.
// Run with `npm run shots -w @leakspot/web -- metrics`.
import { expect, test, type APIRequestContext } from "@playwright/test";
import { TEST_CODE } from "../playwright.config";

const OUT = "e2e/screenshots/metrics";
const H = { "x-leakspot-code": TEST_CODE };

async function seed(request: APIRequestContext): Promise<void> {
  for (const ticks of [20, 6, 3]) {
    const { runId } = (await (await request.post("/api/runs", { headers: H })).json()) as {
      runId: string;
    };
    await request.post(`/api/runs/${runId}/autopilot`, { headers: H, data: { on: true } });
    for (let i = 0; i < Math.ceil(ticks / 4); i += 1) {
      await request.post(`/api/runs/${runId}/tick`, { headers: H, data: { count: 4 } });
    }
  }
}

test.beforeAll(async ({ request }) => {
  await seed(request);
});

for (const size of [
  { name: "desktop", width: 1440, height: 900 },
  { name: "phone", width: 390, height: 844 },
]) {
  test(`landing and metrics at ${size.name}`, async ({ page }) => {
    await page.setViewportSize({ width: size.width, height: size.height });
    await page.goto("/");
    await expect(page.getByText("Leaks resolved")).toBeVisible();
    await page.waitForTimeout(3000);
    for (const label of ["Runs", "Water recovered", "Enter command centre"]) {
      await expect(page.getByText(label, { exact: true }).first()).toBeInViewport();
    }
    await page.screenshot({ path: `${OUT}/${size.name}-landing-fold.png` });
    await page.screenshot({ path: `${OUT}/${size.name}-landing-full.png`, fullPage: true });
    await page.goto("/metrics");
    await expect(page.getByText(/Updated \d+ s ago/)).toBeVisible({ timeout: 15_000 });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${OUT}/${size.name}-metrics.png`, fullPage: true });
  });
}
