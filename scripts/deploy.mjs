// Deploy runner: builds everything (type-check + web bundle) then runs `cdk deploy` with the AWS
// profile from scripts/aws-env.mjs (LEAKSPOT_AWS_PROFILE, default Dev-AWSTW). CDK reads .env.deploy at
// synth to compute COMMAND_CODE_SHA256; this script never reads or prints that file. Prints SiteUrl.
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { AWS_PROFILE } from "./aws-env.mjs";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const infraDir = path.join(rootDir, "infra");
const isWindows = process.platform === "win32";

if (!existsSync(path.join(rootDir, ".env.deploy"))) {
  console.error("deploy: .env.deploy is missing (needs LEAKSPOT_COMMAND_CODE). Aborting.");
  process.exit(1);
}

/**
 * Absolute path to a binary inside the root node_modules/.bin.
 * @param {string} name binary base name
 * @returns {string}
 */
function binPath(name) {
  return path.join(rootDir, "node_modules", ".bin", isWindows ? `${name}.cmd` : name);
}

/**
 * Run a command, inheriting stdio, and exit the process on failure naming the step.
 * @param {string} step human label for the step
 * @param {string} command absolute binary path
 * @param {readonly string[]} args command arguments
 * @param {string} cwd working directory
 */
function run(step, command, args, cwd) {
  console.log(`deploy: ${step}`);
  const result = spawnSync(command, [...args], {
    cwd,
    stdio: "inherit",
    shell: isWindows,
    // Signals the stack to require a real .env.deploy code and reject the placeholder hash.
    env: { ...process.env, LEAKSPOT_DEPLOY: "1" },
  });
  if (result.status !== 0) {
    console.error(`deploy: step failed: ${step}`);
    process.exit(result.status ?? 1);
  }
}

// 1) Build (type-check non-web workspaces + bundle apps/web to apps/web/dist).
run("build", process.execPath, [path.join(rootDir, "scripts", "build.mjs")], rootDir);

// 2) Deploy the single stack. --require-approval broadening pauses only on IAM/security widening.
run(
  "cdk deploy LeakSpot",
  binPath("cdk"),
  [
    "deploy",
    "LeakSpot",
    "--profile",
    AWS_PROFILE,
    "--require-approval",
    "broadening",
    "--outputs-file",
    path.join(infraDir, "cdk-outputs.json"),
  ],
  infraDir,
);

console.log("deploy: done");
