import { APP_CONFIG } from "../config/app";
import type { CoordinateMetadata } from "../types/portal";

export async function fetchCoordinateMetadata(
  ra: string,
  dec: string,
  signal?: AbortSignal
): Promise<CoordinateMetadata | null> {
  const params = new URLSearchParams({
    ra: ra.trim(),
    dec: dec.trim(),
  });

  try {
    const response = await fetch(
      `${APP_CONFIG.metadataEndpoint}?${params.toString()}`,
      { signal }
    );
    if (!response.ok) {
      return null;
    }
    const data = (await response.json()) as Partial<CoordinateMetadata>;
    if (
      typeof data.targetName !== "string" ||
      typeof data.catalogId !== "string" ||
      !Array.isArray(data.availableBands)
    ) {
      return null;
    }
    const availableDates = Array.isArray(data.availableDates)
      ? data.availableDates.filter(
          (item): item is string => typeof item === "string" && item.length > 0
        )
      : [];

    return {
      targetName: data.targetName,
      catalogId: data.catalogId,
      instrument: typeof data.instrument === "string" ? data.instrument : "",
      availableBands: data.availableBands,
      availableDates,
      frameCount: typeof data.frameCount === "number" ? data.frameCount : 0,
      observationWindow:
        typeof data.observationWindow === "string"
          ? data.observationWindow
          : "",
    };
  } catch {
    return null;
  }
}
