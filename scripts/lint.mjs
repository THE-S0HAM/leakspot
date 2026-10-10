// Lint runner: ESLint, then a Prettier check, over the five workspaces, scripts/ and the root config files.
// Each tool runs through its JavaScript bin with process.execPath (no shell); exits non-zero naming the step.
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);

const workspaces = [
  path.join("apps", "web"),
  path.join("services", "api"),
  path.join("packages", "core"),
  path.join("packages", "contracts"),
  "infra",
];
const eslintTargets = [...workspaces, "scripts", "eslint.config.mjs", "vitest.config.ts"];
const prettierTargets = [
  ...eslintTargets,
  "package.json",
  "tsconfig.base.json",
  ".prettierrc.json",
];

/**
 * Absolute path of a package's bin entry, read from its package.json `bin` field.
 * @param {string} pkg package name
 * @param {string} binName bin name inside the package
 * @returns {string}
 */
function binEntry(pkg, binName) {
  const manifestPath = require.resolve(`${pkg}/package.json`);
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const relative = typeof manifest.bin === "string" ? manifest.bin : manifest.bin?.[binName];
  if (typeof relative !== "string") {
    throw new Error(`lint: ${pkg} declares no "${binName}" bin`);
  }
  return path.resolve(path.dirname(manifestPath), relative);
}

/**
 * Run one step through Node and report whether it passed.
 * @param {string} step human label for the step
 * @param {string} entry absolute path of the tool's JS entry
 * @param {readonly string[]} args tool arguments
 * @returns {boolean}
 */
function run(step, entry, args) {
  console.log(`lint: ${step}`);
  const result = spawnSync(process.execPath, [entry, ...args], { cwd: rootDir, stdio: "inherit" });
  if (result.error) console.error(`lint: could not start ${step}: ${result.error.message}`);
  return result.status === 0;
}

/** @type {string[]} */
const failed = [];
if (!run("eslint", binEntry("eslint", "eslint"), eslintTargets)) failed.push("eslint");
if (!run("prettier --check", binEntry("prettier", "prettier"), ["--check", ...prettierTargets])) {
  failed.push("prettier --check");
}

if (failed.length > 0) {
  console.error(`lint: step failed: ${failed.join(", ")}`);
  process.exit(1);
}
console.log("lint: done");
