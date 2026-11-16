import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Compass,
  Crosshair,
  Loader2,
  Maximize2,
  Minimize2,
  Sparkles,
} from "lucide-react";
import * as THREE from "three";
import {
  bvToRgb,
  bvToSpectralClass,
  equatorialToCartesian,
  equatorialToGalacticDeg,
  loadHygStars,
  PLANETS_J2000,
  planetPositionAu,
  parseSexagesimalDecDeg,
  parseSexagesimalRaDeg,
  SKY_3D_COPY,
  SKY3D_CONSTANTS,
  SKY3D_RENDER_CONSTANTS as R,
  SPHEREX_3D_TARGETS,
  type HygStarDataset,
  type Sky3DScaleId,
  type Sky3DTarget,
} from "../../config/sky3dCatalog";
import type {
  ExplorerFrame,
  ExplorerLocale,
  SubtractionResult,
} from "../../types/explorer";
import type { QueryParams } from "../../types/portal";

interface Explorer3DCanvasProps {
  query: QueryParams;
  activeFrame: ExplorerFrame | null;
  activeSubtraction?: SubtractionResult | null;
  locale: ExplorerLocale;
}

interface ProjectedLabel {
  id: string;
  label: string;
  sublabel?: string;
  x: number;
  y: number;
  kind: "target" | "star" | "landmark";
  target?: Sky3DTarget;
  color?: string;
}

interface StarInspection {
  name: string | null;
  raDeg: number;
  decDeg: number;
  distPc: number;
  mag: number;
  ci: number;
  spectralClass: string;
  colorCss: string;
  screenX: number;
  screenY: number;
}

