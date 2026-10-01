"""Shared pytest fixtures."""
import pytest


@pytest.fixture
def clean_metadata():
    return {
        "file_name": "report.pdf",
        "file_type": "application/pdf",
        "created_date": "2026-01-01T10:00:00",
        "modified_date": "2026-01-01T10:00:00",
        "creator": "Microsoft Word",
        "producer": "Microsoft Word",
        "author": "Jane Doe",
        "title": "Quarterly Report",
        "page_count": 5,
        "is_encrypted": False,
    }
