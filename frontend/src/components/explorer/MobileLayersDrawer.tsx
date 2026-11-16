import { X } from "lucide-react";
import { EXPLORER_CONFIG, EXPLORER_COPY } from "../../config/explorer";
import type { ExplorerLayer, ExplorerLocale } from "../../types/explorer";
import { LayersInspector } from "./LayersInspector";

interface MobileLayersDrawerProps {
  open: boolean;
  layers: ExplorerLayer[];
  activeLayerId: string;
  locale: ExplorerLocale;
  onClose: () => void;
  onSelectLayer: (id: string) => void;
  onToggleLayerVisibility: (id: string) => void;
  onAddLayer: () => void;
  onUpdateLayer: (id: string, patch: Partial<ExplorerLayer>) => void;
  onMergeVisible: () => void;
}

export function MobileLayersDrawer({
  open,
  layers,
  activeLayerId,
  locale,
  onClose,
  onSelectLayer,
  onToggleLayerVisibility,
  onAddLayer,
  onUpdateLayer,
  onMergeVisible,
}: MobileLayersDrawerProps) {
  if (!open) {
    return null;
  }

  const copy = EXPLORER_COPY[locale];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={copy.layers}
      className="fixed inset-0 z-40 flex justify-end md:hidden"
    >
      <button
        type="button"
        aria-label={copy.close}
        onClick={onClose}
        className="fixed inset-0 bg-black/60 backdrop-blur-xs"
      />
      <div className="relative z-10 flex h-full w-80 max-w-[88vw] flex-col border-l border-[var(--ae-border-subtle)] bg-[var(--ae-bg-base)] shadow-2xl">
        <div className="flex items-center justify-end border-b border-[var(--ae-border-subtle)] px-3 py-2">
          <button
            type="button"
            onClick={onClose}
            aria-label={copy.close}
            className="btn btn-ghost btn-xs btn-square text-[var(--ae-text-muted)]"
          >
            <X size={EXPLORER_CONFIG.iconSizeMd} aria-hidden="true" />
          </button>
        </div>
        <div className="min-h-0 flex-1">
          <LayersInspector
            layers={layers}
            activeLayerId={activeLayerId}
            locale={locale}
            onSelectLayer={onSelectLayer}
            onToggleLayerVisibility={onToggleLayerVisibility}
            onAddLayer={onAddLayer}
            onUpdateLayer={onUpdateLayer}
            onMergeVisible={onMergeVisible}
          />
        </div>
      </div>
    </div>
  );
}
