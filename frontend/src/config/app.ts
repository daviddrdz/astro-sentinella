export const APP_CONFIG = {
  name: "Astro Sentinella",
  githubUrl: "https://github.com/daviddrdz/astro-sentinella",
  metadataEndpoint: "/api/metadata",
  metadataDebounceMs: 600,
} as const;

export const COORDINATE_LIMITS = {
  raMinDeg: 0,
  raMaxDeg: 360,
  decMinDeg: -90,
  decMaxDeg: 90,
  fieldSizeMinDeg: 0.01,
  fieldSizeMaxDeg: 10,
} as const;

export const ICON_SIZES = {
  navbarBrand: 18,
} as const;

export const PORTAL_PLACEHOLDERS = {
  ra: "05h 35m 17s",
  dec: "-05° 23' 28\"",
  fieldSizeDeg: "0.5 deg",
  observationDate: "2026-10-12",
} as const;

export const PORTAL_HISTORY_CONFIG = {
  storageKey: "astro-sentinella.portal-history.v1",
  maxItems: 50,
  maxSuggestions: 10,
  emptyLength: 0,
  sortPriorityFirst: -1,
  sortPrioritySecond: 1,
  sortEqual: 0,
} as const;
