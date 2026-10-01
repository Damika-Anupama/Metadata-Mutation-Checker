"""Structured logging + request-tracing configuration (observability).

Provides:
- JSON structured logs (machine-parseable for log aggregation).
- A per-request logger helper.
- Timing + request-id middleware is wired in main.py.
"""
import json
import logging
import sys
from datetime import datetime, timezone


class JsonFormatter(logging.Formatter):
    """Render log records as single-line JSON for easy ingestion."""

    def format(self, record: logging.LogRecord) -> str:
        payload = {
            "ts": datetime.now(timezone.utc).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }
        # Attach any structured "extra" fields.
        for key, value in getattr(record, "extra_fields", {}).items():
            payload[key] = value
        if record.exc_info:
            payload["exc_info"] = self.formatException(record.exc_info)
        return json.dumps(payload, ensure_ascii=False)


def configure_logging(level: int = logging.INFO) -> logging.Logger:
    logger = logging.getLogger("metadata_checker")
    if logger.handlers:  # avoid duplicate handlers on reload
        return logger
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(JsonFormatter())
    logger.addHandler(handler)
    logger.setLevel(level)
    logger.propagate = False
    return logger


def log_event(logger: logging.Logger, level: int, message: str, **fields) -> None:
    """Emit a structured log line with arbitrary key/value context."""
    logger.log(level, message, extra={"extra_fields": fields})


logger = configure_logging()
