// Screenshot run (NOT part of the default e2e): `npm run shots -w @leakspot/web`.
// Same dev stack as playwright.config.ts; only matches *.shot.ts. Images land in e2e/screenshots/ (gitignored).
import { defineConfig } from "@playwright/test";
import base from "./playwright.config";

export default defineConfig({
  ...base,
  testMatch: /.*\.shot\.ts/,
  timeout: 120_000,
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
});
