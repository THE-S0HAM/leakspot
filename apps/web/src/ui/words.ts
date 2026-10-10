// Human words for domain enums shown in the Command Centre: no snake_case ever reaches the UI
// (a test asserts the rendered text has no /[a-z]+_[a-z]+/). Shared by cards, the feed and panels.

import type { IncidentView } from "../state/view-types";

const LABEL_WORDS: Record<string, string> = {
  burst: "burst",
  sewage_mixing: "sewage in supply",
  major_leak: "major leak",
  minor_drip: "small drip",
  not_a_leak: "not a leak",
  unclear: "unclear photo",
  self_reported: "self-reported",
};

const VERDICT_WORDS: Record<IncidentView["verdict"], string> = {
  CONFIRMED: "confirmed burst",
  HIDDEN_SUSPECTED: "hidden leak suspected",
  HIDDEN_AREA_KNOWN: "hidden leak, area known",
  LOCAL_LEAK: "local leak",
};

const KIND_WORDS: Record<IncidentView["kind"], string> = {
  hidden: "hidden leak",
  visible: "reported leak",
  cluster: "low-water cluster",
};

export function labelWord(label: string): string {
  return LABEL_WORDS[label] ?? label.replace(/_/g, " ");
}

export function verdictWord(v: IncidentView["verdict"]): string {
  return VERDICT_WORDS[v] ?? v.toLowerCase().replace(/_/g, " ");
}

export function kindWord(k: IncidentView["kind"]): string {
  return KIND_WORDS[k] ?? k;
}

const STATUS_WORDS: Record<IncidentView["status"], string> = {
  open: "open",
  dispatched: "crew dispatched",
  onsite: "crew on site",
  repaired: "repaired",
  verifying: "verifying",
  verified: "verified",
  reopened: "reopened",
  closed_logged: "logged, below meter resolution",
};

export function incidentStatusWord(s: IncidentView["status"]): string {
  return STATUS_WORDS[s] ?? s.replace(/_/g, " ");
}
