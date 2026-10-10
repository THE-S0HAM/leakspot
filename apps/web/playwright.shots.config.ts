// Screenshot run (NOT part of the default e2e): `npm run shots -w @leakspot/web`.
// Same dev stack as playwright.config.ts; only matches *.shot.ts. Images land in e2e/screenshots/ (gitignored).
import { defineConfig } from "@playwright/test";
import base from "./playwright.config";

export default defineConfig({
  ...base,
  testMatch: /.*\.shot\.ts/,
  timeout: 120_000,
  projects: [
    {
      name: "chromium",
      // Real GPU (ANGLE/D3D11): software WebGL is too slow for the 3D city at 1440×900.
      use: {
        browserName: "chromium",
        launchOptions: { args: ["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist"] },
      },
    },
  ],
});
