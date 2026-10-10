// Reading generation (domain-engine.md §2): for a sector at (day, slot), produce 15 building meter
// readings (each independently missing with p = 0.02) and the sector inlet reading, which includes the
// background loss and any active leak volume. Deterministic given the run seed. GROUND TRUTH stays
// implicit: the engine sees only the returned readings, not the leak list.

import type { Sector } from "../world/jaldhara";
import type { SectorSlotReadings } from "../engine/types";
import { buildingConnectionShares, connectionDemand } from "./demand";
import { clippedNormal, makeRng, streamSeed } from "./rng";

const CONSUMPTION_NOISE = 0.08;
const METER_NOISE = 0.01;
const MISSING_PROBABILITY = 0.02;

/** Active leak volume (litres) added to a sector's inlet this slot: Σ litresPerHour × 0.25. */
export type ActiveLeakVolume = number;

/**
 * Generate one sector's meter readings for a slot.
 * @param seed run seed
 * @param day 1-based day
 * @param slotIndex 0–19 supply slot
 * @param sector the sector layout (connections, background loss)
 * @param leakVolumeLitres total active leak volume in this sector this slot (0 in history)
 */
export function generateSectorReadings(
  seed: number,
  day: number,
  slotIndex: number,
  sector: Sector,
  leakVolumeLitres: ActiveLeakVolume,
): SectorSlotReadings {
  const shares = buildingConnectionShares(seed, sector.id, sector.connections);
  const demandPerConnection = connectionDemand(day, slotIndex);

  let trueConsumptionSum = 0;
  const buildings: (number | null)[] = [];

  for (let b = 0; b < shares.length; b += 1) {
    const connections = shares[b] ?? 0;
    const meterId = `${sector.id}#${b}`;
    const consRng = makeRng(streamSeed(seed, day, slotIndex, meterId, "consumption"));
    const meterRng = makeRng(streamSeed(seed, day, slotIndex, meterId, "meter"));
    const missRng = makeRng(streamSeed(seed, day, slotIndex, meterId, "missing"));

    const nominal = connections * demandPerConnection;
    const trueConsumption = nominal * clippedNormal(consRng, 1, CONSUMPTION_NOISE, 0.75, 1.25);
    trueConsumptionSum += trueConsumption;

    const missing = missRng.uniform() < MISSING_PROBABILITY;
    buildings.push(missing ? null : trueConsumption * (1 + METER_NOISE * meterRng.normal()));
  }

  const inletRng = makeRng(streamSeed(seed, day, slotIndex, sector.id, "inlet"));
  const inletTrue = trueConsumptionSum / (1 - sector.backgroundLoss) + leakVolumeLitres;
  const inlet = inletTrue * (1 + METER_NOISE * inletRng.normal());

  return { sectorId: sector.id, buildings, inlet };
}
