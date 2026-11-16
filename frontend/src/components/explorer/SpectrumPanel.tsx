import { AlertTriangle, ChartSpline, Loader2, X } from "lucide-react";
import {
  EXPLORER_CONFIG,
  EXPLORER_COPY,
  SPECTRUM_CHART,
  SPECTRUM_FORMAT,
} from "../../config/explorer";
import type { ExplorerLocale, SpectrumState } from "../../types/explorer";
import { formatFlux } from "../../utils/spectrum";
import { SpectrumChart } from "./SpectrumChart";

// Typography straight from styles/tokens.css (SSOT, >= 14px).
const TEXT_SM = "text-[length:var(--ae-text-sm)]";
const FONT_MONO = "font-[family-name:var(--ae-font-mono)]";

interface SpectrumPanelProps {
  state: SpectrumState;
  locale: ExplorerLocale;
  onClose: () => void;
}

export function SpectrumPanel({ state, locale, onClose }: SpectrumPanelProps) {
  const copy = EXPLORER_COPY[locale];

  return (
    <aside
      aria-label={copy.spectrumTitle}
      className="absolute inset-x-0 bottom-0 z-20 flex max-h-[50%] flex-col overflow-y-auto border-t border-[var(--ae-border-subtle)] bg-[var(--ae-bg-surface)] text-[var(--ae-text-primary)] md:static md:max-h-none md:w-[var(--ae-inspector-width)] md:shrink-0 md:border-t-0 md:border-l"
    >
      <header className="flex items-center justify-between gap-2 border-b border-[var(--ae-border-subtle)] px-4 py-3">
        <h2
          className={`flex items-center gap-2 ${TEXT_SM} font-semibold tracking-wide text-[var(--ae-text-primary)] uppercase`}
        >
          <ChartSpline
            size={EXPLORER_CONFIG.iconSizeMd}
            className="shrink-0 text-[var(--ae-accent-primary)]"
            aria-hidden="true"
          />
          {copy.spectrumTitle}
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label={copy.spectrumClose}
          className="btn btn-ghost btn-xs btn-square text-[var(--ae-text-muted)] hover:bg-[var(--ae-bg-hover)] hover:text-[var(--ae-text-primary)]"
        >
          <X size={EXPLORER_CONFIG.iconSizeMd} aria-hidden="true" />
        </button>
      </header>

      <div className="flex flex-col gap-3 p-4">
        {state.status === "idle" && (
          <p className={`${TEXT_SM} text-[var(--ae-text-muted)]`}>
            {copy.spectrumHint}
          </p>
        )}

        {state.status === "loading" && (
          <p
            role="status"
            className={`flex items-center gap-2 ${TEXT_SM} text-[var(--ae-text-secondary)]`}
          >
            <Loader2
              size={EXPLORER_CONFIG.iconSizeMd}
              className="shrink-0 animate-spin text-[var(--ae-accent-primary)]"
              aria-hidden="true"
            />
            {copy.spectrumLoading}
          </p>
        )}

        {state.status === "error" && (
          <p
            role="alert"
            className={`flex items-start gap-2 rounded-[var(--ae-radius-md)] border border-[var(--ae-status-warning)]/40 bg-[var(--ae-bg-elevated)] p-3 ${TEXT_SM} text-[var(--ae-text-secondary)]`}
          >
            <AlertTriangle
              size={EXPLORER_CONFIG.iconSizeMd}
              className="mt-0.5 shrink-0 text-[var(--ae-status-warning)]"
              aria-hidden="true"
            />
            {state.message}
          </p>
        )}

        {state.status === "loaded" && (
          <>
            <dl
              className={`grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 rounded-[var(--ae-radius-md)] border border-[var(--ae-border-subtle)] bg-[var(--ae-bg-elevated)] px-3 py-2 ${FONT_MONO} ${TEXT_SM} text-[var(--ae-text-muted)]`}
            >
              <dt>{copy.spectrumChunk}</dt>
              <dd className="text-[var(--ae-text-secondary)]">
                {`${state.data.chunk.row + 1},${state.data.chunk.col + 1} / ${state.data.chunk.rows}×${state.data.chunk.cols} · ${state.data.chunk.sizeArcsec.toFixed(SPECTRUM_FORMAT.chunkArcsecDecimals)}″`}
              </dd>
              <dt>RA / Dec</dt>
              <dd className="text-[var(--ae-text-secondary)]">
                {`${state.data.center.ra.toFixed(SPECTRUM_FORMAT.coordDecimals)}°, ${state.data.center.dec.toFixed(SPECTRUM_FORMAT.coordDecimals)}°`}
              </dd>
            </dl>

            <SpectrumChart
              points={state.data.points}
              unit={state.data.unit}
              wavelengthLabel={copy.spectrumWavelength}
              fluxLabel={copy.spectrumFlux}
            />

            <p
              className={`${TEXT_SM} leading-relaxed text-[var(--ae-text-muted)]`}
            >
              {copy.spectrumSourceNote}
            </p>

            {/* daisyUI collapse; colors, radius and type from tokens.css */}
            <details
              className={`collapse-arrow collapse rounded-[var(--ae-radius-md)] border border-[var(--ae-border-subtle)] bg-[var(--ae-bg-elevated)] ${TEXT_SM} text-[var(--ae-text-secondary)]`}
            >
              <summary className="collapse-title min-h-0 px-3 py-2 text-[var(--ae-text-muted)] after:text-[var(--ae-text-muted)] hover:text-[var(--ae-text-primary)]">
                {copy.spectrumShowTable}
              </summary>
              <div className="collapse-content max-h-56 overflow-y-auto border-t border-[var(--ae-border-subtle)] px-0 pb-0">
                <table className={`w-full ${FONT_MONO}`}>
                  <thead className="sticky top-0 border-b border-[var(--ae-border-strong)] bg-[var(--ae-bg-surface)] text-[var(--ae-text-muted)]">
                    <tr>
                      <th className="px-3 py-1 text-left font-normal">
                        λ (µm)
                      </th>
                      <th className="px-3 py-1 text-right font-normal">
                        {state.data.unit}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {state.data.points.map((point) => (
                      <tr
                        key={point.wavelengthUm}
                        className="hover:bg-[var(--ae-bg-hover)]"
                      >
                        <td className="px-3 py-0.5">
                          {point.wavelengthUm.toFixed(
                            SPECTRUM_CHART.wavelengthDecimals
                          )}
                        </td>
                        <td className="px-3 py-0.5 text-right">
                          {point.flux === null ? "—" : formatFlux(point.flux)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          </>
        )}
      </div>
    </aside>
  );
}
