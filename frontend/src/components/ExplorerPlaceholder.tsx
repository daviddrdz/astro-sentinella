import { ArrowLeft } from "lucide-react";
import { APP_CONFIG } from "../config/app";
import type { QueryParams } from "../types/portal";
import { formatFieldSizeDisplay } from "../utils/coordinates";

interface ExplorerPlaceholderProps {
  query: QueryParams;
  onBackToPortal: () => void;
}

export function ExplorerPlaceholder({
  query,
  onBackToPortal,
}: ExplorerPlaceholderProps) {
  return (
    <div className="flex min-h-screen flex-col bg-[var(--ae-bg-canvas)]">
      <header className="navbar border-b border-[var(--ae-border-subtle)] bg-[var(--ae-bg-surface)] px-4">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBackToPortal}
            className="btn btn-ghost btn-sm gap-2 text-[length:var(--ae-text-sm)] text-[var(--ae-text-secondary)]"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            <span>Back</span>
          </button>
          <span className="text-[length:var(--ae-text-base)] font-semibold text-[var(--ae-text-primary)]">
            {APP_CONFIG.name}
          </span>
        </div>

        <div className="mx-auto hidden rounded-md border border-[var(--ae-border-subtle)] bg-[var(--ae-bg-elevated)] px-3 py-1.5 font-mono text-[length:var(--ae-text-sm)] text-[var(--ae-text-secondary)] md:block">
          {query.ra} | {query.dec} |{" "}
          {formatFieldSizeDisplay(query.fieldSizeDeg)} | {query.observationDate}
        </div>
      </header>

      <main className="flex flex-1 items-center justify-center p-6">
        <div className="card max-w-lg border border-[var(--ae-border-subtle)] bg-[var(--ae-bg-surface)]">
          <div className="card-body gap-3">
            <h1 className="text-[length:var(--ae-text-xl)] font-semibold text-[var(--ae-text-primary)]">
              Explorer
            </h1>
            <p className="font-mono text-[length:var(--ae-text-sm)] text-[var(--ae-accent-cyan)]">
              {query.ra} | {query.dec} |{" "}
              {formatFieldSizeDisplay(query.fieldSizeDeg)} |{" "}
              {query.observationDate}
            </p>
            <p className="text-[length:var(--ae-text-base)] text-[var(--ae-text-muted)]">
              Explorer canvas, layer inspector, and timeline strip will render
              here in the next PR.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
