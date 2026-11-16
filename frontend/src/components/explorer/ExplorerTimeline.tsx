import {
  Pause,
  Play,
  SkipBack,
  SkipForward,
  SlidersHorizontal,
} from "lucide-react";
import {
  EXPLORER_CONFIG,
  EXPLORER_COPY,
  TIMELINE_TABS,
} from "../../config/explorer";
import type { BandChannelOption } from "../../config/explorer";
import type {
  BandChannelId,
  ExplorerFrame,
  ExplorerLocale,
  TimelineFilterTab,
} from "../../types/explorer";

interface ExplorerTimelineProps {
  frames: ExplorerFrame[];
  availableChannels: readonly BandChannelOption[];
  activeFrameId: string | null;
  timelineTab: TimelineFilterTab;
  bandFilter: BandChannelId | "all";
  isPlaying: boolean;
  isCompareSelecting?: boolean;
  compareFrameIds?: readonly string[];
  locale: ExplorerLocale;
  onSelectFrame: (frameId: string) => void;
  onToggleCompareFrame?: (frameId: string) => void;
  onChangeTab: (tab: TimelineFilterTab) => void;
  onChangeBandFilter: (band: BandChannelId | "all") => void;
  onTogglePlay: () => void;
  onStepBack: () => void;
  onStepForward: () => void;
}

