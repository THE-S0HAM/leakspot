// Read-only helpers for maintenance scripts (scripts/backfill-stats.ts): find the LeakSpot table in
// the account, and scan every run item (pk RUN#<id>, sk META) with its stored times.
import { DynamoDBClient, ListTablesCommand } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, ScanCommand } from "@aws-sdk/lib-dynamodb";
import type { RunState } from "@leakspot/core";

export type ScannedRun = { runId: string; state: RunState; createdAt?: string; updatedAt?: string };

export function createDynamoRunScan(options: { region: string; client?: DynamoDBClient }) {
  const client = options.client ?? new DynamoDBClient({ region: options.region });
  const doc = DynamoDBDocumentClient.from(client);
  return {
    client,
    /** Table names that start with `prefix` (the CDK stack's tables are named LeakSpot-…). */
    async tablesWithPrefix(prefix: string): Promise<string[]> {
      const names: string[] = [];
      let start: string | undefined;
      do {
        const page = await client.send(new ListTablesCommand({ ExclusiveStartTableName: start }));
        names.push(...(page.TableNames ?? []));
        start = page.LastEvaluatedTableName;
      } while (start);
      return names.filter((n) => n.startsWith(prefix));
    },
    /** Every run item in the table. */
    async runs(tableName: string): Promise<ScannedRun[]> {
      const out: ScannedRun[] = [];
      let start: Record<string, unknown> | undefined;
      do {
        const page = await doc.send(
          new ScanCommand({
            TableName: tableName,
            FilterExpression: "begins_with(pk, :run) AND sk = :meta",
            ExpressionAttributeValues: { ":run": "RUN#", ":meta": "META" },
            ExclusiveStartKey: start,
          }),
        );
        for (const item of page.Items ?? []) {
          out.push({
            runId: String(item.pk).slice("RUN#".length),
            state: item.state as RunState,
            createdAt: item.createdAt as string | undefined,
            updatedAt: item.updatedAt as string | undefined,
          });
        }
        start = page.LastEvaluatedKey;
      } while (start);
      return out;
    },
  };
}
