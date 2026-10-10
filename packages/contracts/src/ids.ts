// Run id and report id zod schemas, shared by the API and web app so both
// sides accept exactly the same ids. Crockford base32 alphabet is
// 0-9 A-Z without I, L, O, U; accepted values are returned unchanged.
import { z } from "zod";

// One Crockford base32 character: digits plus A-Z excluding I, L, O, U.
// A-H, J, K, M, N, P-T, V-Z — the gaps drop exactly I, L, O, U.
const CROCKFORD_CHAR = "[0-9A-HJKMNP-TV-Z]";

export const RunId = z.union([
  z.literal("SHOWCASE"),
  z.string().regex(new RegExp(`^${CROCKFORD_CHAR}{5}$`)),
]);

export const ReportId = z.string().regex(new RegExp(`^[0-7]${CROCKFORD_CHAR}{25}$`));

export type RunId = z.infer<typeof RunId>;
export type ReportId = z.infer<typeof ReportId>;
