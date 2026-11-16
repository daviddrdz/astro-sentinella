import { AlertTriangle, ChartSpline, Loader2, X } from "lucide-react";
import {
  EXPLORER_COPY,
  SPECTRUM_CHART,
  SPECTRUM_FORMAT,
} from "../../config/explorer";
import type { ExplorerLocale, SpectrumState } from "../../types/explorer";
import { formatFlux } from "../../utils/spectrum";
import { SpectrumChart } from "./SpectrumChart";

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
      className="absolute inset-x-0 bottom-0 z-20 flex max-h-[50%] flex-col overflow-y-auto border-t border-[var(--ae-border-subtle)] bg-[var(--ae-bg-surface)] md:static md:max-h-none md:w-96 md:shrink-0 md:border-t-0 md:border-l"
    >
      <header className="flex items-center justify-between gap-2 border-b border-[var(--ae-border-subtle)] px-4 py-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-[var(--ae-text-primary)]">
          <ChartSpline
            className="h-4 w-4 text-[var(--ae-accent-primary)]"
            aria-hidden="true"
          />
          {copy.spectrumTitle}
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label={copy.spectrumClose}
          className="btn btn-ghost btn-xs btn-square text-[var(--ae-text-muted)]"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </header>

      <div className="flex flex-col gap-3 px-4 py-3">
        {state.status === "idle" && (
          <p className="text-sm text-[var(--ae-text-secondary)]">
            {copy.spectrumHint}
          </p>
        )}

        {state.status === "loading" && (
          <p
            role="status"
            className="flex items-center gap-2 text-sm text-[var(--ae-text-secondary)]"
          >
            <Loader2
              className="h-4 w-4 animate-spin text-[var(--ae-accent-primary)]"
              aria-hidden="true"
            />
            {copy.spectrumLoading}
          </p>
        )}

        {state.status === "error" && (
          <p
            role="alert"
            className="flex items-start gap-2 text-sm text-[var(--ae-text-secondary)]"
          >
            <AlertTriangle
              className="mt-0.5 h-4 w-4 shrink-0 text-[var(--ae-status-warning)]"
              aria-hidden="true"
            />
            {state.message}
          </p>
        )}

        {state.status === "loaded" && (
          <>
            <dl className="grid grid-cols-2 gap-x-3 gap-y-1 font-mono text-xs text-[var(--ae-text-muted)]">
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

            <p className="text-xs leading-relaxed text-[var(--ae-text-muted)]">
              {copy.spectrumSourceNote}
            </p>

            <details className="text-xs text-[var(--ae-text-secondary)]">
              <summary className="cursor-pointer text-[var(--ae-text-muted)] hover:text-[var(--ae-text-primary)]">
                {copy.spectrumShowTable}
              </summary>
              <div className="mt-2 max-h-56 overflow-y-auto">
                <table className="w-full font-mono">
                  <thead className="sticky top-0 bg-[var(--ae-bg-surface)] text-[var(--ae-text-muted)]">
                    <tr>
                      <th className="py-1 text-left font-normal">λ (µm)</th>
                      <th className="py-1 text-right font-normal">
                        {state.data.unit}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {state.data.points.map((point) => (
                      <tr key={point.wavelengthUm}>
                        <td className="py-0.5">
                          {point.wavelengthUm.toFixed(
                            SPECTRUM_CHART.wavelengthDecimals
                          )}
                        </td>
                        <td className="py-0.5 text-right">
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
