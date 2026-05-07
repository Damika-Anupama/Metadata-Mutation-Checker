import os
import shutil
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from app.metadata_extractor import extract_metadata
from app.mutation_checker import run_metadata_checks
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


@app.get("/")
def health_check():
    return {
        "status": "running",
        "message": "Metadata Mutation Checker API is active"
    }


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
        raise HTTPException(status_code=500, detail=str(e))

    finally:
        if os.path.exists(file_path):
            os.remove(file_path)