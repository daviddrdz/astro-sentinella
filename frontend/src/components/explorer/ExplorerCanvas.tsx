import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Loader2, RotateCw } from "lucide-react";
import {
  EXPLORER_CONFIG,
  EXPLORER_COPY,
  SPECTRUM_CHART,
} from "../../config/explorer";
import type {
  ChunkBounds,
  ExplorerFrame,
  ExplorerLayer,
  ExplorerLocale,
  ExplorerToolId,
  SubtractionResult,
} from "../../types/explorer";
import type { QueryParams } from "../../types/portal";
import { clamp01, containedBox, type Size } from "../../utils/spectrum";

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

function withColor(imageUrl: string, color: ExplorerLayer["tint"]): string {
  return `${imageUrl}${imageUrl.includes("?") ? "&" : "?"}color=${encodeURIComponent(color)}`;
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

  const primarySourceUrl = activeFrame?.imageUrl ?? null;
  const primaryUrl = primarySourceUrl
    ? withColor(primarySourceUrl, visibleLayers[0]?.tint ?? "magma")
    : null;
  const primaryRetry = primaryUrl
    ? (retryCountByUrl[primaryUrl] ?? EXPLORER_CONFIG.firstIndex)
    : EXPLORER_CONFIG.firstIndex;
  const primaryKey = primaryUrl ? `${primaryUrl}#${primaryRetry}` : null;
  const primaryStatus = primaryKey
    ? (statusByUrl[primaryKey] ?? "loading")
    : "loaded";

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
        className={`relative h-[78%] w-[86%] max-w-3xl overflow-hidden rounded-lg border border-[var(--ae-border-subtle)] bg-[var(--ae-bg-canvas)] shadow-2xl ${
          isDragging ? "" : "transition-transform duration-200"
        }`}
        style={{
          transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${zoomLevel})`,
        }}
      >
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
            const opacityValue = layer.opacity / EXPLORER_CONFIG.opacityMax;
            const sourceImageUrl = resolveLayerImageUrl(layer, activeFrame);
            const imageUrl = sourceImageUrl
              ? withColor(sourceImageUrl, layer.tint)
              : null;

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
                              ...(imageUrl === primaryUrl && primaryKey
                                ? { [primaryKey]: "loaded" as const }
                                : {}),
                            }));
                          }}
                          onError={() => {
                            setStatusByUrl((prev) => ({
                              ...prev,
                              [cacheKey]: "error",
                              ...(imageUrl === primaryUrl && primaryKey
                                ? { [primaryKey]: "error" as const }
                                : {}),
                            }));
                          }}
                          className={`h-full w-full object-contain transition-opacity duration-200 ${
                            imgStatus === "loaded" ? "opacity-100" : "opacity-0"
                          }`}
                        />
                      );
                    })()}
                  </div>
                ) : (
                  <div
                    aria-hidden="true"
                    className="h-full w-full"
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
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-1/4 right-1/4 h-0.5 bg-[var(--ae-primary)]/85"
          />
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
