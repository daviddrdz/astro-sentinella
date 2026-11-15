import { useEffect, useMemo, useRef } from "react";
import { PORTAL_SPACE_CONFIG } from "../config/portalSpace";
import { parseDecToDegrees, parseRaToDegrees } from "../utils/coordinates";

interface PortalSpaceBackdropProps {
  ra: string;
  dec: string;
  fieldSizeDeg?: string;
}

interface CelestialStar {
  x: number;
  y: number;
  z: number;
  radius: number;
  depth: number;
  phase: number;
  color: string;
  isBright: boolean;
}

function createSeededRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state =
      (state + PORTAL_SPACE_CONFIG.math.prngAdd) |
      PORTAL_SPACE_CONFIG.math.zero;
    let t = Math.imul(
      state ^ (state >>> PORTAL_SPACE_CONFIG.math.prngShift15),
      PORTAL_SPACE_CONFIG.math.one | state
    );
    t =
      (t +
        Math.imul(
          t ^ (t >>> PORTAL_SPACE_CONFIG.math.prngShift7),
          PORTAL_SPACE_CONFIG.math.prngMul61 | t
        )) ^
      t;
    return (
      ((t ^ (t >>> PORTAL_SPACE_CONFIG.math.prngShift14)) >>>
        PORTAL_SPACE_CONFIG.math.zero) /
      PORTAL_SPACE_CONFIG.math.prngNorm
    );
  };
}

function pickStarColor(roll: number): string {
  if (roll > PORTAL_SPACE_CONFIG.math.paletteAmberThreshold) {
    return PORTAL_SPACE_CONFIG.colors.starAmber;
  }
  if (roll > PORTAL_SPACE_CONFIG.math.paletteBlueThreshold) {
    return PORTAL_SPACE_CONFIG.colors.starBlue;
  }
  if (roll < PORTAL_SPACE_CONFIG.math.paletteMutedThreshold) {
    return PORTAL_SPACE_CONFIG.colors.starMuted;
  }
  return PORTAL_SPACE_CONFIG.colors.starWhite;
}

function buildCelestialSphere(): CelestialStar[] {
  const rand = createSeededRandom(PORTAL_SPACE_CONFIG.seed);
  const stars: CelestialStar[] = [];
  const radiusSpan =
    PORTAL_SPACE_CONFIG.maxStarRadius - PORTAL_SPACE_CONFIG.minStarRadius;
  const depthSpan = PORTAL_SPACE_CONFIG.depthMax - PORTAL_SPACE_CONFIG.depthMin;

  for (
    let i = PORTAL_SPACE_CONFIG.math.zero;
    i < PORTAL_SPACE_CONFIG.starCount;
    i += PORTAL_SPACE_CONFIG.math.one
  ) {
    // Uniform distribution on unit sphere
    const theta = rand() * PORTAL_SPACE_CONFIG.math.fullCircleRad;
    const u =
      rand() * PORTAL_SPACE_CONFIG.math.two - PORTAL_SPACE_CONFIG.math.one;
    const sinPhi = Math.sqrt(
      Math.max(
        PORTAL_SPACE_CONFIG.math.zero,
        PORTAL_SPACE_CONFIG.math.one - u * u
      )
    );

    const isBright = rand() < PORTAL_SPACE_CONFIG.brightStarRatio;
    stars.push({
      x: sinPhi * Math.cos(theta),
      y: u,
      z: sinPhi * Math.sin(theta),
      radius: PORTAL_SPACE_CONFIG.minStarRadius + rand() * radiusSpan,
      depth: PORTAL_SPACE_CONFIG.depthMin + rand() * depthSpan,
      phase: rand() * PORTAL_SPACE_CONFIG.math.fullCircleRad,
      color: pickStarColor(rand()),
      isBright,
    });
  }

  return stars;
}

function shortestAngleDelta(targetRad: number, currentRad: number): number {
  const twoPi = PORTAL_SPACE_CONFIG.math.fullCircleRad;
  let diff = (targetRad - currentRad) % twoPi;
  if (diff > Math.PI) diff -= twoPi;
  if (diff < -Math.PI) diff += twoPi;
  return diff;
}

function computeZoomMultiplier(fieldSizeDeg?: string): number {
  const parsed = Number(fieldSizeDeg);
  if (!Number.isFinite(parsed) || parsed <= PORTAL_SPACE_CONFIG.math.zero) {
    return PORTAL_SPACE_CONFIG.math.one;
  }
  const clamped = Math.min(
    PORTAL_SPACE_CONFIG.maxFieldSizeDeg,
    Math.max(PORTAL_SPACE_CONFIG.minFieldSizeDeg, parsed)
  );
  const rawZoom = Math.pow(
    PORTAL_SPACE_CONFIG.defaultFieldSizeDeg / clamped,
    PORTAL_SPACE_CONFIG.zoomExponent
  );
  return Math.min(
    PORTAL_SPACE_CONFIG.zoomMaxMultiplier,
    Math.max(PORTAL_SPACE_CONFIG.zoomMinMultiplier, rawZoom)
  );
}

