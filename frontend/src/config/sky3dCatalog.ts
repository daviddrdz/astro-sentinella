import type { ExplorerLocale } from "../types/explorer";
import { PORTAL_FEATURED_SECTORS } from "./app";

export type Sky3DOverlayId =
  "stars" | "deep-sky" | "planets" | "milky-way" | "grid" | "labels";

export interface DeepSkyObject {
  id: string;
  nameEn: string;
  nameEs: string;
  kindEn: string;
  kindEs: string;
  raDeg: number;
  decDeg: number;
  distPc: number;
  mag: number;
  colorHex: string;
  sizePx: number;
}

export interface HygStarDataset {
  source: string;
  /** [raDeg, decDeg, distPc, mag, ci] */
  stars: ReadonlyArray<readonly [number, number, number, number, number]>;
  /** [name, raDeg, decDeg, distPc, mag] */
  named: ReadonlyArray<readonly [string, number, number, number, number]>;
}

export interface Sky3DTarget {
  id: string;
  name: string;
  category: string;
  raDeg: number;
  decDeg: number;
  distPc: number;
  fieldSizeDeg: number;
  raDisplay: string;
  decDisplay: string;
}

export interface SkyObjectDetails {
  kind: "star" | "target" | "deep-sky" | "planet";
  id: string;
  name: string;
  subtitle: string;
  raDeg: number;
  decDeg: number;
  raDisplay: string;
  decDisplay: string;
  distPc: number;
  mag?: number;
  ci?: number;
  colorCss: string;
}

export interface PlanetDefinition {
  id: string;
  nameEn: string;
  nameEs: string;
  semiMajorAu: number;
  eccentricity: number;
  inclinationDeg: number;
  lonAscNodeDeg: number;
  lonPerihelionDeg: number;
  meanLonJ2000Deg: number;
  orbitalPeriodYears: number;
  colorHex: string;
  radiusPx: number;
  isEarth?: boolean;
}

export const SKY3D_CONSTANTS = {
  degToRad: Math.PI / 180,
  radToDeg: 180 / Math.PI,
  hoursToDeg: 15,
  arcminToDeg: 1 / 60,
  arcsecToDeg: 1 / 3600,
  pcToLy: 3.26156,
  auPerPc: 206264.8,
  twoPi: Math.PI * 2,
  halfPi: Math.PI / 2,

  // Camera & Controls
  cameraNear: 0.05,
  cameraFar: 25000,
  defaultFovDeg: 58,
  minFovDeg: 8,
  maxFovDeg: 105,
  telescopeFovDeg: 16,
  wideSkyFovDeg: 62,
  dragSensitivity: 0.0016,
  zoomWheelSensitivity: 0.00055,
  zoomFovWheelSensitivity: 0.018,
  minPitchRad: -1.52,
  maxPitchRad: 1.52,
  dampingFactor: 0.1,
  starHitRadiusPx: 16,
  clickDragThresholdPx: 4,

  // Sky View (inside celestial sphere)
  skySphereRadius: 900,
  skyGridRadius: 885,
  skyMilkyWayRadius: 870,
  skyCutoutDistance: 620,
  skyCutoutMinAngularSizeDeg: 6,
  skyStarMinSize: 1.8,
  skyStarMaxSize: 9.5,
  skyStarBrightMag: -1.5,
  skyStarFaintMag: 6.8,
  skyGridRaStepDeg: 30,
  skyGridDecStepsDeg: [-60, -30, 0, 30, 60] as const,
  skyGridSegments: 96,

  // Solar Neighborhood (3D heliocentric stars in parsecs)
  neighborhoodSceneScalePerPc: 1.4,
  neighborhoodMinDistPc: 0.8,
  neighborhoodMaxDistPc: 320,
  neighborhoodDefaultRadius: 48,
  neighborhoodMinRadius: 6,
  neighborhoodMaxRadius: 450,
  neighborhoodRingsLy: [25, 100, 250, 500, 1000] as const,
  neighborhoodRingSegments: 96,

  // Milky Way (3D spiral galaxy in kpc)
  milkyWayPointCount: 22000,
  milkyWayRadiusKpc: 16,
  milkyWayCoreRadiusKpc: 2.8,
  milkyWaySunRadiusKpc: 8.2,
  milkyWayArmCount: 4,
  milkyWaySpiralTightness: 3.2,
  milkyWayDefaultRadius: 26,
  milkyWayMinRadius: 5,
  milkyWayMaxRadius: 70,

  // Solar System (3D Keplerian orbits in AU)
  solarSystemDefaultRadius: 12,
  solarSystemMinRadius: 1.8,
  solarSystemMaxRadius: 95,
  solarOrbitSegments: 128,
  j2000EpochMs: Date.UTC(2000, 0, 1, 12, 0, 0),
  msPerJulianYear: 365.25 * 86400 * 1000,

  // Galactic pole & zero-longitude (J2000 ICRS -> Galactic)
  galacticNcpRaDeg: 192.85948,
  galacticNcpDecDeg: 27.12825,
  galacticAscNodeDeg: 32.93192,

  // Scale camera transition speed
  cameraLerpSpeed: 0.12,
  maxProjectionsLabelCount: 28,
  pinHitRadiusPx: 22,
} as const;

