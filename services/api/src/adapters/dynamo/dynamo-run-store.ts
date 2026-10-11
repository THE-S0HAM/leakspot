// DynamoDB RunStore adapter. One item per run: pk = RUN#<id>,
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
      return {
        state: out.Item.state as RunState,
        version: out.Item.version as number,
        createdAt: out.Item.createdAt as string | undefined,
        updatedAt: out.Item.updatedAt as string | undefined,
      };
    },

    async create(runId, state, now = new Date().toISOString()) {
      const version = 1;
      try {
        await doc.send(
          new PutCommand({
            TableName: table,
            Item: { pk: pk(runId), sk: SK, version, state, createdAt: now, updatedAt: now },
            ConditionExpression: "attribute_not_exists(pk)",
          }),
        );
      } catch (error) {
        if (conditionFailed(error)) throw new VersionConflictError(`run ${runId} already exists`);
        throw error;
      }
      return { state, version, createdAt: now, updatedAt: now };
    },

    async put(runId, state, expectedVersion, createdAt, now = new Date().toISOString()) {
      const version = expectedVersion + 1;
      try {
        await doc.send(
          new PutCommand({
            TableName: table,
            Item: { pk: pk(runId), sk: SK, version, state, createdAt, updatedAt: now },
            ConditionExpression: "version = :expected",
            ExpressionAttributeValues: { ":expected": expectedVersion },
          }),
        );
      } catch (error) {
        if (conditionFailed(error)) throw new VersionConflictError(`version conflict on ${runId}`);
        throw error;
      }
      return { state, version, createdAt, updatedAt: now };
    },
  };
}
