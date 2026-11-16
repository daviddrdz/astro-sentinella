import { BAND_CHANNELS, EXPLORER_CONFIG } from "../config/explorer";
import type { BandChannelId, ExplorerFrame } from "../types/explorer";
import type { QueryParams } from "../types/portal";

const VALID_BANDS: ReadonlySet<BandChannelId> = new Set(
  BAND_CHANNELS.map((channel) => channel.id)
);

function isValidFrame(item: unknown): item is ExplorerFrame {
  if (typeof item !== "object" || item === null) {
    return false;
  }
  const candidate = item as Partial<ExplorerFrame>;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.timestamp === "string" &&
    typeof candidate.band === "number" &&
    VALID_BANDS.has(candidate.band as BandChannelId) &&
    typeof candidate.filtered === "boolean" &&
    typeof candidate.visible === "boolean"
  );
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
    return data.filter(isValidFrame);
  } catch {
    return [];
  }
}
