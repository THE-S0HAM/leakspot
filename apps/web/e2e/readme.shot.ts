// README screenshots (JPEG, < 400 KB each) straight into docs/images/: landing, Command Centre at
// 06:45, X-ray, and a citizen report on a phone. Run with `npm run shots -w @leakspot/web -- readme`.
import { expect, test, type Page } from "@playwright/test";
import { startRun } from "./helpers";

const OUT = "../../docs/images";

async function clock(page: Page): Promise<string> {
  const t =
    (await page
      .getByText(/Day 15 \d\d:\d\d/)
      .first()
      .textContent()) ?? "";
  return t.match(/\d\d:\d\d/)?.[0] ?? "";
}

test("readme screenshots", async ({ page, browser }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1440, height: 900 });

  await page.goto("/");
  await page.waitForTimeout(3500);
  await page.screenshot({ path: `${OUT}/landing.jpg`, type: "jpeg", quality: 82 });

  await startRun(page);
  while ((await clock(page)) < "06:45") {
    const before = await clock(page);
    await page.getByRole("button", { name: /^Step$/ }).click();
    await expect.poll(() => clock(page), { timeout: 15_000 }).not.toBe(before);
  }
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${OUT}/command-0645.jpg`, type: "jpeg", quality: 82 });
  await page.getByRole("button", { name: /^X-ray$/ }).click();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT}/xray.jpg`, type: "jpeg", quality: 82 });
  const runId = new URL(page.url()).searchParams.get("run") ?? "";

  // An original "dripping tap" picture drawn in the browser, used as the citizen's photo.
  const art = await browser.newPage({ viewport: { width: 480, height: 360 } });
  await art.setContent(`<body style="margin:0;background:linear-gradient(#d9d4c7,#b9b2a3)">
    <div style="position:absolute;left:150px;top:90px;width:180px;height:28px;background:#8a9097"></div>
    <div style="position:absolute;left:300px;top:90px;width:28px;height:70px;background:#8a9097"></div>
    <div style="position:absolute;left:292px;top:150px;width:44px;height:16px;background:#6c7279"></div>
    ${[0, 1, 2, 3]
      .map(
        (i) =>
          `<div style="position:absolute;left:${306 + (i % 2) * 4}px;top:${185 + i * 38}px;width:16px;height:22px;border-radius:50% 50% 50% 50%/60% 60% 40% 40%;background:#2f8fd6"></div>`,
      )
      .join("")}
    <div style="position:absolute;left:240px;top:320px;width:150px;height:18px;border-radius:50%;background:#2f8fd6;opacity:.6"></div>
  </body>`);
  const photo = await art.screenshot({ type: "jpeg", quality: 85 });
  await art.close();

  const phone = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true });
  await phone.goto(`/report?run=${runId}&sector=C2`);
  await phone.getByRole("button", { name: /I see a leak/ }).click();
  await phone
    .locator('input[type="file"]')
    .setInputFiles({ name: "tap.jpg", mimeType: "image/jpeg", buffer: photo });
  await phone.getByRole("button", { name: /Water flowing/ }).click();
  const send = phone.getByRole("button", { name: /^Send$/ });
  await expect(send).toBeEnabled({ timeout: 10_000 });
  await send.click();
  await expect(phone.getByRole("button", { name: /See my ticket/ })).toBeVisible({
    timeout: 30_000,
  });
  await phone.waitForTimeout(800);
  await phone.screenshot({ path: `${OUT}/citizen-phone.jpg`, type: "jpeg", quality: 82 });
  await phone.close();
});
