// Scripted ground truth: the 4 day-15 leaks and the 12 NPC reports with their
// scenario labels. GROUND TRUTH — lives only in sim/; must never reach the web bundle. The engine never
// imports this; it sees only meter readings and submitted reports.

import type { Point, SectorId } from "../world/jaldhara";

export type ScriptedLeak = {
  id: "L-B2" | "L-C3" | "L-A1" | "L-D4";
  sector: SectorId;
  position: Point;
  litresPerHour: number; // during supply slots only
  visible: boolean;
  startDay: number;
  startSlot: number;
};

export const SCRIPTED_LEAKS: readonly ScriptedLeak[] = [
  {
    id: "L-B2",
    sector: "B2",
    position: { x: 88, z: 26 },
    litresPerHour: 24000,
    visible: false,
    startDay: 15,
    startSlot: 0,
  },
  {
    id: "L-C3",
    sector: "C3",
    position: { x: 14, z: 86 },
    litresPerHour: 36000,
    visible: true,
    startDay: 15,
    startSlot: 2,
  },
  {
    id: "L-A1",
    sector: "A1",
    position: { x: 10, z: 20 },
    litresPerHour: 600,
    visible: true,
    startDay: 15,
    startSlot: 1,
  },
  {
    id: "L-D4",
    sector: "D4",
    position: { x: 90, z: 92 },
    litresPerHour: 300,
    visible: true,
    startDay: 15,
    startSlot: 0,
  },
];

export type SelfChoice = "flowing" | "dripping" | "weak_flow" | "no_water";

export type ScriptedReport = {
  day: number;
  slotIndex: number;
  sector: SectorId;
  type: "leak_photo" | "low_water";
  position: Point;
  /** The scenario label this report carries (marked scripted); only live photos call Bedrock. */
  scenarioLabel: VisionLabelName;
  selfChoice: SelfChoice;
  seedPhoto?: string;
};

// The six seed photos' expected labels (seed/photos/manifest.json). FakeVision returns these.
export type VisionLabelName =
  "burst" | "sewage_mixing" | "major_leak" | "minor_drip" | "not_a_leak";

// Scenario labels per seed photo (manifest.json): burst photos -> burst; pipe joint -> major_leak;
// drip -> minor_drip; car wash -> not_a_leak. Low-water reports have no photo/label.
export const SCRIPTED_REPORTS: readonly ScriptedReport[] = [
  {
    day: 15,
    slotIndex: 3,
    sector: "C3",
    type: "leak_photo",
    position: { x: 13, z: 85 },
    scenarioLabel: "burst",
    selfChoice: "flowing",
    seedPhoto: "p1-burst-a.jpg",
  },
  {
    day: 15,
    slotIndex: 3,
    sector: "C3",
    type: "leak_photo",
    position: { x: 16, z: 87 },
    scenarioLabel: "burst",
    selfChoice: "flowing",
    seedPhoto: "p2-burst-b.jpg",
  },
  {
    day: 15,
    slotIndex: 3,
    sector: "A1",
    type: "leak_photo",
    position: { x: 10, z: 21 },
    scenarioLabel: "major_leak",
    selfChoice: "flowing",
    seedPhoto: "p4-pipe-joint.jpg",
  },
  {
    day: 15,
    slotIndex: 4,
    sector: "C3",
    type: "leak_photo",
    position: { x: 15, z: 84 },
    scenarioLabel: "burst",
    selfChoice: "flowing",
    seedPhoto: "p3-street-flow.jpg",
  },
  {
    day: 15,
    slotIndex: 4,
    sector: "C3",
    type: "leak_photo",
    position: { x: 12, z: 87 },
    scenarioLabel: "burst",
    selfChoice: "flowing",
    seedPhoto: "p1-burst-a.jpg",
  },
  {
    day: 15,
    slotIndex: 4,
    sector: "C3",
    type: "low_water",
    position: { x: 8, z: 93 },
    scenarioLabel: "not_a_leak",
    selfChoice: "weak_flow",
  },
  {
    day: 15,
    slotIndex: 4,
    sector: "C3",
    type: "low_water",
    position: { x: 20, z: 95 },
    scenarioLabel: "not_a_leak",
    selfChoice: "no_water",
  },
  {
    day: 15,
    slotIndex: 4,
    sector: "A1",
    type: "leak_photo",
    position: { x: 11, z: 19 },
    scenarioLabel: "major_leak",
    selfChoice: "flowing",
    seedPhoto: "p4-pipe-joint.jpg",
  },
  {
    day: 15,
    slotIndex: 4,
    sector: "D4",
    type: "leak_photo",
    position: { x: 90, z: 91 },
    scenarioLabel: "minor_drip",
    selfChoice: "dripping",
    seedPhoto: "p5-drip.jpg",
  },
  {
    day: 15,
    slotIndex: 5,
    sector: "C3",
    type: "leak_photo",
    position: { x: 14, z: 88 },
    scenarioLabel: "burst",
    selfChoice: "flowing",
    seedPhoto: "p2-burst-b.jpg",
  },
  {
    day: 15,
    slotIndex: 5,
    sector: "A1",
    type: "leak_photo",
    position: { x: 9, z: 20 },
    scenarioLabel: "major_leak",
    selfChoice: "flowing",
    seedPhoto: "p4-pipe-joint.jpg",
  },
  {
    day: 15,
    slotIndex: 5,
    sector: "D1",
    type: "leak_photo",
    position: { x: 60, z: 64 },
    scenarioLabel: "not_a_leak",
    selfChoice: "flowing",
    seedPhoto: "p6-car-wash.jpg",
  },
];
