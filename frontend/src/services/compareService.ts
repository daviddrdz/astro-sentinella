import { EXPLORER_CONFIG } from "../config/explorer";
import type { ExplorerFrame } from "../types/explorer";
import type { QueryParams } from "../types/portal";

export interface CompareFramesResponse {
  ok: boolean;
  imageUrl?: string;
  summary?: string;
  errorMessage?: string;
}

export async function requestFrameComparison(
  query: QueryParams,
  frameA: ExplorerFrame,
  frameB: ExplorerFrame,
  signal?: AbortSignal
): Promise<CompareFramesResponse> {
  try {
    const response = await fetch(EXPLORER_CONFIG.compareEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ra: query.ra.trim(),
        dec: query.dec.trim(),
        fieldSizeDeg: query.fieldSizeDeg.trim(),
        frameA: {
          id: frameA.id,
          timestamp: frameA.timestamp,
          band: frameA.band,
        },
        frameB: {
          id: frameB.id,
          timestamp: frameB.timestamp,
          band: frameB.band,
        },
      }),
      signal,
    });

    if (!response.ok) {
      return {
        ok: false,
        errorMessage: `HTTP ${response.status}`,
      };
    }

    const contentType = response.headers.get("content-type") ?? "";
    if (contentType.startsWith("image/")) {
      const blob = await response.blob();
      return {
        ok: true,
        imageUrl: URL.createObjectURL(blob),
        summary: `${frameA.timestamp} - ${frameB.timestamp}`,
      };
    }

    const data = (await response.json()) as {
      imageUrl?: unknown;
      summary?: unknown;
      diffSummary?: unknown;
    };

    return {
      ok: true,
      imageUrl: typeof data.imageUrl === "string" ? data.imageUrl : undefined,
      summary:
        typeof data.summary === "string"
          ? data.summary
          : typeof data.diffSummary === "string"
            ? data.diffSummary
            : `${frameA.timestamp} - ${frameB.timestamp}`,
    };
  } catch (error) {
    return {
      ok: false,
      errorMessage: error instanceof Error ? error.message : "Network error",
    };
  }
}
