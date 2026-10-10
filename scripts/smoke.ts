// Smoke test against the deployed URL (npm run smoke): create a private run, turn on autopilot, and
// tick until C3 is VERIFIED, then print the incident list. Reads the command code from .env.deploy
// (never printed) and the SiteUrl from infra/cdk-outputs.json, $LEAKSPOT_SITE_URL, or argv[2].
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

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
  const fromArg = process.argv[2];
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
  console.log(`\nsmoke: PASS — C3 verified, water recovered ${state?.waterRecoveredLitres} L/day`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
