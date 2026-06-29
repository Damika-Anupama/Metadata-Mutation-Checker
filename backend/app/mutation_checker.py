import re
from datetime import datetime, timezone


SUSPICIOUS_TOOLS = [
    "preview",
    "acrobat",
    "photoshop",
    "illustrator",
    "canva",
    "online pdf",
    "scanner",
    "pdf editor",
    "smallpdf",
    "ilovepdf",
    "sejda",
    "pdf24",
    "pdffiller",
    "pdfcreator",
    "nitro pdf",
    "foxit",
    "pdfescape",
    "pdf converter",
    "pdf merge",
    "pdf compressor",
    "ghostscript",
    "pdfium",
]

PDF_INVENTED_YEAR = 1993

PDF_VERSION_RELEASE_YEARS = {
    "1.0": 1993,
    "1.1": 1994,
    "1.2": 1996,
    "1.3": 1999,
    "1.4": 2001,
    "1.5": 2003,
    "1.6": 2004,
    "1.7": 2006,
    "2.0": 2017,
}

LIBRE_OFFICE_YEAR_MAP = {3: 2010, 4: 2013, 5: 2015, 6: 2018, 7: 2020, 24: 2024, 25: 2025, 26: 2026}


def safe_parse_date(date_value):
    if not date_value:
        return None
    try:
        return datetime.fromisoformat(date_value)
    except Exception:
        return None


def extract_timezone_offset(raw_date):
    if not raw_date:
        return None
    clean = raw_date.replace("D:", "")[14:]
    match = re.match(r"^([+-]\d{2}'\d{2}'|Z)", clean)
    return match.group(1) if match else None


def get_producer_release_year(text):
    if not text:
        return None

    # Adobe PDF Library 23.x → 2023
    m = re.search(r"adobe\s+pdf\s+library\s+(\d{2})\.", text, re.IGNORECASE)
    if m:
        major = int(m.group(1))
        if 10 <= major <= 40:
            return 2000 + major

    # Adobe Acrobat 2020 / Adobe Acrobat DC 2023
    m = re.search(r"adobe\s+acrobat[^\d]*(\d{4})", text, re.IGNORECASE)
    if m:
        year = int(m.group(1))
        if 2000 <= year <= 2035:
            return year

    # Microsoft Word 2019 / Microsoft Office Word 2016
    m = re.search(r"microsoft[^\d]*(\d{4})", text, re.IGNORECASE)
    if m:
        year = int(m.group(1))
        if 2000 <= year <= 2035:
            return year

    # LibreOffice 7.x → 2020, 24.x → 2024, 25.x → 2025
    m = re.search(r"libreoffice\s+(\d+)\.", text, re.IGNORECASE)
    if m:
        major = int(m.group(1))
        if major in LIBRE_OFFICE_YEAR_MAP:
            return LIBRE_OFFICE_YEAR_MAP[major]

    # OpenOffice.org 3.x
    if re.search(r"openoffice\.org\s+3\.", text, re.IGNORECASE):
        return 2008

    # Nitro PDF <year>
    m = re.search(r"nitro\s+pdf[^\d]*(\d{4})", text, re.IGNORECASE)
    if m:
        year = int(m.group(1))
        if 2000 <= year <= 2035:
            return year

    return None


def add_finding(findings, title, severity, confidence, explanation, category):
    findings.append({
        "title": title,
        "severity": severity,
        "confidence": confidence,
        "category": category,
        "explanation": explanation,
    })


