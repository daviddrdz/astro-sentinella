# Backend API Standard

This document defines conventions for implementing the Flask API consumed by the Astro Sentinella frontend. These are standards for future backend work; the current Hello World app does not yet implement the endpoints described here.

## Current Frontend Contracts

- `GET /api/metadata?ra={ra}&dec={dec}` returns coordinate metadata used to populate available observation dates.
- `GET /api/frames?ra={ra}&dec={dec}&fieldSizeDeg={degrees}&observationDate={date}` returns the frames for an explorer query.
- `GET /api/frames/spectrum?ra={ra}&dec={dec}&fieldSizeDeg={degrees}&observationDate={date}&x={0..1}&y={0..1}` returns the quick-look spectrum (flux vs wavelength, 102 SPHEREx channels) of the chunk under a click on the rendered frame image.
- `GET /api/spectrum/observations?ra={ra}&dec={dec}[&aperturePx=1|3|5][&detectors=1,2,...]` returns the per-exposure spectrum at a sky position, assembled from one pixel of every Level-2 exposure covering it. Slow (seconds); meant as an opt-in detail view, not for the click path.

### Chunk spectrum

`x` and `y` are the click position as fractions of the rendered image (`x` left to right, `y` top to bottom). The backend owns the chunk grid: cells are about `SPECTRUM_CHUNK_ARCSEC` (default 26″, ~2 HiPS cube pixels) on a side, so the client never hard-codes the grid size. Chunk corners go through the frame's WCS to the sky and into the SPHEREx DR1 HiPS cube, where the cube pixels inside the chunk are averaged per channel. The cube is an all-mission mosaic: the spectrum is of the sky region, not of the selected observation date, and it is for visualization only.

```json
{
  "chunk": { "row": 0, "col": 3, "rows": 7, "cols": 7, "sizeArcsec": 25.48,
             "bounds": { "left": 0.4286, "top": 0.0, "width": 0.1429, "height": 0.1429 } },
  "center": { "ra": 133.79, "dec": -7.24 },
  "pixelCount": 4,
  "unit": "MJy/sr",
  "source": "SPHEREx DR1 HiPS cube (all-mission mosaic, quick-look)",
  "points": [ { "wavelengthUm": 0.7536, "bandwidthUm": 0.0189, "flux": 0.42 }, "... 102 items, sorted by wavelength; flux is null for channels without coverage" ]
}
```

Errors: `400 invalid_request`, `404 image_not_found` (no frame on that date), `404 spectrum_unavailable` (no cube coverage for the chunk), `502 spectrum_source_unavailable`. The route has its own rate limit, `SPECTRUM_RATE_LIMIT` (default `30 per minute`).

The field cube behind this endpoint is prefetched in the background whenever `/api/frames/image` renders a frame, so the first click on a freshly loaded frame is usually served from cache.

Keep these contracts aligned with the frontend types and service validation in `frontend/src/types/portal.ts`, `frontend/src/types/explorer.ts`, `frontend/src/services/metadataService.ts`, and `frontend/src/services/framesService.ts`.

### Observations spectrum response

```json
{
  "position": { "ra": 10.68, "dec": 41.27 },
  "aperturePx": 1,
  "unit": "MJy/sr",
  "source": "SPHEREx DR1 Level-2 exposures (per-observation samples)",
  "points": [
    { "wavelengthUm": 0.75, "bandwidthUm": 0.018, "flux": 95.2, "error": 0.38, "zodi": 0.15,
      "detector": 1, "obsId": "2025W28_1B_0480_4", "mjd": 60865.62 }
  ],
  "binned": [
    { "wavelengthUm": 0.75, "wavelengthMinUm": 0.745, "wavelengthMaxUm": 0.764, "flux": 95.2,
      "error": 0.38, "detector": 1, "n": 1 }
  ],
  "coverage": { "exposures": 229, "used": 171, "outOfBounds": 1, "failed": 0, "timedOut": 57,
                "detectors": [1, 2, 3, 4, 5, 6] },
  "status": "complete" | "partial"
}
```

- `points` are raw per-exposure samples sorted by wavelength, already zodiacal-light subtracted (`zodi` is the subtracted value). `flux`/`error`/`zodi`/`mjd` are `null` when unavailable.
- `binned` is the chart series: inverse-variance weighted means in 17 log-spaced bins per detector (at most 102 bins), after 3-sigma clipping. `error` is `null` when any member lacks a variance.
- `status` is `partial` when some exposures failed or exceeded the server deadline; the payload is still usable and is not cached.
- Errors: `400 invalid_request`, `404 no_coverage` (no exposures at the position), `502 image_source_unavailable`. Rate limit: `OBSERVATIONS_RATE_LIMIT` (default `6 per minute`).

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
