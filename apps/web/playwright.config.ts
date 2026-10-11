// Playwright config for the end-to-end checks (health bar, access code) and the screenshot scripts.
// Runs the dev stack (local in-memory API on :8787 + Vite on :5173) with a KNOWN test command code, so
// the tests never read .env.deploy. The code is "ABCDEFGH"; its SHA-256 is injected as COMMAND_CODE_SHA256.
import { createHash } from "node:crypto";
import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

export const TEST_CODE = "ABCDEFGH";
const CODE_SHA = createHash("sha256").update(TEST_CODE).digest("hex");

// Repo root and the dev runner, resolved from this config file so cwd never matters.
const repoRoot = path.resolve(import.meta.dirname, "..", "..");
const devRunner = path.join(repoRoot, "scripts", "dev.mjs");

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  fullyParallel: false,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:5173",
    trace: "off",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    // Invoke the dev runner with node directly (not `npm run dev`). On Windows, Playwright wraps the
    // command in cmd.exe; the extra `npm` layer spawns a grandchild Vite that loses its stdio/signals and
    // never reports ready. Calling node on the script (absolute path) removes that layer.
    command: `node "${devRunner}"`,
    cwd: repoRoot,
    url: "http://localhost:5173",
    // Reuse a dev stack if one is already up; a cold boot re-optimizes Vite deps once, so allow 120 s.
    reuseExistingServer: true,
    timeout: 120_000,
    env: {
      COMMAND_CODE_SHA256: CODE_SHA,
      APP_VERSION: "e2e",
    },
  },
});