export function ExplorerTimeline({
  frames,
  availableChannels,
  activeFrameId,
  timelineTab,
  bandFilter,
  isPlaying,
  isCompareSelecting = false,
  compareFrameIds = [],
  locale,
  onSelectFrame,
  onToggleCompareFrame,
  onChangeTab,
  onChangeBandFilter,
  onTogglePlay,
  onStepBack,
  onStepForward,
}: ExplorerTimelineProps) {
  const copy = EXPLORER_COPY[locale];

  const filteredFrames = frames.filter((frame) => {
    if (timelineTab === "visible" && !frame.visible) {
      return false;
    }
    if (timelineTab === "filtered" && !frame.filtered) {
      return false;
    }
    if (bandFilter !== "all" && frame.band !== bandFilter) {
      return false;
    }
    return true;
  });

  const activeIdx = filteredFrames.findIndex(
    (frame) => frame.id === activeFrameId
  );
  const displayIndex =
    activeIdx >= EXPLORER_CONFIG.firstIndex
      ? activeIdx + EXPLORER_CONFIG.indexStep
      : EXPLORER_CONFIG.firstIndex;

  return (
    <section
      aria-label={copy.timeline}
      className="shrink-0 border-t border-[var(--ae-border-subtle)] bg-[var(--ae-bg-base)] px-3 py-2.5 md:px-4"
    >
      {/* Timeline header controls */}
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold text-[var(--ae-text-primary)]">
            {copy.timeline}
          </span>

          <div
            role="tablist"
            aria-label={copy.timeline}
            className="flex items-center gap-1 rounded-md bg-[var(--ae-bg-elevated)] p-0.5"
          >
            {TIMELINE_TABS.map((tab) => {
              const active = timelineTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => onChangeTab(tab.id)}
                  className={`rounded px-2 py-0.5 text-sm font-medium transition-colors ${
                    active
                      ? "bg-[var(--ae-primary)] text-[var(--ae-primary-content)]"
                      : "text-[var(--ae-text-muted)] hover:text-[var(--ae-text-primary)]"
                  }`}
                >
                  {tab.label[locale]}
                </button>
              );
            })}
          </div>

          <select
            aria-label={copy.bandAll}
            value={bandFilter}
            onChange={(event) => {
              const value = event.target.value;
              onChangeBandFilter(
                value === "all" ? "all" : (Number(value) as BandChannelId)
              );
            }}
            className="select select-bordered select-xs ae-field-input bg-[var(--ae-bg-elevated)] text-sm text-[var(--ae-text-primary)]"
          >
            <option value="all">{copy.bandAll}</option>
            {availableChannels.map((band) => (
              <option key={band.id} value={band.id}>
                {`${copy.bandPrefix} ${band.id}`}
              </option>
            ))}
          </select>
        </div>

        {/* Playback controls */}
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={onStepBack}
            aria-label={copy.stepBack}
            title={copy.stepBack}
            className="btn btn-ghost btn-xs btn-square text-[var(--ae-text-muted)] hover:text-[var(--ae-text-primary)]"
          >
            <SkipBack size={EXPLORER_CONFIG.iconSizeSm} aria-hidden="true" />
          </button>

          <button
            type="button"
            onClick={onTogglePlay}
            aria-label={isPlaying ? copy.pause : copy.play}
            title={isPlaying ? copy.pause : copy.play}
            className="btn btn-primary btn-xs btn-square"
          >
            {isPlaying ? (
              <Pause size={EXPLORER_CONFIG.iconSizeSm} aria-hidden="true" />
            ) : (
              <Play size={EXPLORER_CONFIG.iconSizeSm} aria-hidden="true" />
            )}
          </button>

          <button
            type="button"
            onClick={onStepForward}
            aria-label={copy.stepForward}
            title={copy.stepForward}
            className="btn btn-ghost btn-xs btn-square text-[var(--ae-text-muted)] hover:text-[var(--ae-text-primary)]"
          >
            <SkipForward size={EXPLORER_CONFIG.iconSizeSm} aria-hidden="true" />
          </button>

          <span className="ml-1 font-mono text-sm text-[var(--ae-text-muted)]">
            {`${displayIndex} / ${filteredFrames.length}`}
          </span>
        </div>
      </div>

      {/* Frames strip */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {filteredFrames.length === EXPLORER_CONFIG.firstIndex ? (
          <p className="py-2 text-sm text-[var(--ae-text-muted)]">
            {copy.noFrames}
          </p>
        ) : (
          filteredFrames.map((frame) => {
            const isSelected = frame.id === activeFrameId;
            const compareIndex = compareFrameIds.indexOf(frame.id);
            const compareTag =
              compareIndex === 0 ? "A" : compareIndex === 1 ? "B" : null;
            const isComparePicked = compareTag !== null;

            return (
              <button
                key={frame.id}
                type="button"
                onClick={() =>
                  isCompareSelecting && onToggleCompareFrame
                    ? onToggleCompareFrame(frame.id)
                    : onSelectFrame(frame.id)
                }
                aria-label={
                  isCompareSelecting
                    ? `${copy.pickForCompare} ${frame.timestamp}`
                    : undefined
                }
                aria-pressed={isCompareSelecting ? isComparePicked : isSelected}
                className={`flex shrink-0 items-center gap-2 rounded-lg border px-3 py-2 font-mono text-sm transition-colors ${
                  isCompareSelecting
                    ? isComparePicked
                      ? "border-[var(--ae-primary)] bg-[var(--ae-primary)]/18 text-[var(--ae-text-primary)]"
                      : "border-[var(--ae-border-subtle)] bg-[var(--ae-bg-elevated)] text-[var(--ae-text-muted)] hover:border-[var(--ae-primary)]/60 hover:text-[var(--ae-text-primary)]"
                    : isSelected
                      ? "border-[var(--ae-primary)] bg-[var(--ae-primary)]/15 text-[var(--ae-text-primary)]"
                      : "border-[var(--ae-border-subtle)] bg-[var(--ae-bg-elevated)] text-[var(--ae-text-muted)] hover:border-[var(--ae-border-strong)] hover:text-[var(--ae-text-primary)]"
                }`}
              >
                {isCompareSelecting && (
                  <span
                    aria-hidden="true"
                    className={`inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border text-[10px] font-bold transition-colors ${
                      compareTag === "A"
                        ? "border-[var(--ae-primary)] bg-[var(--ae-primary)] text-[var(--ae-bg-base)]"
                        : compareTag === "B"
                          ? "border-[var(--ae-accent)] bg-[var(--ae-accent)] text-[var(--ae-bg-base)]"
                          : "border-[var(--ae-border-strong)] bg-transparent"
                    }`}
                  >
                    {compareTag ?? ""}
                  </span>
                )}
                <span>{`${frame.timestamp} | ${frame.band}`}</span>
                {frame.filtered && (
                  <SlidersHorizontal
                    size={EXPLORER_CONFIG.iconSizeSm}
                    className="text-[var(--ae-accent)]"
                    aria-hidden="true"
                  />
                )}
              </button>
            );
          })
        )}
      </div>
    </section>
  );
}
