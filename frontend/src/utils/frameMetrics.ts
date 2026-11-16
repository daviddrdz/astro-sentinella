export interface FrameComparisonMetrics {
  meanA: number;
  meanB: number;
  deltaMeanPct: number;
  maxDiff: number;
  rmsDiff: number;
  changedPct: number;
}

const SAMPLE_SIZE = 128;
const PIXEL_STRIDE = 4;
const LUMA_R = 0.299;
const LUMA_G = 0.587;
const LUMA_B = 0.114;
const CHANGE_THRESHOLD = 12;
const PERCENT = 100;
const MIN_DENOM = 1e-3;
const HALF_CIRCLE_DEG = 180;
const DEG_TO_RAD = Math.PI / HALF_CIRCLE_DEG;
const RAD_TO_DEG = HALF_CIRCLE_DEG / Math.PI;
const ARCMIN_PER_DEG = 60;
const ARCSEC_PER_DEG = 3600;
const TWO = 2;
const ONE_ARCMIN_IN_DEG = 1 / ARCMIN_PER_DEG;
const ONE_DEG = 1;

function loadImage(url: string): Promise<HTMLImageElement | null> {
  if (typeof Image === "undefined") return Promise.resolve(null);
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

function sampleLuminance(img: HTMLImageElement): Uint8ClampedArray | null {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = SAMPLE_SIZE;
  canvas.height = SAMPLE_SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  try {
    ctx.drawImage(img, 0, 0, SAMPLE_SIZE, SAMPLE_SIZE);
    const data = ctx.getImageData(0, 0, SAMPLE_SIZE, SAMPLE_SIZE).data;
    const total = SAMPLE_SIZE * SAMPLE_SIZE;
    const luma = new Uint8ClampedArray(total);
    for (let i = 0; i < total; i += 1) {
      const idx = i * PIXEL_STRIDE;
      luma[i] = Math.round(
        LUMA_R * data[idx] + LUMA_G * data[idx + 1] + LUMA_B * data[idx + TWO]
      );
    }
    return luma;
  } catch {
    return null;
  }
}

export async function computeFrameComparisonMetrics(
  urlA?: string,
  urlB?: string
): Promise<FrameComparisonMetrics | null> {
  if (!urlA || !urlB) return null;
  const [imgA, imgB] = await Promise.all([loadImage(urlA), loadImage(urlB)]);
  if (!imgA || !imgB) return null;

  const lumaA = sampleLuminance(imgA);
  const lumaB = sampleLuminance(imgB);
  if (!lumaA || !lumaB) return null;

  const total = lumaA.length;
  let sumA = 0;
  let sumB = 0;
  let sumSqDiff = 0;
  let maxDiff = 0;
  let changed = 0;

  for (let i = 0; i < total; i += 1) {
    const a = lumaA[i];
    const b = lumaB[i];
    const diff = Math.abs(b - a);
    sumA += a;
    sumB += b;
    sumSqDiff += diff * diff;
    if (diff > maxDiff) maxDiff = diff;
    if (diff > CHANGE_THRESHOLD) changed += 1;
  }

  const meanA = sumA / total;
  const meanB = sumB / total;
  const deltaMeanPct = ((meanB - meanA) / Math.max(MIN_DENOM, meanA)) * PERCENT;
  const rmsDiff = Math.sqrt(sumSqDiff / total);
  const changedPct = (changed / total) * PERCENT;

  return {
    meanA,
    meanB,
    deltaMeanPct,
    maxDiff,
    rmsDiff,
    changedPct,
  };
}

/**
 * Exact spherical angular separation in degrees between two J2000 (RA, Dec) coordinates.
 */
export function angularSeparationDeg(
  ra1Deg: number,
  dec1Deg: number,
  ra2Deg: number,
  dec2Deg: number
): number {
  const r1 = ra1Deg * DEG_TO_RAD;
  const d1 = dec1Deg * DEG_TO_RAD;
  const r2 = ra2Deg * DEG_TO_RAD;
  const d2 = dec2Deg * DEG_TO_RAD;

  const sinHalfD = Math.sin((d2 - d1) / TWO);
  const sinHalfR = Math.sin((r2 - r1) / TWO);
  const a =
    sinHalfD * sinHalfD + Math.cos(d1) * Math.cos(d2) * sinHalfR * sinHalfR;
  const c = TWO * Math.atan2(Math.sqrt(a), Math.sqrt(Math.max(0, 1 - a)));
  return c * RAD_TO_DEG;
}

export function formatAngularSeparation(deg: number): string {
  if (deg >= ONE_DEG) {
    return `${deg.toFixed(TWO)}°`;
  }
  if (deg >= ONE_ARCMIN_IN_DEG) {
    return `${(deg * ARCMIN_PER_DEG).toFixed(1)}'`;
  }
  return `${(deg * ARCSEC_PER_DEG).toFixed(1)}"`;
}
