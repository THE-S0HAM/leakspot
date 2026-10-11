// JOB 0: the command centre is gated. A fresh browser context shows the code gate; the accepted code
// lives only in this tab's sessionStorage (never localStorage); a stale code sends the tab back to
// the gate; command routes answer 401 without a valid header.
import { expect, test } from "@playwright/test";
import { TEST_CODE } from "../playwright.config";
import { startRun } from "./helpers";

test("a fresh context shows the code gate", async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto("/command");
  await expect(page.getByLabel(/Code character/).first()).toBeVisible();
  await expect(page.getByTestId("health-bar")).toHaveCount(0);
  await context.close();
});

test("the code lives only in this tab's sessionStorage", async ({ page, context }) => {
  await startRun(page);
  const stores = await page.evaluate(() => ({
    session: Object.values({ ...sessionStorage }),
    local: Object.values({ ...localStorage }),
  }));
  expect(stores.session).toContain(TEST_CODE);
  expect(stores.local.join(" ")).not.toContain(TEST_CODE);
  // A second tab in the same context does not inherit it.
  const other = await context.newPage();
  await other.goto("/command");
  await expect(other.getByLabel(/Code character/).first()).toBeVisible();
});

test("a stale remembered code returns to the gate", async ({ page }) => {
  await startRun(page);
  await page.evaluate(() => {
    for (const k of Object.keys(sessionStorage)) sessionStorage.setItem(k, "WRONGCOD");
  });
  await page.reload();
  await expect(page.getByLabel(/Code character/).first()).toBeVisible({ timeout: 15_000 });
});

test("command routes answer 401 without a valid code", async ({ request }) => {
  for (const headers of [{}, { "x-leakspot-code": "WRONGCOD" }]) {
    expect((await request.post("/api/runs", { headers })).status()).toBe(401);
    expect((await request.get("/api/runs/ABCDE/state", { headers })).status()).toBe(401);
    expect(
      (await request.post("/api/runs/ABCDE/tick", { headers, data: { count: 1 } })).status(),
    ).toBe(401);
  }
});
