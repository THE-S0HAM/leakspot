// DynamoDB RunStore adapter (api-contract.md single-table design). One item per run: pk = RUN#<id>,
// sk = META, a `version` number for optimistic locking, and the RunState JSON under `state`. create
// and put use condition expressions so concurrent writers can't clobber each other; the router retries
// on VersionConflictError. Only adapters/ may import @aws-sdk/* (dependency rules).

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import type { RunState } from "@leakspot/core";
import { VersionConflictError, type RunStore } from "../../ports/run-store";

const SK = "META";
const pk = (runId: string): string => `RUN#${runId}`;

export type DynamoRunStoreOptions = { tableName: string; client?: DynamoDBClient };

export function createDynamoRunStore(options: DynamoRunStoreOptions): RunStore {
  const base = options.client ?? new DynamoDBClient({});
  const doc = DynamoDBDocumentClient.from(base, {
    marshallOptions: { removeUndefinedValues: true },
  });
  const table = options.tableName;

  function conditionFailed(error: unknown): boolean {
    return error instanceof Error && error.name === "ConditionalCheckFailedException";
  }

  return {
    async get(runId) {
      const out = await doc.send(
        new GetCommand({ TableName: table, Key: { pk: pk(runId), sk: SK }, ConsistentRead: true }),
      );
      if (!out.Item) return undefined;
      return { state: out.Item.state as RunState, version: out.Item.version as number };
    },

    async create(runId, state) {
      const version = 1;
      try {
        await doc.send(
          new PutCommand({
            TableName: table,
            Item: { pk: pk(runId), sk: SK, version, state },
            ConditionExpression: "attribute_not_exists(pk)",
          }),
        );
      } catch (error) {
        if (conditionFailed(error)) throw new VersionConflictError(`run ${runId} already exists`);
        throw error;
      }
      return { state, version };
    },

    async put(runId, state, expectedVersion) {
      const version = expectedVersion + 1;
      try {
        await doc.send(
          new PutCommand({
            TableName: table,
            Item: { pk: pk(runId), sk: SK, version, state },
            ConditionExpression: "version = :expected",
            ExpressionAttributeValues: { ":expected": expectedVersion },
          }),
        );
      } catch (error) {
        if (conditionFailed(error)) throw new VersionConflictError(`version conflict on ${runId}`);
        throw error;
      }
      return { state, version };
    },
  };
}
