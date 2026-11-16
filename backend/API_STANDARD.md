# Backend API Standard

This document defines conventions for implementing the Flask API consumed by the Astro Sentinella frontend. These are standards for future backend work; the current Hello World app does not yet implement the endpoints described here.

## Current Frontend Contracts

- `GET /api/metadata?ra={ra}&dec={dec}` returns coordinate metadata used to populate available observation dates.
- `GET /api/metadata/detectors?ra={ra}&dec={dec}&observationDate={date}` returns the
  detector files available for one date, including their wavelength ranges. This
  endpoint only queries SIA2 metadata; it does not download FITS data.
- `GET /api/frames?ra={ra}&dec={dec}&fieldSizeDeg={degrees}&observationDate={date}` returns the frames for an explorer query.
- `GET /api/frames/image?...&detector={1-6}` renders one detector on demand.
  `detectors=1,2,...` renders a comparison. The first available detector is used
  when no detector is specified.

Detector ranges are fixed by the SPHEREx instrument: D1 `0.75–1.11 µm`, D2
`1.11–1.66 µm`, D3 `1.64–2.42 µm`, D4 `2.42–3.18 µm`, D5 `3.18–4.41 µm`,
and D6 `4.41–5.00 µm`. FITS data is cached per detector URL after its first
render, so selecting a date does not download all six files.

Keep these contracts aligned with the frontend types and service validation in `frontend/src/types/portal.ts`, `frontend/src/types/explorer.ts`, `frontend/src/services/metadataService.ts`, and `frontend/src/services/framesService.ts`.

## Request Validation

- Validate all inputs on the server, even when the frontend performs the same validation.
- Require the parameters listed for each endpoint; reject missing, malformed, or out-of-range values before calling data providers.
- Normalize accepted coordinate representations consistently before lookup. Keep `fieldSizeDeg` in degrees and validate it against the supported range.
- Return a client error for invalid input. Do not silently substitute defaults for required query values.

## Response and Error Contracts

- Return JSON from API routes, with stable field names and types matching the frontend contracts.
- Use appropriate HTTP status codes: `200` for success, `400` for invalid input, `404` when a requested resource is not found, and `500` for unexpected server errors.
- Use a consistent JSON error shape, such as `{ "error": { "code": "invalid_request", "message": "..." } }`.
- Do not expose stack traces, secrets, or upstream response details in client-facing errors.
- Keep successful response shapes stable; make contract changes deliberately and update frontend types and tests together.

## Rate Limiting

- Enforce limits on the server; frontend debounce is a usability feature, not abuse protection.
- Apply limits to the API routes and choose an appropriate client identity strategy for the deployment environment. Avoid trusting arbitrary client-supplied identity headers unless a trusted proxy sets them.
- Respond to limit violations with `429 Too Many Requests` and include `Retry-After` when the retry interval is known.
- Keep limit configuration separate from route logic. Use a shared backend such as Redis when running multiple workers or instances; an in-memory limiter is only suitable for a single-process development setup.
- Test that limits apply to the intended routes and that the response is handled safely by the frontend.

## Production Configuration

- Disable Flask debug mode outside local development; use a production WSGI server rather than Flask's development server.
- Restrict CORS to explicitly configured frontend origins. Do not enable wildcard origins with credentials.
- Load secrets and environment-specific settings from environment configuration or a secret manager, never source control.
- Log request context and failures without recording secrets or unnecessarily sensitive query data.

## Testing Expectations

- Test each route's successful response against the documented JSON contract.
- Test missing, malformed, and out-of-range parameters, including coordinate and field-size validation.
- Test not-found and unexpected-provider-failure behavior without leaking internal details.
- Test rate-limit behavior, including the `429` status and `Retry-After` header when present.
- Keep route tests isolated from external catalogs and image providers by using controlled test doubles.