function createInitialAngles(): {
  raRad: number;
  decRad: number;
  zoomMultiplier: number;
} {
  return {
    raRad: PORTAL_SPACE_CONFIG.defaultRaDeg * PORTAL_SPACE_CONFIG.math.degToRad,
    decRad:
      PORTAL_SPACE_CONFIG.defaultDecDeg * PORTAL_SPACE_CONFIG.math.degToRad,
    zoomMultiplier: PORTAL_SPACE_CONFIG.math.one,
  };
}

export function PortalSpaceBackdrop({
  ra,
  dec,
  fieldSizeDeg,
}: PortalSpaceBackdropProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stars = useMemo(() => buildCelestialSphere(), []);

  const targetAnglesRef = useRef(createInitialAngles());
  const currentAnglesRef = useRef(createInitialAngles());

  useEffect(() => {
    const raDeg = parseRaToDegrees(ra);
    const decDeg = parseDecToDegrees(dec);

    if (raDeg !== null) {
      targetAnglesRef.current.raRad =
        (raDeg % PORTAL_SPACE_CONFIG.math.raFullCircleDeg) *
        PORTAL_SPACE_CONFIG.math.degToRad;
    }
    if (decDeg !== null) {
      targetAnglesRef.current.decRad =
        decDeg * PORTAL_SPACE_CONFIG.math.degToRad;
    }
    targetAnglesRef.current.zoomMultiplier =
      computeZoomMultiplier(fieldSizeDeg);
  }, [ra, dec, fieldSizeDeg]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return;
    }

    const prefersReducedMotion =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let animationFrameId: number = PORTAL_SPACE_CONFIG.math.zero;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };

    resize();
    window.addEventListener("resize", resize);

    const renderFrame = (timeMs: number) => {
      const width = canvas.width;
      const height = canvas.height;
      const halfW = width * PORTAL_SPACE_CONFIG.math.half;
      const halfH = height * PORTAL_SPACE_CONFIG.math.half;
      const focalLength =
        Math.max(width, height) * PORTAL_SPACE_CONFIG.fovScale;

      const dRa = shortestAngleDelta(
        targetAnglesRef.current.raRad,
        currentAnglesRef.current.raRad
      );
      const dDec =
        targetAnglesRef.current.decRad - currentAnglesRef.current.decRad;
      const angularDist = Math.hypot(dRa, dDec);

      const distRatio = Math.min(
        PORTAL_SPACE_CONFIG.math.one,
        angularDist / PORTAL_SPACE_CONFIG.travelAngleNormRad
      );
      const lerpFactor =
        PORTAL_SPACE_CONFIG.travelLerpMin +
        (PORTAL_SPACE_CONFIG.travelLerpMax -
          PORTAL_SPACE_CONFIG.travelLerpMin) *
          distRatio;

      if (prefersReducedMotion) {
        currentAnglesRef.current.raRad = targetAnglesRef.current.raRad;
        currentAnglesRef.current.decRad = targetAnglesRef.current.decRad;
        currentAnglesRef.current.zoomMultiplier =
          targetAnglesRef.current.zoomMultiplier;
      } else {
        currentAnglesRef.current.raRad += dRa * lerpFactor;
        currentAnglesRef.current.decRad += dDec * lerpFactor;
        currentAnglesRef.current.zoomMultiplier +=
          (targetAnglesRef.current.zoomMultiplier -
            currentAnglesRef.current.zoomMultiplier) *
          PORTAL_SPACE_CONFIG.zoomLerpFactor;
      }

      const isTraveling =
        !prefersReducedMotion &&
        angularDist > PORTAL_SPACE_CONFIG.travelStopThresholdRad;

      const cosYaw = Math.cos(currentAnglesRef.current.raRad);
      const sinYaw = Math.sin(currentAnglesRef.current.raRad);
      const cosPitch = Math.cos(currentAnglesRef.current.decRad);
      const sinPitch = Math.sin(currentAnglesRef.current.decRad);

      // Subtle bank/roll + forward zoom feel while slewing
      const rollAngle = isTraveling
        ? dRa * PORTAL_SPACE_CONFIG.rollTiltFactor
        : PORTAL_SPACE_CONFIG.math.zero;
      const cosRoll = Math.cos(rollAngle);
      const sinRoll = Math.sin(rollAngle);
      const dynamicFocal =
        focalLength *
        currentAnglesRef.current.zoomMultiplier *
        (PORTAL_SPACE_CONFIG.math.one +
          distRatio * PORTAL_SPACE_CONFIG.warpZoomBoost);

      ctx.fillStyle = PORTAL_SPACE_CONFIG.colors.canvas;
      ctx.fillRect(
        PORTAL_SPACE_CONFIG.math.zero,
        PORTAL_SPACE_CONFIG.math.zero,
        width,
        height
      );

      for (const star of stars) {
        // Rotate around Y (RA / yaw)
        const rx = star.x * cosYaw - star.z * sinYaw;
        const rz1 = star.x * sinYaw + star.z * cosYaw;

        // Rotate around X (Dec / pitch)
        const ry = star.y * cosPitch - rz1 * sinPitch;
        const rz = star.y * sinPitch + rz1 * cosPitch;

        if (rz <= PORTAL_SPACE_CONFIG.math.minProjectionZ) {
          continue;
        }

        // Apply subtle roll around camera Z-axis
        const rrx = rx * cosRoll - ry * sinRoll;
        const rry = rx * sinRoll + ry * cosRoll;

        const screenX = halfW + (rrx / rz) * dynamicFocal;
        const screenY = halfH - (rry / rz) * dynamicFocal;

        if (
          screenX < -PORTAL_SPACE_CONFIG.maxWarpTrailPx ||
          screenX > width + PORTAL_SPACE_CONFIG.maxWarpTrailPx ||
          screenY < -PORTAL_SPACE_CONFIG.maxWarpTrailPx ||
          screenY > height + PORTAL_SPACE_CONFIG.maxWarpTrailPx
        ) {
          continue;
        }

        const twinkle =
          PORTAL_SPACE_CONFIG.twinkleMinAlpha +
          (PORTAL_SPACE_CONFIG.twinkleMaxAlpha -
            PORTAL_SPACE_CONFIG.twinkleMinAlpha) *
            (PORTAL_SPACE_CONFIG.math.half +
              PORTAL_SPACE_CONFIG.math.half *
                Math.sin(
                  timeMs * PORTAL_SPACE_CONFIG.twinkleSpeed + star.phase
                ));

        ctx.save();
        ctx.globalAlpha = twinkle;
        ctx.fillStyle = star.color;
        ctx.strokeStyle = star.color;

        if (isTraveling) {
          const trailX = Math.max(
            -PORTAL_SPACE_CONFIG.maxWarpTrailPx,
            Math.min(
              PORTAL_SPACE_CONFIG.maxWarpTrailPx,
              -dRa * PORTAL_SPACE_CONFIG.warpTrailMultiplier * star.depth
            )
          );
          const trailY = Math.max(
            -PORTAL_SPACE_CONFIG.maxWarpTrailPx,
            Math.min(
              PORTAL_SPACE_CONFIG.maxWarpTrailPx,
              dDec * PORTAL_SPACE_CONFIG.warpTrailMultiplier * star.depth
            )
          );
          ctx.lineWidth = star.radius;
          ctx.beginPath();
          ctx.moveTo(screenX, screenY);
          ctx.lineTo(screenX - trailX, screenY - trailY);
          ctx.stroke();
        }

        if (star.isBright) {
          ctx.globalAlpha = twinkle * PORTAL_SPACE_CONFIG.brightStarHaloAlpha;
          ctx.beginPath();
          ctx.arc(
            screenX,
            screenY,
            star.radius * PORTAL_SPACE_CONFIG.brightStarHaloScale,
            PORTAL_SPACE_CONFIG.math.zero,
            PORTAL_SPACE_CONFIG.math.fullCircleRad
          );
          ctx.fill();
          ctx.globalAlpha = twinkle;
        }

        ctx.beginPath();
        ctx.arc(
          screenX,
          screenY,
          star.radius,
          PORTAL_SPACE_CONFIG.math.zero,
          PORTAL_SPACE_CONFIG.math.fullCircleRad
        );
        ctx.fill();
        ctx.restore();
      }

      animationFrameId = window.requestAnimationFrame(renderFrame);
    };

    animationFrameId = window.requestAnimationFrame(renderFrame);

    return () => {
      window.cancelAnimationFrame(animationFrameId);
      window.removeEventListener("resize", resize);
    };
  }, [stars]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      data-testid="portal-space-backdrop"
      className="pointer-events-none fixed inset-0 z-0 h-full w-full"
    />
  );
}
