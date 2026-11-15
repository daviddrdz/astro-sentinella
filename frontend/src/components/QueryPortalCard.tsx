import { useEffect, useId, useMemo, useRef, useState } from "react";
import { AlertCircle, Database, History, Layers, Trash2 } from "lucide-react";
import {
  APP_CONFIG,
  PORTAL_HISTORY_CONFIG,
  PORTAL_PLACEHOLDERS,
} from "../config/app";
import { fetchCoordinateMetadata } from "../services/metadataService";
import {
  clearQueryHistory,
  loadQueryHistory,
  saveQueryHistoryEntry,
} from "../services/queryHistoryService";
import type { CoordinateMetadata, QueryParams } from "../types/portal";
import {
  hasValidCoordinates,
  validateQueryParams,
  type QueryFieldErrors,
} from "../utils/coordinates";

interface QueryPortalCardProps {
  initialValues?: QueryParams;
  onSubmitQuery: (params: QueryParams) => void;
}

const EMPTY_VALUES: QueryParams = {
  ra: "",
  dec: "",
  fieldSizeDeg: "",
  observationDate: "",
};

type TouchedFields = Partial<Record<keyof QueryParams, boolean>>;

export function QueryPortalCard({
  initialValues = EMPTY_VALUES,
  onSubmitQuery,
}: QueryPortalCardProps) {
  const headingId = useId();
  const raInputRef = useRef<HTMLInputElement>(null);
  const decInputRef = useRef<HTMLInputElement>(null);
  const fieldSizeInputRef = useRef<HTMLInputElement>(null);
  const dateSelectRef = useRef<HTMLSelectElement>(null);

  const [values, setValues] = useState<QueryParams>(initialValues);
  const [touched, setTouched] = useState<TouchedFields>({});
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const [history, setHistory] = useState<QueryParams[]>(() =>
    loadQueryHistory()
  );
  const [autocompleteField, setAutocompleteField] = useState<
    "ra" | "dec" | null
  >(null);
  const [fetchedMetadata, setFetchedMetadata] = useState<{
    key: string;
    data: CoordinateMetadata;
  } | null>(null);

  const coordinatesReady = hasValidCoordinates(values.ra, values.dec);
  const coordinateKey = coordinatesReady
    ? `${values.ra.trim()}|${values.dec.trim()}`
    : "";

  useEffect(() => {
    if (!coordinatesReady) {
      return;
    }

    const controller = new AbortController();
    fetchCoordinateMetadata(values.ra, values.dec, controller.signal).then(
      (data) => {
        if (!controller.signal.aborted && data) {
          setFetchedMetadata({ key: coordinateKey, data });
        }
      }
    );

    return () => controller.abort();
  }, [coordinatesReady, coordinateKey, values.ra, values.dec]);

  const coordinateMetadata =
    coordinatesReady && fetchedMetadata?.key === coordinateKey
      ? fetchedMetadata.data
      : null;

  const availableDates = useMemo(
    () => coordinateMetadata?.availableDates ?? [],
    [coordinateMetadata]
  );

  const selectedObservationDate =
    availableDates.length === 0
      ? PORTAL_PLACEHOLDERS.observationDate
      : availableDates.includes(values.observationDate)
        ? values.observationDate
        : "";

  const allErrors = useMemo(
    () =>
      validateQueryParams({
        ...values,
        observationDate: selectedObservationDate,
      }),
    [values, selectedObservationDate]
  );

  const visibleErrors: QueryFieldErrors = useMemo(() => {
    const visible: QueryFieldErrors = {};
    (Object.keys(allErrors) as (keyof QueryParams)[]).forEach((key) => {
      if (hasSubmitted || touched[key]) {
        visible[key] = allErrors[key];
      }
    });
    return visible;
  }, [allErrors, hasSubmitted, touched]);

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
    else if (errors.observationDate) dateSelectRef.current?.focus();
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

    const submissionValues: QueryParams = {
      ...values,
      observationDate: selectedObservationDate,
    };
    const submissionErrors = validateQueryParams(submissionValues);

    if (Object.keys(submissionErrors).length > 0) {
      focusFirstInvalidField(submissionErrors);
      return;
    }

    const normalizedQuery: QueryParams = {
      ra: submissionValues.ra.trim(),
      dec: submissionValues.dec.trim(),
      fieldSizeDeg: submissionValues.fieldSizeDeg
        .trim()
        .replace(/\s*deg\s*$/i, ""),
      observationDate: submissionValues.observationDate.trim(),
    };
    setHistory(saveQueryHistoryEntry(normalizedQuery));
    onSubmitQuery(normalizedQuery);
  };

  const handleSelectHistory = (entry: QueryParams) => {
    setValues(entry);
    setHasSubmitted(false);
    setTouched({});
    setAutocompleteField(null);
  };

  const raSuggestions = useMemo(() => {
    const term = values.ra.trim().toLowerCase();
    return history.filter((item) =>
      term.length === PORTAL_HISTORY_CONFIG.emptyLength
        ? true
        : item.ra.toLowerCase().includes(term)
    );
  }, [history, values.ra]);

  const decSuggestions = useMemo(() => {
    const term = values.dec.trim().toLowerCase();
    return history.filter((item) =>
      term.length === PORTAL_HISTORY_CONFIG.emptyLength
        ? true
        : item.dec.toLowerCase().includes(term)
    );
  }, [history, values.dec]);

  const handleClearHistory = () => {
    clearQueryHistory();
    setHistory([]);
  };

  return (
    <section className="w-full max-w-2xl">
      <div className="card border border-[var(--ae-border-subtle)] bg-[var(--ae-bg-surface)] shadow-2xl">
        <div className="card-body gap-5 p-6 sm:p-8">
          <h1
            id={headingId}
            className="text-[length:var(--ae-text-2xl)] font-bold tracking-tight text-[var(--ae-text-primary)]"
          >
            {APP_CONFIG.name}
          </h1>

          <form
            role="search"
            noValidate
            aria-labelledby={headingId}
            onSubmit={handleSubmit}
            className="flex flex-col gap-5"
          >
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="relative flex flex-col gap-1.5">
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
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="none"
                  spellCheck={false}
                  placeholder={PORTAL_PLACEHOLDERS.ra}
                  value={values.ra}
                  onFocus={() => setAutocompleteField("ra")}
                  onChange={(e) => {
                    handleFieldChange("ra", e.target.value);
                    setAutocompleteField("ra");
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") {
                      setAutocompleteField(null);
                    }
                  }}
                  onBlur={() => {
                    setAutocompleteField(null);
                    handleFieldBlur("ra");
                  }}
                  aria-invalid={visibleErrors.ra ? "true" : "false"}
                  aria-describedby={
                    visibleErrors.ra ? "portal-ra-error" : undefined
                  }
                  className="input input-bordered ae-field-input w-full"
                />
                {autocompleteField === "ra" &&
                  raSuggestions.length > PORTAL_HISTORY_CONFIG.emptyLength && (
                    <ul
                      role="listbox"
                      aria-label="RA autocomplete suggestions"
                      className="absolute top-full right-0 left-0 z-20 mt-1 max-h-48 overflow-y-auto rounded-lg border border-[var(--ae-border-subtle)] bg-[var(--ae-bg-elevated)] p-1 shadow-xl"
                    >
                      {raSuggestions.map((entry) => (
                        <li
                          key={`${entry.ra}|${entry.dec}|${entry.fieldSizeDeg}`}
                          role="option"
                          aria-selected={entry.ra === values.ra}
                        >
                          <button
                            type="button"
                            onMouseDown={(e) => {
                              e.preventDefault();
                              handleSelectHistory(entry);
                            }}
                            className="flex w-full flex-col rounded px-2.5 py-1.5 text-left font-mono text-[length:var(--ae-text-sm)] text-[var(--ae-text-primary)] hover:bg-[var(--ae-primary)]/15"
                          >
                            <span>{entry.ra}</span>
                            <span className="text-[var(--ae-text-muted)]">
                              {`${entry.dec} | ${entry.fieldSizeDeg} deg`}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
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

              <div className="relative flex flex-col gap-1.5">
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
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="none"
                  spellCheck={false}
                  placeholder={PORTAL_PLACEHOLDERS.dec}
                  value={values.dec}
                  onFocus={() => setAutocompleteField("dec")}
                  onChange={(e) => {
                    handleFieldChange("dec", e.target.value);
                    setAutocompleteField("dec");
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") {
                      setAutocompleteField(null);
                    }
                  }}
                  onBlur={() => {
                    setAutocompleteField(null);
                    handleFieldBlur("dec");
                  }}
                  aria-invalid={visibleErrors.dec ? "true" : "false"}
                  aria-describedby={
                    visibleErrors.dec ? "portal-dec-error" : undefined
                  }
                  className="input input-bordered ae-field-input w-full"
                />
                {autocompleteField === "dec" &&
                  decSuggestions.length > PORTAL_HISTORY_CONFIG.emptyLength && (
                    <ul
                      role="listbox"
                      aria-label="Dec autocomplete suggestions"
                      className="absolute top-full right-0 left-0 z-20 mt-1 max-h-48 overflow-y-auto rounded-lg border border-[var(--ae-border-subtle)] bg-[var(--ae-bg-elevated)] p-1 shadow-xl"
                    >
                      {decSuggestions.map((entry) => (
                        <li
                          key={`${entry.ra}|${entry.dec}|${entry.fieldSizeDeg}`}
                          role="option"
                          aria-selected={entry.dec === values.dec}
                        >
                          <button
                            type="button"
                            onMouseDown={(e) => {
                              e.preventDefault();
                              handleSelectHistory(entry);
                            }}
                            className="flex w-full flex-col rounded px-2.5 py-1.5 text-left font-mono text-[length:var(--ae-text-sm)] text-[var(--ae-text-primary)] hover:bg-[var(--ae-primary)]/15"
                          >
                            <span>{entry.dec}</span>
                            <span className="text-[var(--ae-text-muted)]">
                              {`${entry.ra} | ${entry.fieldSizeDeg} deg`}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
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
                  placeholder={PORTAL_PLACEHOLDERS.fieldSizeDeg}
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
              {coordinatesReady && (
                <div className="ae-slide-down flex flex-col gap-1.5 sm:col-span-2">
                  <label
                    htmlFor="portal-date"
                    className="text-[length:var(--ae-text-sm)] font-medium text-[var(--ae-text-secondary)]"
                  >
                    Observation Date
                  </label>
                  <select
                    ref={dateSelectRef}
                    id="portal-date"
                    name="observationDate"
                    required
                    value={selectedObservationDate}
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
                    className="select select-bordered ae-field-input w-full"
                  >
                    {availableDates.length > 0 ? (
                      <>
                        <option value="" disabled>
                          Select observation date
                        </option>
                        {availableDates.map((dateOption) => (
                          <option key={dateOption} value={dateOption}>
                            {dateOption}
                          </option>
                        ))}
                      </>
                    ) : (
                      <option value={PORTAL_PLACEHOLDERS.observationDate}>
                        {`Default (${PORTAL_PLACEHOLDERS.observationDate})`}
                      </option>
                    )}
                  </select>
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
              )}

              <div
                className={`flex flex-col justify-end ${
                  coordinatesReady ? "" : "sm:col-span-3"
                }`}
              >
                <button
                  type="submit"
                  className="btn btn-primary min-h-[var(--ae-control-height)] w-full text-[length:var(--ae-text-base)] font-semibold"
                >
                  Query
                </button>
              </div>
            </div>
          </form>

          {history.length > PORTAL_HISTORY_CONFIG.emptyLength && (
            <section
              aria-label="Recent coordinate queries"
              className="flex flex-col gap-2 border-t border-[var(--ae-border-subtle)] pt-4"
            >
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-[length:var(--ae-text-sm)] font-medium text-[var(--ae-text-muted)]">
                  <History
                    className="h-3.5 w-3.5 shrink-0"
                    aria-hidden="true"
                  />
                  <span>Recent</span>
                </span>
                <button
                  type="button"
                  onClick={handleClearHistory}
                  aria-label="Clear recent queries"
                  className="btn btn-ghost btn-xs gap-1 text-[var(--ae-text-muted)] hover:text-[var(--ae-text-primary)]"
                >
                  <Trash2 className="h-3 w-3 shrink-0" aria-hidden="true" />
                  <span>Clear</span>
                </button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {history.map((entry) => {
                  const label = `${entry.ra} | ${entry.dec} | ${entry.fieldSizeDeg} deg`;
                  return (
                    <button
                      key={label}
                      type="button"
                      onClick={() => handleSelectHistory(entry)}
                      className="btn btn-xs h-auto min-h-7 border border-[var(--ae-border-subtle)] bg-[var(--ae-bg-elevated)] px-2.5 py-1 font-mono text-[length:var(--ae-text-sm)] font-normal text-[var(--ae-text-secondary)] hover:border-[var(--ae-primary)] hover:text-[var(--ae-text-primary)]"
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </section>
          )}

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
                {coordinateMetadata.instrument && (
                  <>
                    <span>{coordinateMetadata.instrument}</span>
                    <span aria-hidden="true">|</span>
                  </>
                )}
                <span className="flex items-center gap-1.5 font-mono text-[var(--ae-text-secondary)]">
                  <Layers className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>{coordinateMetadata.availableBands.join(" | ")}</span>
                </span>
                {coordinateMetadata.observationWindow && (
                  <>
                    <span aria-hidden="true">|</span>
                    <span className="font-mono">
                      {coordinateMetadata.observationWindow}
                    </span>
                  </>
                )}
              </div>
            </aside>
          )}
        </div>
      </div>
    </section>
  );
}
