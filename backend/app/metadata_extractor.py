import os
import mimetypes
from datetime import datetime
from pypdf import PdfReader


def parse_pdf_date(raw_date):
    """
    Converts PDF date format like D:20260401101500+05'30'
    into a readable ISO-style string where possible.
    """
    if not raw_date:
        return None

    try:
        clean = raw_date.replace("D:", "")
        clean = clean[:14]

        if len(clean) >= 8:
            dt = datetime.strptime(clean, "%Y%m%d%H%M%S")
            return dt.isoformat()
    except Exception:
        return raw_date

    return raw_date


def extract_pdf_metadata(file_path, original_filename):
    file_size = os.path.getsize(file_path)
    file_type = mimetypes.guess_type(original_filename)[0] or "application/pdf"

    reader = PdfReader(file_path)

    metadata = reader.metadata or {}

    created_raw = metadata.get("/CreationDate")
    modified_raw = metadata.get("/ModDate")

    extracted = {
        "file_name": original_filename,
        "file_size_bytes": file_size,
        "file_type": file_type,
        "pdf_version": getattr(reader, "pdf_header", None),
        "created_date": parse_pdf_date(created_raw),
        "modified_date": parse_pdf_date(modified_raw),
        "raw_created_date": created_raw,
        "raw_modified_date": modified_raw,
        "author": metadata.get("/Author"),
        "creator": metadata.get("/Creator"),
        "producer": metadata.get("/Producer"),
        "title": metadata.get("/Title"),
        "subject": metadata.get("/Subject"),
        "page_count": len(reader.pages),
        "is_encrypted": reader.is_encrypted,
    }

    return extracted


def extract_metadata(file_path, original_filename):
    lower_name = original_filename.lower()

    if lower_name.endswith(".pdf"):
        return extract_pdf_metadata(file_path, original_filename)

    raise ValueError("Unsupported file type. Currently only PDF is supported.")