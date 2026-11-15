import { useCallback, useEffect, useState } from "react";
import {
  DEFAULT_EXPLORER_FRAMES,
  EXPLORER_CONFIG,
} from "../../config/explorer";
import { fetchExplorerFrames } from "../../services/framesService";
import { fetchCoordinateMetadata } from "../../services/metadataService";
import type {
  BandChannelId,
  ChannelTintId,
  ExplorerFrame,
  ExplorerLocale,
  ExplorerToolId,
  TimelineFilterTab,
} from "../../types/explorer";
import type { QueryParams } from "../../types/portal";
import { DocsModal } from "../DocsModal";
import { ExplorerCanvas } from "./ExplorerCanvas";
import { ExplorerTimeline } from "./ExplorerTimeline";
import { ExplorerToolbar } from "./ExplorerToolbar";
import { ExplorerTopBar } from "./ExplorerTopBar";

interface ExplorerViewProps {
  query: QueryParams;
  onBackToPortal: () => void;
}

function getInitialFrameId(frames: readonly ExplorerFrame[]): string | null {
  const preferred = frames.find((frame) => frame.id === "f-1840");
  return preferred?.id ?? frames[EXPLORER_CONFIG.firstIndex]?.id ?? null;
}

export function ExplorerView({ query, onBackToPortal }: ExplorerViewProps) {
  const [locale, setLocale] = useState<ExplorerLocale>("en");
  const [frames, setFrames] = useState<ExplorerFrame[]>(() => [
    ...DEFAULT_EXPLORER_FRAMES,
  ]);
  const [activeFrameId, setActiveFrameId] = useState<string | null>(() =>
    getInitialFrameId(DEFAULT_EXPLORER_FRAMES)
  );

  const [activeTool, setActiveTool] = useState<ExplorerToolId>("hand");
  const [channelTint, setChannelTint] = useState<ChannelTintId>("magma");
  const [zoomLevel, setZoomLevel] = useState<number>(
    EXPLORER_CONFIG.zoomDefault
  );
  const [timelineTab, setTimelineTab] = useState<TimelineFilterTab>("all");
  const [bandFilter, setBandFilter] = useState<BandChannelId | "all">("all");
  const [isPlaying, setIsPlaying] = useState(false);
  const [docsOpen, setDocsOpen] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      fetchCoordinateMetadata(query.ra, query.dec, controller.signal),
      fetchExplorerFrames(query, controller.signal),
    ]).then(([metadata, remoteFrames]) => {
      if (controller.signal.aborted) {
        return;
      }

      if (
        metadata &&
        metadata.availableDates.length > EXPLORER_CONFIG.firstIndex
      ) {
        const dateFrames: ExplorerFrame[] = metadata.availableDates.map(
          (obsDate) => {
            const imgParams = new URLSearchParams({
              ra: query.ra.trim(),
              dec: query.dec.trim(),
              fieldSizeDeg: query.fieldSizeDeg.trim(),
              observationDate: obsDate,
            });
            return {
              id: `date-${obsDate}`,
              timestamp: obsDate,
              band: "Band 1",
              filtered: false,
              visible: true,
              imageUrl: `${EXPLORER_CONFIG.framesEndpoint}/image?${imgParams.toString()}`,
            };
          }
        );
        setFrames(dateFrames);
        const matchingFrame = dateFrames.find(
          (frame) => frame.timestamp === query.observationDate.trim()
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
  }, [query]);

  const activeFrameIndex = Math.max(
    EXPLORER_CONFIG.firstIndex,
    frames.findIndex((frame) => frame.id === activeFrameId)
  );

  const handleSelectTool = (tool: ExplorerToolId) => {
    if (tool === "reset") {
      setZoomLevel(EXPLORER_CONFIG.zoomDefault);
      setActiveTool("hand");
      return;
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
        onBackToPortal={onBackToPortal}
        onOpenDocs={() => setDocsOpen(true)}
        onToggleLocale={() =>
          setLocale((prev) => (prev === "en" ? "es" : "en"))
        }
      />

      <div className="flex min-h-0 flex-1">
        <ExplorerToolbar
          activeTool={activeTool}
          locale={locale}
          onSelectTool={handleSelectTool}
          channelTint={channelTint}
          onChangeChannelTint={setChannelTint}
        />

        <ExplorerCanvas
          query={query}
          activeFrame={activeFrame}
          activeTool={activeTool}
          zoomLevel={zoomLevel}
          locale={locale}
          channelTint={channelTint}
          onCanvasClick={handleCanvasClick}
        />
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

      <DocsModal open={docsOpen} onClose={() => setDocsOpen(false)} />
    </div>
  );
}