const STAR_VERTEX_SHADER = /* glsl */ `
  attribute float aSize;
  attribute vec3 aColor;
  varying vec3 vColor;
  uniform float uPixelRatio;
  uniform float uScaleBoost;

  void main() {
    vColor = aColor;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    float dist = max(1.0, -mvPosition.z);
    gl_PointSize = clamp(aSize * uPixelRatio * uScaleBoost * (300.0 / dist), 1.4, 28.0);
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const SKY_STAR_VERTEX_SHADER = /* glsl */ `
  attribute float aSize;
  attribute vec3 aColor;
  varying vec3 vColor;
  uniform float uPixelRatio;
  uniform float uFovFactor;

  void main() {
    vColor = aColor;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = clamp(aSize * uPixelRatio * uFovFactor, 1.2, 18.0);
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const STAR_FRAGMENT_SHADER = /* glsl */ `
  varying vec3 vColor;

  void main() {
    vec2 uv = gl_PointCoord - vec2(0.5);
    float d = length(uv) * 2.0;
    if (d > 1.0) discard;
    float core = exp(-d * d * 5.2);
    float halo = exp(-d * d * 1.8) * 0.45;
    float alpha = clamp(core + halo, 0.0, 1.0);
    gl_FragColor = vec4(vColor, alpha);
  }
`;

function getImageSourceUrl(
  activeFrame: ExplorerFrame | null,
  activeSubtraction?: SubtractionResult | null
): string | null {
  if (
    activeSubtraction &&
    activeSubtraction.status === "ready" &&
    activeSubtraction.imageUrl
  ) {
    return activeSubtraction.imageUrl;
  }
  if (!activeFrame) return null;
  return activeFrame.imageUrl ?? null;
}

function createSkyStarsGroup(dataset: HygStarDataset): THREE.Points {
  const count = dataset.stars.length;
  const positions = new Float32Array(count * R.three);
  const colors = new Float32Array(count * R.three);
  const sizes = new Float32Array(count);

  const magRange =
    SKY3D_CONSTANTS.skyStarFaintMag - SKY3D_CONSTANTS.skyStarBrightMag;
  const sizeRange =
    SKY3D_CONSTANTS.skyStarMaxSize - SKY3D_CONSTANTS.skyStarMinSize;

  for (let i = 0; i < count; i += 1) {
    const [raDeg, decDeg, , mag, ci] = dataset.stars[i];
    const [x, y, z] = equatorialToCartesian(
      raDeg,
      decDeg,
      SKY3D_CONSTANTS.skySphereRadius
    );
    const idx = i * R.three;
    positions[idx] = x;
    positions[idx + 1] = y;
    positions[idx + R.two] = z;

    const [r, g, b] = bvToRgb(ci);
    colors[idx] = r;
    colors[idx + 1] = g;
    colors[idx + R.two] = b;

    const norm = Math.max(
      0,
      Math.min(1, (SKY3D_CONSTANTS.skyStarFaintMag - mag) / magRange)
    );
    sizes[i] =
      SKY3D_CONSTANTS.skyStarMinSize + Math.pow(norm, R.two) * sizeRange;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.BufferAttribute(positions, R.three)
  );
  geometry.setAttribute("aColor", new THREE.BufferAttribute(colors, R.three));
  geometry.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));

  const material = new THREE.ShaderMaterial({
    vertexShader: SKY_STAR_VERTEX_SHADER,
    fragmentShader: STAR_FRAGMENT_SHADER,
    uniforms: {
      uPixelRatio: {
        value: Math.min(window.devicePixelRatio || 1, R.two),
      },
      uFovFactor: { value: 1 },
    },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  return new THREE.Points(geometry, material);
}

function createSkyMilkyWayBand(): THREE.Points {
  const positions = new Float32Array(R.milkyWaySkyPoints * R.three);
  const colors = new Float32Array(R.milkyWaySkyPoints * R.three);
  const sizes = new Float32Array(R.milkyWaySkyPoints);

  let seed = R.prngSeedSky;
  const rand = (): number => {
    seed = (seed * R.prngMult) % R.prngMod;
    return (seed - 1) / R.prngDenom;
  };

  for (let i = 0; i < R.milkyWaySkyPoints; i += 1) {
    let raDeg = 0;
    let decDeg = 0;
    let bDeg: number = R.ninetyDeg;
    let lDeg = 0;
    for (let attempt = 0; attempt < R.skyBandAttempts; attempt += 1) {
      raDeg = rand() * R.fullCircleDeg;
      decDeg = Math.asin(R.two * rand() - 1) * SKY3D_CONSTANTS.radToDeg;
      [lDeg, bDeg] = equatorialToGalacticDeg(raDeg, decDeg);
      if (Math.abs(bDeg) < R.milkyWaySkyBandDeg * (R.half + rand())) {
        break;
      }
    }

    const [x, y, z] = equatorialToCartesian(
      raDeg,
      decDeg,
      SKY3D_CONSTANTS.skyMilkyWayRadius
    );
    const idx = i * R.three;
    positions[idx] = x;
    positions[idx + 1] = y;
    positions[idx + R.two] = z;

    const distFromCenterDeg = Math.min(lDeg, R.fullCircleDeg - lDeg);
    const coreBoost = Math.exp(
      -Math.pow(distFromCenterDeg / R.skyBandCoreSigmaDeg, R.two)
    );
    const latFade = Math.exp(-Math.pow(bDeg / R.skyBandLatSigmaDeg, R.two));
    const intensity =
      (R.skyBandBaseIntensity + R.skyBandCoreIntensity * coreBoost) * latFade;

    colors[idx] =
      intensity * (R.skyBandRedBase + R.skyBandRedBoost * coreBoost);
    colors[idx + 1] =
      intensity * (R.skyBandGreenBase + R.skyBandGreenBoost * coreBoost);
    colors[idx + R.two] = intensity * (1 - R.skyBandBlueDrop * coreBoost);

    sizes[i] = R.milkyWaySkySize * (R.half + rand());
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.BufferAttribute(positions, R.three)
  );
  geometry.setAttribute("aColor", new THREE.BufferAttribute(colors, R.three));
  geometry.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));

  const material = new THREE.ShaderMaterial({
    vertexShader: SKY_STAR_VERTEX_SHADER,
    fragmentShader: STAR_FRAGMENT_SHADER,
    uniforms: {
      uPixelRatio: { value: Math.min(window.devicePixelRatio || 1, R.two) },
      uFovFactor: { value: 1 },
    },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  return new THREE.Points(geometry, material);
}

function createSkyEquatorialGrid(): THREE.Group {
  const group = new THREE.Group();
  const gridMat = new THREE.LineBasicMaterial({
    color: R.skyGridColorHex,
    transparent: true,
    opacity: R.skyGridOpacity,
  });
  const equatorMat = new THREE.LineBasicMaterial({
    color: R.skyGridColorHex,
    transparent: true,
    opacity: R.skyEquatorOpacity,
  });

  const radius = SKY3D_CONSTANTS.skyGridRadius;
  const segs = SKY3D_CONSTANTS.skyGridSegments;

  for (const decDeg of SKY3D_CONSTANTS.skyGridDecStepsDeg) {
    const pts: THREE.Vector3[] = [];
    for (let s = 0; s <= segs; s += 1) {
      const raDeg = (s / segs) * R.fullCircleDeg;
      const [x, y, z] = equatorialToCartesian(raDeg, decDeg, radius);
      pts.push(new THREE.Vector3(x, y, z));
    }
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    group.add(new THREE.Line(geo, decDeg === 0 ? equatorMat : gridMat));
  }

  for (
    let raDeg = 0;
    raDeg < R.fullCircleDeg;
    raDeg += SKY3D_CONSTANTS.skyGridRaStepDeg
  ) {
    const pts: THREE.Vector3[] = [];
    for (let s = 0; s <= segs; s += 1) {
      const decDeg = -R.ninetyDeg + (s / segs) * (R.ninetyDeg * R.two);
      const [x, y, z] = equatorialToCartesian(raDeg, decDeg, radius);
      pts.push(new THREE.Vector3(x, y, z));
    }
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    group.add(new THREE.Line(geo, gridMat));
  }

  return group;
}

function createNeighborhoodGroup(
  dataset: HygStarDataset,
  targetRaDeg: number,
  targetDecDeg: number
): THREE.Group {
  const group = new THREE.Group();
  const count = dataset.stars.length;
  const positions = new Float32Array(count * R.three);
  const colors = new Float32Array(count * R.three);
  const sizes = new Float32Array(count);

  const scale = SKY3D_CONSTANTS.neighborhoodSceneScalePerPc;
  const maxPc = SKY3D_CONSTANTS.neighborhoodMaxDistPc;

  for (let i = 0; i < count; i += 1) {
    const [raDeg, decDeg, distPc, mag, ci] = dataset.stars[i];
    const clampedPc = Math.min(distPc, maxPc);
    const [x, y, z] = equatorialToCartesian(raDeg, decDeg, clampedPc * scale);
    const idx = i * R.three;
    positions[idx] = x;
    positions[idx + 1] = y;
    positions[idx + R.two] = z;

    const [r, g, b] = bvToRgb(ci);
    colors[idx] = r;
    colors[idx + 1] = g;
    colors[idx + R.two] = b;

    const norm = Math.max(
      0,
      Math.min(
        1,
        (SKY3D_CONSTANTS.skyStarFaintMag - mag) /
          (SKY3D_CONSTANTS.skyStarFaintMag - SKY3D_CONSTANTS.skyStarBrightMag)
      )
    );
    sizes[i] =
      SKY3D_CONSTANTS.skyStarMinSize + norm * R.neighborhoodStarSizeBoost;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, R.three));
  geo.setAttribute("aColor", new THREE.BufferAttribute(colors, R.three));
  geo.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));

  const mat = new THREE.ShaderMaterial({
    vertexShader: STAR_VERTEX_SHADER,
    fragmentShader: STAR_FRAGMENT_SHADER,
    uniforms: {
      uPixelRatio: { value: Math.min(window.devicePixelRatio || 1, R.two) },
      uScaleBoost: { value: R.neighborhoodScaleBoost },
    },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  group.add(new THREE.Points(geo, mat));

  const ringMat = new THREE.LineBasicMaterial({
    color: R.skyGridColorHex,
    transparent: true,
    opacity: R.neighborhoodRingOpacity,
  });
  const segs = SKY3D_CONSTANTS.neighborhoodRingSegments;
  for (const ly of SKY3D_CONSTANTS.neighborhoodRingsLy) {
    const r = (ly / SKY3D_CONSTANTS.pcToLy) * scale;
    const pts: THREE.Vector3[] = [];
    for (let s = 0; s <= segs; s += 1) {
      const a = (s / segs) * SKY3D_CONSTANTS.twoPi;
      pts.push(new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r));
    }
    group.add(
      new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), ringMat)
    );
  }

  const sunGeo = new THREE.BufferGeometry();
  sunGeo.setAttribute(
    "position",
    new THREE.BufferAttribute(new Float32Array([0, 0, 0]), R.three)
  );
  sunGeo.setAttribute(
    "aColor",
    new THREE.BufferAttribute(
      new Float32Array([R.sunColorR, R.sunColorG, R.sunColorB]),
      R.three
    )
  );
  sunGeo.setAttribute(
    "aSize",
    new THREE.BufferAttribute(new Float32Array([R.sunGlowSize]), 1)
  );
  group.add(new THREE.Points(sunGeo, mat));

  const [tx, ty, tz] = equatorialToCartesian(
    targetRaDeg,
    targetDecDeg,
    R.lineOfSightLenPc * scale
  );
  const losGeo = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(tx, ty, tz),
  ]);
  const losMat = new THREE.LineBasicMaterial({
    color: R.losColorHex,
    transparent: true,
    opacity: R.losOpacity,
  });
  group.add(new THREE.Line(losGeo, losMat));

  return group;
}

