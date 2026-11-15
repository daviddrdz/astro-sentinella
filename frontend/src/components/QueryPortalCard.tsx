import { useId, useMemo, useRef, useState } from "react";
import { AlertCircle, Database, Layers } from "lucide-react";
import type { QueryParams } from "../types/portal";
import {
  lookupCoordinateMetadata,
  validateQueryParams,
  type QueryFieldErrors,
} from "../utils/coordinates";

interface QueryPortalCardProps {
  initialValues?: QueryParams;
  onSubmitQuery: (params: QueryParams) => void;
}

const DEFAULT_VALUES: QueryParams = {
  ra: "",
  dec: "",
  fieldSizeDeg: "",
  observationDate: "",
};

type TouchedFields = Partial<Record<keyof QueryParams, boolean>>;

export function QueryPortalCard({
  initialValues = DEFAULT_VALUES,
  onSubmitQuery,
}: QueryPortalCardProps) {
  const headingId = useId();
  const raInputRef = useRef<HTMLInputElement>(null);
  const decInputRef = useRef<HTMLInputElement>(null);
  const fieldSizeInputRef = useRef<HTMLInputElement>(null);
  const dateInputRef = useRef<HTMLInputElement>(null);

  const [values, setValues] = useState<QueryParams>(initialValues);
  const [touched, setTouched] = useState<TouchedFields>({});
  const [hasSubmitted, setHasSubmitted] = useState(false);

  const allErrors = useMemo(() => validateQueryParams(values), [values]);

  const visibleErrors: QueryFieldErrors = useMemo(() => {
    const visible: QueryFieldErrors = {};
    (Object.keys(allErrors) as (keyof QueryParams)[]).forEach((key) => {
      if (hasSubmitted || touched[key]) {
        visible[key] = allErrors[key];
      }
    });
    return visible;
  }, [allErrors, hasSubmitted, touched]);

  const coordinateMetadata = useMemo(
    () => lookupCoordinateMetadata(values.ra, values.dec),
    [values.ra, values.dec]
  );

  const handleFieldChange = (field: keyof QueryParams, nextValue: string) => {
    setValues((prev) => ({ ...prev, [field]: nextValue }));
  };

  const handleFieldBlur = (field: keyof QueryParams) => {
    if (values[field].trim() !== "" || hasSubmitted) {
      setTouched((prev) => ({ ...prev, [field]: true }));
    }
  };

  const focusFirstInvalidField = (errors: QueryFieldErrors) => {
    if (errors.ra) raInputRef.current?.focus();
    else if (errors.dec) decInputRef.current?.focus();
    else if (errors.fieldSizeDeg) fieldSizeInputRef.current?.focus();
    else if (errors.observationDate) dateInputRef.current?.focus();
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setHasSubmitted(true);
    setTouched({
      ra: true,
      dec: true,
      fieldSizeDeg: true,
      observationDate: true,
    });

    if (Object.keys(allErrors).length > 0) {
      focusFirstInvalidField(allErrors);
      return;
    }

    onSubmitQuery({
      ra: values.ra.trim(),
      dec: values.dec.trim(),
      fieldSizeDeg: values.fieldSizeDeg.trim().replace(/\s*deg\s*$/i, ""),
      observationDate: values.observationDate.trim(),
    });
  };

  return (
    <section className="w-full max-w-2xl">
      <div className="card border border-[var(--ae-border-subtle)] bg-[var(--ae-bg-surface)] shadow-2xl">
        <div className="card-body gap-5 p-6 sm:p-8">
          <h1
            id={headingId}
            className="text-[length:var(--ae-text-2xl)] font-bold tracking-tight text-[var(--ae-text-primary)]"
          >
            Astro Earth
          </h1>

          <form
            role="search"
            noValidate
            aria-labelledby={headingId}
            onSubmit={handleSubmit}
            className="flex flex-col gap-5"
          >
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor="portal-ra"
                  className="text-[length:var(--ae-text-sm)] font-medium text-[var(--ae-text-secondary)]"
                >
                  RA
                </label>
                <input
                  ref={raInputRef}
                  id="portal-ra"
                  name="ra"
                  type="text"
                  required
                  autoCorrect="off"
                  autoCapitalize="none"
                  spellCheck={false}
                  placeholder="05h 35m 17s"
                  value={values.ra}
                  onChange={(e) => handleFieldChange("ra", e.target.value)}
                  onBlur={() => handleFieldBlur("ra")}
                  aria-invalid={visibleErrors.ra ? "true" : "false"}
                  aria-describedby={
                    visibleErrors.ra ? "portal-ra-error" : undefined
                  }
                  className="input input-bordered ae-field-input w-full"
                />
                {visibleErrors.ra && (
                  <p
                    id="portal-ra-error"
                    className="flex items-start gap-1.5 text-[length:var(--ae-text-sm)] text-[var(--ae-status-error)]"
                  >
                    <AlertCircle
                      className="mt-0.5 h-4 w-4 shrink-0"
                      aria-hidden="true"
                    />
                    <span>{visibleErrors.ra}</span>
                  </p>
                )}
              </div>

              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor="portal-dec"
                  className="text-[length:var(--ae-text-sm)] font-medium text-[var(--ae-text-secondary)]"
                >
                  Dec
                </label>
                <input
                  ref={decInputRef}
                  id="portal-dec"
                  name="dec"
                  type="text"
                  required
                  autoCorrect="off"
                  autoCapitalize="none"
                  spellCheck={false}
                  placeholder={"-05° 23' 28\""}
                  value={values.dec}
                  onChange={(e) => handleFieldChange("dec", e.target.value)}
                  onBlur={() => handleFieldBlur("dec")}
                  aria-invalid={visibleErrors.dec ? "true" : "false"}
                  aria-describedby={
                    visibleErrors.dec ? "portal-dec-error" : undefined
                  }
                  className="input input-bordered ae-field-input w-full"
                />
                {visibleErrors.dec && (
                  <p
                    id="portal-dec-error"
                    className="flex items-start gap-1.5 text-[length:var(--ae-text-sm)] text-[var(--ae-status-error)]"
                  >
                    <AlertCircle
                      className="mt-0.5 h-4 w-4 shrink-0"
                      aria-hidden="true"
                    />
                    <span>{visibleErrors.dec}</span>
                  </p>
                )}
              </div>

              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor="portal-field-size"
                  className="text-[length:var(--ae-text-sm)] font-medium text-[var(--ae-text-secondary)]"
                >
                  Field Size (deg)
                </label>
                <input
                  ref={fieldSizeInputRef}
                  id="portal-field-size"
                  name="fieldSizeDeg"
                  type="text"
                  inputMode="decimal"
                  required
                  autoCorrect="off"
                  autoCapitalize="none"
                  spellCheck={false}
                  placeholder="0.5 deg"
                  value={values.fieldSizeDeg}
                  onChange={(e) =>
                    handleFieldChange("fieldSizeDeg", e.target.value)
                  }
                  onBlur={() => handleFieldBlur("fieldSizeDeg")}
                  aria-invalid={visibleErrors.fieldSizeDeg ? "true" : "false"}
                  aria-describedby={
                    visibleErrors.fieldSizeDeg
                      ? "portal-field-size-error"
                      : undefined
                  }
                  className="input input-bordered ae-field-input w-full"
                />
                {visibleErrors.fieldSizeDeg && (
                  <p
                    id="portal-field-size-error"
                    className="flex items-start gap-1.5 text-[length:var(--ae-text-sm)] text-[var(--ae-status-error)]"
                  >
                    <AlertCircle
                      className="mt-0.5 h-4 w-4 shrink-0"
                      aria-hidden="true"
                    />
                    <span>{visibleErrors.fieldSizeDeg}</span>
                  </p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 items-end gap-4 sm:grid-cols-3">
              <div className="flex flex-col gap-1.5 sm:col-span-2">
                <label
                  htmlFor="portal-date"
                  className="text-[length:var(--ae-text-sm)] font-medium text-[var(--ae-text-secondary)]"
                >
                  Observation Date
                </label>
                <input
                  ref={dateInputRef}
                  id="portal-date"
                  name="observationDate"
                  type="date"
                  required
                  value={values.observationDate}
                  onChange={(e) =>
                    handleFieldChange("observationDate", e.target.value)
                  }
                  onBlur={() => handleFieldBlur("observationDate")}
                  aria-invalid={
                    visibleErrors.observationDate ? "true" : "false"
                  }
                  aria-describedby={
                    visibleErrors.observationDate
                      ? "portal-date-error"
                      : undefined
                  }
                  className="input input-bordered ae-field-input w-full"
                />
                {visibleErrors.observationDate && (
                  <p
                    id="portal-date-error"
                    className="flex items-start gap-1.5 text-[length:var(--ae-text-sm)] text-[var(--ae-status-error)]"
                  >
                    <AlertCircle
                      className="mt-0.5 h-4 w-4 shrink-0"
                      aria-hidden="true"
                    />
                    <span>{visibleErrors.observationDate}</span>
                  </p>
                )}
              </div>

              <div className="flex flex-col justify-end">
                <button
                  type="submit"
                  className="btn btn-primary min-h-[2.75rem] w-full text-[length:var(--ae-text-base)] font-semibold"
                >
                  Query
                </button>
              </div>
            </div>
          </form>

          {coordinateMetadata && (
            <aside
              aria-label="Available coordinate metadata"
              aria-live="polite"
              className="rounded-lg border border-[var(--ae-border-subtle)] bg-[var(--ae-bg-elevated)] px-4 py-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-[length:var(--ae-text-sm)] font-semibold text-[var(--ae-accent-cyan)]">
                  <Database className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>
                    {coordinateMetadata.catalogId} |{" "}
                    {coordinateMetadata.targetName}
                  </span>
                </div>
                <span className="font-mono text-[length:var(--ae-text-sm)] text-[var(--ae-text-secondary)]">
                  {coordinateMetadata.frameCount} frames
                </span>
              </div>

              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[length:var(--ae-text-sm)] text-[var(--ae-text-muted)]">
                <span>{coordinateMetadata.instrument}</span>
                <span aria-hidden="true">|</span>
                <span className="flex items-center gap-1.5 font-mono text-[var(--ae-text-secondary)]">
                  <Layers className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>{coordinateMetadata.availableBands.join(" | ")}</span>
                </span>
                <span aria-hidden="true">|</span>
                <span className="font-mono">
                  {coordinateMetadata.observationWindow}
                </span>
              </div>
            </aside>
          )}
        </div>
      </div>
    </section>
  );
}
