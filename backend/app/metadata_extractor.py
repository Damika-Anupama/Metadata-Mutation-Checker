import os
import re
import mimetypes
from datetime import datetime
from pypdf import PdfReader


def parse_pdf_date(raw_date):
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


def count_incremental_updates(pdf_bytes: bytes) -> int:
    # Each incremental update appends a new %%EOF section; the first is baseline
    eof_count = len(re.findall(rb"%%EOF", pdf_bytes))
    return max(0, eof_count - 1)


def extract_pdf_metadata(file_path, original_filename):
    file_size = os.path.getsize(file_path)
    file_type = mimetypes.guess_type(original_filename)[0] or "application/pdf"

    with open(file_path, "rb") as f:
        pdf_bytes = f.read()

    reader = PdfReader(file_path)
    metadata = reader.metadata or {}

    created_raw = metadata.get("/CreationDate")
    modified_raw = metadata.get("/ModDate")

    pdf_header = getattr(reader, "pdf_header", None)
    if isinstance(pdf_header, bytes):
        pdf_header = pdf_header.decode("latin-1", errors="replace")
    if pdf_header and pdf_header.startswith("%PDF-"):
        pdf_version = pdf_header[5:].strip()
    elif pdf_header:
        pdf_version = str(pdf_header).strip()
    else:
        pdf_version = None

    return {
        "file_name": original_filename,
        "file_size_bytes": file_size,
        "file_type": file_type,
        "pdf_version": pdf_version,
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
        "incremental_updates": count_incremental_updates(pdf_bytes),
    }


def extract_metadata(file_path, original_filename):
    lower_name = original_filename.lower()

    if lower_name.endswith(".pdf"):
        return extract_pdf_metadata(file_path, original_filename)

    raise ValueError("Unsupported file type. Currently only PDF is supported.")