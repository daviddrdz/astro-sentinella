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

export const URL_QUERY_CONFIG = {
  raKey: "ra",
  decKey: "dec",
  fovKey: "fov",
  fieldSizeKey: "fieldSizeDeg",
  dateKey: "date",
  observationDateKey: "observationDate",
  defaultFieldSizeDeg: "0.5",
} as const;

export interface FeaturedSector {
  id: string;
  name: string;
  category: string;
  ra: string;
  dec: string;
  fieldSizeDeg: string;
}

export const PORTAL_FEATURED_SECTORS: readonly FeaturedSector[] = [
  {
    id: "wise-0855",
    name: "WISE 0855",
    category: "Fast Brown Dwarf",
    ra: "08h 55m 10.831s",
    dec: "-07° 14' 42.53\"",
    fieldSizeDeg: "0.5",
  },
  {
    id: "barnards-star",
    name: "Barnard's Star",
    category: "High Proper Motion",
    ra: "17h 57m 48.5s",
    dec: "+04° 41' 36\"",
    fieldSizeDeg: "0.5",
  },
  {
    id: "epsilon-indi-b",
    name: "Epsilon Indi B",
    category: "Binary Brown Dwarf",
    ra: "22h 04m 10.5s",
    dec: "-56° 46' 58\"",
    fieldSizeDeg: "0.5",
  },
  {
    id: "rw-aurigae",
    name: "RW Aurigae",
    category: "Variable Star",
    ra: "05h 07m 49.6s",
    dec: "+30° 24' 05\"",
    fieldSizeDeg: "0.5",
  },
  {
    id: "r-draconis",
    name: "R Draconis",
    category: "Mira Variable",
    ra: "16h 32m 40.2s",
    dec: "+66° 45' 17\"",
    fieldSizeDeg: "0.5",
  },
] as const;
