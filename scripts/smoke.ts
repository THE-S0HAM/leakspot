// Smoke test against the deployed URL (npm run smoke): create a private run, turn on autopilot, and
// tick until C3 is VERIFIED, then print the incident list. With --photo <path.jpg> it also sends a real
// leak_photo report to C3 and classifies it, failing loudly if the label came from the self-reported
// fallback (which would mean Bedrock is not working on AWS). Reads the command code from .env.deploy
// (never printed) and the SiteUrl from a positional arg, $LEAKSPOT_SITE_URL, or infra/cdk-outputs.json.
//
// Usage:
//   npm run smoke                                   (SiteUrl from cdk-outputs.json)
//   npx tsx scripts/smoke.ts <SiteUrl> --photo <path.jpg>   (Bedrock check; use tsx directly so the
//                                                   --photo flag is not swallowed by npm's arg passing)
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Parse argv into a positional (SiteUrl) and flags (--photo <path>). Order-independent.
function parseArgs(argv: readonly string[]): { siteUrl?: string; photo?: string } {
  const args = argv.slice(2);
  let siteUrl: string | undefined;
  let photo: string | undefined;
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === "--photo") {
      photo = args[i + 1];
      i += 1;
    } else if (arg && !arg.startsWith("--") && !siteUrl) {
      siteUrl = arg;
    }
  }
  return { siteUrl, photo };
}

const ARGS = parseArgs(process.argv);

type IncidentView = {
  id: string;
  sectorId: string;
  verdict: string;
  status: string;
  score: { P: number };
};
type StateResponse = {
  simClock: { label: string; day: number };
  incidents: IncidentView[];
  waterRecoveredLitres: number;
};
type CreateReportResponse = { reportId: string; ticketCode: string };
type ClassifyResponse = {
  reportId: string;
  label: string;
  confidence: number;
  rejected: boolean;
  incident?: { id: string; status: string; verdict: string };
};

function readCommandCode(): string {
  const envPath = path.join(rootDir, ".env.deploy");
  if (!existsSync(envPath))
    throw new Error("smoke: .env.deploy not found (needs LEAKSPOT_COMMAND_CODE).");
  const line = readFileSync(envPath, "utf8")
    .split(/\r?\n/)
    .find((l) => l.startsWith("LEAKSPOT_COMMAND_CODE="));
  const code = line?.slice("LEAKSPOT_COMMAND_CODE=".length).trim();
  if (!code) throw new Error("smoke: LEAKSPOT_COMMAND_CODE is missing in .env.deploy.");
  return code;
}

function readSiteUrl(): string {
  const fromArg = ARGS.siteUrl;
  const fromEnv = process.env["LEAKSPOT_SITE_URL"];
  if (fromArg) return fromArg.replace(/\/$/, "");
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  const outputsPath = path.join(rootDir, "infra", "cdk-outputs.json");
  if (existsSync(outputsPath)) {
    const outputs = JSON.parse(readFileSync(outputsPath, "utf8")) as Record<
      string,
      Record<string, string>
    >;
    const stack = outputs["LeakSpot"];
    if (stack?.["SiteUrl"]) return stack["SiteUrl"].replace(/\/$/, "");
  }
  throw new Error(
    "smoke: no SiteUrl (pass it as argv, set LEAKSPOT_SITE_URL, or deploy to write cdk-outputs.json).",
  );
}

const SITE = readSiteUrl();
const CODE = readCommandCode();

async function api<T>(method: string, pathSuffix: string, body?: unknown): Promise<T> {
  const res = await fetch(`${SITE}/api${pathSuffix}`, {
    method,
    headers: {
      "content-type": "application/json",
      "x-leakspot-code": CODE,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`smoke: ${method} ${pathSuffix} → ${res.status} ${text}`);
  }
  return (await res.json()) as T;
}

async function main(): Promise<void> {
  console.log(`smoke: target ${SITE}`);

  const health = await api<{ ok: boolean; version: string }>("GET", "/health");
  console.log(`smoke: health ok=${health.ok} version=${health.version}`);

  const { runId } = await api<{ runId: string }>("POST", "/runs");
  console.log(`smoke: created run ${runId}`);

  await api("POST", `/runs/${runId}/autopilot`, { on: true });

  let state: StateResponse | undefined;
  const MAX_TICKS = 20;
  for (let i = 0; i < MAX_TICKS; i += 1) {
    state = await api<StateResponse>("POST", `/runs/${runId}/tick`, { count: 1 });
    const c3 = state.incidents.find((inc) => inc.sectorId === "C3");
    console.log(`smoke: ${state.simClock.label} C3=${c3?.status ?? "-"} (P${c3?.score.P ?? "-"})`);
    if (c3?.status === "verified") break;
  }

  const c3 = state?.incidents.find((inc) => inc.sectorId === "C3");
  if (c3?.status !== "verified") {
    throw new Error("smoke: C3 did not reach VERIFIED within the tick budget.");
  }

  console.log("\nsmoke: incidents");
  for (const inc of state?.incidents ?? []) {
    console.log(`  ${inc.id} ${inc.sectorId} ${inc.verdict} ${inc.status} P=${inc.score.P}`);
  }
  console.log(`\nsmoke: C3 verified, water recovered ${state?.waterRecoveredLitres} L/day`);

  if (ARGS.photo) await checkBedrock(ARGS.photo);

  console.log("\nsmoke: PASS");
}

/**
 * Send a real leak_photo to C3 and classify it against Bedrock. Fails loudly if the classification
 * came from the self-reported fallback (label "self_reported" or confidence 0), which means Bedrock
 * is not working on AWS.
 */
async function checkBedrock(photoPath: string): Promise<void> {
  const resolved = path.isAbsolute(photoPath) ? photoPath : path.join(rootDir, photoPath);
  if (!existsSync(resolved)) throw new Error(`smoke: --photo file not found: ${resolved}`);
  const photoJpegBase64 = readFileSync(resolved).toString("base64");

  console.log(`\nsmoke: Bedrock check with ${photoPath}`);
  const { runId } = await api<{ runId: string }>("POST", "/runs");

  const created = await api<CreateReportResponse>("POST", `/runs/${runId}/reports`, {
    type: "leak_photo",
    x: 14,
    z: 86,
    lang: "en",
    selfChoice: "flowing",
    photoJpegBase64,
  });
  const classified = await api<ClassifyResponse>(
    "POST",
    `/runs/${runId}/reports/${created.reportId}/classify`,
  );

  const selfReported = classified.label === "self_reported" || classified.confidence === 0;
  console.log(
    `smoke: label=${classified.label} confidence=${classified.confidence} selfReported=${selfReported}`,
  );
  if (selfReported) {
    throw new Error(
      "smoke: classification fell back to self-reported — Bedrock is NOT working on AWS. " +
        "Check the model id, the inference-profile ARN and the Lambda's bedrock:InvokeModel policy.",
    );
  }
  console.log("smoke: Bedrock classified the photo (not a fallback).");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
