import { EXPLORER_CONFIG, SPECTRUM_FORMAT } from "../config/explorer";
import type { ChunkSpectrum } from "../types/explorer";

const FRAME_QUERY_KEYS = [
  "ra",
  "dec",
  "fieldSizeDeg",
  "observationDate",
] as const;

export class SpectrumRequestError extends Error {
  constructor(
    message: string,
    readonly code: string
  ) {
    super(message);
    this.name = "SpectrumRequestError";
  }
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isChunkSpectrum(data: unknown): data is ChunkSpectrum {
  if (typeof data !== "object" || data === null) {
    return false;
  }
  const candidate = data as Partial<ChunkSpectrum>;
  const chunk = candidate.chunk;
  return (
    typeof chunk === "object" &&
    chunk !== null &&
    isFiniteNumber(chunk.rows) &&
    isFiniteNumber(chunk.cols) &&
    typeof chunk.bounds === "object" &&
    chunk.bounds !== null &&
    isFiniteNumber(chunk.bounds.left) &&
    isFiniteNumber(chunk.bounds.top) &&
    typeof candidate.unit === "string" &&
    Array.isArray(candidate.points) &&
    candidate.points.every(
      (point) =>
        isFiniteNumber(point?.wavelengthUm) &&
        (point.flux === null || isFiniteNumber(point.flux))
    )
  );
}

/**
 * Builds the spectrum request from the frame's own image URL, so the chunk is
 * resolved against exactly the cutout the user is looking at.
 */
export function buildSpectrumUrl(
  frameImageUrl: string,
  x: number,
  y: number
): string {
  const frameUrl = new URL(frameImageUrl, window.location.origin);
  const params = new URLSearchParams();
  for (const key of FRAME_QUERY_KEYS) {
    const value = frameUrl.searchParams.get(key);
    if (value !== null) {
      params.set(key, value);
    }
  }
  params.set("x", x.toFixed(SPECTRUM_FORMAT.clickDecimals));
  params.set("y", y.toFixed(SPECTRUM_FORMAT.clickDecimals));
  return `${EXPLORER_CONFIG.spectrumEndpoint}?${params.toString()}`;
}

export async function fetchChunkSpectrum(
  frameImageUrl: string,
  x: number,
  y: number,
  signal?: AbortSignal
): Promise<ChunkSpectrum> {
  const response = await fetch(buildSpectrumUrl(frameImageUrl, x, y), {
    signal,
  });
  const body: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const error = (body as { error?: { code?: string; message?: string } })
      ?.error;
    throw new SpectrumRequestError(
      error?.message ?? `Spectrum request failed (${response.status}).`,
      error?.code ?? "unknown"
    );
  }
  if (!isChunkSpectrum(body)) {
    throw new SpectrumRequestError(
      "Unexpected spectrum response.",
      "invalid_response"
    );
  }
  return body;
}
