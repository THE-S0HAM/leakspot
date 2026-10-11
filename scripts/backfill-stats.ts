// Backfill the per-run summary items (pk "STATS") from every existing run item, using the same pure
// summary function the API uses after each run write. Dry run by default: prints one row per run and
// the totals. Writes only with --write. Uses the AWS profile and region from scripts/aws-env.mjs.
//
//   npx tsx scripts/backfill-stats.ts            # dry run
//   npx tsx scripts/backfill-stats.ts --write    # upsert the summaries
//   npx tsx scripts/backfill-stats.ts --table <name>   # skip table discovery

import { AWS_PROFILE, AWS_REGION } from "./aws-env.mjs";
import { summarizeRun, type RunSummary } from "../services/api/src/app/run-summary";
import { createDynamoRunScan } from "../services/api/src/adapters/dynamo/dynamo-run-scan";
import { createDynamoStatsStore } from "../services/api/src/adapters/dynamo/dynamo-stats-store";

process.env["AWS_PROFILE"] ??= AWS_PROFILE;
const args = process.argv.slice(2);
const write = args.includes("--write");
const tableArg = args.includes("--table") ? args[args.indexOf("--table") + 1] : undefined;
const scan = createDynamoRunScan({ region: AWS_REGION });

/** The deployed stack's table: the one table whose name starts with the stack name "LeakSpot". */
async function findTable(): Promise<string> {
  if (tableArg) return tableArg;
  const candidates = await scan.tablesWithPrefix("LeakSpot");
  if (candidates.length !== 1) {
    throw new Error(
      `Expected one LeakSpot table, found ${candidates.length}: ${candidates.join(", ") || "none"}. Pass --table.`,
    );
  }
  return candidates[0] as string;
}

async function main(): Promise<void> {
  const table = await findTable();
  console.log(
    `backfill-stats: table ${table}, region ${AWS_REGION}, ${write ? "WRITE" : "dry run"}`,
  );
  const items = await scan.runs(table);
  const now = new Date().toISOString();
  const summaries: RunSummary[] = items.map((item) =>
    summarizeRun(item.runId, item.state, {
      createdAt: item.createdAt,
      updatedAt: item.updatedAt ?? now,
    }),
  );
  summaries.sort((a, b) => (a.createdAt ?? "").localeCompare(b.createdAt ?? ""));

  console.table(
    summaries.map((s) => ({
      run: s.runId,
      date: s.istDate ?? "undated",
      clock: s.clock,
      done: s.dayCompleted ? "yes" : "",
      found: s.incidents.detected,
      verified: s.incidents.verified,
      litresPerDay: s.litresRecoveredPerDay,
      phone: s.phoneReports,
      simulated: s.simulatedReports,
      ai: Object.values(s.aiChecks).reduce((a, b) => a + b, 0),
    })),
  );
  const sum = (f: (s: RunSummary) => number): number => summaries.reduce((a, s) => a + f(s), 0);
  const totals = {
    runs: summaries.length,
    undated: summaries.filter((s) => !s.createdAt).length,
    found: sum((s) => s.incidents.detected),
    verified: sum((s) => s.incidents.verified),
    litresPerDay: sum((s) => s.litresRecoveredPerDay),
    phoneReports: sum((s) => s.phoneReports),
    simulatedReports: sum((s) => s.simulatedReports),
  };
  console.log("totals:", totals);
  const negative = summaries.filter(
    (s) =>
      s.litresRecoveredPerDay < 0 ||
      s.scores.some((x) => x < 0) ||
      s.minutesToVerify.some((m) => m < 0),
  );
  if (negative.length)
    throw new Error(`Negative values in ${negative.map((s) => s.runId).join(", ")}`);

  if (!write) {
    console.log("dry run: nothing written. Re-run with --write to upsert these summaries.");
    return;
  }
  const store = createDynamoStatsStore({ tableName: table, client: scan.client });
  for (const s of summaries) await store.putRunSummary(s);
  console.log(`wrote ${summaries.length} summaries`);
}

main().catch((error: unknown) => {
  console.error("backfill-stats failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
