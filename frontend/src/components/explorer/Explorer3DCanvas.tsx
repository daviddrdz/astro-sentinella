import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import * as THREE from "three";
import {
  bvToRgb,
  bvToSpectralClass,
  DEEP_SKY_OBJECTS,
  equatorialToCartesian,
  equatorialToGalacticDeg,
  formatDecSexagesimal,
  formatRaSexagesimal,
  geocentricPlanetSkyCoords,
  loadHygStars,
  PLANETS_J2000,
  parseSexagesimalDecDeg,
  parseSexagesimalRaDeg,
  SKY_3D_COPY,
  SKY3D_CONSTANTS,
  SKY3D_RENDER_CONSTANTS as R,
  SPHEREX_3D_TARGETS,
  type HygStarDataset,
  type Sky3DOverlayId,
  type Sky3DTarget,
  type SkyObjectDetails,
} from "../../config/sky3dCatalog";
import type {
  ChannelTintId,
  ExplorerFrame,
  ExplorerLayer,
  ExplorerLocale,
  SubtractionResult,
} from "../../types/explorer";
import type { QueryParams } from "../../types/portal";

const TINT_HEX: Record<ChannelTintId, string> = {
  grey: "#94A3B8",
  viridis: "#21918C",
  magma: "#B5367A",
  inferno: "#F98E09",
  cividis: "#7C8770",
  cubehelix: "#6890C8",
};

export interface Center3DRequest {
  raDeg: number;
  decDeg: number;
  fovDeg?: number;
  nonce: number;
}

interface Explorer3DCanvasProps {
  query: QueryParams;
  layers?: ExplorerLayer[];
  activeFrame: ExplorerFrame | null;
  activeSubtraction?: SubtractionResult | null;
  locale: ExplorerLocale;
  onSelectObject?: (obj: SkyObjectDetails) => void;
  centerRequest?: Center3DRequest | null;
}

interface ProjectedLabel {
  id: string;
  label: string;
  sublabel?: string;
  x: number;
  y: number;
  kind: "target" | "star" | "deep-sky" | "planet";
  target?: Sky3DTarget;
  color?: string;
}

interface SkyHoverInfo {
  name: string;
  subtitle: string;
  raDeg: number;
  decDeg: number;
  distPc: number;
  mag: number;
  colorCss: string;
  kind: "star" | "deep-sky" | "planet";
  id: string;
  screenX: number;
  screenY: number;
}

