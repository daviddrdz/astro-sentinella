import { SPECTRUM_FORMAT } from "../config/explorer";

export interface Size {
  width: number;
  height: number;
}

export const HALF = 2;

/** Box the image occupies inside its container under `object-contain`. */
export function containedBox(container: Size, natural: Size) {
  const scale = Math.min(
    container.width / natural.width,
    container.height / natural.height
  );
  const width = natural.width * scale;
  const height = natural.height * scale;
  return {
    left: (container.width - width) / HALF,
    top: (container.height - height) / HALF,
    width,
    height,
  };
}

export const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

/** 1-2-5 style tick step for a span split into roughly `target` intervals. */
export function niceStep(span: number, target: number): number {
  const raw = span / target;
  const magnitude = SPECTRUM_FORMAT.niceBase ** Math.floor(Math.log10(raw));
  const residual = raw / magnitude;
  const match = SPECTRUM_FORMAT.niceResiduals.find(
    (entry) => residual >= entry.atLeast
  );
  return (match?.nice ?? 1) * magnitude;
}

export function formatFlux(value: number): string {
  const abs = Math.abs(value);
  if (
    abs !== 0 &&
    (abs < SPECTRUM_FORMAT.fluxSmallAbs || abs >= SPECTRUM_FORMAT.fluxLargeAbs)
  ) {
    return value.toExponential(SPECTRUM_FORMAT.fluxExpDigits);
  }
  return value.toPrecision(SPECTRUM_FORMAT.fluxSignificantDigits);
}

/** Tick label with just enough decimals for the tick step (0.5 -> "0.5"). */
export function formatTick(value: number, step: number): string {
  if (Math.abs(value) >= SPECTRUM_FORMAT.fluxLargeAbs) {
    return value.toExponential(SPECTRUM_FORMAT.fluxExpDigits);
  }
  const decimals = Math.max(0, -Math.floor(Math.log10(step)));
  return value.toFixed(decimals);
}
