import { Compass, Crosshair, Layers, Sparkles, X } from "lucide-react";
import {
  SKY_3D_COPY,
  SKY3D_CONSTANTS,
  SKY3D_RENDER_CONSTANTS as R,
  SPHEREX_3D_TARGETS,
  type Sky3DTarget,
  type SkyObjectDetails,
} from "../../config/sky3dCatalog";
import type { ExplorerLocale } from "../../types/explorer";
import type { QueryParams } from "../../types/portal";

interface SkyObjectInspectorProps {
  query: QueryParams;
  locale: ExplorerLocale;
  selectedObject: SkyObjectDetails | null;
  onClearSelection: () => void;
  onSelectTarget: (target: Sky3DTarget) => void;
  onCenterObject: (obj: SkyObjectDetails) => void;
  onSyncToQuery: (obj: SkyObjectDetails) => void;
}

export function SkyObjectInspector({
  query,
  locale,
  selectedObject,
  onClearSelection,
  onSelectTarget,
  onCenterObject,
  onSyncToQuery,
}: SkyObjectInspectorProps) {
  const copy = SKY_3D_COPY[locale];

  return (
    <section
      aria-label={copy.inspectorTitle}
      className="border-b border-[var(--ae-border-subtle)] p-3"
      data-testid="sky-object-inspector"
    >
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-[var(--ae-text-primary)] uppercase">
          <Sparkles className="h-3.5 w-3.5 text-cyan-400" />
          <span>{copy.inspectorTitle}</span>
        </div>
      </div>

      {/* Shared 2D & 3D Active Coordinates */}
      <div className="mb-2.5 rounded-lg border border-[var(--ae-border-subtle)] bg-[var(--ae-bg-elevated)] px-2.5 py-2 text-[11px]">
        <div className="mb-1 flex items-center gap-1 text-[10px] font-medium text-[var(--ae-text-muted)] uppercase">
          <Compass className="h-3 w-3 text-cyan-400" />
          <span>{copy.activeRegionTitle}</span>
        </div>
        <div className="font-mono text-[10px] text-[var(--ae-text-secondary)]">
          <div>
            {copy.raLabel}: {query.ra}
          </div>
          <div>
            {copy.decLabel}: {query.dec}
          </div>
        </div>
      </div>

      {/* Selected Star or Target Details */}
      {selectedObject ? (
        <div
          data-testid="inspector-selected-object"
          className="rounded-lg border border-cyan-400/35 bg-cyan-950/20 p-2.5 text-xs"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2">
              <span
                className="h-3 w-3 shrink-0 rounded-full ring-2 ring-white/20"
                style={{ backgroundColor: selectedObject.colorCss }}
              />
              <div>
                <div className="font-semibold text-cyan-200">
                  {selectedObject.name}
                </div>
                <div className="text-[11px] text-[var(--ae-text-muted)]">
                  {selectedObject.subtitle}
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={onClearSelection}
              className="rounded p-0.5 text-[var(--ae-text-muted)] hover:text-[var(--ae-text-primary)]"
              aria-label="Clear selected celestial object"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          <dl className="mt-2.5 space-y-1 font-mono text-[10px] text-[var(--ae-text-secondary)]">
            <div className="flex justify-between gap-2">
              <dt className="text-[var(--ae-text-muted)]">{copy.raLabel}</dt>
              <dd>
                {selectedObject.raDisplay} (
                {selectedObject.raDeg.toFixed(R.two)}
                °)
              </dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-[var(--ae-text-muted)]">{copy.decLabel}</dt>
              <dd>
                {selectedObject.decDisplay} (
                {selectedObject.decDeg.toFixed(R.two)}°)
              </dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-[var(--ae-text-muted)]">
                {copy.distanceLabel}
              </dt>
              <dd>
                {Math.round(selectedObject.distPc * SKY3D_CONSTANTS.pcToLy)} ly
                ({selectedObject.distPc.toFixed(1)} pc)
              </dd>
            </div>
            {typeof selectedObject.mag === "number" && (
              <div className="flex justify-between gap-2">
                <dt className="text-[var(--ae-text-muted)]">
                  {copy.magnitudeLabel}
                </dt>
                <dd>{selectedObject.mag.toFixed(R.two)} V</dd>
              </div>
            )}
          </dl>

          <div className="mt-2.5 grid grid-cols-2 gap-1.5">
            <button
              type="button"
              onClick={() => onCenterObject(selectedObject)}
              className="flex items-center justify-center gap-1 rounded-md border border-cyan-400/40 bg-cyan-500/15 px-2 py-1.5 text-[11px] font-medium text-cyan-200 transition hover:bg-cyan-500/25"
            >
              <Crosshair className="h-3 w-3" />
              <span>{copy.centerOnStar}</span>
            </button>
            <button
              type="button"
              onClick={() => onSyncToQuery(selectedObject)}
              className="flex items-center justify-center gap-1 rounded-md border border-[var(--ae-border-subtle)] bg-[var(--ae-bg-elevated)] px-2 py-1.5 text-[11px] font-medium text-[var(--ae-text-primary)] transition hover:border-cyan-400/50 hover:text-cyan-200"
            >
              <Layers className="h-3 w-3" />
              <span>{copy.syncTo2D3D}</span>
            </button>
          </div>
        </div>
      ) : (
        <p className="mb-2.5 text-[11px] leading-relaxed text-[var(--ae-text-muted)]">
          {copy.inspectorEmptyHint}
        </p>
      )}

      {/* Quick SPHEREx Featured Targets */}
      <div className="mt-2.5">
        <div className="mb-1.5 text-[10px] font-medium text-[var(--ae-text-muted)] uppercase">
          {copy.featuredTargetsTitle}
        </div>
        <div className="flex flex-wrap gap-1">
          {SPHEREX_3D_TARGETS.map((target) => {
            const isSelected = selectedObject?.id === target.id;
            return (
              <button
                key={target.id}
                type="button"
                onClick={() => onSelectTarget(target)}
                className={`rounded-full border px-2 py-0.5 text-[10px] font-medium transition ${
                  isSelected
                    ? "border-cyan-400/60 bg-cyan-500/20 text-cyan-200"
                    : "border-[var(--ae-border-subtle)] bg-[var(--ae-bg-elevated)] text-[var(--ae-text-secondary)] hover:border-cyan-400/40 hover:text-cyan-200"
                }`}
              >
                {target.name}
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}
