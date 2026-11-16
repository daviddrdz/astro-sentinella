// import { Eye, EyeOff, GitMerge, Plus } from "lucide-react";
import {
  BAND_CHANNELS,
  // BLEND_MODES,
  CHANNEL_TINTS,
  EXPLORER_CONFIG,
  EXPLORER_COPY,
} from "../../config/explorer";
import type { BandChannelOption } from "../../config/explorer";
import type {
  // BlendMode,
  ChannelTintId,
  ExplorerLayer,
  ExplorerLocale,
} from "../../types/explorer";

interface LayersInspectorProps {
  layers: ExplorerLayer[];
  availableChannels: readonly BandChannelOption[];
  activeLayerId: string;
  locale: ExplorerLocale;
  onSelectLayer?: (id: string) => void;
  onToggleLayerVisibility?: (id: string) => void;
  onAddLayer?: () => void;
  onUpdateLayer: (id: string, patch: Partial<ExplorerLayer>) => void;
  onMergeVisible?: () => void;
}

export function LayersInspector({
  layers,
  availableChannels,
  activeLayerId,
  locale,
  onUpdateLayer,
}: LayersInspectorProps) {
  const copy = EXPLORER_COPY[locale];
  const activeLayer =
    layers.find((layer) => layer.id === activeLayerId) ??
    layers[EXPLORER_CONFIG.firstIndex];

  return (
    <div className="flex flex-col bg-[var(--ae-bg-base)]">
      {/* Temporarily hidden from layout: Layers header & list
      <div className="flex items-center justify-between border-b border-[var(--ae-border-subtle)] px-4 py-3">
        <h2 className="text-sm font-semibold tracking-tight text-[var(--ae-text-primary)]">
          {copy.layers}
        </h2>
        <button
          type="button"
          onClick={onAddLayer}
          className="btn btn-ghost btn-xs gap-1 font-medium text-[var(--ae-primary)] hover:bg-[var(--ae-primary)]/10"
        >
          <Plus size={EXPLORER_CONFIG.iconSizeSm} aria-hidden="true" />
          <span>{copy.addLayer}</span>
        </button>
      </div>

      <div className="flex-1 space-y-1.5 overflow-y-auto p-3">
        {layers.length === EXPLORER_CONFIG.firstIndex ? (
          <p className="py-6 text-center text-sm text-[var(--ae-text-muted)]">
            {copy.noLayers}
          </p>
        ) : (
          layers.map((layer) => {
            const isSelected = layer.id === activeLayer?.id;
            return (
              <div
                key={layer.id}
                role="button"
                tabIndex={EXPLORER_CONFIG.firstIndex}
                onClick={() => onSelectLayer(layer.id)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onSelectLayer(layer.id);
                  }
                }}
                aria-pressed={isSelected}
                className={`flex cursor-pointer items-center justify-between rounded-lg border px-3 py-2 transition-colors ${
                  isSelected
                    ? "border-[var(--ae-primary)] bg-[var(--ae-primary)]/10"
                    : "border-[var(--ae-border-subtle)] bg-[var(--ae-bg-elevated)] hover:border-[var(--ae-border-strong)]"
                }`}
              >
                <div className="min-w-0">
                  <div className="truncate font-mono text-sm font-medium text-[var(--ae-text-primary)]">
                    {`${layer.code} | ${layer.band}`}
                  </div>
                  <div className="truncate text-sm text-[var(--ae-text-muted)]">
                    {`${layer.blendMode} | ${layer.opacity}%`}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    onToggleLayerVisibility(layer.id);
                  }}
                  aria-label={`${copy.toggleVisibility} ${layer.code}`}
                  aria-pressed={layer.visible}
                  className="btn btn-ghost btn-xs btn-square text-[var(--ae-text-muted)] hover:text-[var(--ae-text-primary)]"
                >
                  {layer.visible ? (
                    <Eye size={EXPLORER_CONFIG.iconSizeMd} aria-hidden="true" />
                  ) : (
                    <EyeOff
                      size={EXPLORER_CONFIG.iconSizeMd}
                      aria-hidden="true"
                    />
                  )}
                </button>
              </div>
            );
          })
        )}
      </div>
      */}

      {/* Active Layer Controls (Band/Channel, Tint, Opacity) */}
      {activeLayer && (
        <div className="space-y-3 border-b border-[var(--ae-border-subtle)] bg-[var(--ae-bg-elevated)]/40 p-4">
          <div className="grid grid-cols-1 gap-2.5">
            {/* Temporarily hidden from layout: Blend Mode
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-[var(--ae-text-muted)]">
                {copy.blendMode}
              </span>
              <select
                aria-label={copy.blendMode}
                value={activeLayer.blendMode}
                onChange={(event) =>
                  onUpdateLayer(activeLayer.id, {
                    blendMode: event.target.value as BlendMode,
                  })
                }
                className="select select-bordered select-sm ae-field-input w-full bg-[var(--ae-bg-base)] text-sm text-[var(--ae-text-primary)]"
              >
                {BLEND_MODES.map((mode) => (
                  <option key={mode} value={mode}>
                    {mode}
                  </option>
                ))}
              </select>
            </label>
            */}

            <label className="block">
              <span className="mb-1 block text-sm font-medium text-[var(--ae-text-muted)]">
                {copy.bandChannel}
              </span>
              <div
                role="group"
                aria-label={copy.bandChannel}
                className="grid gap-1.5"
              >
                {availableChannels.map((channel) => (
                  <label
                    key={channel.id}
                    className="flex cursor-pointer items-start gap-2 rounded border border-[var(--ae-border-subtle)] bg-[var(--ae-bg-base)] px-2 py-1.5 text-sm text-[var(--ae-text-primary)]"
                  >
                    <input
                      type="checkbox"
                      checked={activeLayer.bands.includes(channel.id)}
                      onChange={() => {
                        const bands = activeLayer.bands.includes(channel.id)
                          ? activeLayer.bands.filter(
                              (band) => band !== channel.id
                            )
                          : [...activeLayer.bands, channel.id].sort(
                              (a, b) => a - b
                            );
                        if (bands.length === 0) {
                          return;
                        }
                        onUpdateLayer(activeLayer.id, {
                          bands,
                          band: bands[0],
                        });
                      }}
                      className="checkbox checkbox-primary checkbox-xs mt-0.5"
                    />
                    <span>{channel.label}</span>
                  </label>
                ))}
              </div>
            </label>

            <label className="block">
              <span className="mb-1 block text-sm font-medium text-[var(--ae-text-muted)]">
                {copy.channelTint}
              </span>
              <select
                aria-label={copy.channelTint}
                value={activeLayer.tint}
                onChange={(event) =>
                  onUpdateLayer(activeLayer.id, {
                    tint: event.target.value as ChannelTintId,
                  })
                }
                className="select select-bordered select-sm ae-field-input w-full bg-[var(--ae-bg-base)] text-sm text-[var(--ae-text-primary)]"
              >
                {CHANNEL_TINTS.map((tint) => (
                  <option key={tint.id} value={tint.id}>
                    {tint.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="mb-1.5 flex items-center justify-between text-sm font-medium text-[var(--ae-text-muted)]">
                <span>{copy.opacity}</span>
                <span className="font-mono text-[var(--ae-text-primary)]">
                  {`${activeLayer.opacity}%`}
                </span>
              </span>
              <input
                type="range"
                aria-label={copy.opacity}
                min={EXPLORER_CONFIG.opacityMin}
                max={EXPLORER_CONFIG.opacityMax}
                step={EXPLORER_CONFIG.opacityStep}
                value={activeLayer.opacity}
                onChange={(event) =>
                  onUpdateLayer(activeLayer.id, {
                    opacity: Number(event.target.value),
                  })
                }
                className="range range-primary range-xs w-full"
              />
            </label>

            {/* Temporarily hidden from layout: Merge Visible
            <button
              type="button"
              onClick={onMergeVisible}
              className="btn btn-outline btn-sm mt-1 w-full gap-1.5 border-[var(--ae-border-strong)] text-[var(--ae-text-primary)] hover:border-[var(--ae-primary)] hover:bg-[var(--ae-primary)]/15"
            >
              <GitMerge size={EXPLORER_CONFIG.iconSizeSm} aria-hidden="true" />
              <span>{copy.mergeVisible}</span>
            </button>
            */}
          </div>
        </div>
      )}
    </div>
  );
}