function createMilkyWayGroup(): THREE.Group {
  const group = new THREE.Group();
  const count = SKY3D_CONSTANTS.milkyWayPointCount;
  const positions = new Float32Array(count * R.three);
  const colors = new Float32Array(count * R.three);
  const sizes = new Float32Array(count);

  let seed = R.prngSeedMw;
  const rand = (): number => {
    seed = (seed * R.prngMult) % R.prngMod;
    return (seed - 1) / R.prngDenom;
  };
  const gaussian = (): number => {
    const u = Math.max(R.mwMinLog, rand());
    const v = rand();
    return (
      Math.sqrt(-R.two * Math.log(u)) * Math.cos(SKY3D_CONSTANTS.twoPi * v)
    );
  };

  for (let i = 0; i < count; i += 1) {
    const idx = i * R.three;
    const isCore = i < count * R.milkyWayCoreFrac;
    if (isCore) {
      const r = Math.abs(gaussian()) * SKY3D_CONSTANTS.milkyWayCoreRadiusKpc;
      const theta = rand() * SKY3D_CONSTANTS.twoPi;
      const y = gaussian() * R.milkyWayCoreThickness * R.mwCoreThicknessScale;
      positions[idx] = Math.cos(theta) * r;
      positions[idx + 1] = y;
      positions[idx + R.two] = Math.sin(theta) * r;

      colors[idx] = 1;
      colors[idx + 1] = R.mwCoreColorG;
      colors[idx + R.two] = R.mwCoreColorB;
      sizes[i] = R.milkyWayPointSize * R.mwCoreSizeMult;
    } else {
      const arm = i % SKY3D_CONSTANTS.milkyWayArmCount;
      const radius =
        Math.pow(rand(), R.mwArmRadiusPow) * SKY3D_CONSTANTS.milkyWayRadiusKpc;
      const armBaseAngle =
        (arm / SKY3D_CONSTANTS.milkyWayArmCount) * SKY3D_CONSTANTS.twoPi;
      const spiralAngle =
        (radius / SKY3D_CONSTANTS.milkyWayRadiusKpc) *
        SKY3D_CONSTANTS.milkyWaySpiralTightness *
        Math.PI;
      const scatter =
        gaussian() *
        (R.milkyWayArmSpread +
          R.mwArmScatterBase *
            (1 / (R.half + radius * R.mwArmScatterRadiusScale)));
      const angle = armBaseAngle + spiralAngle + scatter;
      const y =
        gaussian() *
        R.milkyWayThickness *
        Math.exp(
          -radius / (SKY3D_CONSTANTS.milkyWayRadiusKpc * R.mwThickFalloff)
        );

      positions[idx] = Math.cos(angle) * radius;
      positions[idx + 1] = y;
      positions[idx + R.two] = Math.sin(angle) * radius;

      const t = radius / SKY3D_CONSTANTS.milkyWayRadiusKpc;
      colors[idx] = R.mwArmRedBase - R.mwArmRedDrop * t;
      colors[idx + 1] = R.mwArmGreenBase - R.mwArmGreenDrop * t;
      colors[idx + R.two] = R.mwArmBlueBase + R.mwArmBlueBoost * t;
      sizes[i] = R.milkyWayPointSize * (R.half + rand());
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, R.three));
  geo.setAttribute("aColor", new THREE.BufferAttribute(colors, R.three));
  geo.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));

  const mat = new THREE.ShaderMaterial({
    vertexShader: STAR_VERTEX_SHADER,
    fragmentShader: STAR_FRAGMENT_SHADER,
    uniforms: {
      uPixelRatio: { value: Math.min(window.devicePixelRatio || 1, R.two) },
      uScaleBoost: { value: R.mwScaleBoost },
    },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  group.add(new THREE.Points(geo, mat));

  const sunGeo = new THREE.BufferGeometry();
  sunGeo.setAttribute(
    "position",
    new THREE.BufferAttribute(
      new Float32Array([SKY3D_CONSTANTS.milkyWaySunRadiusKpc, 0, 0]),
      R.three
    )
  );
  sunGeo.setAttribute(
    "aColor",
    new THREE.BufferAttribute(
      new Float32Array([R.mwSunColorR, R.mwSunColorG, R.mwSunColorB]),
      R.three
    )
  );
  sunGeo.setAttribute(
    "aSize",
    new THREE.BufferAttribute(new Float32Array([R.sunGlowSize]), 1)
  );
  group.add(new THREE.Points(sunGeo, mat));

  return group;
}

function createSolarSystemGroup(): THREE.Group {
  const group = new THREE.Group();
  const nowMs = Date.now();
  const segs = SKY3D_CONSTANTS.solarOrbitSegments;

  const sunGeo = new THREE.BufferGeometry();
  sunGeo.setAttribute(
    "position",
    new THREE.BufferAttribute(new Float32Array([0, 0, 0]), R.three)
  );
  sunGeo.setAttribute(
    "aColor",
    new THREE.BufferAttribute(
      new Float32Array([1, R.ssSunColorG, R.ssSunColorB]),
      R.three
    )
  );
  sunGeo.setAttribute(
    "aSize",
    new THREE.BufferAttribute(
      new Float32Array([R.sunGlowSize * R.ssSunSizeMult]),
      1
    )
  );
  const glowMat = new THREE.ShaderMaterial({
    vertexShader: STAR_VERTEX_SHADER,
    fragmentShader: STAR_FRAGMENT_SHADER,
    uniforms: {
      uPixelRatio: { value: Math.min(window.devicePixelRatio || 1, R.two) },
      uScaleBoost: { value: R.ssGlowBoost },
    },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  group.add(new THREE.Points(sunGeo, glowMat));

  for (const planet of PLANETS_J2000) {
    const orbitPts: THREE.Vector3[] = [];
    const periodMs =
      planet.orbitalPeriodYears * SKY3D_CONSTANTS.msPerJulianYear;
    for (let s = 0; s <= segs; s += 1) {
      const sampleMs = nowMs + (s / segs) * periodMs;
      const [px, py, pz] = planetPositionAu(planet, sampleMs);
      orbitPts.push(new THREE.Vector3(px, py, pz));
    }
    const orbitGeo = new THREE.BufferGeometry().setFromPoints(orbitPts);
    const orbitMat = new THREE.LineBasicMaterial({
      color: new THREE.Color(planet.colorHex),
      transparent: true,
      opacity: planet.isEarth ? R.ssEarthOpacity : R.ssOrbitOpacity,
    });
    group.add(new THREE.Line(orbitGeo, orbitMat));

    const [cx, cy, cz] = planetPositionAu(planet, nowMs);
    const sphereGeo = new THREE.SphereGeometry(
      R.planetMarkerScale * Math.sqrt(planet.radiusPx / R.ssPlanetRefRadius),
      R.ssPlanetWidthSegs,
      R.ssPlanetHeightSegs
    );
    const sphereMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(planet.colorHex),
    });
    const mesh = new THREE.Mesh(sphereGeo, sphereMat);
    mesh.position.set(cx, cy, cz);
    group.add(mesh);
  }

  return group;
}

export function Explorer3DCanvas({
  query,
  activeFrame,
  activeSubtraction,
  locale,
}: Explorer3DCanvasProps) {
  const copy = SKY_3D_COPY[locale];
  const containerRef = useRef<HTMLDivElement | null>(null);

  const [scale, setScale] = useState<Sky3DScaleId>("sky-view");
  const [hygData, setHygData] = useState<HygStarDataset | null>(null);
  const [loadingStars, setLoadingStars] = useState(true);
  const [webglUnavailable, setWebglUnavailable] = useState(false);
  const [selectedTarget, setSelectedTarget] = useState<Sky3DTarget | null>(
    null
  );
  const [hoveredStar, setHoveredStar] = useState<StarInspection | null>(null);
  const [selectedStar, setSelectedStar] = useState<StarInspection | null>(null);
  const [hudFov, setHudFov] = useState<number>(SKY3D_CONSTANTS.defaultFovDeg);
  const [projectedLabels, setProjectedLabels] = useState<ProjectedLabel[]>([]);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);

  const targetRaDeg = useMemo(
    () => parseSexagesimalRaDeg(query.ra),
    [query.ra]
  );
  const targetDecDeg = useMemo(
    () => parseSexagesimalDecDeg(query.dec),
    [query.dec]
  );

  const camStateRef = useRef<{
    yaw: number;
    pitch: number;
    targetYaw: number;
    targetPitch: number;
    fov: number;
    targetFov: number;
    orbitRadius: number;
    targetOrbitRadius: number;
    isDragging: boolean;
    lastX: number;
    lastY: number;
    dragDistance: number;
  }>({
    yaw: 0,
    pitch: 0,
    targetYaw: 0,
    targetPitch: 0,
    fov: SKY3D_CONSTANTS.defaultFovDeg,
    targetFov: SKY3D_CONSTANTS.defaultFovDeg,
    orbitRadius: SKY3D_CONSTANTS.neighborhoodDefaultRadius,
    targetOrbitRadius: SKY3D_CONSTANTS.neighborhoodDefaultRadius,
    isDragging: false,
    lastX: 0,
    lastY: 0,
    dragDistance: 0,
  });

  const aimCameraAtSkyCoords = useCallback(
    (raDeg: number, decDeg: number, nextFov?: number) => {
      const yaw = raDeg * SKY3D_CONSTANTS.degToRad + SKY3D_CONSTANTS.halfPi;
      const pitch = Math.max(
        SKY3D_CONSTANTS.minPitchRad,
        Math.min(SKY3D_CONSTANTS.maxPitchRad, decDeg * SKY3D_CONSTANTS.degToRad)
      );
      camStateRef.current.targetYaw = yaw;
      camStateRef.current.targetPitch = pitch;
      if (typeof nextFov === "number") {
        camStateRef.current.targetFov = nextFov;
        setHudFov(Math.round(nextFov));
      }
    },
    []
  );

  useEffect(() => {
    camStateRef.current.targetYaw =
      targetRaDeg * SKY3D_CONSTANTS.degToRad + SKY3D_CONSTANTS.halfPi;
    camStateRef.current.targetPitch = Math.max(
      SKY3D_CONSTANTS.minPitchRad,
      Math.min(
        SKY3D_CONSTANTS.maxPitchRad,
        targetDecDeg * SKY3D_CONSTANTS.degToRad
      )
    );
  }, [targetRaDeg, targetDecDeg]);

  const handleSelectScale = (nextScale: Sky3DScaleId) => {
    setScale(nextScale);
    if (nextScale === "solar-system") {
      camStateRef.current.targetOrbitRadius =
        SKY3D_CONSTANTS.solarSystemDefaultRadius;
      camStateRef.current.orbitRadius =
        SKY3D_CONSTANTS.solarSystemDefaultRadius;
      camStateRef.current.targetPitch = R.pitchSolarSystem;
    } else if (nextScale === "neighborhood") {
      camStateRef.current.targetOrbitRadius =
        SKY3D_CONSTANTS.neighborhoodDefaultRadius;
      camStateRef.current.orbitRadius =
        SKY3D_CONSTANTS.neighborhoodDefaultRadius;
      camStateRef.current.targetPitch = R.pitchNeighborhood;
    } else if (nextScale === "milky-way") {
      camStateRef.current.targetOrbitRadius =
        SKY3D_CONSTANTS.milkyWayDefaultRadius;
      camStateRef.current.orbitRadius = SKY3D_CONSTANTS.milkyWayDefaultRadius;
      camStateRef.current.targetPitch = R.pitchMilkyWay;
    } else {
      aimCameraAtSkyCoords(
        targetRaDeg,
        targetDecDeg,
        SKY3D_CONSTANTS.defaultFovDeg
      );
    }
  };

  useEffect(() => {
    let active = true;
    loadHygStars().then((dataset) => {
      if (!active) return;
      setHygData(dataset);
      setLoadingStars(false);
    });
    return () => {
      active = false;
    };
  }, []);

  const cutoutImageUrl = useMemo(
    () => getImageSourceUrl(activeFrame, activeSubtraction),
    [activeFrame, activeSubtraction]
  );

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        powerPreference: "high-performance",
        alpha: false,
      });
    } catch {
      requestAnimationFrame(() => setWebglUnavailable(true));
      return undefined;
    }

    const width = Math.max(1, container.clientWidth);
    const height = Math.max(1, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, R.two));
    renderer.setSize(width, height);
    renderer.setClearColor(R.clearColorHex, 1);
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(
      SKY3D_CONSTANTS.defaultFovDeg,
      width / height,
      SKY3D_CONSTANTS.cameraNear,
      SKY3D_CONSTANTS.cameraFar
    );
    cameraRef.current = camera;

    const skyGroup = new THREE.Group();
    const milkyWayBand = createSkyMilkyWayBand();
    skyGroup.add(milkyWayBand);
    skyGroup.add(createSkyEquatorialGrid());

    let skyStarsPoints: THREE.Points | null = null;
    if (hygData) {
      skyStarsPoints = createSkyStarsGroup(hygData);
      skyGroup.add(skyStarsPoints);
    }

    const fieldDeg = Math.max(
      SKY3D_CONSTANTS.skyCutoutMinAngularSizeDeg,
      Number(query.fieldSizeDeg) || SKY3D_CONSTANTS.skyCutoutMinAngularSizeDeg
    );
    const angularRad = fieldDeg * SKY3D_CONSTANTS.degToRad;
    const planeSize =
      R.two * SKY3D_CONSTANTS.skyCutoutDistance * Math.tan(angularRad * R.half);
    const [cx, cy, cz] = equatorialToCartesian(
      targetRaDeg,
      targetDecDeg,
      SKY3D_CONSTANTS.skyCutoutDistance
    );

    const reticleGroup = new THREE.Group();
    reticleGroup.position.set(cx, cy, cz);
    reticleGroup.lookAt(0, 0, 0);

    const halfSize = planeSize * R.half;
    const borderPts = [
      new THREE.Vector3(-halfSize, -halfSize, R.cutoutReticleZOffset),
      new THREE.Vector3(halfSize, -halfSize, R.cutoutReticleZOffset),
      new THREE.Vector3(halfSize, halfSize, R.cutoutReticleZOffset),
      new THREE.Vector3(-halfSize, halfSize, R.cutoutReticleZOffset),
      new THREE.Vector3(-halfSize, -halfSize, R.cutoutReticleZOffset),
    ];
    const borderGeo = new THREE.BufferGeometry().setFromPoints(borderPts);
    const borderMat = new THREE.LineBasicMaterial({
      color: activeSubtraction ? R.reticleSubtractHex : R.losColorHex,
      transparent: true,
      opacity: R.reticleOpacity,
    });
    reticleGroup.add(new THREE.Line(borderGeo, borderMat));

    let cutoutTexture: THREE.Texture | null = null;
    if (cutoutImageUrl) {
      const loader = new THREE.TextureLoader();
      loader.setCrossOrigin("anonymous");
      cutoutTexture = loader.load(cutoutImageUrl, (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
      });
      const cutoutGeo = new THREE.PlaneGeometry(planeSize, planeSize);
      const cutoutMat = new THREE.MeshBasicMaterial({
        map: cutoutTexture,
        transparent: true,
        opacity: R.cutoutMeshOpacity,
        side: THREE.DoubleSide,
      });
      reticleGroup.add(new THREE.Mesh(cutoutGeo, cutoutMat));
    }
    skyGroup.add(reticleGroup);

    const neighborhoodGroup = hygData
      ? createNeighborhoodGroup(hygData, targetRaDeg, targetDecDeg)
      : new THREE.Group();
    const milkyWayGroup = createMilkyWayGroup();
    const solarSystemGroup = createSolarSystemGroup();

    skyGroup.visible = scale === "sky-view";
    neighborhoodGroup.visible = scale === "neighborhood";
    milkyWayGroup.visible = scale === "milky-way";
    solarSystemGroup.visible = scale === "solar-system";

    scene.add(skyGroup);
    scene.add(neighborhoodGroup);
    scene.add(milkyWayGroup);
    scene.add(solarSystemGroup);

    const resizeObserver = new ResizeObserver(() => {
      const nextW = Math.max(1, container.clientWidth);
      const nextH = Math.max(1, container.clientHeight);
      camera.aspect = nextW / nextH;
      camera.updateProjectionMatrix();
      renderer.setSize(nextW, nextH);
    });
    resizeObserver.observe(container);

    let rafId = 0;
    let frameTick = 0;
    const lookTarget = new THREE.Vector3();
    const projVec = new THREE.Vector3();

    const animate = () => {
      rafId = requestAnimationFrame(animate);
      const st = camStateRef.current;

      st.yaw += (st.targetYaw - st.yaw) * SKY3D_CONSTANTS.dampingFactor;
      st.pitch += (st.targetPitch - st.pitch) * SKY3D_CONSTANTS.dampingFactor;
      st.fov += (st.targetFov - st.fov) * SKY3D_CONSTANTS.dampingFactor;
      st.orbitRadius +=
        (st.targetOrbitRadius - st.orbitRadius) * SKY3D_CONSTANTS.dampingFactor;

      if (Math.abs(camera.fov - st.fov) > R.fovEpsilon) {
        camera.fov = st.fov;
        camera.updateProjectionMatrix();
      }

      if (scale === "sky-view") {
        camera.position.set(0, 0, 0);
        const dirX = Math.cos(st.pitch) * Math.sin(st.yaw);
        const dirY = Math.sin(st.pitch);
        const dirZ = Math.cos(st.pitch) * Math.cos(st.yaw);
        lookTarget.set(dirX, dirY, dirZ);
        camera.lookAt(lookTarget);

        const fovFactor = SKY3D_CONSTANTS.defaultFovDeg / st.fov;
        if (skyStarsPoints) {
          const mat = skyStarsPoints.material as THREE.ShaderMaterial;
          mat.uniforms.uFovFactor.value = Math.min(
            R.fovStarMax,
            Math.max(R.fovStarMin, fovFactor)
          );
        }
        const mwMat = milkyWayBand.material as THREE.ShaderMaterial;
        mwMat.uniforms.uFovFactor.value = Math.min(
          R.fovMwMax,
          Math.max(R.fovMwMin, fovFactor)
        );
      } else {
        const ox = st.orbitRadius * Math.cos(st.pitch) * Math.sin(st.yaw);
        const oy = st.orbitRadius * Math.sin(st.pitch);
        const oz = st.orbitRadius * Math.cos(st.pitch) * Math.cos(st.yaw);
        camera.position.set(ox, oy, oz);
        camera.lookAt(0, 0, 0);
      }

      renderer.render(scene, camera);

      frameTick += 1;
      if (frameTick % R.three === 0) {
        const w = container.clientWidth;
        const h = container.clientHeight;
        const labels: ProjectedLabel[] = [];

        const pushLabel = (
          wx: number,
          wy: number,
          wz: number,
          item: Omit<ProjectedLabel, "x" | "y">
        ) => {
          projVec.set(wx, wy, wz).project(camera);
          if (projVec.z > 1) return;
          const sx = (projVec.x * R.half + R.half) * w;
          const sy = (-projVec.y * R.half + R.half) * h;
          if (sx < 0 || sx > w || sy < 0 || sy > h) return;
          labels.push({ ...item, x: sx, y: sy });
        };

        if (scale === "sky-view") {
          for (const target of SPHEREX_3D_TARGETS) {
            const [tx, ty, tz] = equatorialToCartesian(
              target.raDeg,
              target.decDeg,
              SKY3D_CONSTANTS.skySphereRadius * R.cutoutTargetRatio
            );
            pushLabel(tx, ty, tz, {
              id: `target-${target.id}`,
              label: target.name,
              sublabel: target.category,
              kind: "target",
              target,
            });
          }
          if (hygData) {
            let starCount = 0;
            for (const [name, raDeg, decDeg] of hygData.named) {
              if (starCount >= SKY3D_CONSTANTS.maxProjectionsLabelCount) break;
              const [sx, sy, sz] = equatorialToCartesian(
                raDeg,
                decDeg,
                SKY3D_CONSTANTS.skySphereRadius
              );
              const before = labels.length;
              pushLabel(sx, sy, sz, {
                id: `star-${name}`,
                label: name,
                kind: "star",
              });
              if (labels.length > before) starCount += 1;
            }
          }
        } else if (scale === "neighborhood") {
          pushLabel(0, 0, 0, {
            id: "sun-here",
            label: copy.sunLabel,
            sublabel: copy.youAreHere,
            kind: "landmark",
          });
          for (const target of SPHEREX_3D_TARGETS) {
            const r =
              Math.min(target.distPc, SKY3D_CONSTANTS.neighborhoodMaxDistPc) *
              SKY3D_CONSTANTS.neighborhoodSceneScalePerPc;
            const [tx, ty, tz] = equatorialToCartesian(
              target.raDeg,
              target.decDeg,
              r
            );
            pushLabel(tx, ty, tz, {
              id: `target-${target.id}`,
              label: target.name,
              sublabel: `${Math.round(target.distPc * SKY3D_CONSTANTS.pcToLy)} ly`,
              kind: "target",
              target,
            });
          }
        } else if (scale === "milky-way") {
          pushLabel(0, 0, 0, {
            id: "gc",
            label: copy.galacticCenter,
            kind: "landmark",
          });
          pushLabel(SKY3D_CONSTANTS.milkyWaySunRadiusKpc, 0, 0, {
            id: "sun-mw",
            label: copy.sunLabel,
            sublabel: copy.youAreHere,
            kind: "landmark",
          });
        } else if (scale === "solar-system") {
          const nowMs = Date.now();
          pushLabel(0, 0, 0, {
            id: "sun-ss",
            label: copy.sunLabel,
            kind: "landmark",
          });
          for (const planet of PLANETS_J2000) {
            const [px, py, pz] = planetPositionAu(planet, nowMs);
            pushLabel(px, py, pz, {
              id: `planet-${planet.id}`,
              label: locale === "es" ? planet.nameEs : planet.nameEn,
              sublabel: planet.isEarth ? copy.youAreHere : undefined,
              kind: "landmark",
              color: planet.colorHex,
            });
          }
        }

        setProjectedLabels(labels);
      }
    };

    animate();

    return () => {
      cancelAnimationFrame(rafId);
      resizeObserver.disconnect();
      if (cutoutTexture) cutoutTexture.dispose();
      cameraRef.current = null;
      renderer.dispose();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
    };
  }, [
    hygData,
    scale,
    targetRaDeg,
    targetDecDeg,
    query.fieldSizeDeg,
    cutoutImageUrl,
    activeSubtraction,
    locale,
    copy.sunLabel,
    copy.youAreHere,
    copy.galacticCenter,
  ]);

  const findNearestStarAtScreenPos = useCallback(
    (clientX: number, clientY: number): StarInspection | null => {
      const container = containerRef.current;
      const camera = cameraRef.current;
      if (!container || !camera || !hygData) return null;
      if (scale !== "sky-view" && scale !== "neighborhood") return null;

      const rect = container.getBoundingClientRect();
      const px = clientX - rect.left;
      const py = clientY - rect.top;
      const w = rect.width;
      const h = rect.height;
      const hitSq =
        SKY3D_CONSTANTS.starHitRadiusPx * SKY3D_CONSTANTS.starHitRadiusPx;
      const vec = new THREE.Vector3();

      let bestDistSq = hitSq;
      let bestStar: {
        name: string | null;
        raDeg: number;
        decDeg: number;
        distPc: number;
        mag: number;
        ci: number;
        sx: number;
        sy: number;
      } | null = null;

      const projectCoords = (
        raDeg: number,
        decDeg: number,
        distPc: number
      ): [number, number] | null => {
        const radius =
          scale === "sky-view"
            ? SKY3D_CONSTANTS.skySphereRadius
            : Math.min(distPc, SKY3D_CONSTANTS.neighborhoodMaxDistPc) *
              SKY3D_CONSTANTS.neighborhoodSceneScalePerPc;
        const [wx, wy, wz] = equatorialToCartesian(raDeg, decDeg, radius);
        vec.set(wx, wy, wz).project(camera);
        if (vec.z > 1) return null;
        return [(vec.x * R.half + R.half) * w, (-vec.y * R.half + R.half) * h];
      };

      for (const [raDeg, decDeg, distPc, mag, ci] of hygData.stars) {
        const pt = projectCoords(raDeg, decDeg, distPc);
        if (!pt) continue;
        const dx = pt[0] - px;
        const dy = pt[1] - py;
        const dSq = dx * dx + dy * dy;
        if (dSq < bestDistSq) {
          bestDistSq = dSq;
          bestStar = {
            name: null,
            raDeg,
            decDeg,
            distPc,
            mag,
            ci,
            sx: pt[0],
            sy: pt[1],
          };
        }
      }

      if (!bestStar) return null;

      for (const [name, nRa, nDec] of hygData.named) {
        if (
          Math.abs(nRa - bestStar.raDeg) < R.namedStarMatchToleranceDeg &&
          Math.abs(nDec - bestStar.decDeg) < R.namedStarMatchToleranceDeg
        ) {
          bestStar.name = name;
          break;
        }
      }

      const [r, g, b] = bvToRgb(bestStar.ci);
      return {
        name: bestStar.name,
        raDeg: bestStar.raDeg,
        decDeg: bestStar.decDeg,
        distPc: bestStar.distPc,
        mag: bestStar.mag,
        ci: bestStar.ci,
        spectralClass: bvToSpectralClass(bestStar.ci),
        colorCss: `rgb(${Math.round(r * R.rgbScale)}, ${Math.round(g * R.rgbScale)}, ${Math.round(b * R.rgbScale)})`,
        screenX: bestStar.sx,
        screenY: bestStar.sy,
      };
    },
    [hygData, scale]
  );

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    camStateRef.current.isDragging = true;
    camStateRef.current.lastX = e.clientX;
    camStateRef.current.lastY = e.clientY;
    camStateRef.current.dragDistance = 0;
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const st = camStateRef.current;
    if (!st.isDragging) {
      const hit = findNearestStarAtScreenPos(e.clientX, e.clientY);
      setHoveredStar(hit);
      return;
    }

    const dx = e.clientX - st.lastX;
    const dy = e.clientY - st.lastY;
    st.lastX = e.clientX;
    st.lastY = e.clientY;
    st.dragDistance += Math.hypot(dx, dy);
    if (st.dragDistance > SKY3D_CONSTANTS.clickDragThresholdPx) {
      setHoveredStar(null);
    }

    const sign = scale === "sky-view" ? 1 : -1;
    const fovScale =
      scale === "sky-view" ? st.fov / SKY3D_CONSTANTS.defaultFovDeg : 1;
    const sens = SKY3D_CONSTANTS.dragSensitivity * fovScale * sign;
    st.targetYaw += dx * sens;
    st.targetPitch = Math.max(
      SKY3D_CONSTANTS.minPitchRad,
      Math.min(SKY3D_CONSTANTS.maxPitchRad, st.targetPitch + dy * sens)
    );
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const wasClick =
      camStateRef.current.dragDistance <= SKY3D_CONSTANTS.clickDragThresholdPx;
    camStateRef.current.isDragging = false;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    if (wasClick) {
      const hit = findNearestStarAtScreenPos(e.clientX, e.clientY);
      if (hit) {
        setSelectedTarget(null);
        setSelectedStar(hit);
      }
    }
  };

  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    const st = camStateRef.current;
    if (scale === "sky-view") {
      const nextFov = Math.max(
        SKY3D_CONSTANTS.minFovDeg,
        Math.min(
          SKY3D_CONSTANTS.maxFovDeg,
          st.targetFov + e.deltaY * SKY3D_CONSTANTS.zoomFovWheelSensitivity
        )
      );
      st.targetFov = nextFov;
      setHudFov(Math.round(nextFov));
      return;
    }

    const minR =
      scale === "solar-system"
        ? SKY3D_CONSTANTS.solarSystemMinRadius
        : scale === "milky-way"
          ? SKY3D_CONSTANTS.milkyWayMinRadius
          : SKY3D_CONSTANTS.neighborhoodMinRadius;
    const maxR =
      scale === "solar-system"
        ? SKY3D_CONSTANTS.solarSystemMaxRadius
        : scale === "milky-way"
          ? SKY3D_CONSTANTS.milkyWayMaxRadius
          : SKY3D_CONSTANTS.neighborhoodMaxRadius;

    const factor = 1 + e.deltaY * SKY3D_CONSTANTS.zoomWheelSensitivity;
    st.targetOrbitRadius = Math.max(
      minR,
      Math.min(maxR, st.targetOrbitRadius * factor)
    );
  };

  const handleSelectTarget = (target: Sky3DTarget) => {
    setSelectedStar(null);
    setSelectedTarget(target);
    if (scale !== "sky-view") {
      setScale("sky-view");
    }
    aimCameraAtSkyCoords(
      target.raDeg,
      target.decDeg,
      SKY3D_CONSTANTS.telescopeFovDeg
    );
  };

  const starCountDisplay = hygData ? hygData.stars.length.toLocaleString() : "";

  return (
    <div
      className="relative flex-1 overflow-hidden bg-[#030712] select-none"
      data-testid="explorer-3d-canvas"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={() => setHoveredStar(null)}
      onWheel={handleWheel}
    >
      <div
        ref={containerRef}
        className={`absolute inset-0 ${hoveredStar ? "cursor-pointer" : "cursor-grab active:cursor-grabbing"}`}
      />

      {webglUnavailable && (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 text-center text-slate-300">
          <Sparkles className="h-8 w-8 text-cyan-400" />
          <p className="text-sm font-medium">{copy.webglFallbackTitle}</p>
          <p className="max-w-sm text-xs text-slate-400">
            {copy.webglFallbackDesc}
          </p>
        </div>
      )}

      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        {projectedLabels.map((item) => {
          if (item.kind === "star") {
            return (
              <div
                key={item.id}
                style={{ left: item.x, top: item.y }}
                className="absolute -translate-x-1/2 -translate-y-full pb-1 text-[10px] tracking-wide text-slate-300/75 drop-shadow"
              >
                {item.label}
              </div>
            );
          }

          if (item.kind === "landmark") {
            return (
              <div
                key={item.id}
                style={{ left: item.x, top: item.y }}
                className="absolute -translate-x-1/2 -translate-y-full pb-1.5 text-center"
              >
                <span
                  className="rounded-full border border-white/15 bg-slate-950/75 px-2 py-0.5 text-[10px] font-medium text-slate-100 backdrop-blur-sm"
                  style={item.color ? { color: item.color } : undefined}
                >
                  {item.label}
                </span>
                {item.sublabel && (
                  <div className="mt-0.5 text-[9px] text-cyan-300">
                    {item.sublabel}
                  </div>
                )}
              </div>
            );
          }

          return (
            <button
              key={item.id}
              type="button"
              onClick={(ev) => {
                ev.stopPropagation();
                if (item.target) handleSelectTarget(item.target);
              }}
              style={{ left: item.x, top: item.y }}
              className="pointer-events-auto absolute -translate-x-1/2 -translate-y-1/2 flex items-center gap-1.5 rounded-full border border-cyan-400/50 bg-slate-950/80 px-2.5 py-1 text-[11px] font-medium text-cyan-100 shadow-lg backdrop-blur-md transition hover:border-cyan-300 hover:bg-cyan-950/80"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-cyan-400" />
              <span>{item.label}</span>
              {item.sublabel && (
                <span className="text-[9px] text-cyan-300/80">
                  {item.sublabel}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="pointer-events-none absolute top-4 left-4 flex flex-col gap-2">
        <div className="pointer-events-auto flex items-center gap-2 rounded-lg border border-white/10 bg-slate-950/75 px-3 py-1.5 text-xs text-slate-200 backdrop-blur-md">
          <Compass className="h-3.5 w-3.5 text-cyan-400" />
          <span className="font-mono text-[11px]">
            {copy.raLabel} {targetRaDeg.toFixed(R.two)}° · {copy.decLabel}{" "}
            {targetDecDeg.toFixed(R.two)}°
          </span>
          {scale === "sky-view" && (
            <span className="border-l border-white/10 pl-2 font-mono text-[11px] text-cyan-300">
              {copy.fovLabel} {hudFov}°
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-slate-950/65 px-3 py-1 text-[11px] text-slate-300 backdrop-blur-md">
          {loadingStars ? (
            <>
              <Loader2 className="h-3 w-3 animate-spin text-cyan-400" />
              <span>{copy.loadingCatalog}</span>
            </>
          ) : (
            <span>
              {copy.catalogAttribution}
              {starCountDisplay
                ? ` · ${starCountDisplay} ${copy.starsLoaded}`
                : ""}
            </span>
          )}
        </div>
      </div>

      <div className="absolute top-4 right-4 flex items-center gap-1.5">
        <button
          type="button"
          onClick={() =>
            aimCameraAtSkyCoords(
              targetRaDeg,
              targetDecDeg,
              SKY3D_CONSTANTS.defaultFovDeg
            )
          }
          className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-slate-950/80 px-2.5 py-1.5 text-xs font-medium text-slate-200 backdrop-blur-md transition hover:border-cyan-400/50 hover:text-cyan-200"
        >
          <Crosshair className="h-3.5 w-3.5 text-cyan-400" />
          <span>{copy.recenterTarget}</span>
        </button>

        {scale === "sky-view" && (
          <>
            <button
              type="button"
              onClick={() =>
                aimCameraAtSkyCoords(
                  targetRaDeg,
                  targetDecDeg,
                  SKY3D_CONSTANTS.telescopeFovDeg
                )
              }
              className="flex items-center gap-1 rounded-lg border border-white/10 bg-slate-950/80 px-2.5 py-1.5 text-xs text-slate-200 backdrop-blur-md transition hover:border-cyan-400/50 hover:text-cyan-200"
            >
              <Minimize2 className="h-3.5 w-3.5 text-cyan-400" />
              <span>{copy.telescopeView}</span>
            </button>
            <button
              type="button"
              onClick={() =>
                aimCameraAtSkyCoords(
                  targetRaDeg,
                  targetDecDeg,
                  SKY3D_CONSTANTS.wideSkyFovDeg
                )
              }
              className="flex items-center gap-1 rounded-lg border border-white/10 bg-slate-950/80 px-2.5 py-1.5 text-xs text-slate-200 backdrop-blur-md transition hover:border-cyan-400/50 hover:text-cyan-200"
            >
              <Maximize2 className="h-3.5 w-3.5 text-cyan-400" />
              <span>{copy.wideSkyView}</span>
            </button>
          </>
        )}
      </div>

      {hoveredStar && (
        <div
          style={{
            left: hoveredStar.screenX + R.tooltipOffsetX,
            top: hoveredStar.screenY - R.tooltipOffsetY,
          }}
          className="pointer-events-none absolute z-20 rounded-lg border border-cyan-400/35 bg-slate-950/90 px-2.5 py-1.5 text-[11px] text-slate-100 shadow-lg backdrop-blur-md"
        >
          <div className="flex items-center gap-1.5 font-medium">
            <span
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: hoveredStar.colorCss }}
            />
            <span>{hoveredStar.name ?? copy.unnamedStar}</span>
          </div>
          <div className="mt-0.5 font-mono text-[10px] text-slate-300">
            {copy.magnitudeLabel} {hoveredStar.mag.toFixed(R.two)} ·{" "}
            {Math.round(hoveredStar.distPc * SKY3D_CONSTANTS.pcToLy)} ly ·{" "}
            {hoveredStar.spectralClass}
          </div>
        </div>
      )}

      {selectedStar && (
        <div
          data-testid="selected-star-card"
          className="absolute right-4 bottom-20 z-20 w-68 rounded-xl border border-cyan-400/35 bg-slate-950/90 p-3 text-xs text-slate-200 shadow-xl backdrop-blur-md"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2">
              <span
                className="h-3 w-3 shrink-0 rounded-full ring-2 ring-white/20"
                style={{ backgroundColor: selectedStar.colorCss }}
              />
              <div>
                <div className="font-semibold text-cyan-200">
                  {selectedStar.name ?? copy.unnamedStar}
                </div>
                <div className="text-[11px] text-slate-400">
                  {copy.spectralLabel}: {selectedStar.spectralClass}
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setSelectedStar(null)}
              className="text-slate-400 hover:text-white"
              aria-label="Close star card"
            >
              ×
            </button>
          </div>
          <div className="mt-2 space-y-0.5 font-mono text-[10px] text-slate-300">
            <div>
              {copy.magnitudeLabel}: {selectedStar.mag.toFixed(R.two)}
            </div>
            <div>
              {copy.distanceLabel}:{" "}
              {Math.round(selectedStar.distPc * SKY3D_CONSTANTS.pcToLy)} ly (
              {selectedStar.distPc.toFixed(1)} pc)
            </div>
            <div>
              {copy.raLabel}: {selectedStar.raDeg.toFixed(R.three)}° ·{" "}
              {copy.decLabel}: {selectedStar.decDeg.toFixed(R.three)}°
            </div>
          </div>
          <button
            type="button"
            onClick={() =>
              aimCameraAtSkyCoords(
                selectedStar.raDeg,
                selectedStar.decDeg,
                SKY3D_CONSTANTS.telescopeFovDeg
              )
            }
            className="mt-2.5 flex w-full items-center justify-center gap-1.5 rounded-lg border border-cyan-400/35 bg-cyan-500/15 px-2.5 py-1 text-[11px] font-medium text-cyan-200 transition hover:bg-cyan-500/25"
          >
            <Crosshair className="h-3 w-3" />
            <span>{copy.centerOnStar}</span>
          </button>
        </div>
      )}

      {selectedTarget && (
        <div className="absolute right-4 bottom-20 w-64 rounded-xl border border-cyan-400/30 bg-slate-950/85 p-3 text-xs text-slate-200 shadow-xl backdrop-blur-md">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="font-semibold text-cyan-200">
                {selectedTarget.name}
              </div>
              <div className="text-[11px] text-slate-400">
                {selectedTarget.category}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setSelectedTarget(null)}
              className="text-slate-400 hover:text-white"
              aria-label="Close target card"
            >
              ×
            </button>
          </div>
          <div className="mt-2 space-y-0.5 font-mono text-[10px] text-slate-300">
            <div>
              {copy.raLabel}: {selectedTarget.raDisplay}
            </div>
            <div>
              {copy.decLabel}: {selectedTarget.decDisplay}
            </div>
            <div>
              ~{Math.round(selectedTarget.distPc * SKY3D_CONSTANTS.pcToLy)} ly
            </div>
          </div>
        </div>
      )}

      <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 flex-col items-center gap-1.5">
        <div
          className="flex items-center gap-1 rounded-full border border-white/15 bg-slate-950/85 p-1 shadow-xl backdrop-blur-md"
          role="tablist"
          aria-label="3D Space Scale"
        >
          {(
            ["solar-system", "neighborhood", "milky-way", "sky-view"] as const
          ).map((id) => {
            const active = scale === id;
            return (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => handleSelectScale(id)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                  active
                    ? "bg-cyan-500/25 text-cyan-200 ring-1 ring-cyan-400/50"
                    : "text-slate-300 hover:bg-white/5 hover:text-white"
                }`}
              >
                {copy.scales[id]}
              </button>
            );
          })}
        </div>
        <div className="text-[10px] text-slate-400">
          {copy.scaleSubtitles[scale]} · {copy.dragHint} · {copy.scrollHint}
          {(scale === "sky-view" || scale === "neighborhood") &&
            ` · ${copy.starClickHint}`}
        </div>
      </div>
    </div>
  );
}
