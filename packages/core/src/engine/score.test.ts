import { describe, expect, it } from "vitest";
import { scoreIncident, type ScoreInput } from "./score";

const base: ScoreInput = {
  excessLitresPerDay: 0,
  sectorSuspectedOrConfirmed: false,
  maxSeverity: 0,
  evidenceCount: 0,
  facilityFactor: 0,
  sectorConnections: 0,
  meterAnomaly: false,
  anyConfidentPhoto: false,
  sewageMixing: false,
};

describe("scoreIncident test vectors (domain-engine.md §7)", () => {
  it.each([
    [
      "C3 burst",
      {
        excessLitresPerDay: 180000,
        sectorSuspectedOrConfirmed: true,
        maxSeverity: 1.0,
        evidenceCount: 7,
        facilityFactor: 1.0,
        sectorConnections: 500,
        meterAnomaly: true,
        anyConfidentPhoto: true,
        sewageMixing: false,
      },
      96,
    ],
    [
      "B2 hidden",
      {
        excessLitresPerDay: 120000,
        sectorSuspectedOrConfirmed: true,
        maxSeverity: 0,
        evidenceCount: 0,
        facilityFactor: 0,
        sectorConnections: 400,
        meterAnomaly: true,
        anyConfidentPhoto: false,
        sewageMixing: false,
      },
      39,
    ],
    [
      "A1 local",
      {
        excessLitresPerDay: 0,
        sectorSuspectedOrConfirmed: false,
        maxSeverity: 0.6,
        evidenceCount: 3,
        facilityFactor: 0,
        sectorConnections: 240,
        meterAnomaly: false,
        anyConfidentPhoto: true,
        sewageMixing: false,
      },
      31,
    ],
    [
      "D4 drip",
      {
        excessLitresPerDay: 0,
        sectorSuspectedOrConfirmed: false,
        maxSeverity: 0.3,
        evidenceCount: 1,
        facilityFactor: 0,
        sectorConnections: 320,
        meterAnomaly: false,
        anyConfidentPhoto: true,
        sewageMixing: false,
      },
      25,
    ],
    [
      "Sewage floor",
      {
        excessLitresPerDay: 0,
        sectorSuspectedOrConfirmed: false,
        maxSeverity: 1.0,
        evidenceCount: 1,
        facilityFactor: 0,
        sectorConnections: 100,
        meterAnomaly: false,
        anyConfidentPhoto: true,
        sewageMixing: true,
      },
      80,
    ],
  ])("scores %s as P=%i", (name, input, expected) => {
    expect(name).toBeTruthy();
    expect(scoreIncident({ ...base, ...input }).P).toBe(expected);
  });
});
