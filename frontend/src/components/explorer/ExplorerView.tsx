import { useCallback, useEffect, useRef, useState } from "react";
import {
  BAND_CHANNELS,
  DEFAULT_EXPLORER_FRAMES,
  DEFAULT_EXPLORER_LAYERS,
  EXPLORER_CONFIG,
  EXPLORER_COPY,
  type BandChannelOption,
} from "../../config/explorer";
import {
  SKY3D_CONSTANTS,
  type Sky3DScaleId,
  type Sky3DTarget,
  type SkyObjectDetails,
} from "../../config/sky3dCatalog";
import { requestFrameComparison } from "../../services/compareService";
import { fetchExplorerFrames } from "../../services/framesService";
import { fetchCoordinateMetadata } from "../../services/metadataService";
import {
  fetchChunkSpectrum,
  SpectrumRequestError,
} from "../../services/spectrumService";
import type {
  BandChannelId,
  ExplorerFrame,
  ExplorerLayer,
  ExplorerLocale,
  ExplorerSnapshot,
  ExplorerToolId,
  ExplorerViewMode,
  SpectrumState,
  SubtractionResult,
  TimelineFilterTab,
} from "../../types/explorer";
import type { QueryParams } from "../../types/portal";
import { DocsModal } from "../DocsModal";
import { CompareInspector } from "./CompareInspector";
import { Explorer3DCanvas, type Center3DRequest } from "./Explorer3DCanvas";
import { ExplorerCanvas } from "./ExplorerCanvas";
import { ExplorerTimeline } from "./ExplorerTimeline";
import { ExplorerToolbar } from "./ExplorerToolbar";
import { ExplorerTopBar } from "./ExplorerTopBar";
import { SkyObjectInspector } from "./SkyObjectInspector";
import { SpectrumPanel } from "./SpectrumPanel";
import { LayersInspector } from "./LayersInspector";

interface ExplorerViewProps {
  query: QueryParams;
  onBackToPortal: () => void;
}

function cloneLayers(layers: ExplorerLayer[]): ExplorerLayer[] {
  return layers.map((layer) => ({ ...layer, bands: [...layer.bands] }));
}

function getInitialFrameId(frames: readonly ExplorerFrame[]): string | null {
  const preferred = frames.find((frame) => frame.id === "f-1840");
  return preferred?.id ?? frames[EXPLORER_CONFIG.firstIndex]?.id ?? null;
}

function channelsFromFrames(
  frames: readonly ExplorerFrame[]
): BandChannelOption[] {
  const seen = new Set<BandChannelId>();
  return frames.reduce<BandChannelOption[]>((channels, frame) => {
    const detector = frame.detector ?? frame.band;
    if (seen.has(detector)) {
      return channels;
    }
    seen.add(detector);
    const fallback = BAND_CHANNELS.find((channel) => channel.id === detector);
    const min = frame.wavelengthMinUm?.toFixed(
      EXPLORER_CONFIG.detectorRangeDecimals
    );
    const max = frame.wavelengthMaxUm?.toFixed(
      EXPLORER_CONFIG.detectorRangeDecimals
    );
    channels.push({
      id: detector,
      label:
        min && max
          ? `Detector ${detector} (${min} – ${max} µm)`
          : (fallback?.label ?? `Detector ${detector}`),
    });
    return channels;
  }, []);
}

function restrictLayers(
  layers: ExplorerLayer[],
  availableChannels: readonly BandChannelOption[]
): ExplorerLayer[] {
  if (availableChannels.length === 0) {
    return layers;
  }
  const available = new Set(availableChannels.map((channel) => channel.id));
  const firstDetector = availableChannels[EXPLORER_CONFIG.firstIndex].id;
  return layers.map((layer) => {
    const bands = layer.bands.filter((band) => available.has(band));
    const selectedBands = bands.length > 0 ? bands : [firstDetector];
    return { ...layer, bands: selectedBands, band: selectedBands[0] };
  });
}