export const SKY3D_RENDER_CONSTANTS = {
  two: 2,
  three: 3,
  half: 0.5,
  ninetyDeg: 90,
  fullCircleDeg: 360,
  milkyWayCoreFrac: 0.22,
  milkyWayArmSpread: 0.42,
  milkyWayThickness: 0.45,
  milkyWayCoreThickness: 1.1,
  milkyWayPointSize: 2.6,
  milkyWaySkyPoints: 4500,
  milkyWaySkyBandDeg: 16,
  milkyWaySkySize: 24,
  cutoutReticleZOffset: 2,
  planetMarkerScale: 0.22,
  sunGlowSize: 18,
  lineOfSightLenPc: 120,
  prngSeedSky: 1337,
  prngSeedMw: 4242,
  prngMult: 16807,
  prngMod: 2147483647,
  prngDenom: 2147483646,
  skyBandAttempts: 24,
  skyBandCoreSigmaDeg: 45,
  skyBandLatSigmaDeg: 8,
  skyBandBaseIntensity: 0.04,
  skyBandCoreIntensity: 0.08,
  skyBandRedBase: 0.65,
  skyBandRedBoost: 0.35,
  skyBandGreenBase: 0.72,
  skyBandGreenBoost: 0.12,
  skyBandBlueDrop: 0.25,
  skyGridOpacity: 0.14,
  skyEquatorOpacity: 0.28,
  skyGridColorHex: 0x38bdf8,
  neighborhoodStarSizeBoost: 3.5,
  neighborhoodScaleBoost: 0.35,
  neighborhoodRingOpacity: 0.18,
  sunColorR: 1.0,
  sunColorG: 0.9,
  sunColorB: 0.45,
  losColorHex: 0x22d3ee,
  losOpacity: 0.45,
  mwMinLog: 1e-6,
  mwCoreThicknessScale: 0.55,
  mwCoreColorG: 0.84,
  mwCoreColorB: 0.56,
  mwCoreSizeMult: 1.25,
  mwArmRadiusPow: 0.72,
  mwArmScatterBase: 0.12,
  mwArmScatterRadiusScale: 0.2,
  mwThickFalloff: 1.2,
  mwArmRedBase: 0.95,
  mwArmRedDrop: 0.38,
  mwArmGreenBase: 0.84,
  mwArmGreenDrop: 0.08,
  mwArmBlueBase: 0.68,
  mwArmBlueBoost: 0.32,
  mwScaleBoost: 0.22,
  mwSunColorR: 0.22,
  mwSunColorG: 0.85,
  mwSunColorB: 1.0,
  ssSunColorG: 0.88,
  ssSunColorB: 0.35,
  ssSunSizeMult: 1.4,
  ssGlowBoost: 0.4,
  ssEarthOpacity: 0.55,
  ssOrbitOpacity: 0.24,
  ssPlanetRefRadius: 4,
  ssPlanetWidthSegs: 16,
  ssPlanetHeightSegs: 12,
  pitchSolarSystem: 0.52,
  pitchNeighborhood: 0.34,
  pitchMilkyWay: 0.58,
  clearColorHex: 0x030712,
  cutoutTargetRatio: 0.95,
  reticleOpacity: 0.9,
  reticleSubtractHex: 0xf59e0b,
  cutoutMeshOpacity: 0.92,
  fovEpsilon: 0.05,
  fovStarMin: 0.7,
  fovStarMax: 2.4,
  fovMwMin: 0.8,
  fovMwMax: 1.6,
  tooltipOffsetX: 14,
  tooltipOffsetY: 12,
  rgbScale: 255,
  namedStarMatchToleranceDeg: 0.12,
  percentDivisor: 100,
} as const;

