// JOB 3: prove the demo moments on desktop. start → 06:45 → Dispatch C3 → truck mid-drive and on site →
// Mark repaired → verified burst → one API leak_photo report (pin + flash) → X-ray on/off → Autopilot to
// 19:45 → Day report. Run with `npm run shots -w @leakspot/web -- demo`.
import { expect, test, type Page } from "@playwright/test";
import { startRun } from "./helpers";

const OUT = "e2e/screenshots/demo";

async function clock(page: Page): Promise<string> {
  const t =
    (await page
      .getByText(/Day 15 \d\d:\d\d/)
      .first()
      .textContent()) ?? "";
  return t.match(/\d\d:\d\d/)?.[0] ?? "";
}

async function step(page: Page): Promise<void> {
  const before = await clock(page);
  await page.getByRole("button", { name: /^Step$/ }).click();
  await expect.poll(() => clock(page), { timeout: 15_000 }).not.toBe(before);
  await page.waitForTimeout(1200);
}

async function shot(page: Page, name: string): Promise<void> {
  await page.screenshot({ path: `${OUT}/${name}-${(await clock(page)).replace(":", "")}.png` });
}

test("demo moments", async ({ page }) => {
  test.setTimeout(300_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await startRun(page);
  await page.waitForTimeout(2000);
  await shot(page, "01-start");
  while ((await clock(page)) < "07:00") await step(page);
  await shot(page, "02-confirmed");

  await page
    .getByRole("button", { name: /Dispatch crew/ })
    .first()
    .click();
  await page.waitForTimeout(1500);
  await shot(page, "03-dispatched");
  await step(page);
  await shot(page, "04-truck-driving");
  for (
    let i = 0;
    i < 3 &&
    !(await page
      .getByRole("button", { name: /Mark repaired/ })
      .first()
      .isVisible());
    i += 1
  ) {
    await step(page);
  }
  await shot(page, "05-on-site");
  await page
    .getByRole("button", { name: /Mark repaired/ })
    .first()
    .click();
  await page.waitForTimeout(1500);
  await shot(page, "06-repaired");
  for (let i = 0; i < 6; i += 1) {
    await step(page);
    await page.waitForTimeout(300);
    await shot(page, `07-verify-${i}`);
    if (
      await page
        .getByText(/verified/i)
        .first()
        .isVisible()
    )
      break;
  }

  // One real citizen report through the API into this run (FakeVision locally).
  const runId = new URL(page.url()).searchParams.get("run");
  const photo = await page.screenshot({
    type: "jpeg",
    quality: 60,
    clip: { x: 400, y: 300, width: 320, height: 240 },
  });
  expect(runId).toBeTruthy();
  const created = await page.request.post(`/api/runs/${runId}/reports`, {
    data: {
      type: "leak_photo",
      x: 30,
      z: 40,
      lang: "en",
      selfChoice: "flowing",
      photoJpegBase64: photo.toString("base64"),
    },
  });
  expect(created.ok(), await created.text()).toBeTruthy();
  const { reportId } = (await created.json()) as { reportId: string };
  await page.request.post(`/api/runs/${runId}/reports/${reportId}/classify`);
  await page.waitForTimeout(7000); // live polling picks it up
  await shot(page, "08-phone-report");

  await page.getByRole("button", { name: /^X-ray$/ }).click();
  await page.waitForTimeout(1000);
  await shot(page, "09-xray-on");
  await page.getByRole("button", { name: /^X-ray$/ }).click();
  await page.waitForTimeout(1000);
  await shot(page, "10-xray-off");

  await page.getByRole("button", { name: /Autopilot off/ }).click();
  await page.getByRole("button", { name: /^4×$/ }).click();
  await page.getByRole("button", { name: /^Play$/ }).click();
  await expect.poll(() => clock(page), { timeout: 200_000, intervals: [2000] }).toBe("19:45");
  await page.waitForTimeout(4000);
  await shot(page, "11-day-end");
});
