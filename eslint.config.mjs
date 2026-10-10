// Root ESLint flat config for every workspace and scripts/: typescript-eslint, the repo conventions
// (no any, no unused code, no console.log in src/, named exports only) and react-hooks for apps/web.
// eslint-config-prettier stays last so formatting is left entirely to Prettier.
import js from "@eslint/js";
import prettier from "eslint-config-prettier";
import reactHooks from "eslint-plugin-react-hooks";
import { defineConfig, globalIgnores } from "eslint/config";
import tseslint from "typescript-eslint";

// The `globals` package is not installed, so the few Node globals the .mjs scripts use are listed here.
const nodeGlobals = {
  Buffer: "readonly",
  URL: "readonly",
  clearTimeout: "readonly",
  console: "readonly",
  process: "readonly",
  setTimeout: "readonly",
};

// Default exports are banned with core `no-restricted-syntax` (no eslint-plugin-import).
const noDefaultExportSelectors = [
  {
    selector: "ExportDefaultDeclaration",
    message: "Use named exports only (default exports are allowed in *.config.* files).",
  },
  {
    selector: "ExportSpecifier[exported.name='default']",
    message: "Use named exports only (default exports are allowed in *.config.* files).",
  },
];

export default defineConfig(
  globalIgnores(["**/node_modules/", "**/dist/", "**/cdk.out/", "**/coverage/", "apps/web/dist/"]),

  {
    files: ["**/*.{ts,tsx,mjs}"],
    extends: [js.configs.recommended, tseslint.configs.recommended],
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { vars: "all", args: "all", caughtErrors: "all", ignoreRestSiblings: false },
      ],
      "no-restricted-syntax": ["error", ...noDefaultExportSelectors],
    },
  },

  {
    files: ["**/*.mjs"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: nodeGlobals,
    },
  },

  {
    files: [
      "apps/web/src/**/*.{ts,tsx,mjs}",
      "services/api/src/**/*.{ts,tsx,mjs}",
      "packages/*/src/**/*.{ts,tsx,mjs}",
      "infra/src/**/*.{ts,tsx,mjs}",
    ],
    rules: {
      "no-console": ["error", { allow: ["warn", "error"] }],
    },
  },

  // The API logger is the one src/ module that writes log lines; scripts/ are CLIs that print.
  {
    files: ["services/api/src/logger.ts", "scripts/**"],
    rules: {
      "no-console": "off",
    },
  },

  {
    files: ["apps/web/**/*.{ts,tsx}"],
    extends: [reactHooks.configs.flat.recommended],
  },

  // ---- Dependency rules (Task 10.1) go here ----
  // `no-restricted-imports` blocks scoped by `files` (structure.md › Dependency rules). A block that sets
  // `no-restricted-syntax` replaces earlier options for its files, so it must spread
  // `noDefaultExportSelectors`, and it must stay above the *.config.* exemption below.

  // Tools such as Vite, Vitest and ESLint load their config through a default export.
  {
    files: ["**/*.config.{ts,js,mjs,cts,mts}"],
    rules: {
      "no-restricted-syntax": "off",
    },
  },

  prettier,
);
