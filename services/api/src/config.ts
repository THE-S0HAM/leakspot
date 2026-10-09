// Validates process.env once per Lambda role (api | worker) with zod and returns a
// frozen, cached Config. A bad environment fails fast with a message that names every
// offending variable and its rule, never echoing a supplied value (which may be a secret).

import { Buffer } from "node:buffer";
import { z } from "zod";

const PRIMARY_MODEL_ID = "global.amazon.nova-2-lite-v1:0";
const FALLBACK_MODEL_ID = "apac.amazon.nova-lite-v1:0";

const LOG_LEVELS = ["debug", "info", "warn", "error"] as const;
const MODEL_IDS = [PRIMARY_MODEL_ID, FALLBACK_MODEL_ID] as const;

const MIN_SESSION_SECRET_BYTES = 32;
const MAX_DAILY_CAP = Number.MAX_SAFE_INTEGER; // 2^53 - 1

export type Config = {
  role: "api" | "worker";
  tableName: string;
  dataBucket: string;
  appVersion: string;
  logLevel: (typeof LOG_LEVELS)[number]; // default "info"
  bedrockModelId: (typeof MODEL_IDS)[number]; // default primary
  bedrockDailyCap: number; // default 300; digits only, 1..2^53-1
  // api role only:
  commandCodeSha256?: string;
  sessionSecret?: string;
  workerFunctionName?: string;
};

const nonWhitespace = (variable: string): z.ZodString =>
  z.string().regex(/\S/, `${variable} must contain at least one non-whitespace character`);

const logLevelSchema = z
  .enum(LOG_LEVELS, { message: "LOG_LEVEL must be one of debug, info, warn, error" })
  .optional()
  .transform((value) => value ?? "info");

const modelIdSchema = z
  .enum(MODEL_IDS, {
    message: `BEDROCK_MODEL_ID must be exactly "${PRIMARY_MODEL_ID}" or "${FALLBACK_MODEL_ID}"`,
  })
  .optional()
  .transform((value) => value ?? PRIMARY_MODEL_ID);

const dailyCapSchema = z
  .string()
  .regex(/^[0-9]+$/, "BEDROCK_DAILY_CAP must be decimal digits only")
  .optional()
  .transform((value, ctx) => {
    if (value === undefined) return 300;
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > MAX_DAILY_CAP) {
      ctx.addIssue({
        code: "custom",
        message: `BEDROCK_DAILY_CAP must be from 1 to ${MAX_DAILY_CAP}`,
      });
      return z.NEVER;
    }
    return parsed;
  });

const commandCodeSha256Schema = z
  .string()
  .regex(/^[0-9a-f]{64}$/, "COMMAND_CODE_SHA256 must be exactly 64 lowercase hex characters");

const sessionSecretSchema = z
  .string()
  .regex(/^[A-Za-z0-9_-]+$/, "SESSION_SECRET must contain only base64url characters (no padding)")
  .refine(
    (value) => Buffer.from(value, "base64url").length >= MIN_SESSION_SECRET_BYTES,
    `SESSION_SECRET must decode to at least ${MIN_SESSION_SECRET_BYTES} bytes`,
  );

const commonShape = {
  TABLE_NAME: nonWhitespace("TABLE_NAME"),
  DATA_BUCKET: nonWhitespace("DATA_BUCKET"),
  APP_VERSION: nonWhitespace("APP_VERSION"),
  LOG_LEVEL: logLevelSchema,
  BEDROCK_MODEL_ID: modelIdSchema,
  BEDROCK_DAILY_CAP: dailyCapSchema,
};

const apiSchema = z.object({
  ...commonShape,
  COMMAND_CODE_SHA256: commandCodeSha256Schema,
  SESSION_SECRET: sessionSecretSchema,
  WORKER_FUNCTION_NAME: nonWhitespace("WORKER_FUNCTION_NAME"),
});

const workerSchema = z.object(commonShape);

const cache: { api?: Config; worker?: Config } = {};

/**
 * Validates process.env for the given role and returns a frozen Config. On the first
 * successful call per role the result is cached and returned (===) on later calls
 * without re-reading process.env. On failure it throws once and caches nothing.
 */
export function loadConfig(role: "api" | "worker"): Config {
  const cached = cache[role];
  if (cached) return cached;

  const config = role === "api" ? loadApiConfig() : loadWorkerConfig();
  const frozen = Object.freeze(config);
  cache[role] = frozen;
  return frozen;
}

function loadApiConfig(): Config {
  const env = parseOrThrow(apiSchema, "api");
  return {
    role: "api",
    tableName: env.TABLE_NAME,
    dataBucket: env.DATA_BUCKET,
    appVersion: env.APP_VERSION,
    logLevel: env.LOG_LEVEL,
    bedrockModelId: env.BEDROCK_MODEL_ID,
    bedrockDailyCap: env.BEDROCK_DAILY_CAP,
    commandCodeSha256: env.COMMAND_CODE_SHA256,
    sessionSecret: env.SESSION_SECRET,
    workerFunctionName: env.WORKER_FUNCTION_NAME,
  };
}

function loadWorkerConfig(): Config {
  const env = parseOrThrow(workerSchema, "worker");
  return {
    role: "worker",
    tableName: env.TABLE_NAME,
    dataBucket: env.DATA_BUCKET,
    appVersion: env.APP_VERSION,
    logLevel: env.LOG_LEVEL,
    bedrockModelId: env.BEDROCK_MODEL_ID,
    bedrockDailyCap: env.BEDROCK_DAILY_CAP,
  };
}

function parseOrThrow<T extends z.ZodTypeAny>(schema: T, role: string): z.infer<T> {
  const result = schema.safeParse(process.env);
  if (result.success) return result.data;

  const details = result.error.issues
    .map((issue) => {
      const variable = issue.path[0];
      const name = typeof variable === "string" ? variable : "environment";
      return `${name}: ${issue.message}`;
    })
    .join("; ");
  throw new Error(`Invalid environment for role "${role}": ${details}`);
}

/**
 * Test-only: clears the per-role cache so a test can validate both roles and error paths
 * against a freshly mutated process.env. Not used by production code.
 */
export function __resetConfigCacheForTests(): void {
  delete cache.api;
  delete cache.worker;
}
