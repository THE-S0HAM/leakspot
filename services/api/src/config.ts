// Validates process.env once with zod and returns a frozen, cached Config (one API
// Lambda, no worker, no sessions). A bad environment fails fast with a message that names every
// offending variable and its rule, never echoing a supplied value (COMMAND_CODE_SHA256 is a hash, but
// we still avoid printing it). Env comes from the CDK stack: TABLE_NAME, PHOTO_BUCKET, BEDROCK_MODEL_ID,
// COMMAND_CODE_SHA256, APP_VERSION (+ optional LOG_LEVEL, BEDROCK_DAILY_CAP).

import { z } from "zod";

const PRIMARY_MODEL_ID = "global.amazon.nova-2-lite-v1:0";
const FALLBACK_MODEL_ID = "apac.amazon.nova-lite-v1:0";

const LOG_LEVELS = ["debug", "info", "warn", "error"] as const;
const MODEL_IDS = [PRIMARY_MODEL_ID, FALLBACK_MODEL_ID] as const;

const MAX_DAILY_CAP = Number.MAX_SAFE_INTEGER;

export type Config = {
  tableName: string;
  photoBucket: string;
  appVersion: string;
  logLevel: (typeof LOG_LEVELS)[number];
  bedrockModelId: (typeof MODEL_IDS)[number];
  bedrockDailyCap: number;
  commandCodeSha256: string;
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

const schema = z.object({
  TABLE_NAME: nonWhitespace("TABLE_NAME"),
  PHOTO_BUCKET: nonWhitespace("PHOTO_BUCKET"),
  APP_VERSION: nonWhitespace("APP_VERSION"),
  LOG_LEVEL: logLevelSchema,
  BEDROCK_MODEL_ID: modelIdSchema,
  BEDROCK_DAILY_CAP: dailyCapSchema,
  COMMAND_CODE_SHA256: commandCodeSha256Schema,
});

let cached: Config | undefined;

/** Validate process.env and return a frozen Config; cached (===) after the first success. */
export function loadConfig(): Config {
  if (cached) return cached;
  const env = parseOrThrow();
  cached = Object.freeze({
    tableName: env.TABLE_NAME,
    photoBucket: env.PHOTO_BUCKET,
    appVersion: env.APP_VERSION,
    logLevel: env.LOG_LEVEL,
    bedrockModelId: env.BEDROCK_MODEL_ID,
    bedrockDailyCap: env.BEDROCK_DAILY_CAP,
    commandCodeSha256: env.COMMAND_CODE_SHA256,
  });
  return cached;
}

function parseOrThrow(): z.infer<typeof schema> {
  const result = schema.safeParse(process.env);
  if (result.success) return result.data;
  const details = result.error.issues
    .map((issue) => {
      const variable = issue.path[0];
      const name = typeof variable === "string" ? variable : "environment";
      return `${name}: ${issue.message}`;
    })
    .join("; ");
  throw new Error(`Invalid API environment: ${details}`);
}

/** Test-only: clear the cache so a test can validate error paths against a mutated process.env. */
export function __resetConfigCacheForTests(): void {
  cached = undefined;
}
