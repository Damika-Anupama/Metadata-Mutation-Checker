# Metadata Mutation Checker

Frontend-only Next.js demo for checking PDF metadata consistency and potential mutation signals.

Live demo:

```text
https://metadata-mutation-checker-chi.vercel.app/
```

## Branches

`main` is intentionally kept as the Vercel-ready frontend-only demo branch. The app, API route, and shared metadata-analysis logic live at the repository root so Vercel can deploy from the project root without extra root-directory settings.

For the older full-stack structure with separate `frontend/` and `backend/` folders, refer to:

```text
legacy-fullstack-main
```

## Local Development

```bash
npm install
npm run dev
```

Open:

```text
http://localhost:3000
```

## API

The PDF analysis runs in the same Next.js deployment:

```text
POST /api/analyze
```

Upload field:

```text
file
```

Optional environment variable:

```text
MAX_UPLOAD_SIZE_MB=8
```

## Deploy on Vercel

Use the repository root as the Vercel root directory.

Recommended settings:

```text
Branch: main
Root Directory: leave blank / project root
Framework: Next.js
Install Command: npm install
Build Command: npm run build
Output Directory: leave blank / default
```

Output is handled by Next.js automatically.
