// Root Vitest config: one `vitest run` covers every workspace and scripts/ through test.projects.
// Node projects are defined inline; apps/web keeps its own jsdom config.
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "@leakspot/core",
          root: "packages/core",
          environment: "node",
          include: ["src/**/*.test.ts"],
        },
      },
      {
        test: {
          name: "@leakspot/contracts",
          root: "packages/contracts",
          environment: "node",
          include: ["src/**/*.test.ts"],
        },
      },
      {
        test: {
          name: "@leakspot/api",
          root: "services/api",
          environment: "node",
          include: ["src/**/*.test.ts"],
        },
      },
      {
        test: {
          name: "@leakspot/infra",
          root: "infra",
          environment: "node",
          include: ["test/**/*.test.ts"],
          // CDK synthesis is CPU-heavy: ~2 s alone, >13 s while the other projects run in parallel.
          testTimeout: 60_000,
        },
      },
      {
        test: {
          name: "scripts",
          root: "scripts",
          environment: "node",
          include: ["**/*.test.ts"],
        },
      },
      "apps/web/vitest.config.ts",
    ],
  },
});