export const PLANETS_J2000: readonly PlanetDefinition[] = [
  {
    id: "mercury",
    nameEn: "Mercury",
    nameEs: "Mercurio",
    semiMajorAu: 0.387,
    eccentricity: 0.2056,
    inclinationDeg: 7.0,
    lonAscNodeDeg: 48.33,
    lonPerihelionDeg: 77.46,
    meanLonJ2000Deg: 252.25,
    orbitalPeriodYears: 0.2408,
    colorHex: "#9ca3af",
    radiusPx: 4,
  },
  {
    id: "venus",
    nameEn: "Venus",
    nameEs: "Venus",
    semiMajorAu: 0.723,
    eccentricity: 0.0068,
    inclinationDeg: 3.39,
    lonAscNodeDeg: 76.68,
    lonPerihelionDeg: 131.53,
    meanLonJ2000Deg: 181.98,
    orbitalPeriodYears: 0.6152,
    colorHex: "#fde68a",
    radiusPx: 5.5,
  },
  {
    id: "earth",
    nameEn: "Earth",
    nameEs: "Tierra",
    semiMajorAu: 1.0,
    eccentricity: 0.0167,
    inclinationDeg: 0.0,
    lonAscNodeDeg: -11.26,
    lonPerihelionDeg: 102.94,
    meanLonJ2000Deg: 100.46,
    orbitalPeriodYears: 1.0,
    colorHex: "#38bdf8",
    radiusPx: 6,
    isEarth: true,
  },
  {
    id: "mars",
    nameEn: "Mars",
    nameEs: "Marte",
    semiMajorAu: 1.524,
    eccentricity: 0.0934,
    inclinationDeg: 1.85,
    lonAscNodeDeg: 49.58,
    lonPerihelionDeg: 336.04,
    meanLonJ2000Deg: 355.45,
    orbitalPeriodYears: 1.8808,
    colorHex: "#f97316",
    radiusPx: 4.5,
  },
  {
    id: "jupiter",
    nameEn: "Jupiter",
    nameEs: "Júpiter",
    semiMajorAu: 5.203,
    eccentricity: 0.0484,
    inclinationDeg: 1.31,
    lonAscNodeDeg: 100.56,
    lonPerihelionDeg: 14.75,
    meanLonJ2000Deg: 34.4,
    orbitalPeriodYears: 11.862,
    colorHex: "#fdba74",
    radiusPx: 8.5,
  },
  {
    id: "saturn",
    nameEn: "Saturn",
    nameEs: "Saturno",
    semiMajorAu: 9.537,
    eccentricity: 0.0542,
    inclinationDeg: 2.49,
    lonAscNodeDeg: 113.72,
    lonPerihelionDeg: 92.43,
    meanLonJ2000Deg: 49.94,
    orbitalPeriodYears: 29.457,
    colorHex: "#fcd34d",
    radiusPx: 7.5,
  },
  {
    id: "uranus",
    nameEn: "Uranus",
    nameEs: "Urano",
    semiMajorAu: 19.191,
    eccentricity: 0.0472,
    inclinationDeg: 0.77,
    lonAscNodeDeg: 74.23,
    lonPerihelionDeg: 170.96,
    meanLonJ2000Deg: 313.23,
    orbitalPeriodYears: 84.011,
    colorHex: "#67e8f9",
    radiusPx: 6,
  },
  {
    id: "neptune",
    nameEn: "Neptune",
    nameEs: "Neptuno",
    semiMajorAu: 30.069,
    eccentricity: 0.0086,
    inclinationDeg: 1.77,
    lonAscNodeDeg: 131.72,
    lonPerihelionDeg: 44.97,
    meanLonJ2000Deg: 304.88,
    orbitalPeriodYears: 164.79,
    colorHex: "#60a5fa",
    radiusPx: 6,
  },
] as const;

const KNOWN_DISTANCES_PC: Record<string, number> = {
  "wise-0855": 2.28,
  "barnards-star": 1.83,
  "epsilon-indi-b": 3.64,
  "rw-aurigae": 163,
  "r-draconis": 490,
};

