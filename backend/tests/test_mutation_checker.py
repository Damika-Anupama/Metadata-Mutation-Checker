"""Unit tests for mutation_checker: metadata heuristic findings."""
from datetime import datetime, timedelta, timezone

from app.mutation_checker import (
    extract_timezone_offset,
    get_producer_release_year,
    run_metadata_checks,
    safe_parse_date,
)


def _titles(findings):
    return {f["title"] for f in findings}


def _severity_of(findings, title_prefix):
    return next(f for f in findings if f["title"].startswith(title_prefix))["severity"]


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


def test_modified_two_months_after_created_flags_low():
    metadata = {
        "created_date": "2026-01-01T10:00:00",
        "modified_date": "2026-03-01T10:00:00",
        "creator": "Word",
        "producer": "Word",
        "author": "A",
        "title": "T",
    }
    findings = run_metadata_checks(metadata)
    assert _severity_of(findings, "Document modified after creation") == "Low"


def test_modified_over_year_after_created_flags_medium():
    metadata = {
        "created_date": "2022-01-01T10:00:00",
        "modified_date": "2024-02-01T10:00:00",
        "creator": "Word",
        "producer": "Word",
        "author": "A",
        "title": "T",
    }
    findings = run_metadata_checks(metadata)
    assert _severity_of(findings, "Document modified over a year after creation") == "Medium"


def test_modified_many_years_after_created_flags_high():
    metadata = {
        "created_date": "2015-01-01T10:00:00",
        "modified_date": "2024-01-01T10:00:00",
        "creator": "Word",
        "producer": "Word",
        "author": "A",
        "title": "T",
    }
    findings = run_metadata_checks(metadata)
    assert _severity_of(findings, "Document modified") == "High"


def test_future_creation_date_flags_high():
    future = (datetime.now(timezone.utc).replace(tzinfo=None) + timedelta(days=365)).isoformat()
    metadata = {
        "created_date": future,
        "modified_date": future,
        "creator": "Word",
        "producer": "Word",
        "author": "A",
        "title": "T",
    }
    findings = run_metadata_checks(metadata)
    assert _severity_of(findings, "Creation date is in the future") == "High"


def test_creation_predating_pdf_format_flags_high():
    metadata = {
        "created_date": "1990-01-01T10:00:00",
        "modified_date": "1990-01-01T10:00:00",
        "creator": "Word",
        "producer": "Word",
        "author": "A",
        "title": "T",
    }
    assert "Creation date predates the PDF format" in _titles(run_metadata_checks(metadata))


def test_creation_predating_pdf_version_flags_high():
    metadata = {
        "created_date": "2000-01-01T10:00:00",
        "modified_date": "2000-01-01T10:00:00",
        "pdf_version": "2.0",
        "creator": "Word",
        "producer": "Word",
        "author": "A",
        "title": "T",
    }
    assert "Creation date predates PDF 2.0 format" in _titles(run_metadata_checks(metadata))


def test_authoring_tool_postdates_creation_flags_high():
    metadata = {
        "created_date": "2019-01-01T10:00:00",
        "modified_date": "2019-01-01T10:00:00",
        "creator": "Microsoft Word",
        "producer": "Adobe PDF Library 23.6",
        "author": "A",
        "title": "T",
    }
    assert "Authoring tool post-dates stated document creation" in _titles(run_metadata_checks(metadata))


def test_timezone_shift_flagged():
    metadata = {
        "created_date": "2022-04-14T11:20:34",
        "modified_date": "2022-04-14T18:32:01",
        "raw_created_date": "D:20220414112034+05'30'",
        "raw_modified_date": "D:20220414183201Z",
        "creator": "Word",
        "producer": "Word",
        "author": "A",
        "title": "T",
    }
    assert "Timezone shift between creation and modification dates" in _titles(run_metadata_checks(metadata))


def test_extract_timezone_offset_parses_offsets():
    assert extract_timezone_offset("D:20220414112034+05'30'") == "+05'30'"
    assert extract_timezone_offset("D:20240927183201Z") == "Z"
    assert extract_timezone_offset(None) is None


def test_get_producer_release_year_known_tools():
    assert get_producer_release_year("Adobe PDF Library 23.6") == 2023
    assert get_producer_release_year("Microsoft Word 2019") == 2019
    assert get_producer_release_year("LibreOffice 24.2") == 2024
    assert get_producer_release_year("Some Unknown Tool") is None


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
