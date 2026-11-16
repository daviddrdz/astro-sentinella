import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Loader2, RotateCw } from "lucide-react";
import {
  EXPLORER_CONFIG,
  EXPLORER_COPY,
  SPECTRUM_CHART,
} from "../../config/explorer";
import type {
  ChannelTintId,
  ChunkBounds,
  ExplorerFrame,
  ExplorerLayer,
  ExplorerLocale,
  ExplorerToolId,
  SubtractionResult,
} from "../../types/explorer";
import type { QueryParams } from "../../types/portal";
import { clamp01, containedBox, type Size } from "../../utils/spectrum";
import { formatAngularSeparation } from "../../utils/frameMetrics";
import {
  formatDecSexagesimal,
  formatRaSexagesimal,
  parseSexagesimalDecDeg,
  parseSexagesimalRaDeg,
  SKY3D_CONSTANTS,
} from "../../config/sky3dCatalog";

const DEFAULT_FIELD_SIZE_DEG = 0.5;
const RULER_MAX_POINTS = 2;
const RULER_HALF = 0.5;
const RULER_PCT = 100;
const ZOOM_OUT_OUTER_RING_THRESHOLD = 0.92;
const TILE_OUTER_RADIUS = 2;
const TILE_OFFSETS = [-TILE_OUTER_RADIUS, -1, 0, 1, TILE_OUTER_RADIUS] as const;
const TILE_INNER_RADIUS = 1;
const MIN_COS_DEC = 0.15;
const MAX_ABS_DEC_DEG = 89.5;
const FULL_CIRCLE_DEG = 360;

interface ExplorerCanvasProps {
  query: QueryParams;
  layers: ExplorerLayer[];
  activeFrame: ExplorerFrame | null;
  activeSubtraction?: SubtractionResult | null;
  activeTool: ExplorerToolId;
  zoomLevel: number;
  panOffset: { x: number; y: number };
  locale: ExplorerLocale;
  onPanChange: (next: { x: number; y: number }) => void;
  onZoomChange: (nextZoom: number) => void;
  onCanvasClick: () => void;
  /** Chunk grid learned from the last spectrum response (cells are invisible). */
  spectrumGrid?: { rows: number; cols: number } | null;
  selectedChunk?: ChunkBounds | null;
  pendingChunkClick?: { x: number; y: number } | null;
  onChunkSelect?: (x: number, y: number) => void;
}

type ImageSourceCarrier = {
  imageUrl?: string;
  url?: string;
  src?: string;
};

const TINT_HEX: Record<ChannelTintId, string> = {
  grey: "#94A3B8",
  viridis: "#21918C",
  magma: "#B5367A",
  inferno: "#F98E09",
  cividis: "#7C8770",
  cubehelix: "#6890C8",
};

function getTintHex(tintId: ExplorerLayer["tint"]): string {
  return TINT_HEX[tintId] ?? "#4BA39B";
}

function buildFilterCss(): string {
  return "none";
}

function mapBlendMode(
  blendMode: ExplorerLayer["blendMode"]
): "normal" | "difference" | "screen" | "lighten" {
  switch (blendMode) {
    case "Subtract":
      return "difference";
    case "Screen":
      return "screen";
    case "Add":
      return "lighten";
    case "Normal":
      return "normal";
  }
}

function resolveLayerImageUrl(
  layer: ExplorerLayer,
  activeFrame: ExplorerFrame | null
): string | null {
  const layerSource = layer as ExplorerLayer & ImageSourceCarrier;
  const frameSource = activeFrame as
    (ExplorerFrame & ImageSourceCarrier) | null;

  return (
    layerSource.imageUrl ??
    layerSource.url ??
    layerSource.src ??
    frameSource?.imageUrl ??
    frameSource?.url ??
    frameSource?.src ??
    null
  );
}

