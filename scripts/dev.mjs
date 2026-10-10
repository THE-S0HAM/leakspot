// Dev runner: starts the local API (node:http on :8787) and the Vite dev server (:5173) together.
// Vite proxies /api to the API, so the browser talks to one origin. Ctrl+C stops both.
//
// We spawn the resolved JS entry points of tsx and vite with the current node binary and shell: false.
// Going through `npm run ... --workspace` instead would add a cmd.exe/npm layer on Windows; when this
// script itself runs under a harness (Playwright's webServer wraps it in cmd.exe), that extra layer left
// Vite as an orphaned grandchild whose stdio and signals were lost, so it never reported "ready" and the
// harness timed out. Spawning the entry points directly removes every intermediate shell.
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Absolute path to a package's JS entry, resolved from this repo's node_modules.
 * @param {string} pkg package name (e.g. "vite")
 * @param {string} relFromPkgDir path to the entry relative to the package dir
 * @returns {string}
 */
function entry(pkg, relFromPkgDir) {
  const pkgDir = path.dirname(require.resolve(`${pkg}/package.json`));
  return path.join(pkgDir, relFromPkgDir);
}

const tsxCli = entry("tsx", "dist/cli.mjs");
const viteCli = entry("vite", "bin/vite.js");

/**
 * Spawn a node process for a resolved CLI entry (no shell, no npm layer).
 * @param {string} label human label for logs
 * @param {string} cliEntry absolute path to the CLI's JS entry
 * @param {readonly string[]} args CLI arguments
 * @param {string} cwd working directory for the child
 * @returns {import("node:child_process").ChildProcess}
 */
function start(label, cliEntry, args, cwd) {
  console.log(`dev: starting ${label}`);
  // stdin is "ignore", not inherited: Vite's dev server listens on stdin for keypress shortcuts
  // ("press h + enter"). Under a harness that wraps us in a non-TTY shell (Playwright's cmd.exe), an
  // inherited stdin made Vite hang during setup so it never bound :5173. stdout/stderr still inherit.
  return spawn(process.execPath, [cliEntry, ...args], {
    cwd,
    stdio: ["ignore", "inherit", "inherit"],
    shell: false,
  });
}

const api = start(
  "api (:8787)",
  tsxCli,
  ["watch", "src/local/server.ts"],
  path.join(rootDir, "services", "api"),
);
const web = start("web (:5173)", viteCli, [], path.join(rootDir, "apps", "web"));

const children = [api, web];
let shuttingDown = false;

/**
 * Kill both children once and exit.
 * @param {number} code process exit code
 */
function shutdown(code) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) {
    if (!child.killed) child.kill();
  }
  process.exit(code ?? 0);
}

for (const child of children) {
  child.on("exit", (code) => shutdown(code ?? 0));
}
process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));
