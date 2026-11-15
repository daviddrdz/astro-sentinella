import { EXPLORER_CONFIG } from "../config/explorer";
import type { BandChannelId, ExplorerFrame } from "../types/explorer";
import type { QueryParams } from "../types/portal";

const VALID_BANDS: ReadonlySet<BandChannelId> = new Set([
  "Band 1",
  "Band 2",
  "Band 3",
  "Band 4",
  "Band 5",
  "Band 6",
]);

function normalizeBand(value: unknown): BandChannelId | null {
  if (value === "IR") {
    return "Band 1";
  }
  return typeof value === "string" &&
    VALID_BANDS.has(value as BandChannelId)
    ? (value as BandChannelId)
    : null;
}

function parseFrame(item: unknown): ExplorerFrame | null {
  if (typeof item !== "object" || item === null) {
    return null;
  }
  const candidate = item as Partial<ExplorerFrame>;
  const band = normalizeBand(candidate.band);
  if (
    typeof candidate.id !== "string" ||
    typeof candidate.timestamp !== "string" ||
    band === null ||
    typeof candidate.filtered !== "boolean" ||
    typeof candidate.visible !== "boolean"
  ) {
    return null;
  }
  return { ...candidate, band } as ExplorerFrame;
}

export async function fetchExplorerFrames(
  query: QueryParams,
  signal?: AbortSignal
): Promise<ExplorerFrame[]> {
  const params = new URLSearchParams({
    ra: query.ra.trim(),
    dec: query.dec.trim(),
    fieldSizeDeg: query.fieldSizeDeg.trim(),
    observationDate: query.observationDate.trim(),
  });

  try {
    const response = await fetch(
      `${EXPLORER_CONFIG.framesEndpoint}?${params.toString()}`,
      { signal }
    );
    if (!response.ok) {
      return [];
    }
    const data: unknown = await response.json();
    if (!Array.isArray(data)) {
      return [];
    }
    return data
      .map(parseFrame)
      .filter((frame): frame is ExplorerFrame => frame !== null);
  } catch {
    return [];
  }
}