export function parseSexagesimalRaDeg(raw: string): number {
  const trimmed = raw.trim();
  const hms = trimmed.match(
    /(\d+(?:\.\d+)?)h\s*(\d+(?:\.\d+)?)m\s*(\d+(?:\.\d+)?)s/i
  );
  if (hms) {
    const hours =
      Number(hms[1]) +
      Number(hms[2]) * SKY3D_CONSTANTS.arcminToDeg +
      Number(hms[3]) * SKY3D_CONSTANTS.arcsecToDeg;
    return hours * SKY3D_CONSTANTS.hoursToDeg;
  }
  const num = Number(trimmed);
  return Number.isFinite(num) ? num : 0;
}

export function parseSexagesimalDecDeg(raw: string): number {
  const trimmed = raw.trim();
  const dms = trimmed.match(
    /([+-]?\d+(?:\.\d+)?)[°\s]+(\d+(?:\.\d+)?)['\s]+(\d+(?:\.\d+)?)/i
  );
  if (dms) {
    const sign = dms[1].startsWith("-") ? -1 : 1;
    const deg = Math.abs(Number(dms[1]));
    const min = Number(dms[2]) * SKY3D_CONSTANTS.arcminToDeg;
    const sec = Number(dms[3]) * SKY3D_CONSTANTS.arcsecToDeg;
    return sign * (deg + min + sec);
  }
  const num = Number(trimmed);
  return Number.isFinite(num) ? num : 0;
}

export const SPHEREX_3D_TARGETS: readonly Sky3DTarget[] =
  PORTAL_FEATURED_SECTORS.map((sector) => ({
    id: sector.id,
    name: sector.name,
    category: sector.category,
    raDeg: parseSexagesimalRaDeg(sector.ra),
    decDeg: parseSexagesimalDecDeg(sector.dec),
    distPc: KNOWN_DISTANCES_PC[sector.id] ?? 12,
    fieldSizeDeg: Number(sector.fieldSizeDeg) || 0.5,
    raDisplay: sector.ra,
    decDisplay: sector.dec,
  }));

/**
 * Convert equatorial J2000 (raDeg, decDeg) + radius into Three.js Y-up Cartesian coords.
 * Y = Celestial North (+Dec), X = RA 0h, Z = RA 18h (right-handed sky interior).
 */
export function equatorialToCartesian(
  raDeg: number,
  decDeg: number,
  radius: number
): [number, number, number] {
  const ra = raDeg * SKY3D_CONSTANTS.degToRad;
  const dec = decDeg * SKY3D_CONSTANTS.degToRad;
  const cosDec = Math.cos(dec);
  const x = radius * cosDec * Math.cos(ra);
  const y = radius * Math.sin(dec);
  const z = -radius * cosDec * Math.sin(ra);
  return [x, y, z];
}

/**
 * Approximate B-V color index -> RGB [0..1] for realistic stellar temperatures
 * (O/B blue-white -> A white -> G yellow -> K orange -> M red).
 */
export function bvToRgb(bv: number): [number, number, number] {
  const t = Math.max(-0.4, Math.min(2.0, Number.isFinite(bv) ? bv : 0.65));
  if (t < 0.0) {
    const k = (t + 0.4) / 0.4;
    return [0.62 + 0.38 * k, 0.76 + 0.24 * k, 1.0];
  }
  if (t < 0.4) {
    const k = t / 0.4;
    return [1.0, 0.96 - 0.04 * k, 1.0 - 0.14 * k];
  }
  if (t < 0.85) {
    const k = (t - 0.4) / 0.45;
    return [1.0, 0.92 - 0.14 * k, 0.86 - 0.28 * k];
  }
  if (t < 1.4) {
    const k = (t - 0.85) / 0.55;
    return [1.0, 0.78 - 0.22 * k, 0.58 - 0.26 * k];
  }
  const k = (t - 1.4) / 0.6;
  return [1.0, 0.56 - 0.18 * k, 0.32 - 0.12 * k];
}

/**
 * Estimate Harvard spectral class from B-V color index.
 */
export function bvToSpectralClass(bv: number): string {
  if (!Number.isFinite(bv)) return "G-type";
  if (bv < -0.15) return "O / B (Blue-white)";
  if (bv < 0.15) return "A (White)";
  if (bv < 0.45) return "F (Yellow-white)";
  if (bv < 0.8) return "G (Solar yellow)";
  if (bv < 1.35) return "K (Orange)";
  return "M (Red)";
}

export function formatRaSexagesimal(raDeg: number): string {
  const norm = ((raDeg % 360) + 360) % 360;
  const totalHours = norm / SKY3D_CONSTANTS.hoursToDeg;
  const h = Math.floor(totalHours);
  const remM = (totalHours - h) * 60;
  const m = Math.floor(remM);
  const s = (remM - m) * 60;
  return `${String(h).padStart(2, "0")}h ${String(m).padStart(2, "0")}m ${s.toFixed(1).padStart(4, "0")}s`;
}

export function formatDecSexagesimal(decDeg: number): string {
  const sign = decDeg < 0 ? "-" : "+";
  const abs = Math.abs(decDeg);
  const d = Math.floor(abs);
  const remM = (abs - d) * 60;
  const m = Math.floor(remM);
  const s = (remM - m) * 60;
  return `${sign}${String(d).padStart(2, "0")}° ${String(m).padStart(2, "0")}' ${s.toFixed(0).padStart(2, "0")}"`;
}

/**
 * Compute Galactic coordinates (l, b) in degrees from equatorial J2000 (raDeg, decDeg)
 * to render the real Milky Way band across the celestial sphere.
 */
export function equatorialToGalacticDeg(
  raDeg: number,
  decDeg: number
): [number, number] {
  const ra = raDeg * SKY3D_CONSTANTS.degToRad;
  const dec = decDeg * SKY3D_CONSTANTS.degToRad;
  const raNcp = SKY3D_CONSTANTS.galacticNcpRaDeg * SKY3D_CONSTANTS.degToRad;
  const decNcp = SKY3D_CONSTANTS.galacticNcpDecDeg * SKY3D_CONSTANTS.degToRad;
  const l0 = SKY3D_CONSTANTS.galacticAscNodeDeg * SKY3D_CONSTANTS.degToRad;

  const sinB =
    Math.sin(dec) * Math.sin(decNcp) +
    Math.cos(dec) * Math.cos(decNcp) * Math.cos(ra - raNcp);
  const b = Math.asin(Math.max(-1, Math.min(1, sinB)));

  const y = Math.cos(dec) * Math.sin(ra - raNcp);
  const x =
    Math.sin(dec) * Math.cos(decNcp) -
    Math.cos(dec) * Math.sin(decNcp) * Math.cos(ra - raNcp);
  const l = l0 - Math.atan2(y, x);
  const lDeg = (((l * SKY3D_CONSTANTS.radToDeg) % 360) + 360) % 360;
  const bDeg = b * SKY3D_CONSTANTS.radToDeg;
  return [lDeg, bDeg];
}

/**
 * Compute J2000 Keplerian heliocentric position (x, y, z) in AU (ecliptic plane = XZ).
 */
export function planetPositionAu(
  planet: PlanetDefinition,
  dateMs: number
): [number, number, number] {
  const yearsSinceJ2000 =
    (dateMs - SKY3D_CONSTANTS.j2000EpochMs) / SKY3D_CONSTANTS.msPerJulianYear;
  const meanMotionDegPerYear = 360 / planet.orbitalPeriodYears;
  const M =
    ((planet.meanLonJ2000Deg -
      planet.lonPerihelionDeg +
      meanMotionDegPerYear * yearsSinceJ2000) *
      SKY3D_CONSTANTS.degToRad) %
    SKY3D_CONSTANTS.twoPi;

  // Solve Kepler's equation E - e*sin(E) = M (3 Newton iterations)
  let E = M;
  for (let i = 0; i < 3; i += 1) {
    E -=
      (E - planet.eccentricity * Math.sin(E) - M) /
      (1 - planet.eccentricity * Math.cos(E));
  }

  const xOrb = planet.semiMajorAu * (Math.cos(E) - planet.eccentricity);
  const yOrb =
    planet.semiMajorAu *
    Math.sqrt(1 - planet.eccentricity * planet.eccentricity) *
    Math.sin(E);

  const argPeri =
    (planet.lonPerihelionDeg - planet.lonAscNodeDeg) * SKY3D_CONSTANTS.degToRad;
  const omega = planet.lonAscNodeDeg * SKY3D_CONSTANTS.degToRad;
  const inc = planet.inclinationDeg * SKY3D_CONSTANTS.degToRad;

  const cosO = Math.cos(omega);
  const sinO = Math.sin(omega);
  const cosW = Math.cos(argPeri);
  const sinW = Math.sin(argPeri);
  const cosI = Math.cos(inc);
  const sinI = Math.sin(inc);

  const xEcl =
    (cosO * cosW - sinO * sinW * cosI) * xOrb +
    (-cosO * sinW - sinO * cosW * cosI) * yOrb;
  const yEcl =
    (sinO * cosW + cosO * sinW * cosI) * xOrb +
    (-sinO * sinW + cosO * cosW * cosI) * yOrb;
  const zEcl = sinW * sinI * xOrb + cosW * sinI * yOrb;

  // Map ecliptic (xEcl, yEcl, zEcl) -> Three.js Y-up (xEcl, zEcl, -yEcl)
  return [xEcl, zEcl, -yEcl];
}

const ECLIPTIC_OBLIQUITY_DEG = 23.4392911;

/**
 * Convert a planet's heliocentric J2000 position into geocentric equatorial (RA, Dec) in degrees.
 */
export function geocentricPlanetSkyCoords(
  planet: PlanetDefinition,
  dateMs: number
): { raDeg: number; decDeg: number; distAu: number } {
  const earth = PLANETS_J2000.find((p) => p.isEarth);
  const [px, py, pz] = planetPositionAu(planet, dateMs);
  const [ex, ey, ez] = earth ? planetPositionAu(earth, dateMs) : [0, 0, 0];

  // Undo Three.js Y-up -> ecliptic (xEcl, yEcl, zEcl)
  const dx = px - ex;
  const dy = -(pz - ez);
  const dz = py - ey;
  const distAu = Math.hypot(dx, dy, dz);

  const eps = ECLIPTIC_OBLIQUITY_DEG * SKY3D_CONSTANTS.degToRad;
  const cosE = Math.cos(eps);
  const sinE = Math.sin(eps);

  const xEq = dx;
  const yEq = dy * cosE - dz * sinE;
  const zEq = dy * sinE + dz * cosE;

  const raRad = Math.atan2(yEq, xEq);
  const decRad = Math.asin(
    Math.max(-1, Math.min(1, zEq / Math.max(1e-6, distAu)))
  );

  return {
    raDeg: (((raRad * SKY3D_CONSTANTS.radToDeg) % 360) + 360) % 360,
    decDeg: decRad * SKY3D_CONSTANTS.radToDeg,
    distAu,
  };
}

/**
 * Curated real Deep Sky Objects (Messier / NGC public J2000 coordinates).
 */
export const DEEP_SKY_OBJECTS: readonly DeepSkyObject[] = [
  {
    id: "m31",
    nameEn: "M31 Andromeda Galaxy",
    nameEs: "M31 Galaxia de Andrómeda",
    kindEn: "Spiral Galaxy",
    kindEs: "Galaxia espiral",
    raDeg: 10.6847,
    decDeg: 41.2687,
    distPc: 778000,
    mag: 3.44,
    colorHex: "#c4b5fd",
    sizePx: 22,
  },
  {
    id: "m42",
    nameEn: "M42 Orion Nebula",
    nameEs: "M42 Nebulosa de Orión",
    kindEn: "Diffuse Nebula",
    kindEs: "Nebulosa difusa",
    raDeg: 83.8221,
    decDeg: -5.3911,
    distPc: 412,
    mag: 4.0,
    colorHex: "#f472b6",
    sizePx: 20,
  },
  {
    id: "m45",
    nameEn: "M45 Pleiades",
    nameEs: "M45 Pléyades",
    kindEn: "Open Cluster",
    kindEs: "Cúmulo abierto",
    raDeg: 56.75,
    decDeg: 24.1167,
    distPc: 136,
    mag: 1.6,
    colorHex: "#7dd3fc",
    sizePx: 18,
  },
  {
    id: "m1",
    nameEn: "M1 Crab Nebula",
    nameEs: "M1 Nebulosa del Cangrejo",
    kindEn: "Supernova Remnant",
    kindEs: "Remanente de supernova",
    raDeg: 83.6331,
    decDeg: 22.0145,
    distPc: 2000,
    mag: 8.4,
    colorHex: "#fb923c",
    sizePx: 15,
  },
  {
    id: "m13",
    nameEn: "M13 Hercules Cluster",
    nameEs: "M13 Cúmulo de Hércules",
    kindEn: "Globular Cluster",
    kindEs: "Cúmulo globular",
    raDeg: 250.4235,
    decDeg: 36.4613,
    distPc: 6800,
    mag: 5.8,
    colorHex: "#fde68a",
    sizePx: 16,
  },
  {
    id: "m8",
    nameEn: "M8 Lagoon Nebula",
    nameEs: "M8 Nebulosa de la Laguna",
    kindEn: "Emission Nebula",
    kindEs: "Nebulosa de emisión",
    raDeg: 270.9042,
    decDeg: -24.3867,
    distPc: 1250,
    mag: 6.0,
    colorHex: "#f472b6",
    sizePx: 17,
  },
  {
    id: "m51",
    nameEn: "M51 Whirlpool Galaxy",
    nameEs: "M51 Galaxia del Remolino",
    kindEn: "Spiral Galaxy",
    kindEs: "Galaxia espiral",
    raDeg: 202.4696,
    decDeg: 47.1953,
    distPc: 7100000,
    mag: 8.4,
    colorHex: "#c4b5fd",
    sizePx: 15,
  },
  {
    id: "m57",
    nameEn: "M57 Ring Nebula",
    nameEs: "M57 Nebulosa del Anillo",
    kindEn: "Planetary Nebula",
    kindEs: "Nebulosa planetaria",
    raDeg: 283.3962,
    decDeg: 33.0292,
    distPc: 787,
    mag: 8.8,
    colorHex: "#34d399",
    sizePx: 14,
  },
  {
    id: "m87",
    nameEn: "M87 Virgo A",
    nameEs: "M87 Virgo A",
    kindEn: "Elliptical Galaxy",
    kindEs: "Galaxia elíptica",
    raDeg: 187.7059,
    decDeg: 12.3911,
    distPc: 16400000,
    mag: 8.6,
    colorHex: "#ddd6fe",
    sizePx: 15,
  },
  {
    id: "m104",
    nameEn: "M104 Sombrero Galaxy",
    nameEs: "M104 Galaxia del Sombrero",
    kindEn: "Spiral Galaxy",
    kindEs: "Galaxia espiral",
    raDeg: 189.9976,
    decDeg: -11.6231,
    distPc: 9550000,
    mag: 8.0,
    colorHex: "#c4b5fd",
    sizePx: 15,
  },
  {
    id: "lmc",
    nameEn: "Large Magellanic Cloud",
    nameEs: "Gran Nube de Magallanes",
    kindEn: "Dwarf Galaxy",
    kindEs: "Galaxia enana",
    raDeg: 80.8942,
    decDeg: -69.7561,
    distPc: 49970,
    mag: 0.9,
    colorHex: "#a5b4fc",
    sizePx: 24,
  },
  {
    id: "omega-cen",
    nameEn: "NGC 5139 Omega Centauri",
    nameEs: "NGC 5139 Omega Centauri",
    kindEn: "Globular Cluster",
    kindEs: "Cúmulo globular",
    raDeg: 201.697,
    decDeg: -47.4795,
    distPc: 5200,
    mag: 3.9,
    colorHex: "#fde68a",
    sizePx: 18,
  },
] as const;

let cachedHygStars: HygStarDataset | null = null;
let pendingHygPromise: Promise<HygStarDataset | null> | null = null;

export function loadHygStars(): Promise<HygStarDataset | null> {
  if (cachedHygStars) {
    return Promise.resolve(cachedHygStars);
  }
  if (pendingHygPromise) {
    return pendingHygPromise;
  }
  if (typeof fetch !== "function") {
    return Promise.resolve(null);
  }
  pendingHygPromise = fetch("/data/hyg-stars.json")
    .then(async (res) => {
      if (!res.ok) return null;
      const json = (await res.json()) as HygStarDataset;
      if (!Array.isArray(json.stars)) return null;
      cachedHygStars = json;
      return json;
    })
    .catch(() => null);
  return pendingHygPromise;
}

export const SKY_3D_COPY: Record<
  ExplorerLocale,
  {
    overlays: Record<Sky3DOverlayId, string>;
    dragHint: string;
    scrollHint: string;
    loadingCatalog: string;
    catalogAttribution: string;
    starsLoaded: string;
    activeTarget: string;
    activeSubtraction: string;
    youAreHere: string;
    sunLabel: string;
    galacticCenter: string;
    recenterTarget: string;
    telescopeView: string;
    wideSkyView: string;
    webglFallbackTitle: string;
    webglFallbackDesc: string;
    fovLabel: string;
    raLabel: string;
    decLabel: string;
    unnamedStar: string;
    magnitudeLabel: string;
    distanceLabel: string;
    spectralLabel: string;
    centerOnStar: string;
    starClickHint: string;
    inspectorTitle: string;
    inspectorEmptyHint: string;
    syncTo2D3D: string;
    syncedLabel: string;
    featuredTargetsTitle: string;
    activeRegionTitle: string;
    measureFromHere: string;
    measureSelectSecond: string;
    measureClear: string;
    angularSeparationLabel: string;
    physicalDistanceLabel: string;
  }
> = {
  en: {
    overlays: {
      stars: "Stars",
      "deep-sky": "Deep Sky",
      planets: "Planets",
      "milky-way": "Milky Way",
      grid: "Grid",
      labels: "Labels",
    },
    dragHint: "Drag to look",
    scrollHint: "Scroll to zoom",
    loadingCatalog: "Loading HYG v4.1 star catalog...",
    catalogAttribution: "HYG v4.1 (CC BY-SA 4.0)",
    starsLoaded: "real stars",
    activeTarget: "Active SPHEREx Cutout",
    activeSubtraction: "Active Difference (A - B)",
    youAreHere: "You are here",
    sunLabel: "Sun",
    galacticCenter: "Galactic Center",
    recenterTarget: "Center target",
    telescopeView: "Telescope view",
    wideSkyView: "Wide sky",
    webglFallbackTitle: "3D WebGL viewport ready",
    webglFallbackDesc:
      "WebGL hardware rendering is unavailable in this environment.",
    fovLabel: "FOV",
    raLabel: "RA",
    decLabel: "Dec",
    unnamedStar: "Star",
    magnitudeLabel: "Mag",
    distanceLabel: "Distance",
    spectralLabel: "Class",
    centerOnStar: "Center & Zoom",
    starClickHint: "Hover or click any star",
    inspectorTitle: "3D Celestial Inspector",
    inspectorEmptyHint:
      "Click any star or SPHEREx target in 3D to inspect its astronomical data and sync with 2D.",
    syncTo2D3D: "Load in 2D & 3D",
    syncedLabel: "Active region",
    featuredTargetsTitle: "SPHEREx Targets",
    activeRegionTitle: "Shared Coordinates",
    measureFromHere: "Measure from here",
    measureSelectSecond: "Select a second celestial object in 3D...",
    measureClear: "Clear",
    angularSeparationLabel: "Angular sep.",
    physicalDistanceLabel: "3D distance",
  },
  es: {
    overlays: {
      stars: "Estrellas",
      "deep-sky": "Cielo profundo",
      planets: "Planetas",
      "milky-way": "Vía Láctea",
      grid: "Grilla",
      labels: "Etiquetas",
    },
    dragHint: "Arrastra para mirar",
    scrollHint: "Rueda para acercar",
    loadingCatalog: "Cargando catálogo HYG v4.1...",
    catalogAttribution: "HYG v4.1 (CC BY-SA 4.0)",
    starsLoaded: "estrellas reales",
    activeTarget: "Recorte SPHEREx activo",
    activeSubtraction: "Resta activa (A - B)",
    youAreHere: "Estás aquí",
    sunLabel: "Sol",
    galacticCenter: "Centro Galáctico",
    recenterTarget: "Centrar objetivo",
    telescopeView: "Vista telescopio",
    wideSkyView: "Cielo amplio",
    webglFallbackTitle: "Visor 3D WebGL listo",
    webglFallbackDesc:
      "El renderizado WebGL por hardware no está disponible en este entorno.",
    fovLabel: "FOV",
    raLabel: "AR",
    decLabel: "Dec",
    unnamedStar: "Estrella",
    magnitudeLabel: "Mag",
    distanceLabel: "Distancia",
    spectralLabel: "Clase",
    centerOnStar: "Centrar y acercar",
    starClickHint: "Pasa o haz clic en una estrella",
    inspectorTitle: "Inspector Celeste 3D",
    inspectorEmptyHint:
      "Haz clic en cualquier estrella u objetivo SPHEREx en 3D para ver su detalle y sincronizar con 2D.",
    syncTo2D3D: "Cargar en 2D y 3D",
    syncedLabel: "Región activa",
    featuredTargetsTitle: "Objetivos SPHEREx",
    activeRegionTitle: "Coordenadas compartidas",
    measureFromHere: "Medir desde aquí",
    measureSelectSecond: "Selecciona un segundo astro en 3D...",
    measureClear: "Limpiar",
    angularSeparationLabel: "Sep. angular",
    physicalDistanceLabel: "Distancia 3D",
  },
};
