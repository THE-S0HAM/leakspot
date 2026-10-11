// JOB 2: the mode chooser, the guided story (each beat's caption as it fires), the "?" explainer and the
// one-line top bar at 1280–1920. Run with `npm run shots -w @leakspot/web -- story`.
import { expect, test, type Page } from "@playwright/test";
import { TEST_CODE } from "../playwright.config";

const OUT = "e2e/screenshots/story";

async function gate(page: Page): Promise<void> {
  await page.goto("/command");
  const cells = page.getByLabel(/Code character/);
  for (let i = 0; i < TEST_CODE.length; i += 1) await cells.nth(i).fill(TEST_CODE[i] ?? "");
  await page.getByRole("button", { name: /Enter/ }).click();
}

test("watch it work: chooser, five beats, day report", async ({ page }) => {
  test.setTimeout(300_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await gate(page);
  await expect(page.getByRole("button", { name: /Watch it work/ })).toBeVisible();
  await page.screenshot({ path: `${OUT}/00-chooser.png` });
  await page.getByRole("button", { name: /Watch it work/ }).click();
  await expect(page.getByTestId("health-bar")).toBeVisible();

  for (let n = 1; n <= 5; n += 1) {
    const step = page.getByText(new RegExp(`^${n} / 5$`));
    await expect(step).toBeVisible({ timeout: 120_000 });
    await page.waitForTimeout(900); // camera ease
    await page.screenshot({ path: `${OUT}/beat-${n}.png` });
    await page.getByRole("button", { name: /^Next$/ }).click();
  }
  await expect(page.getByRole("heading", { name: /Day report/ })).toBeVisible({ timeout: 120_000 });
  await page.screenshot({ path: `${OUT}/99-day-report.png` });
});

test("take over switches to manual", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await gate(page);
  await page.getByRole("button", { name: /Watch it work/ }).click();
  await page
    .getByRole("button", { name: /Take over/ })
    .first()
    .click();
  await expect(page.getByRole("button", { name: /Autopilot off/ })).toBeVisible({
    timeout: 10_000,
  });
  await page.screenshot({ path: `${OUT}/take-over.png` });
});

test("explainer and top bar at 1280-1920", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await gate(page);
  await page.getByRole("button", { name: /Run it yourself/ }).click();
  await page.getByRole("button", { name: /^Start$/ }).click();
  await page.getByRole("button", { name: "How LeakSpot works" }).click();
  await page.screenshot({ path: `${OUT}/explainer.png` });
  await page.getByRole("button", { name: /Got it/ }).click();
  for (const width of [1280, 1366, 1440, 1600, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    await page.waitForTimeout(300);
    const bar = page.locator("header").first();
    const box = await bar.boundingBox();
    // one line: the bar is no taller than its tallest button + padding
    expect(box?.height ?? 999, `top bar wraps at ${width}px`).toBeLessThan(80);
    await bar.screenshot({ path: `${OUT}/topbar-${width}.png` });
  }
});
