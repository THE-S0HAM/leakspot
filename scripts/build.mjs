// Build runner: type-checks the lib/service/infra workspaces, then bundles apps/web with Vite.
// No AWS network calls; apps/web/dist must contain no sourcemaps. Paths are built with node:path and
// the local toolchain binaries are resolved from node_modules/.bin so this runs the same on Windows and POSIX.
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const isWindows = process.platform === "win32";

/**
 * Absolute path to a binary inside the root node_modules/.bin.
 * @param {string} name binary base name
 * @returns {string}
 */
function binPath(name) {
  return path.join(rootDir, "node_modules", ".bin", isWindows ? `${name}.cmd` : name);
}

/**
 * Does the directory tree hold at least one .ts/.tsx file (ignoring build/dep output)?
 * @param {string} dir directory to search
 * @returns {boolean}
 */
function hasTsSources(dir) {
  if (!existsSync(dir)) return false;
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === "dist" || entry === "cdk.out") continue;
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (hasTsSources(full)) return true;
    } else if (entry.endsWith(".ts") || entry.endsWith(".tsx")) {
      return true;
    }
  }
  return false;
}

/**
 * Run a command, inheriting stdio, and exit the process on failure naming the step.
 * @param {string} step human label for the step
 * @param {string} command absolute binary path
 * @param {readonly string[]} args command arguments
 * @param {string} cwd working directory
 */
function run(step, command, args, cwd) {
  console.log(`build: ${step}`);
  const result = spawnSync(command, [...args], { cwd, stdio: "inherit", shell: isWindows });
  if (result.status !== 0) {
    console.error(`build: step failed: ${step}`);
    process.exit(result.status ?? 1);
  }
}

// 1) Type-check (build-validate) the non-web workspaces. These are noEmit projects today, so `tsc --noEmit`
//    is their build step; apps/web is bundled by Vite below.
const tscProjects = ["packages/core", "packages/contracts", "services/api", "infra"];
const tsc = binPath("tsc");
for (const project of tscProjects) {
  const projectDir = path.join(rootDir, project);
  if (!hasTsSources(projectDir)) {
    console.log(`build: skipping ${project} (no source files yet)`);
    continue;
  }
  run(`tsc ${project}`, tsc, ["-p", path.join(projectDir, "tsconfig.json"), "--noEmit"], rootDir);
}

// 2) Bundle apps/web with Vite (sourcemaps disabled in vite.config.ts).
run("vite build apps/web", binPath("vite"), ["build"], path.join(rootDir, "apps", "web"));

console.log("build: done");
