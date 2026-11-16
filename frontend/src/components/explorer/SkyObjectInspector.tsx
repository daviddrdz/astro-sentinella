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
      className="border-b border-[var(--ae-border-subtle)] bg-[var(--ae-bg-base)] p-4"
      data-testid="sky-object-inspector"
    >
      <h2 className="mb-3 text-[length:var(--ae-text-sm)] font-semibold tracking-tight text-[var(--ae-text-primary)]">
        {copy.inspectorTitle}
      </h2>

      {/* Shared 2D & 3D Active Coordinates */}
      <div className="mb-3 rounded-[var(--ae-radius-md)] border border-[var(--ae-border-subtle)] bg-[var(--ae-bg-elevated)] px-3 py-2.5">
        <div className="mb-1 text-[length:var(--ae-text-sm)] font-medium text-[var(--ae-text-muted)]">
          {copy.activeRegionTitle}
        </div>
        <div className="font-mono text-[length:var(--ae-text-sm)] text-[var(--ae-text-secondary)]">
          <div>
            {copy.raLabel}: {query.ra}
          </div>
          <div>
            {copy.decLabel}: {query.dec}
          </div>
        </div>
      </div>

      {/* Selected Star or Target Details */}
      {selectedObject && (
        <div
          data-testid="inspector-selected-object"
          className="mb-3 rounded-[var(--ae-radius-md)] border border-[var(--ae-border-strong)] bg-[var(--ae-bg-surface)] p-3"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2">
              <span
                className="h-3 w-3 shrink-0 rounded-full ring-1 ring-[var(--ae-border-strong)]"
                style={{ backgroundColor: selectedObject.colorCss }}
              />
              <div>
                <div className="text-[length:var(--ae-text-base)] font-semibold text-[var(--ae-text-primary)]">
                  {selectedObject.name}
                </div>
                <div className="text-[length:var(--ae-text-sm)] text-[var(--ae-text-muted)]">
                  {selectedObject.subtitle}
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={onClearSelection}
              className="rounded px-1.5 py-0.5 text-[length:var(--ae-text-sm)] text-[var(--ae-text-muted)] hover:bg-[var(--ae-bg-hover)] hover:text-[var(--ae-text-primary)]"
              aria-label="Clear selected celestial object"
            >
              ×
            </button>
          </div>

          <dl className="mt-3 space-y-1.5 font-mono text-[length:var(--ae-text-sm)] text-[var(--ae-text-secondary)]">
            <div className="flex justify-between gap-2">
              <dt className="text-[var(--ae-text-muted)]">{copy.raLabel}</dt>
              <dd>{selectedObject.raDisplay}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-[var(--ae-text-muted)]">{copy.decLabel}</dt>
              <dd>{selectedObject.decDisplay}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-[var(--ae-text-muted)]">
                {copy.distanceLabel}
              </dt>
              <dd>
                {Math.round(selectedObject.distPc * SKY3D_CONSTANTS.pcToLy)} ly
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

          <div className="mt-3 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => onCenterObject(selectedObject)}
              className="rounded-[var(--ae-radius-sm)] bg-[var(--ae-accent-primary)] px-2.5 py-1.5 text-[length:var(--ae-text-sm)] font-medium text-[var(--ae-accent-primary-content)] transition hover:opacity-90"
            >
              {copy.centerOnStar}
            </button>
            <button
              type="button"
              onClick={() => onSyncToQuery(selectedObject)}
              className="rounded-[var(--ae-radius-sm)] border border-[var(--ae-border-strong)] bg-[var(--ae-bg-elevated)] px-2.5 py-1.5 text-[length:var(--ae-text-sm)] font-medium text-[var(--ae-text-primary)] transition hover:bg-[var(--ae-bg-hover)]"
            >
              {copy.syncTo2D3D}
            </button>
          </div>
        </div>
      )}

      {/* Quick SPHEREx Featured Targets */}
      <div>
        <div className="mb-2 text-[length:var(--ae-text-sm)] font-medium text-[var(--ae-text-muted)]">
          {copy.featuredTargetsTitle}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {SPHEREX_3D_TARGETS.map((target) => {
            const isSelected = selectedObject?.id === target.id;
            return (
              <button
                key={target.id}
                type="button"
                onClick={() => onSelectTarget(target)}
                className={`rounded-[var(--ae-radius-sm)] border px-2.5 py-1 text-[length:var(--ae-text-sm)] font-medium transition ${
                  isSelected
                    ? "border-[var(--ae-accent-primary)] bg-[var(--ae-accent-primary)] text-[var(--ae-accent-primary-content)]"
                    : "border-[var(--ae-border-subtle)] bg-[var(--ae-bg-elevated)] text-[var(--ae-text-secondary)] hover:border-[var(--ae-border-strong)] hover:bg-[var(--ae-bg-hover)] hover:text-[var(--ae-text-primary)]"
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
