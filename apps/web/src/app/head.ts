// Per-route document head: title, meta description and theme-color. Command and landing use the
// Monsoon Night theme-color (--night); the citizen app uses Neel Limewash (--lime). Keeps the browser
// chrome and tab text matching the surface the user is on. No library — just the DOM.
import { useEffect } from "react";

export type Head = {
  title: string;
  description: string;
  /** theme-color meta; defaults to Monsoon Night. */
  themeColor?: string;
};

const NIGHT = "#0E1828";

function setMeta(name: string, content: string): void {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[name="${name}"]`);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute("name", name);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

/** Set the document head for the current route. Re-runs when any field changes. */
export function useHead({ title, description, themeColor = NIGHT }: Head): void {
  useEffect(() => {
    document.title = title;
    setMeta("description", description);
    setMeta("theme-color", themeColor);
  }, [title, description, themeColor]);
}
