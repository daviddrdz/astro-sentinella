# Astro Sentinella

Monorepo for **Astro Sentinella**, a layer-based telescope image comparison and analysis workspace.

## Structure

- `backend/` | Flask (Python) API and image calculation service
- `frontend/` | React + Vite + TypeScript + Tailwind CSS + DaisyUI workspace UI
- `.github/workflows/ci.yml` | CI pipeline for formatting, lint, typecheck, tests, and build

## Backend (`backend/`)

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python app.py
```

Runs on `http://127.0.0.1:5000`.

## Frontend (`frontend/`)

```bash
cd frontend
pnpm install
pnpm dev
```

Runs on `http://localhost:5173` with `/api` proxied to `http://127.0.0.1:5000`.

### Scripts

- `pnpm dev` | Start Vite dev server
- `pnpm build` | Typecheck and build production bundle
- `pnpm format` | Format code with Prettier
- `pnpm format:check` | Check Prettier formatting
- `pnpm lint` | Run ESLint (includes `no-magic-numbers` rule)
- `pnpm typecheck` | Run TypeScript compiler check
- `pnpm test` | Run Vitest unit and component tests

## Frontend Architecture (`frontend/src/`)

- **SSOT Design Tokens & Config**:
  - `styles/tokens.css` & `index.css`: `astro-dark` DaisyUI theme tokens, responsive `clamp()` typography, and self-hosted `IBM Plex Sans` / `IBM Plex Mono` fonts.
  - `config/app.ts` & `config/explorer.ts`: Centralized constants, coordinate bounds, debounce timing, history limits, tool/band/tint/filter definitions, and `EN | ES` copy.
- **Query Portal (`components/QueryPortalCard.tsx`, `components/PortalNavbar.tsx`, `components/DocsModal.tsx`)**:
  - Client-side validation for `RA` (HMS or degrees), `Dec` (DMS or degrees), and `Field Size (deg)`.
  - Coordinate debounce (`APP_CONFIG.metadataDebounceMs`) before querying `APP_CONFIG.metadataEndpoint`, showing a loading spinner while checking available observation dates, then revealing the date dropdown or a retry prompt (`No observation dates found in preview.`).
  - Validated browser query history in `localStorage` (configured via `PORTAL_HISTORY_CONFIG.maxItems`) powering prefix-ranked autocomplete suggestions (`PORTAL_HISTORY_CONFIG.maxSuggestions`) on `RA` and `Dec`.
- **Explorer (`components/explorer/`)**:
  - `ExplorerTopBar`: Back to Portal, query summary (`RA | Dec | arcmin | Date`), Undo/Redo, `Merge / Export`, `Docs`, `GitHub`, `EN | ES` toggle, and mobile `Layers (N)` drawer trigger.
  - `ExplorerToolbar`: Desktop tool rail (`Pan`, `Zoom`, `Split`, `Subtract`, `Region`, `Ruler`, `Reset`) and mobile compact dock.
  - `ExplorerCanvas`: Multi-layer viewport with blend modes, opacity, channel tints, CSS filters, tool overlays, and astrometric HUD.
  - `LayersInspector` & `MobileLayersDrawer`: Layer visibility toggles, `+ Add`, `Blend Mode`, `Band / Channel`, `Channel Tint`, `Opacity` slider, `Stretch`/`Contrast`/`Invert`/`Edges` filters, and `Merge Visible`.
  - `ExplorerTimeline`: `All` / `Visible` / `Filtered` tabs, band filter, playback controls (`SkipBack`, `Play`/`Pause`, `SkipForward`), and frame strip backed by `services/framesService.ts` (`/api/frames`).

## Pre-commit Hook

`frontend/.husky/pre-commit` enforces:

1. `pnpm run format:check`
2. `pnpm run lint`
3. `pnpm run typecheck`
4. `pnpm run test`
5. `python3 -m py_compile backend/app.py`
