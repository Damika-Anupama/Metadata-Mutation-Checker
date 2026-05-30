# Metadata Mutation Checker — Frontend

Next.js frontend for the Document Metadata Mutation Checker. Communicates with the Python FastAPI backend via a proxied `/api/analyze` route.

See the [root README](../README.md) for the full project overview, Docker setup, and architecture.

## Local Development

```bash
cp .env.example .env.local      # sets BACKEND_URL=http://localhost:8000
npm install
npm run dev
```

Frontend runs at `http://localhost:3000`. Requires the backend running separately (see root README).

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `BACKEND_URL` | `http://localhost:8000` | URL of the Python FastAPI backend |

## Run with Docker

From the project root:

```bash
docker compose up --build
```