def run_metadata_checks(metadata):
    findings = []

    created = metadata.get("created_date")
    modified = metadata.get("modified_date")
    creator = metadata.get("creator") or ""
    producer = metadata.get("producer") or ""
    author = metadata.get("author")
    title = metadata.get("title")

    created_dt = safe_parse_date(created)
    modified_dt = safe_parse_date(modified)
    now = datetime.now(timezone.utc).replace(tzinfo=None)

    # Rule: future dates
    if created_dt and created_dt > now:
        add_finding(
            findings,
            "Creation date is in the future",
            "High",
            0.95,
            f"The document's stated creation date ({created}) is in the future. No legitimate document can be created at a future time — this strongly indicates the date metadata has been manually altered or set incorrectly.",
            "date",
        )

    if modified_dt and modified_dt > now:
        add_finding(
            findings,
            "Modification date is in the future",
            "High",
            0.95,
            f"The document's stated modification date ({modified}) is in the future. This strongly suggests the date metadata was manually altered.",
            "date",
        )

    # Rule: creation date predates the PDF format
    if created_dt and created_dt.year < PDF_INVENTED_YEAR:
        add_finding(
            findings,
            "Creation date predates the PDF format",
            "High",
            0.97,
            f"The stated creation date ({created}) is before 1993, when Adobe invented the PDF format. No authentic PDF document could have been created before this date — this is a strong indicator of backdated or incorrect metadata.",
            "date",
        )

    # Rule: PDF version post-dates document creation
    pdf_version = metadata.get("pdf_version")
    if pdf_version and created_dt:
        version_year = PDF_VERSION_RELEASE_YEARS.get(pdf_version)
        if version_year and created_dt.year < version_year:
            add_finding(
                findings,
                f"Creation date predates PDF {pdf_version} format",
                "High",
                0.93,
                f"This document uses the PDF {pdf_version} format, which was introduced in {version_year}. However, the stated creation date ({created}) is before that year. This is a technical impossibility — the document format did not exist when the document claims to have been created.",
                "date",
            )

    # Date-based checks
    if modified and not created:
        add_finding(
            findings,
            "Modified date exists but created date is missing",
            "Medium",
            0.70,
            "The document has a modified date but no creation date. This may suggest metadata was removed, changed, or not saved by the creating software.",
            "date",
        )

    if not created and not modified:
        add_finding(
            findings,
            "Created and modified dates are missing",
            "Medium",
            0.65,
            "Both creation and modification dates are missing. This can happen naturally, but it may also indicate metadata removal.",
            "date",
        )

    if created and not created_dt:
        add_finding(
            findings,
            "Created date format is unusual",
            "Low",
            0.45,
            "The created date exists but could not be parsed into a standard date format.",
            "date",
        )

    if modified and not modified_dt:
        add_finding(
            findings,
            "Modified date format is unusual",
            "Low",
            0.45,
            "The modified date exists but could not be parsed into a standard date format.",
            "date",
        )

    if created_dt and modified_dt:
        if modified_dt < created_dt:
            add_finding(
                findings,
                "Modified date is earlier than created date",
                "High",
                0.85,
                "The modified date appears earlier than the created date. This is unusual and may indicate incorrect or altered metadata.",
                "date",
            )

        days_difference = (modified_dt - created_dt).days

        if days_difference > 1825:
            add_finding(
                findings,
                f"Document modified {days_difference // 365} years after creation",
                "High",
                0.85,
                f"The document was last modified {days_difference // 365} years after its stated creation date. A gap of this magnitude is a strong signal that the document was re-exported, backdated, or otherwise altered long after the original was produced.",
                "date",
            )
        elif days_difference > 365:
            add_finding(
                findings,
                "Document modified over a year after creation",
                "Medium",
                0.78,
                f"The document was modified {days_difference // 30} months after creation. A gap of more than a year between creation and modification is uncommon and may indicate post-creation editing or conversion.",
                "date",
            )
        elif days_difference > 30:
            add_finding(
                findings,
                "Document modified after creation",
                "Low",
                0.55,
                f"The document was modified {days_difference} days after creation. This may indicate minor edits, format conversion, or normal document handling.",
                "date",
            )

    # Rule: timezone shift between creation and modification
    created_tz = extract_timezone_offset(metadata.get("raw_created_date"))
    modified_tz = extract_timezone_offset(metadata.get("raw_modified_date"))
    if created_tz and modified_tz and created_tz != modified_tz:
        add_finding(
            findings,
            "Timezone shift between creation and modification dates",
            "Low",
            0.62,
            f"The document was created with timezone offset {created_tz} but last modified with {modified_tz}. Different timezones between creation and modification can indicate the document was edited on a system in a different region or country.",
            "date",
        )

    # Software/tool checks
    if creator and producer and creator.lower() != producer.lower():
        add_finding(
            findings,
            "Creator and producer mismatch",
            "Low",
            0.60,
            "The document appears to have been created using one tool and exported or processed using another. This is common and should not be treated as proof of tampering.",
            "software",
        )

    combined_tools = f"{creator} {producer}".lower()
    for tool in SUSPICIOUS_TOOLS:
        if tool in combined_tools:
            add_finding(
                findings,
                f"Document metadata references {tool}",
                "Low",
                0.50,
                f"The metadata references {tool}. This may indicate editing, exporting, scanning, or normal document handling.",
                "software",
            )
            break

    # Rule: authoring tool post-dates stated document creation
    producer_year = get_producer_release_year(producer)
    creator_year = get_producer_release_year(creator)
    tool_year = max(producer_year or 0, creator_year or 0) or None
    if tool_year and created_dt and tool_year > created_dt.year:
        tool_name = f"producer ({producer})" if producer_year else f"creator ({creator})"
        add_finding(
            findings,
            "Authoring tool post-dates stated document creation",
            "High",
            0.90,
            f"The document claims to have been created in {created_dt.year}, but the {tool_name} was not released until {tool_year}. This is an impossible timeline and strongly indicates the document was re-exported or backdated.",
            "software",
        )

    # Missing metadata checks
    if not author:
        add_finding(
            findings,
            "Missing author metadata",
            "Low",
            0.40,
            "The author field is empty. This may happen naturally depending on the software used to create the document.",
            "missing_metadata",
        )

    if not title:
        add_finding(
            findings,
            "Missing title metadata",
            "Low",
            0.35,
            "The title field is empty. This is common and does not strongly indicate tampering by itself.",
            "missing_metadata",
        )

    # Structural checks
    if metadata.get("is_encrypted"):
        add_finding(
            findings,
            "PDF is encrypted",
            "Medium",
            0.70,
            "The PDF is encrypted. Some metadata or content may not be fully accessible for analysis.",
            "structure",
        )

    if metadata.get("page_count") == 0:
        add_finding(
            findings,
            "PDF has zero pages",
            "High",
            0.90,
            "The PDF appears to contain no pages, which is abnormal for a document file.",
            "structure",
        )

    # Rule: incremental updates
    incremental_updates = metadata.get("incremental_updates", 0)
    if incremental_updates > 0:
        count = incremental_updates
        add_finding(
            findings,
            f"PDF contains {count} incremental update{'s' if count > 1 else ''}",
            "High" if count >= 3 else "Medium",
            0.85 if count >= 3 else 0.72,
            f"The PDF structure contains {count} incremental update section{'s' if count > 1 else ''} appended after the original content. Incremental updates are how PDF editors append changes without rewriting the whole file — a common technique when modifying a signed or certified document.",
            "structure",
        )

    return findings
