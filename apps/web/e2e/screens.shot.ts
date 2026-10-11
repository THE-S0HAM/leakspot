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

      // Step until the HUD clock reads 06:45 (scenario: C3 confirmed). Wait for each tick to land.
      const clock = async (): Promise<string> =>
        (
          (await page
            .getByText(/Day 15 \d\d:\d\d/)
            .first()
            .textContent()) ?? ""
        ).match(/\d\d:\d\d/)?.[0] ?? "";
      for (let i = 0; i < 8 && (await clock()) < "06:45"; i += 1) {
        const before = await clock();
        await page.getByRole("button", { name: /^Step$/ }).click();
        await expect.poll(clock, { timeout: 15_000 }).not.toBe(before);
      }
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

// JOB 1 repro: nothing may grow while idle, and every step to 08:30 must look sane.
test("idle and step to 08:30", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await startRun(page);
  await settle(page);
  for (const s of [0, 10, 30]) {
    if (s) await page.waitForTimeout(s === 10 ? 10_000 : 20_000);
    await page.screenshot({ path: `${OUT}/idle-0545-${s}s.png` });
  }
  const clock = async (): Promise<string> =>
    (
      (await page
        .getByText(/Day 15 \d\d:\d\d/)
        .first()
        .textContent()) ?? ""
    ).match(/\d\d:\d\d/)?.[0] ?? "";
  for (let i = 0; i < 12 && (await clock()) < "08:30"; i += 1) {
    const before = await clock();
    await page.getByRole("button", { name: /^Step$/ }).click();
    await expect.poll(clock, { timeout: 15_000 }).not.toBe(before);
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${OUT}/step-${(await clock()).replace(":", "")}.png` });
  }
});

// JOB 1: vehicles stay on the roads (close-up after zooming in on the centre).
test("traffic close-up", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await startRun(page);
  await settle(page);
  await page.mouse.move(530, 480);
  for (let i = 0; i < 6; i += 1) {
    await page.mouse.wheel(0, -400);
    await page.waitForTimeout(150);
  }
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT}/traffic-closeup-a.png` });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT}/traffic-closeup-b.png` });
});
