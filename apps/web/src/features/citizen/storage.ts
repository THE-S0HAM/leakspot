// Local, device-only persistence for the citizen app: the chosen language and "My tickets". All reads
// and writes are wrapped in try/catch so a blocked or unavailable localStorage never breaks the app.
// No accounts, no personal data (product.md privacy).

import type { Lang } from "../../i18n/t";

const LANG_KEY = "leakspot.lang";
const TICKETS_KEY = "leakspot.tickets";
const MAX_TICKETS = 10;

export type SavedTicket = {
  run: string;
  rid: string;
  code?: string;
  type: "leak_photo" | "low_water";
  at: string; // ISO
};

export function loadLang(): Lang | null {
  try {
    const v = localStorage.getItem(LANG_KEY);
    return v === "en" || v === "hi" || v === "mr" ? v : null;
  } catch {
    return null;
  }
}

export function saveLang(lang: Lang): void {
  try {
    localStorage.setItem(LANG_KEY, lang);
  } catch {
    // ignore — language just won't persist
  }
}

export function loadTickets(): SavedTicket[] {
  try {
    const raw = localStorage.getItem(TICKETS_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as SavedTicket[]) : [];
  } catch {
    return [];
  }
}

/** Prepend a ticket (newest first), de-duplicated by rid, capped at 10. */
export function saveTicket(ticket: SavedTicket): void {
  try {
    const existing = loadTickets().filter((t) => t.rid !== ticket.rid);
    const next = [ticket, ...existing].slice(0, MAX_TICKETS);
    localStorage.setItem(TICKETS_KEY, JSON.stringify(next));
  } catch {
    // ignore — tickets just won't persist on this device
  }
}
