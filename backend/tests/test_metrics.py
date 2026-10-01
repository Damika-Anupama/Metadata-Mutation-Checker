"""Tests for the Prometheus /metrics endpoint and domain instrumentation."""
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


def test_metrics_endpoint_exposes_prometheus_text():
    resp = client.get("/metrics")
    assert resp.status_code == 200
    # Prometheus text exposition format content type
    assert "text/plain" in resp.headers["content-type"]
    body = resp.text
    # Metric names should be present in the HELP/TYPE preamble
    assert "http_requests_total" in body
    assert "http_request_duration_seconds" in body
    assert "documents_analyzed_total" in body


def test_metrics_counts_increment_after_analysis():
    # Trigger an analysis so the domain counter moves.
    pdf = _make_pdf_bytes(pages=1)
    analyze = client.post(
        "/analyze",
        files={"file": ("metrics-doc.pdf", pdf, "application/pdf")},
    )
    assert analyze.status_code == 200
    risk_level = analyze.json()["metadata_risk_level"]

    metrics_body = client.get("/metrics").text
    # The documents_analyzed_total counter for this risk level should appear
    # with a value >= 1.
    assert f'documents_analyzed_total{{risk_level="{risk_level}"}}' in metrics_body
    # HTTP request counter should record the analyze POST.
    assert 'http_requests_total{' in metrics_body
    assert 'path="/analyze"' in metrics_body
