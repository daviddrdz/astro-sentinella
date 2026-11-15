import { useCallback, useEffect, useState } from "react";
import {
  DEFAULT_EXPLORER_FRAMES,
  DEFAULT_EXPLORER_LAYERS,
  EXPLORER_CONFIG,
} from "../../config/explorer";
import { fetchExplorerFrames } from "../../services/framesService";
import type {
  BandChannelId,
  ExplorerFrame,
  ExplorerLayer,
  ExplorerLocale,
  ExplorerSnapshot,
  ExplorerToolId,
  LayerFilterId,
  TimelineFilterTab,
} from "../../types/explorer";
import type { QueryParams } from "../../types/portal";
import { DocsModal } from "../DocsModal";
import { ExplorerCanvas } from "./ExplorerCanvas";
import { ExplorerTimeline } from "./ExplorerTimeline";
import { ExplorerToolbar } from "./ExplorerToolbar";
import { ExplorerTopBar } from "./ExplorerTopBar";
import { LayersInspector } from "./LayersInspector";
import { MobileLayersDrawer } from "./MobileLayersDrawer";

interface ExplorerViewProps {
  query: QueryParams;
  onBackToPortal: () => void;
}

function cloneLayers(layers: ExplorerLayer[]): ExplorerLayer[] {
  return layers.map((layer) => ({
    ...layer,
    filters: { ...layer.filters },
  }));
}

function getInitialFrameId(frames: readonly ExplorerFrame[]): string | null {
  const preferred = frames.find((frame) => frame.id === "f-1840");
  return preferred?.id ?? frames[EXPLORER_CONFIG.firstIndex]?.id ?? null;
}

