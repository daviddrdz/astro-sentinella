import { SiGithub } from "@icons-pack/react-simple-icons";
import {
  ArrowLeft,
  BookOpen,
  GitMerge,
  Layers,
  Menu,
  Redo2,
  Telescope,
  Undo2,
} from "lucide-react";
import { APP_CONFIG, ICON_SIZES } from "../../config/app";
import { EXPLORER_CONFIG, EXPLORER_COPY } from "../../config/explorer";
import type { ExplorerLocale } from "../../types/explorer";
import type { QueryParams } from "../../types/portal";

interface ExplorerTopBarProps {
  query: QueryParams;
  locale: ExplorerLocale;
  layerCount: number;
  canUndo: boolean;
  canRedo: boolean;
  onBackToPortal: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onMergeExport: () => void;
  onOpenDocs: () => void;
  onToggleLocale: () => void;
  onOpenMobileLayers: () => void;
}

function formatFieldSizeArcmin(fieldSizeDeg: string): string {
  const parsed = Number.parseFloat(fieldSizeDeg);
  if (Number.isNaN(parsed)) {
    return fieldSizeDeg;
  }
  const arcmin = Math.round(parsed * EXPLORER_CONFIG.defaultArcminPerDeg);
  return `${arcmin} arcmin`;
}

