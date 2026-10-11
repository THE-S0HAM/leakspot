// i18n key parity: hi and mr must define exactly the same keys as en, with non-empty values. A missing
// or extra key would mean an untranslated or dead string.
import { describe, expect, it } from "vitest";
import { en } from "./en";
import { hi } from "./hi";
import { mr } from "./mr";

const enKeys = Object.keys(en).sort();

describe("i18n parity", () => {
  it.each([
    ["hi", hi],
    ["mr", mr],
  ])("%s has exactly the English key set", (name, table) => {
    expect(name).toBeTruthy();
    expect(Object.keys(table).sort()).toEqual(enKeys);
  });

  it.each([
    ["hi", hi],
    ["mr", mr],
  ])("%s has no empty strings", (name, table) => {
    expect(name).toBeTruthy();
    for (const [key, value] of Object.entries(table)) {
      expect(value, `empty value for ${key}`).toBeTruthy();
    }
  });
});

describe("finished PipelineLog steps read in the past tense", () => {
  // Keys the citizen log shows with state "done" (ReportApp toLogLines).
  const DONE = [
    "stageReceived",
    "stageStored",
    "stageLocated",
    "stageClassified",
    "stageMatched",
    "stageScored",
    "stageDone",
  ] as const;
  it.each([
    ["en", en, /\bchecking\b|\bmatching\b|ing$/],
    ["hi", hi, /रहा है|रही है|रहे हैं|रही हैं/],
    ["mr", mr, /आहे$|त आहे/],
  ])("%s has no progressive form on a done step", (name, table, progressive) => {
    for (const k of DONE) expect(table[k], `${name} ${k}`).not.toMatch(progressive);
  });
  it("Marathi says the photo was checked", () => {
    expect(mr.stageClassified).toBe("फोटो तपासला");
  });
});
