"use client";

import { useSyncExternalStore } from "react";

function subscribeTheme(onChange: () => void) {
  const el = document.documentElement;
  const obs = new MutationObserver(onChange);
  obs.observe(el, { attributes: true, attributeFilter: ["data-theme"] });
  return () => obs.disconnect();
}

function getThemeSnapshot(): "light" | "dark" {
  const v = document.documentElement.dataset.theme;
  return v === "light" ? "light" : "dark";
}

function getServerTheme(): "light" | "dark" {
  return "dark";
}

/** Matches `AppLayout` / `document.documentElement.dataset.theme`. */
export function useDocumentTheme(): "light" | "dark" {
  return useSyncExternalStore(subscribeTheme, getThemeSnapshot, getServerTheme);
}
