"""Integration tests for the FastAPI app using TestClient.

A minimal valid PDF is generated in-memory with pypdf so tests need no fixtures
on disk and run deterministically in CI.
"""
import io

from fastapi.testclient import TestClient
from pypdf import PdfWriter

from app.main import app

client = TestClient(app)


def _make_pdf_bytes(pages: int = 1) -> bytes:
    writer = PdfWriter()
    for _ in range(pages):
        writer.add_blank_page(width=200, height=200)
    buf = io.BytesIO()
    writer.write(buf)
    return buf.getvalue()


def test_health_check():
    resp = client.get("/")
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "running"


def test_analyze_rejects_non_pdf():
    resp = client.post(
        "/analyze",
        files={"file": ("notes.txt", b"hello", "text/plain")},
    )
    assert resp.status_code == 400
    assert "PDF" in resp.json()["detail"]


def test_analyze_accepts_pdf_and_returns_report():
    pdf = _make_pdf_bytes(pages=1)
    resp = client.post(
        "/analyze",
        files={"file": ("doc.pdf", pdf, "application/pdf")},
    )
    assert resp.status_code == 200
    report = resp.json()
    # Core report contract
    for key in (
        "document_name",
        "metadata_risk_score",
        "metadata_risk_level",
        "summary",
        "extracted_metadata",
        "findings",
        "recommended_action",
        "disclaimer",
    ):
        assert key in report
    assert report["document_name"] == "doc.pdf"
    assert 0 <= report["metadata_risk_score"] <= 100
    assert report["metadata_risk_level"] in {"Low", "Medium", "High"}
    assert isinstance(report["findings"], list)


def test_analyze_request_id_header_present():
    """Observability: every response carries an X-Request-ID and timing header."""
    resp = client.get("/")
    assert "x-request-id" in resp.headers
    assert "x-process-time-ms" in resp.headers
