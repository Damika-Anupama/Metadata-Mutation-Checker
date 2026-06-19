# Metadata Mutation Checker

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
| Backend | Python, FastAPI, Uvicorn, pypdf, Pydantic |
| Tooling / Deploy | Docker, docker-compose, Vercel (frontend demo), ESLint 9 |

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

## Screenshots

> _Add screenshots / demo GIF here (see `assets/`)._

## Author

**Damika Anupama Nanayakkara** — [Portfolio](https://damika.is-a.dev/) · [GitHub](https://github.com/Damika-Anupama) · [LinkedIn](https://www.linkedin.com/in/damika-anupama)
