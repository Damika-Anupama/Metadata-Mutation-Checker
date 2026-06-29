"""Unit tests for metadata_extractor: PDF parsing and helpers.

These build real PDFs in-memory with pypdf and run them through the extractor,
covering the parsing path that the dict-based mutation_checker tests skip.
"""
import io

import pytest
from pypdf import PdfWriter

from app.metadata_extractor import (
    count_incremental_updates,
    extract_metadata,
    parse_pdf_date,
)


def _write_pdf(path, pages=1, metadata=None):
    writer = PdfWriter()
    for _ in range(pages):
        writer.add_blank_page(width=200, height=200)
    if metadata:
        writer.add_metadata(metadata)
    buf = io.BytesIO()
    writer.write(buf)
    path.write_bytes(buf.getvalue())
    return str(path)


def test_parse_pdf_date_converts_pdf_format():
    assert parse_pdf_date("D:20220414112034+05'30'") == "2022-04-14T11:20:34"


def test_parse_pdf_date_handles_none_and_garbage():
    assert parse_pdf_date(None) is None
    assert parse_pdf_date("garbage") == "garbage"


def test_count_incremental_updates():
    assert count_incremental_updates(b"%PDF-1.7 ... %%EOF") == 0
    assert count_incremental_updates(b"a %%EOF b %%EOF") == 1
    assert count_incremental_updates(b"no markers here") == 0


def test_extract_metadata_rejects_non_pdf():
    with pytest.raises(ValueError):
        extract_metadata("/tmp/whatever.txt", "whatever.txt")


def test_extract_pdf_version_is_clean_string(tmp_path):
    """Guards the regression where pdf_header (a str) was treated as bytes."""
    path = _write_pdf(tmp_path / "doc.pdf")
    meta = extract_metadata(path, "doc.pdf")

    version = meta["pdf_version"]
    assert isinstance(version, str)
    assert version
    # Must be the numeric version (e.g. "1.7"/"2.0"), not a raw "%PDF-" header
    assert "%PDF" not in version
    assert version[0].isdigit() and "." in version


def test_extract_pdf_metadata_fields(tmp_path):
    path = _write_pdf(
        tmp_path / "report.pdf",
        pages=3,
        metadata={
            "/Author": "Jane Doe",
            "/Title": "Quarterly Report",
            "/Creator": "Microsoft Word",
            "/Producer": "Adobe PDF Library 23.6",
        },
    )
    meta = extract_metadata(path, "report.pdf")

    assert meta["file_name"] == "report.pdf"
    assert meta["page_count"] == 3
    assert meta["is_encrypted"] is False
    assert meta["author"] == "Jane Doe"
    assert meta["title"] == "Quarterly Report"
    assert meta["creator"] == "Microsoft Word"
    assert meta["producer"] == "Adobe PDF Library 23.6"
    # A freshly written PDF has a single %%EOF, i.e. no incremental updates
    assert meta["incremental_updates"] == 0
    assert meta["file_size_bytes"] > 0
