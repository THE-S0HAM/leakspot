// Unit tests for loadConfig (the single API Lambda's env): defaults, caching (===), isolation
// from later env changes, and the aggregated error that names every offending variable without
// echoing a supplied value. The command-code hash is derived from a code generated at test start.

import { createHash, randomInt } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { __resetConfigCacheForTests, loadConfig } from "./config";

const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTVWXYZ23456789";
const PRIMARY_MODEL_ID = "global.amazon.nova-2-lite-v1:0";
const FALLBACK_MODEL_ID = "apac.amazon.nova-lite-v1:0";

function generateValidCode(): string {
  let code = "";
  for (let i = 0; i < 8; i += 1) code += CODE_ALPHABET[randomInt(0, CODE_ALPHABET.length)];
  return code;
}

const VALID_CODE = generateValidCode();
const COMMAND_CODE_SHA256 = createHash("sha256").update(VALID_CODE).digest("hex");

function goodEnv(): Record<string, string> {
  return {
    TABLE_NAME: "LeakSpot",
    PHOTO_BUCKET: "leakspot-photos",
    APP_VERSION: "1.2.3",
    COMMAND_CODE_SHA256,
  };
}

function setEnv(vars: Record<string, string>): void {
  for (const key of Object.keys(process.env)) delete process.env[key];
  Object.assign(process.env, vars);
}

let savedEnv: NodeJS.ProcessEnv;

beforeEach(() => {
  savedEnv = { ...process.env };
  __resetConfigCacheForTests();
});

afterEach(() => {
  setEnv(savedEnv as Record<string, string>);
  __resetConfigCacheForTests();
});

describe("loadConfig valid environment", () => {
  it("returns a fully populated Config", () => {
    setEnv({
      ...goodEnv(),
      LOG_LEVEL: "warn",
      BEDROCK_MODEL_ID: FALLBACK_MODEL_ID,
      BEDROCK_DAILY_CAP: "500",
    });
    expect(loadConfig()).toEqual({
      tableName: "LeakSpot",
      photoBucket: "leakspot-photos",
      appVersion: "1.2.3",
      logLevel: "warn",
      bedrockModelId: FALLBACK_MODEL_ID,
      bedrockDailyCap: 500,
      commandCodeSha256: COMMAND_CODE_SHA256,
    });
  });

  it("applies info, the primary model and 300 when the optional vars are absent", () => {
    setEnv(goodEnv());
    const config = loadConfig();
    expect(config.logLevel).toBe("info");
    expect(config.bedrockModelId).toBe(PRIMARY_MODEL_ID);
    expect(config.bedrockDailyCap).toBe(300);
  });
});

describe("loadConfig caching", () => {
  it("returns the identical object on a second call", () => {
    setEnv(goodEnv());
    expect(loadConfig()).toBe(loadConfig());
  });

  it("ignores later process.env changes once cached", () => {
    setEnv(goodEnv());
    const first = loadConfig();
    process.env.TABLE_NAME = "SomethingElse";
    expect(loadConfig()).toBe(first);
    expect(loadConfig().tableName).toBe("LeakSpot");
  });

  it("caches nothing on failure", () => {
    setEnv({ PHOTO_BUCKET: "p", APP_VERSION: "1", COMMAND_CODE_SHA256 }); // TABLE_NAME missing
    expect(() => loadConfig()).toThrow();
    setEnv(goodEnv());
    expect(loadConfig().tableName).toBe("LeakSpot");
  });
});

describe("loadConfig aggregated error", () => {
  it("names every offending variable without echoing a supplied value", () => {
    const badLogLevel = "verbose";
    const badDailyCap = "-7";
    const badCommandCode = "ZZZ_not_hex";
    setEnv({
      PHOTO_BUCKET: "leakspot-photos",
      APP_VERSION: "1.2.3",
      LOG_LEVEL: badLogLevel,
      BEDROCK_DAILY_CAP: badDailyCap,
      COMMAND_CODE_SHA256: badCommandCode,
    });

    let message = "";
    try {
      loadConfig();
    } catch (error) {
      message = (error as Error).message;
    }

    expect(message).toContain("TABLE_NAME");
    expect(message).toContain("LOG_LEVEL");
    expect(message).toContain("BEDROCK_DAILY_CAP");
    expect(message).toContain("COMMAND_CODE_SHA256");
    expect(message).not.toContain(badLogLevel);
    expect(message).not.toContain(badDailyCap);
    expect(message).not.toContain(badCommandCode);
    expect(message).not.toContain(VALID_CODE);
  });
});

describe("loadConfig present-but-empty invalid", () => {
  it("rejects an empty TABLE_NAME", () => {
    setEnv({ ...goodEnv(), TABLE_NAME: "" });
    expect(() => loadConfig()).toThrow(/TABLE_NAME/);
  });
});
