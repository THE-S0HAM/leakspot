// Unit tests for loadConfig: per-role validation, defaults, caching (===), per-role
// variable isolation, and the aggregated error that names every offending variable
// without echoing any supplied value. The access code is generated at test start
// (never a literal) per testing.md and Req 9.10.

import { createHash, randomBytes, randomInt } from "node:crypto";
import { Buffer } from "node:buffer";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { __resetConfigCacheForTests, loadConfig } from "./config";

const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTVWXYZ23456789";
const PRIMARY_MODEL_ID = "global.amazon.nova-2-lite-v1:0";
const FALLBACK_MODEL_ID = "apac.amazon.nova-lite-v1:0";

// Build a Valid_Code at test start: 8 random characters from the code alphabet.
function generateValidCode(): string {
  let code = "";
  for (let i = 0; i < 8; i += 1) {
    code += CODE_ALPHABET[randomInt(0, CODE_ALPHABET.length)];
  }
  return code;
}

// A base64url string (no padding) whose decoded form is exactly `byteLength` bytes.
function base64urlOf(byteLength: number): string {
  return randomBytes(byteLength).toString("base64url");
}

const VALID_CODE = generateValidCode();
const COMMAND_CODE_SHA256 = createHash("sha256").update(VALID_CODE).digest("hex");
const SESSION_SECRET = base64urlOf(32);

// A known-good environment for each role. Callers mutate a copy for failure cases.
function goodApiEnv(): Record<string, string> {
  return {
    TABLE_NAME: "LeakSpot",
    DATA_BUCKET: "leakspot-data",
    APP_VERSION: "1.2.3",
    COMMAND_CODE_SHA256,
    SESSION_SECRET,
    WORKER_FUNCTION_NAME: "LeakSpot-WorkerFn",
  };
}

function goodWorkerEnv(): Record<string, string> {
  return {
    TABLE_NAME: "LeakSpot",
    DATA_BUCKET: "leakspot-data",
    APP_VERSION: "1.2.3",
  };
}

