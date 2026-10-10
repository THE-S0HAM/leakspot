// Dev runner: starts the local API (node:http on :8787) and the Vite dev server (:5173) together.
// Vite proxies /api to the API, so the browser talks to one origin. Ctrl+C stops both.
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const isWindows = process.platform === "win32";
const npm = isWindows ? "npm.cmd" : "npm";

/**
 * Start an npm workspace script, prefixing nothing (child inherits stdio).
 * @param {string} label human label for logs
 * @param {readonly string[]} args npm arguments
 * @returns {import("node:child_process").ChildProcess}
 */
function start(label, args) {
  console.log(`dev: starting ${label}`);
  return spawn(npm, [...args], { cwd: rootDir, stdio: "inherit", shell: isWindows });
}

const api = start("api (:8787)", ["run", "dev:api", "--workspace", "@leakspot/api"]);
const web = start("web (:5173)", ["run", "dev", "--workspace", "@leakspot/web"]);

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
