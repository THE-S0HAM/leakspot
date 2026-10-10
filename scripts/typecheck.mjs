// Typecheck runner: runs `tsc -p <tsconfig> --noEmit` for every workspace and scripts/.
// A project with no .ts/.tsx inputs yet (empty workspace during early scaffolding) is skipped
// so `tsc` does not fail with "No inputs were found"; the project is type-checked once it has sources.
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const TS = /** @type {const} */ ([".ts", ".tsx"]);
const TS_AND_MJS = /** @type {const} */ ([".ts", ".tsx", ".mjs"]);

/** @type {ReadonlyArray<{ name: string; tsconfig: string; include: readonly string[]; extensions: readonly string[] }>} */
const projects = [
  {
    name: "packages/core",
    tsconfig: "packages/core/tsconfig.json",
    include: ["src"],
    extensions: TS,
  },
  {
    name: "packages/contracts",
    tsconfig: "packages/contracts/tsconfig.json",
    include: ["src"],
    extensions: TS,
  },
  {
    name: "services/api",
    tsconfig: "services/api/tsconfig.json",
    include: ["src"],
    extensions: TS,
  },
  { name: "apps/web", tsconfig: "apps/web/tsconfig.json", include: ["src"], extensions: TS },
  {
    name: "infra",
    tsconfig: "infra/tsconfig.json",
    include: ["bin", "lib", "test"],
    extensions: TS,
  },
  { name: "scripts", tsconfig: "scripts/tsconfig.json", include: ["."], extensions: TS_AND_MJS },
];

/**
 * Does the directory tree hold at least one checkable file?
 * @param {string} dir directory to search
 * @param {readonly string[]} extensions file extensions that count as inputs
 * @returns {boolean}
 */
function hasInputFiles(dir, extensions) {
  if (!existsSync(dir)) return false;
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === "dist" || entry === "cdk.out") continue;
    const full = path.join(dir, entry);
    const info = statSync(full);
    if (info.isDirectory()) {
      if (hasInputFiles(full, extensions)) return true;
    } else if (extensions.some((ext) => entry.endsWith(ext))) {
      return true;
    }
  }
  return false;
}

const tscBin = path.join(
  rootDir,
  "node_modules",
  ".bin",
  process.platform === "win32" ? "tsc.cmd" : "tsc",
);
let failed = false;

for (const project of projects) {
  const projectDir = path.join(rootDir, project.name);
  const hasInputs = project.include.some((rel) =>
    hasInputFiles(path.join(projectDir, rel), project.extensions),
  );
  if (!hasInputs) {
    console.log(`typecheck: skipping ${project.name} (no source files yet)`);
    continue;
  }
  if (!existsSync(path.join(rootDir, project.tsconfig))) {
    console.error(`typecheck: missing tsconfig for ${project.name}`);
    failed = true;
    continue;
  }
  console.log(`typecheck: ${project.name}`);
  const result = spawnSync(tscBin, ["-p", path.join(rootDir, project.tsconfig), "--noEmit"], {
    cwd: rootDir,
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (result.status !== 0) failed = true;
}

process.exit(failed ? 1 : 0);
