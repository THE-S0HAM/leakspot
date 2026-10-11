// DynamoDB StatsStore: summary items live in the same table as runs, under pk "STATS" and
// sk "RUN#<createdAt>#<runId>". Listing is one Query on pk, paginated, capped by `limit`.
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { summarySortKey, type RunSummary } from "../../app/run-summary";
import type { StatsStore } from "../../ports/stats-store";

const PK = "STATS";

export function createDynamoStatsStore(options: {
  tableName: string;
  client?: DynamoDBClient;
}): StatsStore {
  const doc = DynamoDBDocumentClient.from(options.client ?? new DynamoDBClient({}), {
    marshallOptions: { removeUndefinedValues: true },
  });
  const table = options.tableName;
  return {
    async putRunSummary(summary) {
      await doc.send(
        new PutCommand({
          TableName: table,
          Item: { pk: PK, sk: summarySortKey(summary), summary },
        }),
      );
    },
    async listRunSummaries(limit) {
      const out: RunSummary[] = [];
      let start: Record<string, unknown> | undefined;
      do {
        const page = await doc.send(
          new QueryCommand({
            TableName: table,
            KeyConditionExpression: "pk = :pk",
            ExpressionAttributeValues: { ":pk": PK },
            ExclusiveStartKey: start,
            Limit: Math.min(500, limit - out.length),
          }),
        );
        for (const item of page.Items ?? []) out.push(item.summary as RunSummary);
        start = page.LastEvaluatedKey;
      } while (start && out.length < limit);
      return out;
    },
  };
}
