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
  locale: ExplorerLocale;
  onSelectFrame: (frameId: string) => void;
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
  locale,
  onSelectFrame,
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
            onChange={(event) =>
              onChangeBandFilter(event.target.value as BandChannelId | "all")
            }
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
            return (
              <button
                key={frame.id}
                type="button"
                onClick={() => onSelectFrame(frame.id)}
                aria-pressed={isSelected}
                className={`flex shrink-0 items-center gap-2 rounded-lg border px-3 py-2 font-mono text-sm transition-colors ${
                  isSelected
                    ? "border-[var(--ae-primary)] bg-[var(--ae-primary)]/15 text-[var(--ae-text-primary)]"
                    : "border-[var(--ae-border-subtle)] bg-[var(--ae-bg-elevated)] text-[var(--ae-text-muted)] hover:border-[var(--ae-border-strong)] hover:text-[var(--ae-text-primary)]"
                }`}
              >
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
