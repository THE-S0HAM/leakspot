// Sector-status presentation: the CSS custom-property colour and the word label for each status
// (status is never colour alone). Shared by CityView and the zone rail.

import type { SectorStatus } from "../state/view-types";

export const STATUS_COLOR: Record<SectorStatus, string> = {
  normal: "var(--neem)",
  watch: "var(--haldi)",
  suspected: "var(--haldi)",
  confirmed: "var(--sindoor)",
  data_gap: "var(--ink-dim)",
  verifying: "var(--jal)",
  verified: "var(--neem)",
};

export const STATUS_WORD: Record<SectorStatus, string> = {
  normal: "Normal",
  watch: "Watch",
  suspected: "Suspected",
  confirmed: "Confirmed",
  data_gap: "Data gap",
  verifying: "Verifying",
  verified: "Verified",
};