const SKY_STAR_VERTEX_SHADER = /* glsl */ `
  attribute float aSize;
  attribute vec3 aColor;
  varying vec3 vColor;
  uniform float uPixelRatio;
  uniform float uFovFactor;

  void main() {
    vColor = aColor;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = clamp(aSize * uPixelRatio * uFovFactor, 1.2, 26.0);
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

const OVERLAY_ORDER: readonly Sky3DOverlayId[] = [
  "stars",
  "deep-sky",
  "planets",
  "milky-way",
  "grid",
  "labels",
];

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

function createSkyStarsPoints(dataset: HygStarDataset): THREE.Points {
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
      uPixelRatio: { value: Math.min(window.devicePixelRatio || 1, R.two) },
      uFovFactor: { value: 1 },
    },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  return new THREE.Points(geometry, material);
}

function createDeepSkyPoints(): THREE.Points {
  const count = DEEP_SKY_OBJECTS.length;
  const positions = new Float32Array(count * R.three);
  const colors = new Float32Array(count * R.three);
  const sizes = new Float32Array(count);

  for (let i = 0; i < count; i += 1) {
    const obj = DEEP_SKY_OBJECTS[i];
    const [x, y, z] = equatorialToCartesian(
      obj.raDeg,
      obj.decDeg,
      SKY3D_CONSTANTS.skySphereRadius * R.cutoutTargetRatio
    );
    const idx = i * R.three;
    positions[idx] = x;
    positions[idx + 1] = y;
    positions[idx + R.two] = z;

    const col = new THREE.Color(obj.colorHex);
    colors[idx] = col.r;
    colors[idx + 1] = col.g;
    colors[idx + R.two] = col.b;
    sizes[i] = obj.sizePx;
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

function createPlanetPoints(dateMs: number): THREE.Points {
  const planets = PLANETS_J2000.filter((p) => !p.isEarth);
  const count = planets.length;
  const positions = new Float32Array(count * R.three);
  const colors = new Float32Array(count * R.three);
  const sizes = new Float32Array(count);

  for (let i = 0; i < count; i += 1) {
    const planet = planets[i];
    const { raDeg, decDeg } = geocentricPlanetSkyCoords(planet, dateMs);
    const [x, y, z] = equatorialToCartesian(
      raDeg,
      decDeg,
      SKY3D_CONSTANTS.skySphereRadius * R.cutoutTargetRatio
    );
    const idx = i * R.three;
    positions[idx] = x;
    positions[idx + 1] = y;
    positions[idx + R.two] = z;

    const col = new THREE.Color(planet.colorHex);
    colors[idx] = col.r;
    colors[idx + 1] = col.g;
    colors[idx + R.two] = col.b;
    sizes[i] = planet.radiusPx * R.two;
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

export function Explorer3DCanvas({
  query,
  layers = [],
  activeFrame,
  activeSubtraction,
  locale,
  onSelectObject,
  centerRequest,
}: Explorer3DCanvasProps) {
  const copy = SKY_3D_COPY[locale];
  const containerRef = useRef<HTMLDivElement | null>(null);

  const [overlays, setOverlays] = useState<Record<Sky3DOverlayId, boolean>>({
    stars: true,
    "deep-sky": true,
    planets: true,
    "milky-way": true,
    grid: true,
    labels: true,
  });
  const [hygData, setHygData] = useState<HygStarDataset | null>(null);
  const [loadingStars, setLoadingStars] = useState(true);
  const [webglUnavailable, setWebglUnavailable] = useState(false);
  const [hoveredItem, setHoveredItem] = useState<SkyHoverInfo | null>(null);
  const [hudFov, setHudFov] = useState<number>(SKY3D_CONSTANTS.defaultFovDeg);
  const [projectedLabels, setProjectedLabels] = useState<ProjectedLabel[]>([]);

  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const overlaysRef = useRef(overlays);
  const localeRef = useRef(locale);
  const skyObjectsRef = useRef<{
    starsPoints: THREE.Points | null;
    deepSkyPoints: THREE.Points;
    planetPoints: THREE.Points;
    milkyWayBand: THREE.Points;
    gridGroup: THREE.Group;
  } | null>(null);
  const reticleGroupRef = useRef<THREE.Group | null>(null);
  const cutoutMatRef = useRef<THREE.MeshBasicMaterial | null>(null);
  const cutoutBorderMatRef = useRef<THREE.LineBasicMaterial | null>(null);
  const cutoutTextureRef = useRef<THREE.Texture | null>(null);
  const cutoutBaseSizeRef = useRef<number>(1);
  const planetCoordsRef = useRef<
    Array<{
      id: string;
      nameEn: string;
      nameEs: string;
      raDeg: number;
      decDeg: number;
      distPc: number;
      colorHex: string;
    }>
  >([]);

  useEffect(() => {
    overlaysRef.current = overlays;
  }, [overlays]);

  useEffect(() => {
    localeRef.current = locale;
  }, [locale]);

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

  useEffect(() => {
    if (!centerRequest) return;
    camStateRef.current.targetYaw =
      centerRequest.raDeg * SKY3D_CONSTANTS.degToRad + SKY3D_CONSTANTS.halfPi;
    camStateRef.current.targetPitch = Math.max(
      SKY3D_CONSTANTS.minPitchRad,
      Math.min(
        SKY3D_CONSTANTS.maxPitchRad,
        centerRequest.decDeg * SKY3D_CONSTANTS.degToRad
      )
    );
    if (typeof centerRequest.fovDeg === "number") {
      const nextFov = centerRequest.fovDeg;
      camStateRef.current.targetFov = nextFov;
      requestAnimationFrame(() => setHudFov(Math.round(nextFov)));
    }
  }, [centerRequest]);

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

    const nowMs = Date.now();
    planetCoordsRef.current = PLANETS_J2000.filter((p) => !p.isEarth).map(
      (planet) => {
        const { raDeg, decDeg, distAu } = geocentricPlanetSkyCoords(
          planet,
          nowMs
        );
        return {
          id: planet.id,
          nameEn: planet.nameEn,
          nameEs: planet.nameEs,
          raDeg,
          decDeg,
          distPc: distAu / SKY3D_CONSTANTS.auPerPc,
          colorHex: planet.colorHex,
        };
      }
    );

    const milkyWayBand = createSkyMilkyWayBand();
    const gridGroup = createSkyEquatorialGrid();
    const deepSkyPoints = createDeepSkyPoints();
    const planetPoints = createPlanetPoints(nowMs);
    const starsPoints = hygData ? createSkyStarsPoints(hygData) : null;

    const curOv = overlaysRef.current;
    milkyWayBand.visible = curOv["milky-way"];
    gridGroup.visible = curOv.grid;
    deepSkyPoints.visible = curOv["deep-sky"];
    planetPoints.visible = curOv.planets;
    if (starsPoints) starsPoints.visible = curOv.stars;

    skyObjectsRef.current = {
      starsPoints,
      deepSkyPoints,
      planetPoints,
      milkyWayBand,
      gridGroup,
    };

    scene.add(milkyWayBand);
    scene.add(gridGroup);
    scene.add(deepSkyPoints);
    scene.add(planetPoints);
    if (starsPoints) scene.add(starsPoints);

    const angularRad =
      SKY3D_CONSTANTS.skyCutoutMinAngularSizeDeg * SKY3D_CONSTANTS.degToRad;
    const basePlaneSize =
      R.two * SKY3D_CONSTANTS.skyCutoutDistance * Math.tan(angularRad * R.half);
    cutoutBaseSizeRef.current = basePlaneSize;

    const reticleGroup = new THREE.Group();
    const [cx, cy, cz] = equatorialToCartesian(
      0,
      0,
      SKY3D_CONSTANTS.skyCutoutDistance
    );
    reticleGroup.position.set(cx, cy, cz);
    reticleGroup.lookAt(0, 0, 0);

    const halfSize = basePlaneSize * R.half;
    const borderPts = [
      new THREE.Vector3(-halfSize, -halfSize, R.cutoutReticleZOffset),
      new THREE.Vector3(halfSize, -halfSize, R.cutoutReticleZOffset),
      new THREE.Vector3(halfSize, halfSize, R.cutoutReticleZOffset),
      new THREE.Vector3(-halfSize, halfSize, R.cutoutReticleZOffset),
      new THREE.Vector3(-halfSize, -halfSize, R.cutoutReticleZOffset),
    ];
    const borderGeo = new THREE.BufferGeometry().setFromPoints(borderPts);
    const borderMat = new THREE.LineBasicMaterial({
      color: R.losColorHex,
      transparent: true,
      opacity: R.reticleOpacity,
    });
    reticleGroup.add(new THREE.Line(borderGeo, borderMat));

    const cutoutGeo = new THREE.PlaneGeometry(basePlaneSize, basePlaneSize);
    const cutoutMat = new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: R.cutoutMeshOpacity,
      side: THREE.DoubleSide,
      visible: false,
    });
    reticleGroup.add(new THREE.Mesh(cutoutGeo, cutoutMat));
    scene.add(reticleGroup);

    reticleGroupRef.current = reticleGroup;
    cutoutMatRef.current = cutoutMat;
    cutoutBorderMatRef.current = borderMat;

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

      if (Math.abs(camera.fov - st.fov) > R.fovEpsilon) {
        camera.fov = st.fov;
        camera.updateProjectionMatrix();
      }

      camera.position.set(0, 0, 0);
      const dirX = Math.cos(st.pitch) * Math.sin(st.yaw);
      const dirY = Math.sin(st.pitch);
      const dirZ = Math.cos(st.pitch) * Math.cos(st.yaw);
      lookTarget.set(dirX, dirY, dirZ);
      camera.lookAt(lookTarget);

      const fovFactor = SKY3D_CONSTANTS.defaultFovDeg / st.fov;
      if (starsPoints) {
        const mat = starsPoints.material as THREE.ShaderMaterial;
        mat.uniforms.uFovFactor.value = Math.min(
          R.fovStarMax,
          Math.max(R.fovStarMin, fovFactor)
        );
      }
      const dsMat = deepSkyPoints.material as THREE.ShaderMaterial;
      dsMat.uniforms.uFovFactor.value = Math.min(
        R.fovStarMax,
        Math.max(R.fovStarMin, fovFactor)
      );
      const mwMat = milkyWayBand.material as THREE.ShaderMaterial;
      mwMat.uniforms.uFovFactor.value = Math.min(
        R.fovMwMax,
        Math.max(R.fovMwMin, fovFactor)
      );

      renderer.render(scene, camera);

      frameTick += 1;
      if (frameTick % R.three === 0) {
        const ov = overlaysRef.current;
        if (!ov.labels) {
          setProjectedLabels((prev) => (prev.length > 0 ? [] : prev));
          return;
        }

        const w = container.clientWidth;
        const h = container.clientHeight;
        const labels: ProjectedLabel[] = [];
        const curLocale = localeRef.current;

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

        if (ov["deep-sky"]) {
          for (const dso of DEEP_SKY_OBJECTS) {
            const [dx, dy, dz] = equatorialToCartesian(
              dso.raDeg,
              dso.decDeg,
              SKY3D_CONSTANTS.skySphereRadius * R.cutoutTargetRatio
            );
            pushLabel(dx, dy, dz, {
              id: `dso-${dso.id}`,
              label: curLocale === "es" ? dso.nameEs : dso.nameEn,
              kind: "deep-sky",
              color: dso.colorHex,
            });
          }
        }

        if (ov.planets) {
          for (const planet of planetCoordsRef.current) {
            const [px, py, pz] = equatorialToCartesian(
              planet.raDeg,
              planet.decDeg,
              SKY3D_CONSTANTS.skySphereRadius * R.cutoutTargetRatio
            );
            pushLabel(px, py, pz, {
              id: `planet-${planet.id}`,
              label: curLocale === "es" ? planet.nameEs : planet.nameEn,
              kind: "planet",
              color: planet.colorHex,
            });
          }
        }

        if (ov.stars && hygData) {
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

        setProjectedLabels(labels);
      }
    };

    animate();

    return () => {
      cancelAnimationFrame(rafId);
      resizeObserver.disconnect();
      if (cutoutTextureRef.current) {
        cutoutTextureRef.current.dispose();
        cutoutTextureRef.current = null;
      }
      skyObjectsRef.current = null;
      reticleGroupRef.current = null;
      cutoutMatRef.current = null;
      cutoutBorderMatRef.current = null;
      cameraRef.current = null;
      renderer.dispose();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
    };
  }, [hygData]);

  // Toggle sky overlays in-place without tearing down WebGL
  useEffect(() => {
    const objs = skyObjectsRef.current;
    if (!objs) return;
    if (objs.starsPoints) objs.starsPoints.visible = overlays.stars;
    objs.deepSkyPoints.visible = overlays["deep-sky"];
    objs.planetPoints.visible = overlays.planets;
    objs.milkyWayBand.visible = overlays["milky-way"];
    objs.gridGroup.visible = overlays.grid;
  }, [overlays]);

  // Reposition 3D cutout reticle in-place when coordinates or field size change
  useEffect(() => {
    const reticle = reticleGroupRef.current;
    if (!reticle) return;
    const fieldDeg = Math.max(
      SKY3D_CONSTANTS.skyCutoutMinAngularSizeDeg,
      Number(query.fieldSizeDeg) || SKY3D_CONSTANTS.skyCutoutMinAngularSizeDeg
    );
    const angularRad = fieldDeg * SKY3D_CONSTANTS.degToRad;
    const targetSize =
      R.two * SKY3D_CONSTANTS.skyCutoutDistance * Math.tan(angularRad * R.half);
    const scaleFactor = targetSize / cutoutBaseSizeRef.current;
    const [cx, cy, cz] = equatorialToCartesian(
      targetRaDeg,
      targetDecDeg,
      SKY3D_CONSTANTS.skyCutoutDistance
    );
    reticle.position.set(cx, cy, cz);
    reticle.lookAt(0, 0, 0);
    reticle.scale.setScalar(scaleFactor);
  }, [targetRaDeg, targetDecDeg, query.fieldSizeDeg, hygData]);

  // Update 3D cutout texture, layer opacity/tint & subtraction reticle in-place
  useEffect(() => {
    const mat = cutoutMatRef.current;
    const borderMat = cutoutBorderMatRef.current;
    if (borderMat) {
      borderMat.color.setHex(
        activeSubtraction ? R.reticleSubtractHex : R.losColorHex
      );
    }
    if (!mat) return;

    const activeLayer = layers.find((l) => l.visible) ?? layers[0];
    const layerVisible = activeLayer ? activeLayer.visible : true;
    const layerOpacity = activeLayer
      ? activeLayer.opacity / R.percentDivisor
      : R.cutoutMeshOpacity;
    const tintHex = activeLayer ? TINT_HEX[activeLayer.tint] : "#ffffff";

    mat.opacity = layerOpacity;
    mat.color.set(activeSubtraction ? "#ffffff" : tintHex);

    if (!cutoutImageUrl || !layerVisible) {
      mat.visible = false;
      mat.needsUpdate = true;
      return;
    }

    const loader = new THREE.TextureLoader();
    loader.setCrossOrigin("anonymous");
    const nextTex = loader.load(cutoutImageUrl, (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace;
      if (cutoutTextureRef.current && cutoutTextureRef.current !== tex) {
        cutoutTextureRef.current.dispose();
      }
      cutoutTextureRef.current = tex;
      mat.map = tex;
      mat.visible = true;
      mat.needsUpdate = true;
    });
    if (nextTex.image) {
      mat.map = nextTex;
      mat.visible = true;
      mat.needsUpdate = true;
    }
  }, [cutoutImageUrl, activeSubtraction, layers, hygData]);

  const findNearestSkyObjectAtScreenPos = useCallback(
    (clientX: number, clientY: number): SkyHoverInfo | null => {
      const container = containerRef.current;
      const camera = cameraRef.current;
      if (!container || !camera) return null;

      const rect = container.getBoundingClientRect();
      const px = clientX - rect.left;
      const py = clientY - rect.top;
      const w = rect.width;
      const h = rect.height;
      const hitSq =
        SKY3D_CONSTANTS.starHitRadiusPx * SKY3D_CONSTANTS.starHitRadiusPx;
      const vec = new THREE.Vector3();

      let bestDistSq = hitSq;
      let bestMatch: SkyHoverInfo | null = null;

      const project = (
        raDeg: number,
        decDeg: number,
        radius: number
      ): [number, number] | null => {
        const [wx, wy, wz] = equatorialToCartesian(raDeg, decDeg, radius);
        vec.set(wx, wy, wz).project(camera);
        if (vec.z > 1) return null;
        return [(vec.x * R.half + R.half) * w, (-vec.y * R.half + R.half) * h];
      };

      if (overlays.planets) {
        for (const planet of planetCoordsRef.current) {
          const pt = project(
            planet.raDeg,
            planet.decDeg,
            SKY3D_CONSTANTS.skySphereRadius * R.cutoutTargetRatio
          );
          if (!pt) continue;
          const dx = pt[0] - px;
          const dy = pt[1] - py;
          const dSq = dx * dx + dy * dy;
          if (dSq < bestDistSq) {
            bestDistSq = dSq;
            bestMatch = {
              id: `planet-${planet.id}`,
              name: locale === "es" ? planet.nameEs : planet.nameEn,
              subtitle: locale === "es" ? "Planeta" : "Planet",
              raDeg: planet.raDeg,
              decDeg: planet.decDeg,
              distPc: planet.distPc,
              mag: 0,
              colorCss: planet.colorHex,
              kind: "planet",
              screenX: pt[0],
              screenY: pt[1],
            };
          }
        }
      }

      if (overlays["deep-sky"]) {
        for (const dso of DEEP_SKY_OBJECTS) {
          const pt = project(
            dso.raDeg,
            dso.decDeg,
            SKY3D_CONSTANTS.skySphereRadius * R.cutoutTargetRatio
          );
          if (!pt) continue;
          const dx = pt[0] - px;
          const dy = pt[1] - py;
          const dSq = dx * dx + dy * dy;
          if (dSq < bestDistSq) {
            bestDistSq = dSq;
            bestMatch = {
              id: `dso-${dso.id}`,
              name: locale === "es" ? dso.nameEs : dso.nameEn,
              subtitle: locale === "es" ? dso.kindEs : dso.kindEn,
              raDeg: dso.raDeg,
              decDeg: dso.decDeg,
              distPc: dso.distPc,
              mag: dso.mag,
              colorCss: dso.colorHex,
              kind: "deep-sky",
              screenX: pt[0],
              screenY: pt[1],
            };
          }
        }
      }

      if (overlays.stars && hygData) {
        for (const [raDeg, decDeg, distPc, mag, ci] of hygData.stars) {
          const pt = project(raDeg, decDeg, SKY3D_CONSTANTS.skySphereRadius);
          if (!pt) continue;
          const dx = pt[0] - px;
          const dy = pt[1] - py;
          const dSq = dx * dx + dy * dy;
          if (dSq < bestDistSq) {
            bestDistSq = dSq;
            let starName: string | null = null;
            for (const [name, nRa, nDec] of hygData.named) {
              if (
                Math.abs(nRa - raDeg) < R.namedStarMatchToleranceDeg &&
                Math.abs(nDec - decDeg) < R.namedStarMatchToleranceDeg
              ) {
                starName = name;
                break;
              }
            }
            const [r, g, b] = bvToRgb(ci);
            bestMatch = {
              id: `star-${raDeg.toFixed(R.three)}-${decDeg.toFixed(R.three)}`,
              name: starName ?? copy.unnamedStar,
              subtitle: bvToSpectralClass(ci),
              raDeg,
              decDeg,
              distPc,
              mag,
              colorCss: `rgb(${Math.round(r * R.rgbScale)}, ${Math.round(g * R.rgbScale)}, ${Math.round(b * R.rgbScale)})`,
              kind: "star",
              screenX: pt[0],
              screenY: pt[1],
            };
          }
        }
      }

      return bestMatch;
    },
    [hygData, overlays, locale, copy.unnamedStar]
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
      setHoveredItem(findNearestSkyObjectAtScreenPos(e.clientX, e.clientY));
      return;
    }

    const dx = e.clientX - st.lastX;
    const dy = e.clientY - st.lastY;
    st.lastX = e.clientX;
    st.lastY = e.clientY;
    st.dragDistance += Math.hypot(dx, dy);
    if (st.dragDistance > SKY3D_CONSTANTS.clickDragThresholdPx) {
      setHoveredItem(null);
    }

    const fovScale = st.fov / SKY3D_CONSTANTS.defaultFovDeg;
    const sens = SKY3D_CONSTANTS.dragSensitivity * fovScale;
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
      const hit = findNearestSkyObjectAtScreenPos(e.clientX, e.clientY);
      if (hit && onSelectObject) {
        onSelectObject({
          kind: hit.kind,
          id: hit.id,
          name: hit.name,
          subtitle: hit.subtitle,
          raDeg: hit.raDeg,
          decDeg: hit.decDeg,
          raDisplay: formatRaSexagesimal(hit.raDeg),
          decDisplay: formatDecSexagesimal(hit.decDeg),
          distPc: hit.distPc,
          mag: hit.kind === "planet" ? undefined : hit.mag,
          colorCss: hit.colorCss,
        });
      }
    }
  };

  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    const st = camStateRef.current;
    const nextFov = Math.max(
      SKY3D_CONSTANTS.minFovDeg,
      Math.min(
        SKY3D_CONSTANTS.maxFovDeg,
        st.targetFov + e.deltaY * SKY3D_CONSTANTS.zoomFovWheelSensitivity
      )
    );
    st.targetFov = nextFov;
    setHudFov(Math.round(nextFov));
  };

  const handleSelectTarget = (target: Sky3DTarget) => {
    if (onSelectObject) {
      onSelectObject({
        kind: "target",
        id: target.id,
        name: target.name,
        subtitle: target.category,
        raDeg: target.raDeg,
        decDeg: target.decDeg,
        raDisplay: target.raDisplay,
        decDisplay: target.decDisplay,
        distPc: target.distPc,
        colorCss: "#5b8fd9",
      });
    }
    aimCameraAtSkyCoords(
      target.raDeg,
      target.decDeg,
      SKY3D_CONSTANTS.telescopeFovDeg
    );
  };

  const toggleOverlay = (id: Sky3DOverlayId) => {
    setOverlays((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <div
      className="relative flex-1 overflow-hidden bg-[#030712] select-none"
      data-testid="explorer-3d-canvas"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={() => setHoveredItem(null)}
      onWheel={handleWheel}
    >
      <div
        ref={containerRef}
        className={`absolute inset-0 ${hoveredItem ? "cursor-pointer" : "cursor-grab active:cursor-grabbing"}`}
      />

      {webglUnavailable && (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 text-center text-[var(--ae-text-secondary)]">
          <p className="text-[length:var(--ae-text-base)] font-medium text-[var(--ae-text-primary)]">
            {copy.webglFallbackTitle}
          </p>
          <p className="max-w-sm text-[length:var(--ae-text-sm)] text-[var(--ae-text-muted)]">
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
                className="absolute -translate-x-1/2 -translate-y-full pb-1 text-xs tracking-wide text-[var(--ae-text-secondary)] drop-shadow"
              >
                {item.label}
              </div>
            );
          }

          if (item.kind === "deep-sky" || item.kind === "planet") {
            return (
              <div
                key={item.id}
                style={{ left: item.x, top: item.y }}
                className="absolute -translate-x-1/2 -translate-y-full pb-1.5"
              >
                <span
                  className="rounded-full border border-[var(--ae-border-strong)] bg-[var(--ae-bg-surface)]/90 px-2 py-0.5 text-xs font-medium"
                  style={item.color ? { color: item.color } : undefined}
                >
                  {item.label}
                </span>
              </div>
            );
          }

          return (
            <button
              key={item.id}
              type="button"
              onPointerDown={(ev) => ev.stopPropagation()}
              onClick={(ev) => {
                ev.stopPropagation();
                if (item.target) handleSelectTarget(item.target);
              }}
              style={{ left: item.x, top: item.y }}
              className="pointer-events-auto absolute -translate-x-1/2 -translate-y-1/2 flex items-center gap-1.5 rounded-full border border-[var(--ae-accent-primary)] bg-[var(--ae-bg-surface)]/90 px-3 py-1 text-xs font-medium text-[var(--ae-text-primary)] shadow-lg backdrop-blur-md transition hover:bg-[var(--ae-bg-hover)]"
            >
              <span className="h-2 w-2 rounded-full bg-[var(--ae-accent-primary)]" />
              <span>{item.label}</span>
              {item.sublabel && (
                <span className="text-xs text-[var(--ae-text-muted)]">
                  {item.sublabel}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="pointer-events-none absolute top-4 left-4 flex flex-col gap-2">
        <div className="pointer-events-auto flex items-center gap-3 rounded-[var(--ae-radius-md)] border border-[var(--ae-border-subtle)] bg-[var(--ae-bg-surface)]/90 px-3 py-1.5 text-[length:var(--ae-text-sm)] text-[var(--ae-text-primary)] backdrop-blur-md">
          <span className="font-mono">
            {copy.raLabel} {targetRaDeg.toFixed(R.two)}° {copy.decLabel}{" "}
            {targetDecDeg.toFixed(R.two)}°
          </span>
          <span className="border-l border-[var(--ae-border-subtle)] pl-2.5 font-mono text-[var(--ae-accent-primary)]">
            {copy.fovLabel} {hudFov}°
          </span>
          {(activeSubtraction || activeFrame) && (
            <span
              data-testid="hud-active-frame"
              className="border-l border-[var(--ae-border-subtle)] pl-2.5 font-mono text-[var(--ae-text-secondary)]"
            >
              {activeSubtraction
                ? (activeSubtraction.summary ?? copy.activeSubtraction)
                : `${activeFrame?.timestamp} | ${activeFrame?.band}`}
            </span>
          )}
        </div>

        {loadingStars && (
          <div className="flex items-center gap-2 rounded-[var(--ae-radius-md)] border border-[var(--ae-border-subtle)] bg-[var(--ae-bg-surface)]/85 px-3 py-1 text-[length:var(--ae-text-sm)] text-[var(--ae-text-muted)] backdrop-blur-md">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-[var(--ae-accent-primary)]" />
            <span>{copy.loadingCatalog}</span>
          </div>
        )}
      </div>

      <div
        className="absolute top-4 right-4 flex items-center gap-2"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={() =>
            aimCameraAtSkyCoords(
              targetRaDeg,
              targetDecDeg,
              SKY3D_CONSTANTS.defaultFovDeg
            )
          }
          className="rounded-[var(--ae-radius-md)] border border-[var(--ae-border-subtle)] bg-[var(--ae-bg-surface)]/90 px-3 py-1.5 text-[length:var(--ae-text-sm)] font-medium text-[var(--ae-text-primary)] backdrop-blur-md transition hover:border-[var(--ae-border-strong)] hover:bg-[var(--ae-bg-hover)]"
        >
          {copy.recenterTarget}
        </button>
        <button
          type="button"
          onClick={() =>
            aimCameraAtSkyCoords(
              targetRaDeg,
              targetDecDeg,
              SKY3D_CONSTANTS.telescopeFovDeg
            )
          }
          className="rounded-[var(--ae-radius-md)] border border-[var(--ae-border-subtle)] bg-[var(--ae-bg-surface)]/90 px-3 py-1.5 text-[length:var(--ae-text-sm)] font-medium text-[var(--ae-text-primary)] backdrop-blur-md transition hover:border-[var(--ae-border-strong)] hover:bg-[var(--ae-bg-hover)]"
        >
          {copy.telescopeView}
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
          className="rounded-[var(--ae-radius-md)] border border-[var(--ae-border-subtle)] bg-[var(--ae-bg-surface)]/90 px-3 py-1.5 text-[length:var(--ae-text-sm)] font-medium text-[var(--ae-text-primary)] backdrop-blur-md transition hover:border-[var(--ae-border-strong)] hover:bg-[var(--ae-bg-hover)]"
        >
          {copy.wideSkyView}
        </button>
      </div>

      {hoveredItem && (
        <div
          style={{
            left: hoveredItem.screenX + R.tooltipOffsetX,
            top: hoveredItem.screenY - R.tooltipOffsetY,
          }}
          className="pointer-events-none absolute z-20 rounded-[var(--ae-radius-md)] border border-[var(--ae-border-strong)] bg-[var(--ae-bg-surface)]/95 px-3 py-2 text-[length:var(--ae-text-sm)] text-[var(--ae-text-primary)] shadow-lg backdrop-blur-md"
        >
          <div className="flex items-center gap-2 font-medium">
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: hoveredItem.colorCss }}
            />
            <span>{hoveredItem.name}</span>
          </div>
          <div className="mt-0.5 font-mono text-xs text-[var(--ae-text-secondary)]">
            {hoveredItem.subtitle}
            {hoveredItem.kind !== "planet" &&
              ` ${copy.magnitudeLabel} ${hoveredItem.mag.toFixed(R.two)}`}
          </div>
        </div>
      )}

      {/* Bottom Sky Overlays Dock */}
      <div
        className="absolute bottom-4 left-1/2 flex -translate-x-1/2 flex-col items-center gap-1.5"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div
          className="flex items-center gap-1 rounded-full border border-[var(--ae-border-strong)] bg-[var(--ae-bg-surface)]/90 p-1 shadow-xl backdrop-blur-md"
          role="group"
          aria-label="3D Sky Overlays"
        >
          {OVERLAY_ORDER.map((id) => {
            const active = overlays[id];
            return (
              <button
                key={id}
                type="button"
                aria-pressed={active}
                onClick={() => toggleOverlay(id)}
                className={`rounded-full px-3 py-1 text-[length:var(--ae-text-sm)] font-medium transition ${
                  active
                    ? "bg-[var(--ae-accent-primary)] text-[var(--ae-accent-primary-content)]"
                    : "text-[var(--ae-text-secondary)] hover:bg-[var(--ae-bg-hover)] hover:text-[var(--ae-text-primary)]"
                }`}
              >
                {copy.overlays[id]}
              </button>
            );
          })}
        </div>
        <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-[var(--ae-text-muted)]">
          <span>{copy.dragHint}</span>
          <span>{copy.scrollHint}</span>
          <span>{copy.starClickHint}</span>
        </div>
      </div>

      {!loadingStars && (
        <div className="pointer-events-none absolute bottom-4 left-4 text-xs text-[var(--ae-text-muted)] opacity-75">
          {copy.catalogAttribution}
        </div>
      )}
    </div>
  );
}