// Replace process.env with exactly the given variables for the duration of a test.
function setEnv(vars: Record<string, string>): void {
  for (const key of Object.keys(process.env)) {
    delete process.env[key];
  }
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

describe("loadConfig valid environments", () => {
  it("returns a fully populated api Config from a valid api environment", () => {
    setEnv({
      ...goodApiEnv(),
      LOG_LEVEL: "warn",
      BEDROCK_MODEL_ID: FALLBACK_MODEL_ID,
      BEDROCK_DAILY_CAP: "500",
    });

    const config = loadConfig("api");

    expect(config).toEqual({
      role: "api",
      tableName: "LeakSpot",
      dataBucket: "leakspot-data",
      appVersion: "1.2.3",
      logLevel: "warn",
      bedrockModelId: FALLBACK_MODEL_ID,
      bedrockDailyCap: 500,
      commandCodeSha256: COMMAND_CODE_SHA256,
      sessionSecret: SESSION_SECRET,
      workerFunctionName: "LeakSpot-WorkerFn",
    });
  });

  it("returns a worker Config without the three api-only fields", () => {
    setEnv({
      ...goodWorkerEnv(),
      LOG_LEVEL: "error",
      BEDROCK_MODEL_ID: PRIMARY_MODEL_ID,
      BEDROCK_DAILY_CAP: "42",
    });

    const config = loadConfig("worker");

    expect(config).toEqual({
      role: "worker",
      tableName: "LeakSpot",
      dataBucket: "leakspot-data",
      appVersion: "1.2.3",
      logLevel: "error",
      bedrockModelId: PRIMARY_MODEL_ID,
      bedrockDailyCap: 42,
    });
  });

  it("exposes BEDROCK_DAILY_CAP as a number, not a string", () => {
    setEnv({ ...goodWorkerEnv(), BEDROCK_DAILY_CAP: "500" });

    expect(loadConfig("worker").bedrockDailyCap).toBe(500);
  });
});

describe("loadConfig defaults", () => {
  it("applies info, the primary model and 300 when the optional vars are absent", () => {
    setEnv(goodWorkerEnv());

    const config = loadConfig("worker");

    expect(config.logLevel).toBe("info");
    expect(config.bedrockModelId).toBe(PRIMARY_MODEL_ID);
    expect(config.bedrockDailyCap).toBe(300);
  });
});

describe("loadConfig per-role isolation", () => {
  it("omits commandCodeSha256, sessionSecret and workerFunctionName from a worker Config", () => {
    // Supply the api-only vars too; the worker schema must ignore them.
    setEnv({ ...goodWorkerEnv(), ...goodApiEnv() });

    const config = loadConfig("worker");

    expect("commandCodeSha256" in config).toBe(false);
    expect("sessionSecret" in config).toBe(false);
    expect("workerFunctionName" in config).toBe(false);
    expect(config.commandCodeSha256).toBeUndefined();
    expect(config.sessionSecret).toBeUndefined();
    expect(config.workerFunctionName).toBeUndefined();
  });
});

describe("loadConfig caching", () => {
  it("returns the identical object on a second call for the same role", () => {
    setEnv(goodApiEnv());

    const first = loadConfig("api");
    const second = loadConfig("api");

    expect(second).toBe(first);
  });

  it("ignores later process.env changes once a role is cached", () => {
    setEnv(goodApiEnv());
    const first = loadConfig("api");

    process.env.TABLE_NAME = "SomethingElse";
    const second = loadConfig("api");

    expect(second).toBe(first);
    expect(second.tableName).toBe("LeakSpot");
  });
});

describe("loadConfig aggregated error", () => {
  it("throws once naming every offending variable without echoing a supplied value", () => {
    const badLogLevel = "verbose";
    const badDailyCap = "-7";
    const badCommandCode = "ZZZ_not_hex";
    setEnv({
      // TABLE_NAME deliberately missing.
      DATA_BUCKET: "leakspot-data",
      APP_VERSION: "1.2.3",
      LOG_LEVEL: badLogLevel,
      BEDROCK_DAILY_CAP: badDailyCap,
      COMMAND_CODE_SHA256: badCommandCode,
      SESSION_SECRET,
      WORKER_FUNCTION_NAME: "LeakSpot-WorkerFn",
    });

    let message = "";
    expect(() => {
      try {
        loadConfig("api");
      } catch (error) {
        message = (error as Error).message;
        throw error;
      }
    }).toThrow();

    // Every offending variable is named.
    expect(message).toContain("TABLE_NAME");
    expect(message).toContain("LOG_LEVEL");
    expect(message).toContain("BEDROCK_DAILY_CAP");
    expect(message).toContain("COMMAND_CODE_SHA256");

    // No supplied value appears in the message, including secret material.
    expect(message).not.toContain(badLogLevel);
    expect(message).not.toContain(badDailyCap);
    expect(message).not.toContain(badCommandCode);
    expect(message).not.toContain(SESSION_SECRET);
    expect(message).not.toContain(VALID_CODE);
    expect(message).not.toContain(COMMAND_CODE_SHA256);
  });

  it("names a bad LOG_LEVEL and bad BEDROCK_DAILY_CAP for a worker without values", () => {
    const badLogLevel = "trace";
    const badDailyCap = "12.5";
    setEnv({
      DATA_BUCKET: "leakspot-data",
      APP_VERSION: "1.2.3",
      LOG_LEVEL: badLogLevel,
      BEDROCK_DAILY_CAP: badDailyCap,
      // TABLE_NAME deliberately missing.
    });

    let message = "";
    try {
      loadConfig("worker");
    } catch (error) {
      message = (error as Error).message;
    }

    expect(message).toContain("TABLE_NAME");
    expect(message).toContain("LOG_LEVEL");
    expect(message).toContain("BEDROCK_DAILY_CAP");
    expect(message).not.toContain(badLogLevel);
    expect(message).not.toContain(badDailyCap);
  });
});

describe("loadConfig present-but-empty invalid", () => {
  it("rejects an empty LOG_LEVEL", () => {
    setEnv({ ...goodWorkerEnv(), LOG_LEVEL: "" });

    expect(() => loadConfig("worker")).toThrow(/LOG_LEVEL/);
  });

  it("rejects an empty TABLE_NAME", () => {
    setEnv({ ...goodWorkerEnv(), TABLE_NAME: "" });

    expect(() => loadConfig("worker")).toThrow(/TABLE_NAME/);
  });
});

describe("loadConfig SESSION_SECRET byte boundary", () => {
  it("rejects a secret that decodes to 31 bytes", () => {
    const secret31 = base64urlOf(31);
    expect(Buffer.from(secret31, "base64url").length).toBe(31);
    setEnv({ ...goodApiEnv(), SESSION_SECRET: secret31 });

    expect(() => loadConfig("api")).toThrow(/SESSION_SECRET/);
  });

  it("accepts a secret that decodes to exactly 32 bytes", () => {
    const secret32 = base64urlOf(32);
    expect(Buffer.from(secret32, "base64url").length).toBe(32);
    setEnv({ ...goodApiEnv(), SESSION_SECRET: secret32 });

    expect(loadConfig("api").sessionSecret).toBe(secret32);
  });
});

describe("loadConfig caches nothing on failure", () => {
  it("succeeds after a fixed environment following an earlier failed load", () => {
    setEnv({
      DATA_BUCKET: "leakspot-data",
      APP_VERSION: "1.2.3",
      // TABLE_NAME missing: first load fails.
    });
    expect(() => loadConfig("worker")).toThrow();

    setEnv(goodWorkerEnv());
    const config = loadConfig("worker");

    expect(config.tableName).toBe("LeakSpot");
  });
});