export function ExplorerView({ query, onBackToPortal }: ExplorerViewProps) {
  const [locale, setLocale] = useState<ExplorerLocale>("en");
  const [layers, setLayers] = useState<ExplorerLayer[]>(() =>
    cloneLayers([...DEFAULT_EXPLORER_LAYERS])
  );
  const [activeLayerId, setActiveLayerId] = useState<string>(
    DEFAULT_EXPLORER_LAYERS[EXPLORER_CONFIG.firstIndex]?.id ?? ""
  );
  const [frames, setFrames] = useState<ExplorerFrame[]>(() => [
    ...DEFAULT_EXPLORER_FRAMES,
  ]);
  const [activeFrameId, setActiveFrameId] = useState<string | null>(() =>
    getInitialFrameId(DEFAULT_EXPLORER_FRAMES)
  );

  const [undoStack, setUndoStack] = useState<ExplorerSnapshot[]>([]);
  const [redoStack, setRedoStack] = useState<ExplorerSnapshot[]>([]);

  const [activeTool, setActiveTool] = useState<ExplorerToolId>("hand");
  const [zoomLevel, setZoomLevel] = useState<number>(
    EXPLORER_CONFIG.zoomDefault
  );
  const [timelineTab, setTimelineTab] = useState<TimelineFilterTab>("all");
  const [bandFilter, setBandFilter] = useState<BandChannelId | "all">("all");
  const [isPlaying, setIsPlaying] = useState(false);
  const [mobileLayersOpen, setMobileLayersOpen] = useState(false);
  const [docsOpen, setDocsOpen] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    fetchExplorerFrames(query, controller.signal).then((remoteFrames) => {
      if (remoteFrames.length > EXPLORER_CONFIG.firstIndex) {
        setFrames(remoteFrames);
        setActiveFrameId(getInitialFrameId(remoteFrames));
      }
    });
    return () => controller.abort();
  }, [query]);

  const activeFrameIndex = Math.max(
    EXPLORER_CONFIG.firstIndex,
    frames.findIndex((frame) => frame.id === activeFrameId)
  );

  const pushSnapshot = useCallback(
    (nextLayers: ExplorerLayer[], nextActiveLayerId: string) => {
      setUndoStack((prev) => [
        ...prev.slice(
          -(EXPLORER_CONFIG.maxUndoHistory - EXPLORER_CONFIG.indexStep)
        ),
        {
          layers: cloneLayers(layers),
          activeLayerId,
          activeFrameIndex,
        },
      ]);
      setRedoStack([]);
      setLayers(nextLayers);
      setActiveLayerId(nextActiveLayerId);
    },
    [activeFrameIndex, activeLayerId, layers]
  );

  const handleUndo = () => {
    const previous = undoStack[undoStack.length - EXPLORER_CONFIG.indexStep];
    if (!previous) {
      return;
    }
    setRedoStack((prev) => [
      ...prev,
      {
        layers: cloneLayers(layers),
        activeLayerId,
        activeFrameIndex,
      },
    ]);
    setUndoStack((prev) =>
      prev.slice(
        EXPLORER_CONFIG.firstIndex,
        prev.length - EXPLORER_CONFIG.indexStep
      )
    );
    setLayers(cloneLayers(previous.layers));
    setActiveLayerId(previous.activeLayerId);
  };

  const handleRedo = () => {
    const next = redoStack[redoStack.length - EXPLORER_CONFIG.indexStep];
    if (!next) {
      return;
    }
    setUndoStack((prev) => [
      ...prev,
      {
        layers: cloneLayers(layers),
        activeLayerId,
        activeFrameIndex,
      },
    ]);
    setRedoStack((prev) =>
      prev.slice(
        EXPLORER_CONFIG.firstIndex,
        prev.length - EXPLORER_CONFIG.indexStep
      )
    );
    setLayers(cloneLayers(next.layers));
    setActiveLayerId(next.activeLayerId);
  };

  const handleToggleLayerVisibility = (id: string) => {
    const next = layers.map((layer) =>
      layer.id === id ? { ...layer, visible: !layer.visible } : layer
    );
    pushSnapshot(next, activeLayerId);
  };

  const handleUpdateLayer = (id: string, patch: Partial<ExplorerLayer>) => {
    const next = layers.map((layer) =>
      layer.id === id ? { ...layer, ...patch } : layer
    );
    pushSnapshot(next, activeLayerId);
  };

  const handleToggleLayerFilter = (id: string, filterId: LayerFilterId) => {
    const next = layers.map((layer) =>
      layer.id === id
        ? {
            ...layer,
            filters: {
              ...layer.filters,
              [filterId]: !layer.filters[filterId],
            },
          }
        : layer
    );
    pushSnapshot(next, activeLayerId);
  };

  const handleAddLayer = () => {
    const nextIndex = layers.length + EXPLORER_CONFIG.indexStep;
    const newId = `frm-custom-${nextIndex}`;
    const newLayer: ExplorerLayer = {
      id: newId,
      code: `FRM-0${nextIndex}`,
      band: "Ha",
      blendMode: "Normal",
      opacity: EXPLORER_CONFIG.defaultNewLayerOpacity,
      visible: true,
      tint: "Cyan",
      filters: {
        stretch: false,
        contrast: false,
        invert: false,
        edges: false,
      },
    };
    pushSnapshot([newLayer, ...layers], newId);
  };

  const handleMergeVisible = () => {
    const visibleLayers = layers.filter((layer) => layer.visible);
    if (visibleLayers.length <= EXPLORER_CONFIG.indexStep) {
      return;
    }
    const mergedId = `frm-merged-${layers.length + EXPLORER_CONFIG.indexStep}`;
    const mergedLayer: ExplorerLayer = {
      id: mergedId,
      code: "MERGED",
      band: visibleLayers[EXPLORER_CONFIG.firstIndex]?.band ?? "BB",
      blendMode: "Normal",
      opacity: EXPLORER_CONFIG.opacityMax,
      visible: true,
      tint: "White",
      filters: {
        stretch: false,
        contrast: false,
        invert: false,
        edges: false,
      },
    };
    const hiddenLayers = layers.filter((layer) => !layer.visible);
    pushSnapshot([mergedLayer, ...hiddenLayers], mergedId);
  };

  const handleSelectTool = (tool: ExplorerToolId) => {
    if (tool === "reset") {
      setZoomLevel(EXPLORER_CONFIG.zoomDefault);
      setActiveTool("hand");
      return;
    }
    if (tool === "subtract") {
      handleUpdateLayer(activeLayerId, { blendMode: "Subtract" });
    }
    setActiveTool(tool);
  };

  const handleCanvasClick = () => {
    if (activeTool === "zoom") {
      setZoomLevel((prev) =>
        prev >= EXPLORER_CONFIG.zoomMax
          ? EXPLORER_CONFIG.zoomDefault
          : Math.min(EXPLORER_CONFIG.zoomMax, prev + EXPLORER_CONFIG.zoomStep)
      );
    }
  };

  const handleStepBack = useCallback(() => {
    if (frames.length === EXPLORER_CONFIG.firstIndex) {
      return;
    }
    const prevIndex =
      activeFrameIndex <= EXPLORER_CONFIG.firstIndex
        ? frames.length - EXPLORER_CONFIG.indexStep
        : activeFrameIndex - EXPLORER_CONFIG.indexStep;
    setActiveFrameId(frames[prevIndex]?.id ?? null);
  }, [activeFrameIndex, frames]);

  const handleStepForward = useCallback(() => {
    if (frames.length === EXPLORER_CONFIG.firstIndex) {
      return;
    }
    const nextIndex =
      (activeFrameIndex + EXPLORER_CONFIG.indexStep) % frames.length;
    setActiveFrameId(frames[nextIndex]?.id ?? null);
  }, [activeFrameIndex, frames]);

  useEffect(() => {
    if (!isPlaying) {
      return;
    }
    const timer = window.setInterval(
      handleStepForward,
      EXPLORER_CONFIG.playbackIntervalMs
    );
    return () => window.clearInterval(timer);
  }, [isPlaying, handleStepForward]);

  const activeFrame =
    frames.find((frame) => frame.id === activeFrameId) ?? null;

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-[var(--ae-bg-canvas)] text-[var(--ae-text-primary)]">
      <ExplorerTopBar
        query={query}
        locale={locale}
        layerCount={layers.length}
        canUndo={undoStack.length > EXPLORER_CONFIG.firstIndex}
        canRedo={redoStack.length > EXPLORER_CONFIG.firstIndex}
        onBackToPortal={onBackToPortal}
        onUndo={handleUndo}
        onRedo={handleRedo}
        onMergeExport={handleMergeVisible}
        onOpenDocs={() => setDocsOpen(true)}
        onToggleLocale={() =>
          setLocale((prev) => (prev === "en" ? "es" : "en"))
        }
        onOpenMobileLayers={() => setMobileLayersOpen(true)}
      />

      <div className="flex min-h-0 flex-1">
        <ExplorerToolbar
          activeTool={activeTool}
          locale={locale}
          onSelectTool={handleSelectTool}
        />

        <ExplorerCanvas
          query={query}
          layers={layers}
          activeFrame={activeFrame}
          activeTool={activeTool}
          zoomLevel={zoomLevel}
          onCanvasClick={handleCanvasClick}
        />

        <aside
          aria-label="Layers inspector"
          className="hidden w-80 shrink-0 border-l border-[var(--ae-border-subtle)] md:block"
        >
          <LayersInspector
            layers={layers}
            activeLayerId={activeLayerId}
            locale={locale}
            onSelectLayer={setActiveLayerId}
            onToggleLayerVisibility={handleToggleLayerVisibility}
            onAddLayer={handleAddLayer}
            onUpdateLayer={handleUpdateLayer}
            onToggleLayerFilter={handleToggleLayerFilter}
            onMergeVisible={handleMergeVisible}
          />
        </aside>
      </div>

      <ExplorerTimeline
        frames={frames}
        activeFrameId={activeFrameId}
        timelineTab={timelineTab}
        bandFilter={bandFilter}
        isPlaying={isPlaying}
        locale={locale}
        onSelectFrame={setActiveFrameId}
        onChangeTab={setTimelineTab}
        onChangeBandFilter={setBandFilter}
        onTogglePlay={() => setIsPlaying((prev) => !prev)}
        onStepBack={handleStepBack}
        onStepForward={handleStepForward}
      />

      <MobileLayersDrawer
        open={mobileLayersOpen}
        layers={layers}
        activeLayerId={activeLayerId}
        locale={locale}
        onClose={() => setMobileLayersOpen(false)}
        onSelectLayer={setActiveLayerId}
        onToggleLayerVisibility={handleToggleLayerVisibility}
        onAddLayer={handleAddLayer}
        onUpdateLayer={handleUpdateLayer}
        onToggleLayerFilter={handleToggleLayerFilter}
        onMergeVisible={handleMergeVisible}
      />

      <DocsModal open={docsOpen} onClose={() => setDocsOpen(false)} />
    </div>
  );
}
