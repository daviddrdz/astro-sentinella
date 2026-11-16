import {
  AlertTriangle,
  ArrowUpDown,
  Eye,
  GitCompareArrows,
  Loader2,
  X,
} from "lucide-react";
import { EXPLORER_CONFIG, EXPLORER_COPY } from "../../config/explorer";
import type {
  ExplorerFrame,
  ExplorerLocale,
  SubtractionResult,
} from "../../types/explorer";

interface CompareInspectorProps {
  isCompareSelecting: boolean;
  selectedFrames: ExplorerFrame[];
  restas: SubtractionResult[];
  activeSubtractionId: string | null;
  isComparing: boolean;
  locale: ExplorerLocale;
  onStartCompareSelection: () => void;
  onCancelCompareSelection: () => void;
  onRemoveSelectedFrame: (frameId: string) => void;
  onSwapFrames: () => void;
  onCompare: () => void;
  onSelectResta: (restaId: string) => void;
  onExitRestaView: () => void;
}

export function CompareInspector({
  isCompareSelecting,
  selectedFrames,
  restas,
  activeSubtractionId,
  isComparing,
  locale,
  onStartCompareSelection,
  onCancelCompareSelection,
  onRemoveSelectedFrame,
  onSwapFrames,
  onCompare,
  onSelectResta,
  onExitRestaView,
}: CompareInspectorProps) {
  const copy = EXPLORER_COPY[locale];
  const frameA = selectedFrames[0] ?? null;
  const frameB = selectedFrames[1] ?? null;
  const canCompare = Boolean(frameA && frameB) && !isComparing;

  return (
    <div className="flex flex-1 flex-col bg-[var(--ae-bg-base)] text-[var(--ae-text-primary)]">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[var(--ae-border-subtle)] px-4 py-3">
        <div className="flex items-center gap-2">
          <GitCompareArrows
            size={EXPLORER_CONFIG.iconSizeMd}
            className="text-[var(--ae-primary)]"
            aria-hidden="true"
          />
          <h2 className="text-sm font-semibold tracking-wide uppercase">
            {copy.compareTitle}
          </h2>
        </div>

        {isCompareSelecting && (
          <button
            type="button"
            onClick={onCancelCompareSelection}
            className="btn btn-ghost btn-xs text-xs text-[var(--ae-text-muted)] hover:text-[var(--ae-text-primary)]"
          >
            {copy.cancelCompare}
          </button>
        )}
      </div>

      {/* Compare trigger or WhatsApp-style 2-frame selection */}
      <div className="space-y-3 border-b border-[var(--ae-border-subtle)] p-4">
        {!isCompareSelecting ? (
          <>
            <p className="text-xs text-[var(--ae-text-muted)]">
              {copy.compareHint}
            </p>
            <button
              type="button"
              onClick={onStartCompareSelection}
              disabled={isComparing}
              className="btn btn-primary btn-sm w-full gap-1.5 font-medium"
            >
              {isComparing ? (
                <>
                  <Loader2
                    size={EXPLORER_CONFIG.iconSizeSm}
                    className="animate-spin"
                    aria-hidden="true"
                  />
                  <span>{copy.comparing}</span>
                </>
              ) : (
                <>
                  <GitCompareArrows
                    size={EXPLORER_CONFIG.iconSizeSm}
                    aria-hidden="true"
                  />
                  <span>{copy.startCompare}</span>
                </>
              )}
            </button>
          </>
        ) : (
          <>
            <p className="text-xs text-[var(--ae-text-muted)]">
              {copy.compareSelectingHint}
            </p>

            <div className="space-y-2">
              {[
                { label: copy.frameALabel, tag: "A", frame: frameA },
                { label: copy.frameBLabel, tag: "B", frame: frameB },
              ].map(({ label, tag, frame }) => (
                <div
                  key={tag}
                  className="flex items-center justify-between rounded-lg border border-[var(--ae-border-subtle)] bg-[var(--ae-bg-elevated)] px-3 py-2"
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <span
                      className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full font-mono text-xs font-semibold ${
                        tag === "A"
                          ? "bg-[var(--ae-primary)]/20 text-[var(--ae-primary)]"
                          : "bg-[var(--ae-accent)]/20 text-[var(--ae-accent)]"
                      }`}
                    >
                      {tag}
                    </span>
                    <div className="min-w-0">
                      <div className="text-[11px] text-[var(--ae-text-muted)]">
                        {label}
                      </div>
                      {frame ? (
                        <div className="truncate font-mono text-xs text-[var(--ae-text-primary)]">
                          {`${frame.timestamp} | ${frame.band}`}
                        </div>
                      ) : (
                        <div className="truncate text-xs text-[var(--ae-text-muted)] italic">
                          {copy.selectFromTimeline}
                        </div>
                      )}
                    </div>
                  </div>

                  {frame && (
                    <button
                      type="button"
                      onClick={() => onRemoveSelectedFrame(frame.id)}
                      aria-label={`${copy.clearSelection} ${label}`}
                      className="btn btn-ghost btn-xs btn-square text-[var(--ae-text-muted)] hover:text-[var(--ae-text-primary)]"
                    >
                      <X size={EXPLORER_CONFIG.iconSizeSm} aria-hidden="true" />
                    </button>
                  )}
                </div>
              ))}
            </div>

            <div className="flex items-center gap-2">
              {frameA && frameB && (
                <button
                  type="button"
                  onClick={onSwapFrames}
                  aria-label={copy.swapFrames}
                  title={copy.swapFrames}
                  className="btn btn-outline btn-sm border-[var(--ae-border-strong)] text-[var(--ae-text-primary)]"
                >
                  <ArrowUpDown
                    size={EXPLORER_CONFIG.iconSizeSm}
                    aria-hidden="true"
                  />
                </button>
              )}

              <button
                type="button"
                onClick={onCompare}
                disabled={!canCompare}
                className="btn btn-primary btn-sm flex-1 font-medium"
              >
                {copy.compareAction}
              </button>
            </div>
          </>
        )}
      </div>

      {/* Saved Restas (Subtractions) */}
      <div className="flex min-h-0 flex-1 flex-col p-4">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h3 className="text-xs font-semibold tracking-wide text-[var(--ae-text-muted)] uppercase">
              {copy.restasTitle}
            </h3>
            <span className="rounded bg-[var(--ae-bg-elevated)] px-1.5 py-0.5 font-mono text-xs text-[var(--ae-text-muted)]">
              {restas.length}
            </span>
          </div>

          {activeSubtractionId && (
            <button
              type="button"
              onClick={onExitRestaView}
              className="btn btn-ghost btn-xs text-xs text-[var(--ae-primary)]"
            >
              {copy.backToFrames}
            </button>
          )}
        </div>

        <div className="flex-1 space-y-2 overflow-y-auto pr-1">
          {restas.length === EXPLORER_CONFIG.firstIndex ? (
            <p className="py-4 text-center text-xs text-[var(--ae-text-muted)]">
              {copy.noRestas}
            </p>
          ) : (
            restas.map((resta) => {
              const isViewing = resta.id === activeSubtractionId;
              return (
                <button
                  key={resta.id}
                  type="button"
                  onClick={() => onSelectResta(resta.id)}
                  aria-pressed={isViewing}
                  className={`flex w-full flex-col gap-1.5 rounded-lg border p-2.5 text-left transition-colors ${
                    isViewing
                      ? "border-[var(--ae-primary)] bg-[var(--ae-primary)]/12"
                      : "border-[var(--ae-border-subtle)] bg-[var(--ae-bg-elevated)] hover:border-[var(--ae-border-strong)]"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate font-mono text-xs font-medium text-[var(--ae-text-primary)]">
                      {`${resta.frameA.timestamp} - ${resta.frameB.timestamp}`}
                    </span>
                    <span className="inline-flex shrink-0 items-center gap-1 text-[11px] font-medium text-[var(--ae-primary)]">
                      <Eye size={12} aria-hidden="true" />
                      {isViewing ? copy.viewingResult : copy.viewResult}
                    </span>
                  </div>

                  {resta.status === "loading" && (
                    <div className="h-2 w-full animate-pulse rounded bg-[var(--ae-border-strong)]" />
                  )}

                  {resta.status === "ready" && (
                    <>
                      <div className="truncate text-xs text-[var(--ae-text-muted)]">
                        {resta.summary ??
                          `Band ${resta.frameA.band} - Band ${resta.frameB.band}`}
                      </div>
                      {resta.metrics && (
                        <div className="mt-1 grid grid-cols-2 gap-x-2 gap-y-1 rounded border border-[var(--ae-border-subtle)] bg-[var(--ae-bg-base)] px-2 py-1.5 font-mono text-xs text-[var(--ae-text-secondary)]">
                          <span>
                            {copy.metricDeltaMean}:{" "}
                            {resta.metrics.deltaMeanPct >= 0 ? "+" : ""}
                            {resta.metrics.deltaMeanPct.toFixed(1)}%
                          </span>
                          <span>
                            {copy.metricMaxDiff}:{" "}
                            {Math.round(resta.metrics.maxDiff)}
                          </span>
                          <span>
                            {copy.metricRms}: {resta.metrics.rmsDiff.toFixed(1)}
                          </span>
                          <span>
                            {copy.metricChanged}:{" "}
                            {resta.metrics.changedPct.toFixed(1)}%
                          </span>
                        </div>
                      )}
                    </>
                  )}

                  {resta.status === "error" && (
                    <div className="flex items-center gap-1.5 text-xs text-amber-300">
                      <AlertTriangle
                        size={12}
                        className="shrink-0"
                        aria-hidden="true"
                      />
                      <span className="truncate">
                        {resta.errorMessage ?? copy.compareFailed}
                      </span>
                    </div>
                  )}
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