export function ExplorerTopBar({
  query,
  locale,
  layerCount,
  canUndo,
  canRedo,
  onBackToPortal,
  onUndo,
  onRedo,
  onMergeExport,
  onOpenDocs,
  onToggleLocale,
  onOpenMobileLayers,
}: ExplorerTopBarProps) {
  const copy = EXPLORER_COPY[locale];
  const arcminLabel = formatFieldSizeArcmin(query.fieldSizeDeg);
  const desktopSummary = `${query.ra} | ${query.dec} | ${arcminLabel} | ${query.observationDate}`;
  const mobileSummary = `${query.ra} | ${query.dec}`;

  return (
    <header className="flex h-[52px] shrink-0 items-center justify-between border-b border-[var(--ae-border-subtle)] bg-[var(--ae-bg-base)] px-3 md:px-4">
      <div className="flex min-w-0 items-center gap-2 md:gap-3">
        <button
          type="button"
          onClick={onBackToPortal}
          aria-label={copy.backToPortal}
          title={copy.backToPortal}
          className="btn btn-ghost btn-sm btn-square text-[var(--ae-text-muted)] hover:text-[var(--ae-text-primary)]"
        >
          <ArrowLeft size={ICON_SIZES.navbarBrand} aria-hidden="true" />
        </button>

        <div className="flex items-center gap-2 text-sm font-semibold tracking-tight text-[var(--ae-text-primary)]">
          <Telescope
            size={ICON_SIZES.navbarBrand}
            className="shrink-0 text-[var(--ae-primary)]"
            aria-hidden="true"
          />
          <span className="hidden md:inline">{APP_CONFIG.name}</span>
        </div>

        <span className="truncate font-mono text-sm text-[var(--ae-text-muted)] md:hidden">
          {mobileSummary}
        </span>

        <span
          className="hidden truncate font-mono text-sm text-[var(--ae-text-muted)] lg:inline"
          title={desktopSummary}
        >
          {desktopSummary}
        </span>
      </div>

      {/* Desktop actions */}
      <div className="hidden items-center gap-1.5 md:flex">
        <button
          type="button"
          onClick={onUndo}
          disabled={!canUndo}
          aria-label={copy.undo}
          title={copy.undo}
          className="btn btn-ghost btn-sm btn-square text-[var(--ae-text-muted)] hover:text-[var(--ae-text-primary)] disabled:opacity-35"
        >
          <Undo2 size={EXPLORER_CONFIG.iconSizeMd} aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={onRedo}
          disabled={!canRedo}
          aria-label={copy.redo}
          title={copy.redo}
          className="btn btn-ghost btn-sm btn-square text-[var(--ae-text-muted)] hover:text-[var(--ae-text-primary)] disabled:opacity-35"
        >
          <Redo2 size={EXPLORER_CONFIG.iconSizeMd} aria-hidden="true" />
        </button>

        <div className="mx-1 h-4 w-px bg-[var(--ae-border-subtle)]" />

        <button
          type="button"
          onClick={onMergeExport}
          className="btn btn-primary btn-sm gap-1.5 font-medium"
        >
          <GitMerge size={EXPLORER_CONFIG.iconSizeSm} aria-hidden="true" />
          <span>{copy.mergeExport}</span>
        </button>

        <button
          type="button"
          onClick={onOpenDocs}
          className="btn btn-ghost btn-sm gap-1.5 text-[var(--ae-text-muted)] hover:text-[var(--ae-text-primary)]"
        >
          <BookOpen size={EXPLORER_CONFIG.iconSizeSm} aria-hidden="true" />
          <span>{copy.docs}</span>
        </button>

        <a
          href={APP_CONFIG.githubUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="btn btn-ghost btn-sm gap-1.5 text-[var(--ae-text-muted)] hover:text-[var(--ae-text-primary)]"
        >
          <SiGithub size={EXPLORER_CONFIG.iconSizeSm} aria-hidden="true" />
          <span>{copy.github}</span>
        </a>

        <button
          type="button"
          onClick={onToggleLocale}
          aria-label="Toggle language"
          className="btn btn-ghost btn-sm font-mono text-sm text-[var(--ae-text-muted)] hover:text-[var(--ae-text-primary)]"
        >
          <span
            className={
              locale === "en"
                ? "font-semibold text-[var(--ae-text-primary)]"
                : ""
            }
          >
            EN
          </span>
          <span className="mx-0.5 text-[var(--ae-border-strong)]">|</span>
          <span
            className={
              locale === "es"
                ? "font-semibold text-[var(--ae-text-primary)]"
                : ""
            }
          >
            ES
          </span>
        </button>
      </div>

      {/* Mobile actions */}
      <div className="flex items-center gap-1.5 md:hidden">
        <button
          type="button"
          onClick={onOpenMobileLayers}
          className="btn btn-sm gap-1.5 border border-[var(--ae-border-subtle)] bg-[var(--ae-bg-elevated)] text-[var(--ae-text-primary)]"
        >
          <Layers size={EXPLORER_CONFIG.iconSizeSm} aria-hidden="true" />
          <span>{`${copy.layers} (${layerCount})`}</span>
        </button>

        <div className="dropdown dropdown-end">
          <button
            type="button"
            tabIndex={EXPLORER_CONFIG.firstIndex}
            aria-label="Explorer menu"
            className="btn btn-ghost btn-sm btn-square text-[var(--ae-text-muted)]"
          >
            <Menu size={EXPLORER_CONFIG.iconSizeLg} aria-hidden="true" />
          </button>
          <ul
            tabIndex={EXPLORER_CONFIG.firstIndex}
            className="menu dropdown-content z-30 mt-2 w-48 rounded-lg border border-[var(--ae-border-subtle)] bg-[var(--ae-bg-elevated)] p-1.5 shadow-xl"
          >
            <li>
              <button type="button" onClick={onMergeExport}>
                <GitMerge
                  size={EXPLORER_CONFIG.iconSizeSm}
                  aria-hidden="true"
                />
                {copy.mergeExport}
              </button>
            </li>
            <li>
              <button type="button" onClick={onUndo} disabled={!canUndo}>
                <Undo2 size={EXPLORER_CONFIG.iconSizeSm} aria-hidden="true" />
                {copy.undo}
              </button>
            </li>
            <li>
              <button type="button" onClick={onRedo} disabled={!canRedo}>
                <Redo2 size={EXPLORER_CONFIG.iconSizeSm} aria-hidden="true" />
                {copy.redo}
              </button>
            </li>
            <li>
              <button type="button" onClick={onOpenDocs}>
                <BookOpen
                  size={EXPLORER_CONFIG.iconSizeSm}
                  aria-hidden="true"
                />
                {copy.docs}
              </button>
            </li>
            <li>
              <a
                href={APP_CONFIG.githubUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                <SiGithub
                  size={EXPLORER_CONFIG.iconSizeSm}
                  aria-hidden="true"
                />
                {copy.github}
              </a>
            </li>
            <li>
              <button type="button" onClick={onToggleLocale}>
                {locale === "en" ? "EN | ES" : "ES | EN"}
              </button>
            </li>
          </ul>
        </div>
      </div>
    </header>
  );
}