export function ExplorerView({ query, onBackToPortal }: ExplorerViewProps) {
  const [locale, setLocale] = useState<ExplorerLocale>("en");
  const [viewMode, setViewMode] = useState<ExplorerViewMode>("2d");
  const [queryOverride, setQueryOverride] = useState<QueryParams | null>(null);
  const activeQuery = queryOverride ?? query;
  const [scale3D, setScale3D] = useState<Sky3DScaleId>("sky-view");
  const [selectedSkyObject, setSelectedSkyObject] =
    useState<SkyObjectDetails | null>(null);
  const [centerRequest, setCenterRequest] = useState<Center3DRequest | null>(
    null
  );
  const [layers, setLayers] = useState<ExplorerLayer[]>(() =>
    cloneLayers([...DEFAULT_EXPLORER_LAYERS])
  );
  const [availableChannels, setAvailableChannels] = useState<
    BandChannelOption[]
  >(() => [...BAND_CHANNELS]);
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
  const [panOffset, setPanOffset] = useState<{ x: number; y: number }>({
    x: EXPLORER_CONFIG.firstIndex,
    y: EXPLORER_CONFIG.firstIndex,
  });
  const [timelineTab, setTimelineTab] = useState<TimelineFilterTab>("all");
  const [bandFilter, setBandFilter] = useState<BandChannelId | "all">("all");
  const [isPlaying, setIsPlaying] = useState(false);
  const [docsOpen, setDocsOpen] = useState(false);
  // Keyed by frame: each date renders a different cutout (orientation, grid),
  // so a selection never carries over to another frame.
  const [spectrumEntry, setSpectrumEntry] = useState<{
    frameId: string | null;
    state: SpectrumState;
    grid: { rows: number; cols: number } | null;
  }>({ frameId: null, state: { status: "idle" }, grid: null });
  const spectrumAbortRef = useRef<AbortController | null>(null);
  const [isCompareSelecting, setIsCompareSelecting] = useState(false);
  const [compareFrameIds, setCompareFrameIds] = useState<string[]>([]);
  const [restas, setRestas] = useState<SubtractionResult[]>([]);
  const [activeSubtractionId, setActiveSubtractionId] = useState<string | null>(
    null
  );

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      fetchCoordinateMetadata(
        activeQuery.ra,
        activeQuery.dec,
        controller.signal
      ),
      fetchExplorerFrames(activeQuery, controller.signal),
    ]).then(([metadata, remoteFrames]) => {
      if (controller.signal.aborted) {
        return;
      }

      if (remoteFrames.length > EXPLORER_CONFIG.firstIndex) {
        const detectedChannels = channelsFromFrames(remoteFrames);
        setAvailableChannels(detectedChannels);
        setLayers((previous) =>
          restrictLayers(previous, detectedChannels).map((layer) => ({
            ...layer,
            bands: [...layer.bands],
          }))
        );
      }

      if (
        metadata &&
        metadata.availableDates.length > EXPLORER_CONFIG.firstIndex
      ) {
        const dateFrames: ExplorerFrame[] = metadata.availableDates.map(
          (obsDate) => {
            const imgParams = new URLSearchParams({
              ra: activeQuery.ra.trim(),
              dec: activeQuery.dec.trim(),
              fieldSizeDeg: activeQuery.fieldSizeDeg.trim(),
              observationDate: obsDate,
            });
            return {
              id: `date-${obsDate}`,
              timestamp: obsDate,
              band: 2,
              filtered: false,
              visible: true,
              imageUrl: `${EXPLORER_CONFIG.framesEndpoint}/image?${imgParams.toString()}`,
            };
          }
        );
        setFrames(dateFrames);
        const matchingFrame = dateFrames.find(
          (frame) => frame.timestamp === activeQuery.observationDate.trim()
        );
        setActiveFrameId(
          matchingFrame?.id ??
            dateFrames[EXPLORER_CONFIG.firstIndex]?.id ??
            null
        );
        return;
      }

      if (remoteFrames.length > EXPLORER_CONFIG.firstIndex) {
        setFrames(remoteFrames);
        setActiveFrameId(getInitialFrameId(remoteFrames));
      }
    });
    return () => controller.abort();
  }, [activeQuery]);

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

  /* Temporarily hidden from layout: Layers & Blend Mode
  const handleToggleLayerVisibility = (id: string) => {
    const next = layers.map((layer) =>
      layer.id === id ? { ...layer, visible: !layer.visible } : layer
    );
    pushSnapshot(next, activeLayerId);
  };
  */

  const handleUpdateLayer = (id: string, patch: Partial<ExplorerLayer>) => {
    const next = layers.map((layer) =>
      layer.id === id ? { ...layer, ...patch } : layer
    );
    pushSnapshot(next, activeLayerId);
  };

  /* Temporarily hidden from layout: Layers & Blend Mode
  const handleAddLayer = () => {
    const nextIndex = layers.length + EXPLORER_CONFIG.indexStep;
    const newId = `frm-custom-${nextIndex}`;
    const newLayer: ExplorerLayer = {
      id: newId,
      code: `FRM-0${nextIndex}`,
      band: 1,
      blendMode: "Normal",
      opacity: EXPLORER_CONFIG.defaultNewLayerOpacity,
      visible: true,
      tint: "magma",
      bands: [1],
    };
    const detector = availableChannels[EXPLORER_CONFIG.firstIndex]?.id ?? 1;
    newLayer.band = detector;
    newLayer.bands = [detector];
    pushSnapshot([newLayer, ...layers], newId);
  };
  */

  const handleMergeVisible = () => {
    const visibleLayers = layers.filter((layer) => layer.visible);
    if (visibleLayers.length <= EXPLORER_CONFIG.indexStep) {
      return;
    }
    const mergedId = `frm-merged-${layers.length + EXPLORER_CONFIG.indexStep}`;
    const mergedLayer: ExplorerLayer = {
      id: mergedId,
      code: "MERGED",
      band: visibleLayers[EXPLORER_CONFIG.firstIndex]?.band ?? 1,
      bands: visibleLayers.flatMap((layer) => layer.bands),
      blendMode: "Normal",
      opacity: EXPLORER_CONFIG.opacityMax,
      visible: true,
      tint: "grey",
    };
    const hiddenLayers = layers.filter((layer) => !layer.visible);
    pushSnapshot([mergedLayer, ...hiddenLayers], mergedId);
  };

  const handleSelectTool = (tool: ExplorerToolId) => {
    if (tool === "reset") {
      setZoomLevel(EXPLORER_CONFIG.zoomDefault);
      setPanOffset({
        x: EXPLORER_CONFIG.firstIndex,
        y: EXPLORER_CONFIG.firstIndex,
      });
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

  const isCurrentSpectrum = spectrumEntry.frameId === activeFrameId;
  const spectrum: SpectrumState = isCurrentSpectrum
    ? spectrumEntry.state
    : { status: "idle" };
  const spectrumGrid = isCurrentSpectrum ? spectrumEntry.grid : null;

  useEffect(() => () => spectrumAbortRef.current?.abort(), []);

  const handleChunkSelect = (x: number, y: number) => {
    const imageUrl = activeFrame?.imageUrl;
    if (!imageUrl) {
      return;
    }
    spectrumAbortRef.current?.abort();
    const controller = new AbortController();
    spectrumAbortRef.current = controller;
    const frameId = activeFrameId;
    const grid = spectrumGrid;
    setSpectrumEntry({
      frameId,
      state: { status: "loading", pending: { x, y } },
      grid,
    });

    fetchChunkSpectrum(imageUrl, x, y, controller.signal)
      .then((data) => {
        if (controller.signal.aborted) {
          return;
        }
        setSpectrumEntry({
          frameId,
          state: { status: "loaded", data },
          grid: { rows: data.chunk.rows, cols: data.chunk.cols },
        });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) {
          return;
        }
        const copy = EXPLORER_COPY[locale];
        const noCoverage =
          error instanceof SpectrumRequestError &&
          error.code === "spectrum_unavailable";
        setSpectrumEntry({
          frameId,
          state: {
            status: "error",
            message: noCoverage ? copy.spectrumNoCoverage : copy.spectrumError,
          },
          grid,
        });
      });
  };

  const handleCloseSpectrum = () => {
    spectrumAbortRef.current?.abort();
    setSpectrumEntry((prev) => ({ ...prev, state: { status: "idle" } }));
    setActiveTool("hand");
  };

  const showSpectrumPanel =
    activeTool === "spectrum" || spectrum.status !== "idle";

  const selectedCompareFrames = compareFrameIds
    .map((id) => frames.find((frame) => frame.id === id) ?? null)
    .filter((frame): frame is ExplorerFrame => frame !== null);

  const activeSubtraction =
    restas.find((resta) => resta.id === activeSubtractionId) ?? null;
  const isComparing = restas.some((resta) => resta.status === "loading");

  const handleToggleCompareFrame = (frameId: string) => {
    setCompareFrameIds((prev) => {
      if (prev.includes(frameId)) {
        return prev.filter((id) => id !== frameId);
      }
      if (prev.length < EXPLORER_CONFIG.compareMaxFrames) {
        return [...prev, frameId];
      }
      return [prev[EXPLORER_CONFIG.firstIndex], frameId];
    });
  };

  const handleSwapCompareFrames = () => {
    setCompareFrameIds((prev) =>
      prev.length === EXPLORER_CONFIG.compareMaxFrames
        ? [prev[EXPLORER_CONFIG.indexStep], prev[EXPLORER_CONFIG.firstIndex]]
        : prev
    );
  };

  const handleCompareFrames = async () => {
    const frameA = selectedCompareFrames[EXPLORER_CONFIG.firstIndex];
    const frameB = selectedCompareFrames[EXPLORER_CONFIG.indexStep];
    if (!frameA || !frameB || isComparing) {
      return;
    }

    const restaId = `resta-${Date.now()}-${frameA.id}-${frameB.id}`;
    const pendingResta: SubtractionResult = {
      id: restaId,
      frameA,
      frameB,
      createdAt: new Date().toISOString(),
      status: "loading",
    };

    setRestas((prev) => [pendingResta, ...prev]);
    setActiveSubtractionId(restaId);
    setIsCompareSelecting(false);
    setCompareFrameIds([]);

    const result = await requestFrameComparison(activeQuery, frameA, frameB);
    setRestas((prev) =>
      prev.map((item) =>
        item.id === restaId
          ? result.ok
            ? {
                ...item,
                status: "ready",
                imageUrl: result.imageUrl,
                summary: result.summary,
              }
            : {
                ...item,
                status: "error",
                errorMessage: result.errorMessage,
              }
          : item
      )
    );
  };

  const handleCenterSkyObject = (obj: SkyObjectDetails) => {
    setViewMode("3d");
    setScale3D("sky-view");
    setCenterRequest((prev) => ({
      raDeg: obj.raDeg,
      decDeg: obj.decDeg,
      fovDeg: SKY3D_CONSTANTS.telescopeFovDeg,
      nonce: (prev?.nonce ?? 0) + 1,
    }));
  };

  const handleSyncObjectToQuery = (obj: SkyObjectDetails) => {
    setQueryOverride({
      ...activeQuery,
      ra: obj.raDisplay,
      dec: obj.decDisplay,
    });
    setCenterRequest((prev) => ({
      raDeg: obj.raDeg,
      decDeg: obj.decDeg,
      fovDeg: SKY3D_CONSTANTS.telescopeFovDeg,
      nonce: (prev?.nonce ?? 0) + 1,
    }));
  };

  const handleSelectFeaturedTarget = (target: Sky3DTarget) => {
    const details: SkyObjectDetails = {
      kind: "target",
      id: target.id,
      name: target.name,
      subtitle: target.category,
      raDeg: target.raDeg,
      decDeg: target.decDeg,
      raDisplay: target.raDisplay,
      decDisplay: target.decDisplay,
      distPc: target.distPc,
      colorCss: "#22d3ee",
    };
    setSelectedSkyObject(details);
    handleCenterSkyObject(details);
  };

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-[var(--ae-bg-canvas)] text-[var(--ae-text-primary)]">
      <ExplorerTopBar
        query={activeQuery}
        locale={locale}
        viewMode={viewMode}
        onChangeViewMode={setViewMode}
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
      />

      <div className="relative flex min-h-0 flex-1">
        <ExplorerToolbar
          activeTool={activeTool}
          locale={locale}
          onSelectTool={handleSelectTool}
        />

        {viewMode === "3d" ? (
          <Explorer3DCanvas
            query={activeQuery}
            activeFrame={activeFrame}
            activeSubtraction={activeSubtraction}
            locale={locale}
            scale={scale3D}
            onChangeScale={setScale3D}
            onSelectObject={setSelectedSkyObject}
            centerRequest={centerRequest}
          />
        ) : (
          <ExplorerCanvas
            query={activeQuery}
            layers={layers}
            activeFrame={activeFrame}
            activeSubtraction={activeSubtraction}
            activeTool={activeTool}
            zoomLevel={zoomLevel}
            panOffset={panOffset}
            locale={locale}
            onPanChange={setPanOffset}
            onZoomChange={setZoomLevel}
            onCanvasClick={handleCanvasClick}
            spectrumGrid={spectrumGrid}
            selectedChunk={
              spectrum.status === "loaded" ? spectrum.data.chunk.bounds : null
            }
            pendingChunkClick={
              spectrum.status === "loading" ? spectrum.pending : null
            }
            onChunkSelect={handleChunkSelect}
          />
        )}

        {showSpectrumPanel && (
          <SpectrumPanel
            state={spectrum}
            locale={locale}
            onClose={handleCloseSpectrum}
          />
        )}

        <aside
          aria-label="Compare inspector"
          className="hidden w-80 shrink-0 overflow-y-auto border-l border-[var(--ae-border-subtle)] bg-[var(--ae-bg-base)] md:flex md:flex-col"
        >
          <SkyObjectInspector
            query={activeQuery}
            locale={locale}
            selectedObject={selectedSkyObject}
            onClearSelection={() => setSelectedSkyObject(null)}
            onSelectTarget={handleSelectFeaturedTarget}
            onCenterObject={handleCenterSkyObject}
            onSyncToQuery={handleSyncObjectToQuery}
          />
          <LayersInspector
            layers={layers}
            availableChannels={availableChannels}
            activeLayerId={activeLayerId}
            locale={locale}
            onUpdateLayer={handleUpdateLayer}
          />
          <CompareInspector
            isCompareSelecting={isCompareSelecting}
            selectedFrames={selectedCompareFrames}
            restas={restas}
            activeSubtractionId={activeSubtractionId}
            isComparing={isComparing}
            locale={locale}
            onStartCompareSelection={() => {
              setIsCompareSelecting(true);
              setCompareFrameIds([]);
            }}
            onCancelCompareSelection={() => {
              setIsCompareSelecting(false);
              setCompareFrameIds([]);
            }}
            onRemoveSelectedFrame={(frameId) =>
              setCompareFrameIds((prev) => prev.filter((id) => id !== frameId))
            }
            onSwapFrames={handleSwapCompareFrames}
            onCompare={handleCompareFrames}
            onSelectResta={(restaId) => setActiveSubtractionId(restaId)}
            onExitRestaView={() => setActiveSubtractionId(null)}
          />
        </aside>
      </div>

      <ExplorerTimeline
        frames={frames}
        availableChannels={availableChannels}
        activeFrameId={activeFrameId}
        timelineTab={timelineTab}
        bandFilter={bandFilter}
        isPlaying={isPlaying}
        isCompareSelecting={isCompareSelecting}
        compareFrameIds={compareFrameIds}
        locale={locale}
        onSelectFrame={(frameId) => {
          setActiveSubtractionId(null);
          setActiveFrameId(frameId);
        }}
        onToggleCompareFrame={handleToggleCompareFrame}
        onChangeTab={setTimelineTab}
        onChangeBandFilter={setBandFilter}
        onTogglePlay={() => setIsPlaying((prev) => !prev)}
        onStepBack={handleStepBack}
        onStepForward={handleStepForward}
      />

      <DocsModal open={docsOpen} onClose={() => setDocsOpen(false)} />
    </div>
  );
}
