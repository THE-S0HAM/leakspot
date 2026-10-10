// Raw hex colours for the 3D world. three.js materials need concrete colours, not CSS custom
// properties, so the Monsoon Night tokens (tokens.css) are mirrored here as hex. Keep in sync with
// tokens.css: these are the --night/--jal/--neem/--haldi/--sindoor/--neel values.

import type { SectorStatus } from "../state/view-types";
import type { ZoneId } from "@leakspot/core/world";

export const HEX = {
  night: "#0e1828",
  cloud: "#172539",
  cloud2: "#21324a",
  rule: "#2e4361",
  ink: "#e7eef7",
  inkDim: "#9db0c9",
  jal: "#35d3f0",
  neem: "#49d49a",
  haldi: "#f4b43a",
  sindoor: "#ff7183",
  neel: "#a99bff",
} as const;

/** Sector status → emissive/overlay colour (matches STATUS_COLOR tokens). */
export const STATUS_HEX: Record<SectorStatus, string> = {
  normal: HEX.neem,
  watch: HEX.haldi,
  suspected: HEX.haldi,
  confirmed: HEX.sindoor,
  data_gap: HEX.inkDim,
  verifying: HEX.jal,
  verified: HEX.neem,
};

// Subtle zone ground tints so zones still read on the diorama slab (plan PART 1a).
// A ochre, B terracotta, C slate, D indigo — low-saturation so status overlays stay legible.
export const ZONE_GROUND: Record<ZoneId, string> = {
  A: "#b59d68",
  B: "#b07a62",
  C: "#8495a0",
  D: "#7c85ad",
};

// Building wall/roof tints per zone (3D), brighter and more varied than the SVG map so the city reads
// as an Indian town: pastel limewash houses, terracotta market, whitewash hospital road, slate colony.
export const ZONE_BUILDING: Record<ZoneId, { wall: string; roof: string }> = {
  A: { wall: "#d8c9a6", roof: "#b24a3a" }, // sandstone limewash, terracotta roof
  B: { wall: "#c97b53", roof: "#8f4a36" }, // terracotta market
  C: { wall: "#eef1f3", roof: "#9fb0b8" }, // whitewash
  D: { wall: "#8ea2c9", roof: "#55658a" }, // slate-blue colony
};

// Pastel limewash wall colours for independent houses (seeded pick per building), plus shop awnings.
export const HOUSE_WALLS = [
  "#f1d7a8", // haldi cream
  "#f4c6c0", // rose limewash
  "#c9e4d6", // mint
  "#bcd7ef", // neel limewash
  "#efe3c4", // sand
  "#e6c9ef", // lilac
  "#f7e08f", // mango
] as const;
export const APARTMENT_WALLS = ["#e9ecef", "#d9dee6", "#f0e6d6", "#cfd9e6"] as const;
export const SHOP_WALLS = ["#e8a87c", "#f0c987", "#d98e73", "#e6d3a3"] as const;
export const AWNINGS = ["#e0473f", "#2f8fd6", "#f2a81d", "#2fae6b", "#c23b8a"] as const;
