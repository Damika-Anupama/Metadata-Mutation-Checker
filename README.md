# Document Metadata Mutation Checker

Full-stack application for analyzing PDF document metadata and detecting potential mutation signals. Uploads a PDF, extracts metadata, runs rule-based checks, and returns a scored risk report with detailed findings.

**Live demo:** [metadata-mutation-checker-chi.vercel.app](https://metadata-mutation-checker-chi.vercel.app/)

## Demo

![Metadata Mutation Checker demo](assets/metadata-mutation-checker-demo.gif)

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 16, React 19, TypeScript, Tailwind CSS |
| Backend | Python 3.11, FastAPI, pypdf |
| Infrastructure | Docker, Docker Compose |

## Features

- PDF upload with drag & drop
- Metadata extraction (author, creator, producer, dates, encryption, page count, etc.)
- Rule-based mutation signal checks across 4 categories: dates, software, missing fields, structure
- Risk score (0–100) with Low / Medium / High classification
- Findings panel with severity, confidence, and explanations
- Side-by-side document comparison mode
- Export report as JSON or TXT
- Searchable metadata table

## Project Structure

```
.
├── backend/          # Python FastAPI — metadata extraction & risk scoring
│   ├── app/
│   │   ├── main.py
│   │   ├── metadata_extractor.py
│   │   ├── mutation_checker.py
│   │   └── risk_scoring.py
│   ├── Dockerfile
│   └── requirements.txt
├── frontend/         # Next.js — upload UI, report view, compare mode
│   ├── app/
│   ├── lib/
│   ├── Dockerfile
│   └── .env.example
├── docker-compose.yml
└── assets/
```

## Branches

| Branch | Description |
|---|---|
| `main` | Full-stack source — Python backend + Next.js frontend + Docker |
| `frontend-demo` | Self-contained Next.js demo deployed on Vercel (no Python required) |

## Run with Docker

```bash
docker compose up --build
```

Frontend: http://localhost:3000  
Backend API: http://localhost:8000

## Local Development

### Backend

```bash
cd backend
python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

Backend runs at `http://localhost:8000`.

### Frontend

```bash
cd frontend
cp .env.example .env.local      # sets BACKEND_URL=http://localhost:8000
npm install
npm run dev
```

Frontend runs at `http://localhost:3000`.

## Risk Scoring Logic

Each finding contributes to the final score based on severity and confidence.

| Severity | Weight |
|---|---|
| Low | 10 |
| Medium | 25 |
| High | 45 |

Multiple findings across different categories add a category bonus. Weak findings alone are capped to avoid false-positive high-risk results.

Risk levels: **Low** (0–30) · **Medium** (31–65) · **High** (66–100)

## Rules Implemented

**Date checks** — modified before created, large creation-to-modification gap, unusual date formats, both dates missing

**Software checks** — creator/producer mismatch, references to editing tools (Acrobat, Preview, Photoshop, Illustrator, Canva, online PDF editors)

**Missing metadata** — blank author, blank title

**Structural checks** — encryption status, zero page count
