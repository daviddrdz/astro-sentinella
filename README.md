# Astro Earth

Monorepo for **Astro Earth**, a layer-based telescope image comparison and analysis workspace.

## Structure

- `backend/` | Flask (Python) API and image calculation service
- `frontend/` | React + Vite + TypeScript + Tailwind CSS + DaisyUI workspace UI
- `.github/workflows/ci.yml` | CI pipeline for lint, typecheck, tests, and build

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
- `pnpm lint` | Run ESLint
- `pnpm typecheck` | Run TypeScript compiler check
- `pnpm test` | Run Vitest unit/component tests
