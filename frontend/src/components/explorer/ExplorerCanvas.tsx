import { CHANNEL_TINTS, EXPLORER_CONFIG } from "../../config/explorer";
import type {
  ExplorerFrame,
  ExplorerLayer,
  ExplorerToolId,
} from "../../types/explorer";
import type { QueryParams } from "../../types/portal";

interface ExplorerCanvasProps {
  query: QueryParams;
  layers: ExplorerLayer[];
  activeFrame: ExplorerFrame | null;
  activeTool: ExplorerToolId;
  zoomLevel: number;
  onCanvasClick: () => void;
}

type ImageSourceCarrier = {
  imageUrl?: string;
  url?: string;
  src?: string;
};

function getTintHex(tintId: ExplorerLayer["tint"]): string {
  const match = CHANNEL_TINTS.find((item) => item.id === tintId);
  return match ? match.hex : "#4BA39B";
}

function buildFilterCss(layer: ExplorerLayer): string {
  const parts: string[] = [];
  if (layer.filters.stretch) {
    parts.push("brightness(1.18)");
  }
  if (layer.filters.contrast) {
    parts.push("contrast(1.35)");
  }
  if (layer.filters.invert) {
    parts.push("invert(0.85)");
  }
  if (layer.filters.edges) {
    parts.push("saturate(1.5) contrast(1.2)");
  }
  return parts.length > EXPLORER_CONFIG.firstIndex ? parts.join(" ") : "none";
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
  activeTool,
  zoomLevel,
  onCanvasClick,
}: ExplorerCanvasProps) {
  const visibleLayers = layers.filter((layer) => layer.visible);
  const scaleArcmin = (EXPLORER_CONFIG.defaultScaleArcmin / zoomLevel).toFixed(
    EXPLORER_CONFIG.firstIndex
  );

  return (
    <section
      aria-label="Telescope viewport"
      onClick={onCanvasClick}
      className="relative flex flex-1 items-center justify-center overflow-hidden bg-[var(--ae-bg-canvas)] select-none"
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

      {/* Stacked photogram layers */}
      <div
        className="relative h-[78%] w-[86%] max-w-3xl overflow-hidden rounded-lg border border-[var(--ae-border-subtle)] bg-[var(--ae-bg-canvas)] shadow-2xl transition-transform duration-200"
        style={{ transform: `scale(${zoomLevel})` }}
      >
        {visibleLayers.map((layer) => {
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
                filter: buildFilterCss(layer),
              }}
            >
              {imageUrl ? (
                <div className="relative h-full w-full">
                  <img
                    src={imageUrl}
                    alt={`${layer.code} astronomical cutout`}
                    draggable={false}
                    className="h-full w-full object-contain"
                  />
                  {/* Channel tint overlay preserving dark sky background */}
                  <div
                    aria-hidden="true"
                    className="absolute inset-0"
                    style={{
                      backgroundColor: tintHex,
                      mixBlendMode: "multiply",
                    }}
                  />
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
        })}

        {/* Central reticle */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 flex items-center justify-center"
        >
          <div className="h-12 w-12 rounded-full border border-[var(--ae-primary)]/40" />
          <div className="absolute h-px w-20 bg-[var(--ae-primary)]/35" />
          <div className="absolute h-20 w-px bg-[var(--ae-primary)]/35" />
        </div>

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
