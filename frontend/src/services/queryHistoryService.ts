import { PORTAL_HISTORY_CONFIG } from "../config/app";
import type { QueryParams } from "../types/portal";

function isValidQueryEntry(item: unknown): item is QueryParams {
  if (typeof item !== "object" || item === null) {
    return false;
  }
  const candidate = item as Partial<QueryParams>;
  return (
    typeof candidate.ra === "string" &&
    candidate.ra.trim().length > PORTAL_HISTORY_CONFIG.emptyLength &&
    typeof candidate.dec === "string" &&
    candidate.dec.trim().length > PORTAL_HISTORY_CONFIG.emptyLength &&
    typeof candidate.fieldSizeDeg === "string" &&
    candidate.fieldSizeDeg.trim().length > PORTAL_HISTORY_CONFIG.emptyLength &&
    typeof candidate.observationDate === "string"
  );
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
