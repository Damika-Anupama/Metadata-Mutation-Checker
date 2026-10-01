"""Prometheus metrics for the Metadata Mutation Checker API.

Exposes a small, dependency-light set of metrics that map directly to the
service's behaviour so it can be scraped by Prometheus and visualised in
Grafana:

- ``http_requests_total{method,path,status}`` — request counter
- ``http_request_duration_seconds{method,path}`` — latency histogram
- ``documents_analyzed_total{risk_level}`` — domain counter for analyses
- ``analyze_failures_total`` — counter for failed analyses

The middleware in ``main.py`` records the HTTP metrics; the analyze route
records the domain metrics. ``/metrics`` renders the standard Prometheus
text exposition format.
"""
from prometheus_client import (
    CONTENT_TYPE_LATEST,
    CollectorRegistry,
    Counter,
    Histogram,
    generate_latest,
)

# A dedicated registry keeps the app's metrics isolated and test-friendly.
registry = CollectorRegistry()

REQUEST_COUNT = Counter(
    "http_requests_total",
    "Total HTTP requests processed, labelled by method, path and status code.",
    ["method", "path", "status"],
    registry=registry,
)

REQUEST_LATENCY = Histogram(
    "http_request_duration_seconds",
    "HTTP request latency in seconds, labelled by method and path.",
    ["method", "path"],
    registry=registry,
)

DOCUMENTS_ANALYZED = Counter(
    "documents_analyzed_total",
    "Total documents analyzed, labelled by computed risk level.",
    ["risk_level"],
    registry=registry,
)

ANALYZE_FAILURES = Counter(
    "analyze_failures_total",
    "Total document analyses that ended in an error.",
    registry=registry,
)


def normalize_path(path: str) -> str:
    """Collapse dynamic/unknown paths so label cardinality stays bounded."""
    known = {"/", "/analyze", "/metrics"}
    return path if path in known else "/other"


def record_request(method: str, path: str, status: int, duration_seconds: float) -> None:
    label_path = normalize_path(path)
    REQUEST_COUNT.labels(method=method, path=label_path, status=str(status)).inc()
    REQUEST_LATENCY.labels(method=method, path=label_path).observe(duration_seconds)


def record_analysis(risk_level: str) -> None:
    DOCUMENTS_ANALYZED.labels(risk_level=risk_level).inc()


def record_analysis_failure() -> None:
    ANALYZE_FAILURES.inc()


def render_latest() -> tuple[bytes, str]:
    """Return (payload, content_type) for the /metrics response."""
    return generate_latest(registry), CONTENT_TYPE_LATEST
