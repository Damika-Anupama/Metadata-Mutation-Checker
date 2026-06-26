import logging
import os
import shutil
import time
import uuid

from fastapi import FastAPI, UploadFile, File, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response

from app.metadata_extractor import extract_metadata
from app.mutation_checker import run_metadata_checks
from app.observability import logger, log_event
from app import metrics
from app.risk_scoring import (
    calculate_risk_score,
    get_risk_level,
    get_summary,
    get_recommended_action,
)

UPLOAD_DIR = "uploads"

app = FastAPI(title="Metadata Mutation Checker API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000", "http://0.0.0.0:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def observability_middleware(request: Request, call_next):
    """Attach a request id, measure latency, and emit a structured access log."""
    request_id = request.headers.get("X-Request-ID") or uuid.uuid4().hex
    start = time.perf_counter()
    try:
        response = await call_next(request)
    except Exception:
        elapsed_ms = round((time.perf_counter() - start) * 1000, 2)
        log_event(
            logger, logging.ERROR, "request_failed",
            request_id=request_id, method=request.method,
            path=request.url.path, duration_ms=elapsed_ms,
        )
        raise
    elapsed_ms = round((time.perf_counter() - start) * 1000, 2)
    response.headers["X-Request-ID"] = request_id
    response.headers["X-Process-Time-ms"] = str(elapsed_ms)
    metrics.record_request(
        request.method, request.url.path, response.status_code, elapsed_ms / 1000
    )
    log_event(
        logger, logging.INFO, "request_completed",
        request_id=request_id, method=request.method,
        path=request.url.path, status_code=response.status_code,
        duration_ms=elapsed_ms,
    )
    return response


@app.get("/")
def health_check():
    return {
        "status": "running",
        "message": "Metadata Mutation Checker API is active"
    }


@app.get("/metrics")
def metrics_endpoint():
    """Prometheus scrape endpoint (text exposition format)."""
    payload, content_type = metrics.render_latest()
    return Response(content=payload, media_type=content_type)


@app.post("/analyze")
async def analyze_document(file: UploadFile = File(...)):
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(
            status_code=400,
            detail="Only PDF files are supported in this implementation."
        )

    os.makedirs(UPLOAD_DIR, exist_ok=True)

    file_path = os.path.join(UPLOAD_DIR, file.filename)

    try:
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        metadata = extract_metadata(file_path, file.filename)
        findings = run_metadata_checks(metadata)

        risk_score = calculate_risk_score(findings)
        risk_level = get_risk_level(risk_score)

        log_event(
            logger, logging.INFO, "document_analyzed",
            document_name=file.filename,
            risk_score=risk_score, risk_level=risk_level,
            findings_count=len(findings),
        )
        metrics.record_analysis(risk_level)

        report = {
            "document_name": file.filename,
            "file_type": metadata.get("file_type"),
            "metadata_risk_score": risk_score,
            "metadata_risk_level": risk_level,
            "summary": get_summary(risk_score),
            "extracted_metadata": metadata,
            "findings": findings,
            "recommended_action": get_recommended_action(risk_score),
            "disclaimer": "Metadata indicators are not proof of tampering. They should be reviewed with additional evidence."
        }

        return report

    except Exception as e:
        log_event(
            logger, logging.ERROR, "analyze_failed",
            document_name=file.filename, error=str(e),
        )
        metrics.record_analysis_failure()
        raise HTTPException(status_code=500, detail=str(e))

    finally:
        if os.path.exists(file_path):
            os.remove(file_path)
