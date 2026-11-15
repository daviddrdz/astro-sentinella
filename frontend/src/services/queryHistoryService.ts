import { PORTAL_HISTORY_CONFIG } from "../config/app";
import type { QueryParams } from "../types/portal";
import { validateQueryParams } from "../utils/coordinates";

function isValidQueryEntry(item: unknown): item is QueryParams {
  if (typeof item !== "object" || item === null) {
    return false;
  }
  const candidate = item as Partial<QueryParams>;
  if (
    typeof candidate.ra !== "string" ||
    typeof candidate.dec !== "string" ||
    typeof candidate.fieldSizeDeg !== "string" ||
    typeof candidate.observationDate !== "string"
  ) {
    return false;
  }

  const errors = validateQueryParams({
    ra: candidate.ra,
    dec: candidate.dec,
    fieldSizeDeg: candidate.fieldSizeDeg,
    observationDate: candidate.observationDate,
  });

  return Object.keys(errors).length === PORTAL_HISTORY_CONFIG.emptyLength;
}

export function loadQueryHistory(): QueryParams[] {
  try {
    const raw = window.localStorage.getItem(PORTAL_HISTORY_CONFIG.storageKey);
    if (!raw) {
      return [];
    }
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed
      .filter(isValidQueryEntry)
      .slice(PORTAL_HISTORY_CONFIG.emptyLength, PORTAL_HISTORY_CONFIG.maxItems);
  } catch {
    return [];
  }
}

export function saveQueryHistoryEntry(entry: QueryParams): QueryParams[] {
  const current = loadQueryHistory();
  if (!isValidQueryEntry(entry)) {
    return current;
  }

  const deduped = current.filter(
    (item) =>
      !(
        item.ra === entry.ra &&
        item.dec === entry.dec &&
        item.fieldSizeDeg === entry.fieldSizeDeg
      )
  );
  const next = [entry, ...deduped].slice(
    PORTAL_HISTORY_CONFIG.emptyLength,
    PORTAL_HISTORY_CONFIG.maxItems
  );
  try {
    window.localStorage.setItem(
      PORTAL_HISTORY_CONFIG.storageKey,
      JSON.stringify(next)
    );
  } catch {
    // Ignore storage quota or private browsing errors
  }
  return next;
}

export function clearQueryHistory(): void {
  try {
    window.localStorage.removeItem(PORTAL_HISTORY_CONFIG.storageKey);
  } catch {
    // Ignore storage errors
  }
}