export function ExplorerCanvas({
  query,
  layers,
  activeFrame,
  activeSubtraction = null,
  activeTool,
  zoomLevel,
  panOffset,
  locale,
  onPanChange,
  onZoomChange,
  onCanvasClick,
  spectrumGrid = null,
  selectedChunk = null,
  pendingChunkClick = null,
  onChunkSelect,
}: ExplorerCanvasProps) {
  const copy = EXPLORER_COPY[locale];
  const visibleLayers = layers.filter((layer) => layer.visible);
  const primaryLayer = visibleLayers[0] ?? layers[0];
  const primaryTint = primaryLayer?.tint ?? "grey";
  const primaryTintHex = getTintHex(primaryTint);
  const primaryOpacity = primaryLayer
    ? primaryLayer.opacity / EXPLORER_CONFIG.opacityMax
    : 1;
  const scaleArcmin = (EXPLORER_CONFIG.defaultScaleArcmin / zoomLevel).toFixed(
    EXPLORER_CONFIG.firstIndex
  );

  const [isDragging, setIsDragging] = useState(false);
  const dragStateRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
    moved: boolean;
  } | null>(null);

  const [statusByUrl, setStatusByUrl] = useState<
    Record<string, "loading" | "loaded" | "error">
  >({});
  const [retryCountByUrl, setRetryCountByUrl] = useState<
    Record<string, number>
  >({});
  const [loadingPct, setLoadingPct] = useState<number>(
    EXPLORER_CONFIG.progressInitialPct
  );
  const frameRef = useRef<HTMLDivElement>(null);
  const [frameSize, setFrameSize] = useState<Size | null>(null);
  const [naturalSize, setNaturalSize] = useState<Size | null>(null);
  const [hoverCell, setHoverCell] = useState<{
    row: number;
    col: number;
  } | null>(null);
  const [rulerPoints, setRulerPoints] = useState<
    Array<{ x: number; y: number }>
  >([]);
  const [tileStatus, setTileStatus] = useState<
    Record<string, "loading" | "loaded" | "error">
  >({});

  const showSurroundingSectors = !activeSubtraction;

  // Unscaled layout size of the frame box; the zoom transform is applied on top.
  useEffect(() => {
    const element = frameRef.current;
    if (!element) {
      return;
    }
    const measure = () =>
      setFrameSize({
        width: element.offsetWidth,
        height: element.offsetHeight,
      });
    measure();
    if (typeof ResizeObserver === "undefined") {
      return;
    }
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const primaryUrl = activeFrame?.imageUrl ?? null;
  const primaryRetry = primaryUrl
    ? (retryCountByUrl[primaryUrl] ?? EXPLORER_CONFIG.firstIndex)
    : EXPLORER_CONFIG.firstIndex;
  const primaryKey = primaryUrl ? `${primaryUrl}#${primaryRetry}` : null;
  const primaryStatus = primaryKey
    ? (statusByUrl[primaryKey] ?? "loading")
    : "loaded";

  const obsDateForTiles = (
    activeFrame?.timestamp ?? query.observationDate
  ).trim();
  const canLoadNeighborTiles = !primaryUrl || primaryStatus === "loaded";
  const maxRing =
    zoomLevel < ZOOM_OUT_OUTER_RING_THRESHOLD
      ? TILE_OFFSETS[TILE_OFFSETS.length - 1]
      : TILE_INNER_RADIUS;

  const surroundingTiles = showSurroundingSectors
    ? (() => {
        const centerRa = parseSexagesimalRaDeg(query.ra);
        const centerDec = parseSexagesimalDecDeg(query.dec);
        const fieldDeg = Number(query.fieldSizeDeg) || DEFAULT_FIELD_SIZE_DEG;
        const cosDec = Math.max(
          MIN_COS_DEC,
          Math.cos(centerDec * SKY3D_CONSTANTS.degToRad)
        );
        const isRemoteSource =
          Boolean(primaryUrl) &&
          (primaryUrl!.includes("/image") ||
            primaryUrl!.startsWith("/api/") ||
            primaryUrl!.startsWith("http"));
        const tiles: Array<{
          key: string;
          statusKey: string;
          col: number;
          row: number;
          raDisplay: string;
          decDisplay: string;
          imageUrl: string | null;
        }> = [];
        for (const row of TILE_OFFSETS) {
          for (const col of TILE_OFFSETS) {
            if (col === 0 && row === 0) continue;
            if (Math.abs(col) > maxRing || Math.abs(row) > maxRing) continue;
            const nDec = Math.max(
              -MAX_ABS_DEC_DEG,
              Math.min(MAX_ABS_DEC_DEG, centerDec - row * fieldDeg)
            );
            const nRa =
              (((centerRa - (col * fieldDeg) / cosDec) % FULL_CIRCLE_DEG) +
                FULL_CIRCLE_DEG) %
              FULL_CIRCLE_DEG;
            const raDisplay = formatRaSexagesimal(nRa);
            const decDisplay = formatDecSexagesimal(nDec);
            let imageUrl: string | null = null;
            if (canLoadNeighborTiles && isRemoteSource && obsDateForTiles) {
              const params = new URLSearchParams({
                ra: raDisplay,
                dec: decDisplay,
                fieldSizeDeg: String(fieldDeg),
                observationDate: obsDateForTiles,
              });
              imageUrl = `${EXPLORER_CONFIG.framesEndpoint}/image?${params.toString()}`;
            }
            const key = `${col}:${row}`;
            tiles.push({
              key,
              statusKey: `${key}:${obsDateForTiles}`,
              col,
              row,
              raDisplay,
              decDisplay,
              imageUrl,
            });
          }
        }
        return tiles;
      })()
    : [];

  useEffect(() => {
    if (!primaryKey || primaryStatus !== "loading") {
      return;
    }
    const timer = window.setInterval(() => {
      setLoadingPct((prev) =>
        Math.min(
          EXPLORER_CONFIG.progressMaxPendingPct,
          prev + EXPLORER_CONFIG.progressStepPct
        )
      );
    }, EXPLORER_CONFIG.progressTickMs);

    return () => window.clearInterval(timer);
  }, [primaryKey, primaryStatus]);

  const handleRetryImage = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    if (!primaryUrl) {
      return;
    }
    setLoadingPct(EXPLORER_CONFIG.progressInitialPct);
    setRetryCountByUrl((prev) => ({
      ...prev,
      [primaryUrl]:
        (prev[primaryUrl] ?? EXPLORER_CONFIG.firstIndex) +
        EXPLORER_CONFIG.indexStep,
    }));
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLElement>) => {
    const canPan =
      activeTool === "hand" || event.button === EXPLORER_CONFIG.indexStep;
    if (!canPan) {
      return;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    dragStateRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: panOffset.x,
      originY: panOffset.y,
      moved: false,
    };
    setIsDragging(true);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLElement>) => {
    const drag = dragStateRef.current;
    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    if (!drag.moved && Math.hypot(dx, dy) > EXPLORER_CONFIG.dragThresholdPx) {
      drag.moved = true;
    }
    if (drag.moved) {
      onPanChange({ x: drag.originX + dx, y: drag.originY + dy });
    }
  };

  const finishDrag = (event: React.PointerEvent<HTMLElement>) => {
    const drag = dragStateRef.current;
    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    const wasMoved = drag.moved;
    dragStateRef.current = null;
    setIsDragging(false);
    if (!wasMoved) {
      onCanvasClick();
    }
  };

  const handleWheel = (event: React.WheelEvent<HTMLElement>) => {
    const nextZoom = Math.min(
      EXPLORER_CONFIG.zoomMax,
      Math.max(
        EXPLORER_CONFIG.zoomMin,
        zoomLevel *
          Math.exp(-event.deltaY * EXPLORER_CONFIG.wheelZoomSensitivity)
      )
    );
    onZoomChange(nextZoom);
  };

  const cursorClass =
    activeTool === "hand"
      ? isDragging
        ? "cursor-grabbing"
        : "cursor-grab"
      : activeTool === "zoom"
        ? "cursor-zoom-in"
        : "cursor-crosshair";

  return (
    <section
      aria-label="Telescope viewport"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={finishDrag}
      onPointerCancel={finishDrag}
      onWheel={handleWheel}
      onClick={() => {
        if (activeTool !== "hand") {
          onCanvasClick();
        }
      }}
      className={`relative flex flex-1 items-center justify-center overflow-hidden bg-[var(--ae-bg-canvas)] select-none touch-none ${cursorClass}`}
    >
      {/* Subtle astrometric grid */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-20"
        style={{
          backgroundImage:
            "linear-gradient(to right, var(--ae-border-subtle) 1px, transparent 1px), linear-gradient(to bottom, var(--ae-border-subtle) 1px, transparent 1px)",
          backgroundSize: "48px 48px",
        }}
      />

      {/* Stacked photogram layers or Compare subtraction view */}
      <div
        ref={frameRef}
        className={`relative aspect-square h-[78%] max-w-[86%] bg-[var(--ae-bg-canvas)] ${
          showSurroundingSectors
            ? "overflow-visible"
            : "overflow-hidden rounded-lg border border-[var(--ae-border-subtle)] shadow-2xl"
        } ${isDragging ? "" : "transition-transform duration-200"}`}
        style={{
          transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${zoomLevel})`,
        }}
      >
        {showSurroundingSectors && (
          <div
            data-testid="surrounding-sectors"
            className="pointer-events-none"
          >
            {surroundingTiles.map((tile) => {
              const status = tileStatus[tile.statusKey] ?? "loading";
              const isErrorOrMissing =
                status === "error" || (canLoadNeighborTiles && !tile.imageUrl);
              return (
                <div
                  key={tile.key}
                  style={{
                    left: `${tile.col * RULER_PCT}%`,
                    top: `${tile.row * RULER_PCT}%`,
                    opacity: primaryOpacity,
                  }}
                  className="absolute h-full w-full overflow-hidden bg-[var(--ae-bg-canvas)]"
                >
                  {tile.imageUrl && status !== "error" && (
                    <img
                      src={tile.imageUrl}
                      alt={`${tile.raDisplay} ${tile.decDisplay}`}
                      loading="lazy"
                      fetchPriority="low"
                      onLoad={() =>
                        setTileStatus((prev) => ({
                          ...prev,
                          [tile.statusKey]: "loaded",
                        }))
                      }
                      onError={() =>
                        setTileStatus((prev) => ({
                          ...prev,
                          [tile.statusKey]: "error",
                        }))
                      }
                      className={`h-full w-full object-cover transition-opacity duration-200 ${
                        status === "loaded" ? "opacity-100" : "opacity-0"
                      }`}
                    />
                  )}
                  {primaryTint !== "grey" &&
                    tile.imageUrl &&
                    status === "loaded" && (
                      <div
                        aria-hidden="true"
                        className="absolute inset-0"
                        style={{
                          backgroundColor: primaryTintHex,
                          mixBlendMode: "multiply",
                        }}
                      />
                    )}
                  {isErrorOrMissing && (
                    <div
                      data-testid={`sector-warning-${tile.key}`}
                      className="flex h-full w-full flex-col items-center justify-center gap-1.5 bg-[var(--ae-bg-surface)]/45 px-3 text-center"
                    >
                      <AlertTriangle
                        className="h-5 w-5 text-[var(--ae-status-warning)]"
                        aria-hidden="true"
                      />
                      <span className="text-xs font-medium text-[var(--ae-text-muted)]">
                        {copy.sectorNotFoundForDate}
                      </span>
                    </div>
                  )}
                </div>
              );
            })}

            {/* Delineating grid lines and sector info overlaid ON TOP of seamless tiles */}
            <div className="pointer-events-none absolute inset-0 z-10">
              {surroundingTiles.map((tile) => (
                <div
                  key={`overlay-${tile.key}`}
                  style={{
                    left: `${tile.col * RULER_PCT}%`,
                    top: `${tile.row * RULER_PCT}%`,
                  }}
                  className="absolute h-full w-full border border-[var(--ae-border-strong)]/60"
                >
                  <span className="absolute top-2 left-2 rounded bg-[var(--ae-bg-base)]/75 px-1.5 py-0.5 font-mono text-xs text-[var(--ae-text-secondary)]">
                    {`${tile.raDisplay} ${tile.decDisplay}`}
                  </span>
                </div>
              ))}
              <div className="absolute inset-0 border border-[var(--ae-accent-primary)]/70" />
            </div>
          </div>
        )}
        {activeSubtraction ? (
          <div className="relative flex h-full w-full items-center justify-center bg-[var(--ae-bg-elevated)]/40 p-4">
            <div className="pointer-events-none absolute top-3 left-3 z-10 rounded border border-[var(--ae-border-strong)] bg-[var(--ae-bg-base)]/85 px-2.5 py-1 font-mono text-xs text-[var(--ae-text-primary)]">
              {`${activeSubtraction.frameA.timestamp} - ${activeSubtraction.frameB.timestamp}`}
            </div>

            {activeSubtraction.status === "loading" && (
              <div
                data-testid="compare-skeleton"
                className="relative flex h-full w-full flex-col items-center justify-center gap-3 overflow-hidden rounded-lg border border-[var(--ae-primary)]/30 bg-[var(--ae-bg-elevated)]/60 p-6 shadow-[inset_0_0_40px_rgba(56,189,248,0.12)]"
              >
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-0 animate-pulse bg-gradient-to-br from-[var(--ae-primary)]/10 via-[var(--ae-bg-elevated)]/40 to-[var(--ae-accent)]/10"
                />
                <div className="relative z-10 flex items-center gap-2 text-sm font-medium text-[var(--ae-text-primary)]">
                  <Loader2
                    size={EXPLORER_CONFIG.iconSizeMd}
                    className="animate-spin text-[var(--ae-primary)]"
                    aria-hidden="true"
                  />
                  <span>{copy.comparingSkeleton}</span>
                </div>
              </div>
            )}

            {activeSubtraction.status === "ready" && (
              <>
                {activeSubtraction.imageUrl ? (
                  <img
                    src={activeSubtraction.imageUrl}
                    alt={`${activeSubtraction.frameA.timestamp} minus ${activeSubtraction.frameB.timestamp}`}
                    draggable={false}
                    className="h-full w-full object-contain"
                  />
                ) : (
                  <div className="rounded-lg border border-[var(--ae-border-subtle)] bg-[var(--ae-bg-base)]/90 px-4 py-3 text-center text-sm text-[var(--ae-text-primary)]">
                    {activeSubtraction.summary}
                  </div>
                )}
              </>
            )}

            {activeSubtraction.status === "error" && (
              <div className="flex max-w-sm flex-col items-center gap-2 rounded-lg border border-amber-500/40 bg-[var(--ae-bg-base)]/90 p-5 text-center">
                <AlertTriangle
                  size={EXPLORER_CONFIG.iconSizeLg}
                  className="text-amber-300"
                  aria-hidden="true"
                />
                <p className="text-sm font-medium text-[var(--ae-text-primary)]">
                  {copy.compareFailed}
                </p>
                {activeSubtraction.errorMessage && (
                  <p className="font-mono text-xs text-[var(--ae-text-muted)]">
                    {activeSubtraction.errorMessage}
                  </p>
                )}
              </div>
            )}
          </div>
        ) : (
          visibleLayers.map((layer) => {
            const tintHex = getTintHex(layer.tint);
            const opacityValue = layer.opacity / EXPLORER_CONFIG.opacityMax;
            const imageUrl = resolveLayerImageUrl(layer, activeFrame);

            return (
              <div
                key={layer.id}
                data-testid={`canvas-layer-${layer.id}`}
                className="pointer-events-none absolute inset-0 transition-opacity duration-150"
                style={{
                  opacity: opacityValue,
                  mixBlendMode: mapBlendMode(layer.blendMode),
                  filter: buildFilterCss(),
                }}
              >
                {imageUrl ? (
                  <div className="relative h-full w-full">
                    {(() => {
                      const retryNum =
                        retryCountByUrl[imageUrl] ?? EXPLORER_CONFIG.firstIndex;
                      const cacheKey = `${imageUrl}#${retryNum}`;
                      const imgStatus = statusByUrl[cacheKey] ?? "loading";
                      const srcWithRetry =
                        retryNum > EXPLORER_CONFIG.firstIndex
                          ? `${imageUrl}&retry=${retryNum}`
                          : imageUrl;
                      return (
                        <img
                          key={cacheKey}
                          src={srcWithRetry}
                          alt={`${layer.code} astronomical cutout`}
                          draggable={false}
                          onLoad={(event) => {
                            const img = event.currentTarget;
                            if (img.naturalWidth > 0 && img.naturalHeight > 0) {
                              setNaturalSize({
                                width: img.naturalWidth,
                                height: img.naturalHeight,
                              });
                            }
                            setStatusByUrl((prev) => ({
                              ...prev,
                              [cacheKey]: "loaded",
                            }));
                          }}
                          onError={() => {
                            setStatusByUrl((prev) => ({
                              ...prev,
                              [cacheKey]: "error",
                            }));
                          }}
                          className={`h-full w-full object-cover transition-opacity duration-200 ${
                            imgStatus === "loaded" ? "opacity-100" : "opacity-0"
                          }`}
                        />
                      );
                    })()}
                    {/* Channel tint overlay preserving dark sky background */}
                    {layer.tint !== "grey" && (
                      <div
                        aria-hidden="true"
                        className="absolute inset-0"
                        style={{
                          backgroundColor: tintHex,
                          mixBlendMode: "multiply",
                        }}
                      />
                    )}
                  </div>
                ) : (
                  <div
                    aria-hidden="true"
                    className="h-full w-full"
                    style={{
                      background: `radial-gradient(circle at 48% 50%, ${tintHex}44 0%, ${tintHex}18 32%, transparent 68%)`,
                    }}
                  />
                )}
              </div>
            );
          })
        )}

        {/* Glowing pulsing skeleton or error fallback for remote cutouts */}
        {!activeSubtraction && primaryUrl && primaryStatus === "loading" && (
          <div
            role="status"
            aria-live="polite"
            className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center overflow-hidden bg-[var(--ae-bg-canvas)]/75 backdrop-blur-[2px]"
          >
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-4 animate-pulse rounded-lg border border-[var(--ae-primary)]/25 bg-gradient-to-br from-[var(--ae-primary)]/12 via-[var(--ae-bg-elevated)]/45 to-[var(--ae-accent)]/10 shadow-[0_0_32px_rgba(56,189,248,0.12)]"
            />
            <div className="relative z-10 flex items-center gap-2 rounded-full border border-[var(--ae-border-subtle)] bg-[var(--ae-bg-base)]/80 px-3.5 py-1.5 text-sm font-medium text-[var(--ae-text-primary)] shadow-lg">
              <Loader2
                className="h-4 w-4 animate-spin text-[var(--ae-primary)]"
                aria-hidden="true"
              />
              <span>{copy.loadingFrame}</span>
              <span className="font-mono text-[var(--ae-primary)]">
                {`${loadingPct}%`}
              </span>
            </div>
          </div>
        )}

        {!activeSubtraction && primaryUrl && primaryStatus === "error" && (
          <div
            role="alert"
            className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[var(--ae-bg-canvas)]/80 px-4 text-center backdrop-blur-[2px]"
          >
            <AlertTriangle
              className="h-6 w-6 text-[var(--ae-warning)]"
              aria-hidden="true"
            />
            <p className="max-w-xs text-sm text-[var(--ae-text-secondary)]">
              {copy.frameUnavailable}
            </p>
            <button
              type="button"
              onClick={handleRetryImage}
              className="btn btn-sm gap-1.5 border border-[var(--ae-border-subtle)] bg-[var(--ae-bg-elevated)] text-[var(--ae-text-primary)] hover:border-[var(--ae-primary)]"
            >
              <RotateCw className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{copy.retryFrame}</span>
            </button>
          </div>
        )}

        {/* Central reticle temporarily removed */}

        {/* Active tool overlays */}
        {activeTool === "split" && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 left-1/2 w-0.5 bg-[var(--ae-accent)]/80"
          />
        )}
        {activeTool === "region" && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute top-1/4 left-1/4 h-1/2 w-1/2 border border-dashed border-[var(--ae-warning)]/80"
          />
        )}
        {activeTool === "spectrum" &&
          onChunkSelect &&
          primaryUrl &&
          primaryStatus === "loaded" &&
          frameSize &&
          naturalSize && (
            <div
              data-testid="chunk-overlay"
              className="absolute cursor-crosshair"
              style={containedBox(frameSize, naturalSize)}
              onClick={(event) => {
                event.stopPropagation();
                const rect = event.currentTarget.getBoundingClientRect();
                if (rect.width <= 0 || rect.height <= 0) {
                  return;
                }
                onChunkSelect(
                  clamp01((event.clientX - rect.left) / rect.width),
                  clamp01((event.clientY - rect.top) / rect.height)
                );
              }}
              onPointerMove={(event) => {
                if (!spectrumGrid) {
                  return;
                }
                const rect = event.currentTarget.getBoundingClientRect();
                if (rect.width <= 0 || rect.height <= 0) {
                  return;
                }
                const x = clamp01((event.clientX - rect.left) / rect.width);
                const y = clamp01((event.clientY - rect.top) / rect.height);
                setHoverCell({
                  row: Math.min(
                    Math.floor(y * spectrumGrid.rows),
                    spectrumGrid.rows - 1
                  ),
                  col: Math.min(
                    Math.floor(x * spectrumGrid.cols),
                    spectrumGrid.cols - 1
                  ),
                });
              }}
              onPointerLeave={() => setHoverCell(null)}
            >
              {spectrumGrid && hoverCell && (
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute border border-[var(--ae-text-primary)]/30"
                  style={{
                    left: `${(hoverCell.col / spectrumGrid.cols) * SPECTRUM_CHART.percent}%`,
                    top: `${(hoverCell.row / spectrumGrid.rows) * SPECTRUM_CHART.percent}%`,
                    width: `${SPECTRUM_CHART.percent / spectrumGrid.cols}%`,
                    height: `${SPECTRUM_CHART.percent / spectrumGrid.rows}%`,
                  }}
                />
              )}
              {selectedChunk && (
                <div
                  data-testid="selected-chunk"
                  aria-hidden="true"
                  className="pointer-events-none absolute border-2 border-[var(--ae-accent-primary)] bg-[var(--ae-accent-primary)]/10"
                  style={{
                    left: `${selectedChunk.left * SPECTRUM_CHART.percent}%`,
                    top: `${selectedChunk.top * SPECTRUM_CHART.percent}%`,
                    width: `${selectedChunk.width * SPECTRUM_CHART.percent}%`,
                    height: `${selectedChunk.height * SPECTRUM_CHART.percent}%`,
                  }}
                />
              )}
              {pendingChunkClick && (
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 animate-ping rounded-full bg-[var(--ae-accent-primary)]"
                  style={{
                    left: `${pendingChunkClick.x * SPECTRUM_CHART.percent}%`,
                    top: `${pendingChunkClick.y * SPECTRUM_CHART.percent}%`,
                  }}
                />
              )}
            </div>
          )}
        {activeTool === "ruler" && (
          <div
            data-testid="ruler-overlay"
            className="absolute inset-0 z-10 cursor-crosshair"
            onClick={(event) => {
              event.stopPropagation();
              const rect = event.currentTarget.getBoundingClientRect();
              if (rect.width <= 0 || rect.height <= 0) return;
              const pt = {
                x: clamp01((event.clientX - rect.left) / rect.width),
                y: clamp01((event.clientY - rect.top) / rect.height),
              };
              setRulerPoints((prev) =>
                prev.length >= RULER_MAX_POINTS ? [pt] : [...prev, pt]
              );
            }}
          >
            {rulerPoints.length === RULER_MAX_POINTS && (
              <svg
                aria-hidden="true"
                className="pointer-events-none h-full w-full"
                viewBox={`0 0 ${RULER_PCT} ${RULER_PCT}`}
                preserveAspectRatio="none"
              >
                <line
                  x1={rulerPoints[0].x * RULER_PCT}
                  y1={rulerPoints[0].y * RULER_PCT}
                  x2={rulerPoints[1].x * RULER_PCT}
                  y2={rulerPoints[1].y * RULER_PCT}
                  stroke="var(--ae-accent-primary)"
                  strokeWidth="0.4"
                  strokeDasharray="1.5 1"
                />
              </svg>
            )}
            {rulerPoints.map((pt, idx) => (
              <div
                key={`${idx}-${pt.x}-${pt.y}`}
                className="pointer-events-none absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-[var(--ae-accent-primary-content)] bg-[var(--ae-accent-primary)]"
                style={{
                  left: `${pt.x * RULER_PCT}%`,
                  top: `${pt.y * RULER_PCT}%`,
                }}
              />
            ))}
            {rulerPoints.length === RULER_MAX_POINTS ? (
              <div
                data-testid="ruler-readout"
                className="pointer-events-none absolute -translate-x-1/2 -translate-y-full rounded-[var(--ae-radius-sm)] border border-[var(--ae-border-strong)] bg-[var(--ae-bg-surface)]/95 px-2.5 py-1 font-mono text-xs font-medium text-[var(--ae-text-primary)] shadow"
                style={{
                  left: `${(rulerPoints[0].x + rulerPoints[1].x) * RULER_HALF * RULER_PCT}%`,
                  top: `${(rulerPoints[0].y + rulerPoints[1].y) * RULER_HALF * RULER_PCT}%`,
                }}
              >
                {`${copy.rulerSeparation}: ${formatAngularSeparation(
                  Math.hypot(
                    rulerPoints[1].x - rulerPoints[0].x,
                    rulerPoints[1].y - rulerPoints[0].y
                  ) * (Number(query.fieldSizeDeg) || DEFAULT_FIELD_SIZE_DEG)
                )}`}
              </div>
            ) : (
              <div className="pointer-events-none absolute top-3 left-1/2 -translate-x-1/2 rounded-[var(--ae-radius-sm)] border border-[var(--ae-border-subtle)] bg-[var(--ae-bg-surface)]/90 px-3 py-1 text-xs text-[var(--ae-text-secondary)]">
                {copy.rulerHint}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Bottom-left scale HUD */}
      <div className="pointer-events-none absolute bottom-3 left-3 flex items-center gap-2 rounded bg-[var(--ae-bg-base)]/85 px-2.5 py-1 font-mono text-sm text-[var(--ae-text-muted)] backdrop-blur">
        <span className="inline-block h-1.5 w-10 border-x border-b border-[var(--ae-text-muted)]" />
        <span>{`${scaleArcmin} arcmin`}</span>
      </div>

      {/* Bottom-right coordinates HUD */}
      <div className="pointer-events-none absolute right-3 bottom-3 flex items-center gap-2 rounded bg-[var(--ae-bg-base)]/85 px-2.5 py-1 font-mono text-sm text-[var(--ae-text-muted)] backdrop-blur">
        <span>{`RA ${query.ra} | Dec ${query.dec}`}</span>
        {activeFrame && (
          <span className="rounded bg-[var(--ae-bg-elevated)] px-1.5 py-0.5 text-[var(--ae-primary)]">
            {`${activeFrame.timestamp} | ${activeFrame.band}`}
          </span>
        )}
      </div>
    </section>
  );
}
