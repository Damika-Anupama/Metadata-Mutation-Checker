# Metadata Mutation Checker

[![CI](https://github.com/Damika-Anupama/Metadata-Mutation-Checker/actions/workflows/ci.yml/badge.svg)](https://github.com/Damika-Anupama/Metadata-Mutation-Checker/actions/workflows/ci.yml)

> Full-stack PDF metadata forensics tool that flags backdating and tampering **signals** for manual review — it does **not** confirm document tampering.

**🔗 Live demo:** [metadata-mutation-checker-chi.vercel.app](https://metadata-mutation-checker-chi.vercel.app/)

> ⚠️ **Disclaimer:** This tool extracts PDF metadata and applies rule-based heuristics to surface *potential* indicators of manipulation. A flagged document is **not** proof of tampering — results are signals intended for human review.

---

## Branch convention

| Branch | Purpose |
|---|---|
| `main` | Full-stack source — **Next.js frontend + FastAPI backend** (Docker-composed) |
| `frontend-demo` | Frontend-only build deployed to Vercel (the live demo above) |

---

## Overview

Upload a PDF and the tool parses its raw metadata, runs a series of rule-based checks, and produces a weighted **risk score (0–100)** alongside a breakdown of which signals fired. It is built as two services: a Python/FastAPI API that does the parsing and scoring, and a Next.js UI that handles upload, visualisation, and reporting.

## Key features

- **Raw metadata extraction** from PDF documents (via `pypdf`)
- **Rule-based mutation checks** — date anomalies, impossible tool/version vs. year combinations, timezone shifts, incremental update markers, and encryption/structure flags
- **Weighted risk scoring** (0–100) with a per-signal breakdown
- **Clean upload UX** with drag-and-drop and instant analysis
- **Dockerised** — single `docker compose up` brings the full stack online

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 16, React 19, TypeScript 5, Tailwind CSS 4 |
| Backend | Python, FastAPI, Uvicorn, pypdf, Pydantic, prometheus-client |
| Tooling / Deploy | Docker, docker-compose, Vercel (frontend demo), ESLint 9, Playwright (E2E), GitHub Actions CI |

## Project structure

```
.
├── frontend/                 # Next.js app (upload UI, results, scoring view)
│   └── src/
├── backend/                  # FastAPI service
│   └── app/
│       ├── main.py           # API entrypoint / routes
│       ├── metadata_extractor.py
│       ├── mutation_checker.py
│       ├── risk_scoring.py
│       └── schemas.py
├── docker-compose.yml        # frontend + backend orchestration
└── vercel.json
```

## Local development

### Full stack (Docker)

```bash
docker compose up --build
# frontend → http://localhost:3000
# backend  → http://localhost:8000
```

### Run services individually

**Backend**
```bash
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

**Frontend**
```bash
cd frontend
npm install
npm run dev          # http://localhost:3000
```

## Testing

The backend has a `pytest` suite covering the scoring logic, metadata heuristics, the API contract, and the Prometheus metrics endpoint.

```bash
cd backend
pip install -r requirements.txt -r requirements-dev.txt
pytest -q          # run the suite
ruff check app tests   # lint
```

The frontend has a **Playwright** end-to-end suite that drives a real Chromium
browser against the running app — covering page render, the demo/sample-document
flow, the risk-score and findings rendering, upload validation, and tab switching.
Because the demo path is fully client-side, the suite also runs green against the
backend-free Vercel preview deploy.

```bash
cd frontend
npm install
npx playwright install chromium
npm run test:e2e                      # run against a locally booted server
E2E_BASE_URL=https://<preview-url> npm run test:e2e   # run against a deployed preview
```

Both suites run automatically on every push and pull request via GitHub Actions (see the CI badge above): a `backend-tests` job (pytest + ruff) and a `frontend-e2e` job (build + Playwright, with the HTML report uploaded as an artifact).

## Observability

The API emits **structured JSON logs** and tags every request for tracing:

- Each response includes an `X-Request-ID` (generated if not supplied) and an `X-Process-Time-ms` latency header.
- Every request produces a `request_completed` JSON log line with method, path, status, and duration.
- Document analysis emits a `document_analyzed` event with the risk score, level, and number of findings; failures log a structured `analyze_failed` event.

Example log line:

```json
{"ts": "2026-06-20T03:10:00Z", "level": "INFO", "logger": "metadata_checker", "message": "request_completed", "request_id": "a1b2c3", "method": "POST", "path": "/analyze", "status_code": 200, "duration_ms": 12.4}
```

This makes the service ready for log aggregation (e.g. CloudWatch, Grafana Loki, Datadog) and per-request latency tracking.

### Prometheus metrics

The API also exposes a **Prometheus** scrape endpoint at `GET /metrics` (standard text exposition format), ready to wire into Prometheus + Grafana:

| Metric | Type | Labels | Meaning |
|---|---|---|---|
| `http_requests_total` | counter | `method`, `path`, `status` | Total HTTP requests processed |
| `http_request_duration_seconds` | histogram | `method`, `path` | Request latency distribution |
| `documents_analyzed_total` | counter | `risk_level` | Documents analyzed, by computed risk level |
| `analyze_failures_total` | counter | — | Analyses that ended in an error |

Path labels are normalized to a bounded set (`/`, `/analyze`, `/metrics`, `/other`) to keep cardinality safe. Example scrape config:

```yaml
scrape_configs:
  - job_name: metadata-mutation-checker
    metrics_path: /metrics
    static_configs:
      - targets: ["localhost:8000"]
```

## Screenshots

> _Add screenshots / demo GIF here (see `assets/`)._

## Author

**Damika Anupama Nanayakkara** — [Portfolio](https://damika.is-a.dev/) · [GitHub](https://github.com/Damika-Anupama) · [LinkedIn](https://www.linkedin.com/in/damika-anupama)
