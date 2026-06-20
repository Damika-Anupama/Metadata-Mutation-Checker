"""Unit tests for mutation_checker: metadata heuristic findings."""
from app.mutation_checker import safe_parse_date, run_metadata_checks


def _titles(findings):
    return {f["title"] for f in findings}


def test_safe_parse_date_valid_iso():
    dt = safe_parse_date("2026-04-01T10:15:00")
    assert dt is not None
    assert dt.year == 2026 and dt.month == 4 and dt.day == 1


def test_safe_parse_date_invalid_returns_none():
    assert safe_parse_date("not-a-date") is None
    assert safe_parse_date(None) is None


def test_modified_before_created_is_high_severity():
    metadata = {
        "created_date": "2026-04-10T10:00:00",
        "modified_date": "2026-04-01T10:00:00",
        "creator": "Word",
        "producer": "Word",
        "author": "A",
        "title": "T",
    }
    findings = run_metadata_checks(metadata)
    titles = _titles(findings)
    assert "Modified date is earlier than created date" in titles
    flagged = next(f for f in findings if f["title"].startswith("Modified date is earlier"))
    assert flagged["severity"] == "High"


def test_modified_long_after_created_flags_medium():
    metadata = {
        "created_date": "2026-01-01T10:00:00",
        "modified_date": "2026-03-01T10:00:00",
        "creator": "Word",
        "producer": "Word",
        "author": "A",
        "title": "T",
    }
    findings = run_metadata_checks(metadata)
    assert "Document modified significantly after creation" in _titles(findings)


def test_suspicious_tool_detected():
    metadata = {
        "created_date": "2026-01-01T10:00:00",
        "modified_date": "2026-01-01T10:00:00",
        "creator": "Adobe Photoshop",
        "producer": "Adobe Photoshop",
        "author": "A",
        "title": "T",
    }
    findings = run_metadata_checks(metadata)
    assert any("photoshop" in f["title"].lower() for f in findings)


def test_creator_producer_mismatch_flagged():
    metadata = {
        "created_date": "2026-01-01T10:00:00",
        "modified_date": "2026-01-01T10:00:00",
        "creator": "Microsoft Word",
        "producer": "LibreOffice",
        "author": "A",
        "title": "T",
    }
    assert "Creator and producer mismatch" in _titles(run_metadata_checks(metadata))


def test_missing_author_and_title_flagged():
    metadata = {
        "created_date": "2026-01-01T10:00:00",
        "modified_date": "2026-01-01T10:00:00",
        "creator": "Word",
        "producer": "Word",
        "author": None,
        "title": None,
    }
    titles = _titles(run_metadata_checks(metadata))
    assert "Missing author metadata" in titles
    assert "Missing title metadata" in titles


def test_zero_pages_is_high_severity():
    metadata = {
        "created_date": "2026-01-01T10:00:00",
        "modified_date": "2026-01-01T10:00:00",
        "creator": "Word", "producer": "Word",
        "author": "A", "title": "T",
        "page_count": 0,
    }
    findings = run_metadata_checks(metadata)
    zero = next(f for f in findings if f["title"] == "PDF has zero pages")
    assert zero["severity"] == "High"


def test_encrypted_pdf_flagged():
    metadata = {
        "created_date": "2026-01-01T10:00:00",
        "modified_date": "2026-01-01T10:00:00",
        "creator": "Word", "producer": "Word",
        "author": "A", "title": "T",
        "is_encrypted": True,
    }
    assert "PDF is encrypted" in _titles(run_metadata_checks(metadata))


def test_clean_metadata_has_no_high_findings():
    metadata = {
        "created_date": "2026-01-01T10:00:00",
        "modified_date": "2026-01-01T10:00:00",
        "creator": "Microsoft Word",
        "producer": "Microsoft Word",
        "author": "Jane Doe",
        "title": "Quarterly Report",
        "page_count": 5,
        "is_encrypted": False,
    }
    findings = run_metadata_checks(metadata)
    assert all(f["severity"] != "High" for f in findings)


def test_every_finding_has_required_shape():
    metadata = {"modified_date": "2026-01-01T10:00:00", "created_date": None}
    for f in run_metadata_checks(metadata):
        assert set(f.keys()) == {"title", "severity", "confidence", "category", "explanation"}
        assert f["severity"] in {"Low", "Medium", "High"}
        assert 0.0 <= f["confidence"] <= 1.0
