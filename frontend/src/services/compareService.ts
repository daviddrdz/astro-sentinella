import { EXPLORER_CONFIG } from "../config/explorer";
import type { BandChannelId, ExplorerFrame } from "../types/explorer";
import type { QueryParams } from "../types/portal";

export interface CompareFramesResponse {
  ok: boolean;
  imageUrl?: string;
  summary?: string;
  errorMessage?: string;
}

// Subset of the POST /api/subtract summary used for the one-line Restas label.
interface SubtractionSummary {
  meta?: { days_between?: number | null };
  difference_image?: { flux_scale_k?: number };
  change_detection?: { candidates_total?: number } | null;
  change_detection_error?: string | null;
  candidates?: unknown[];
}

interface ApiErrorEnvelope {
  error?: { code?: string; message?: string };
}

function describeSummary(
  detector: BandChannelId,
  summary: SubtractionSummary
): string {
  const parts: string[] = [`D${detector}`];
  const days = summary.meta?.days_between;
  if (typeof days === "number") {
    parts.push(`Δt ${days} d`);
  }
  const k = summary.difference_image?.flux_scale_k;
  if (typeof k === "number") {
    parts.push(`k=${k.toFixed(EXPLORER_CONFIG.compareScaleDecimals)}`);
  }
  const total =
    summary.change_detection?.candidates_total ?? summary.candidates?.length;
  if (typeof total === "number") {
    parts.push(`${total} candidate${total === 1 ? "" : "s"}`);
  } else if (summary.change_detection_error) {
    parts.push("no source detection");
  }
  return parts.join(" · ");
}

export async function requestFrameComparison(
  query: QueryParams,
  frameA: ExplorerFrame,
  frameB: ExplorerFrame,
  detector: BandChannelId,
  signal?: AbortSignal
): Promise<CompareFramesResponse> {
  try {
    const response = await fetch(EXPLORER_CONFIG.compareEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ra: query.ra.trim(),
        dec: query.dec.trim(),
        observationDateA: frameA.timestamp,
        observationDateB: frameB.timestamp,
        detector,
        size: EXPLORER_CONFIG.compareImageSizePx,
      }),
      signal,
    });

    if (!response.ok) {
      const payload = (await response
        .json()
        .catch(() => null)) as ApiErrorEnvelope | null;
      return {
        ok: false,
        errorMessage: payload?.error?.message ?? `HTTP ${response.status}`,
      };
    }

    const data = (await response.json()) as {
      imageDataUrl?: unknown;
      summary?: unknown;
    };
    const summary =
      data.summary && typeof data.summary === "object"
        ? (data.summary as SubtractionSummary)
        : {};

    return {
      ok: true,
      imageUrl:
        typeof data.imageDataUrl === "string" ? data.imageDataUrl : undefined,
      summary: describeSummary(detector, summary),
    };
  } catch (error) {
    return {
      ok: false,
      errorMessage: error instanceof Error ? error.message : "Network error",
    };
  }
}
