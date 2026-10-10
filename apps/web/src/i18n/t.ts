// Tiny i18n: three complete string tables (EN / हिंदी / मराठी) and a hook that reads the language from
// a context. Keys are shared; a missing key falls back to English. The lang also sets the document
// <html lang> so Devanagari fonts apply (global.css).

import { createContext, useContext } from "react";
import { en } from "./en";
import { hi } from "./hi";
import { mr } from "./mr";

export type Lang = "en" | "hi" | "mr";
export type StringKey = keyof typeof en;
// Values are plain strings (not the English literals), so translations can differ while the key set
// stays identical across languages.
export type Strings = Record<StringKey, string>;

const TABLES: Record<Lang, Strings> = { en, hi, mr };

export const LANG_NAMES: Record<Lang, string> = { en: "English", hi: "हिंदी", mr: "मराठी" };

export const LangContext = createContext<Lang>("en");

/** Translate a key for the current language, falling back to English. */
export function useT(): (key: StringKey) => string {
  const lang = useContext(LangContext);
  const table = TABLES[lang];
  return (key) => table[key] ?? en[key];
}

export function useLang(): Lang {
  return useContext(LangContext);
}
