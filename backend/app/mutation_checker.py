from datetime import datetime


SUSPICIOUS_TOOLS = [
    "preview",
    "acrobat",
    "photoshop",
    "illustrator",
    "canva",
    "online pdf",
    "scanner",
    "pdf editor",
]


def safe_parse_date(date_value):
    if not date_value:
        return None

    try:
        return datetime.fromisoformat(date_value)
    except Exception:
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

    # Date-based checks
    if modified and not created:
        add_finding(
            findings,
            "Modified date exists but created date is missing",
            "Medium",
            0.70,
            "The document has a modified date but no creation date. This may suggest metadata was removed, changed, or not saved by the creating software.",
            "date"
        )

    if not created and not modified:
        add_finding(
            findings,
            "Created and modified dates are missing",
            "Medium",
            0.65,
            "Both creation and modification dates are missing. This can happen naturally, but it may also indicate metadata removal.",
            "date"
        )

    if created and not created_dt:
        add_finding(
            findings,
            "Created date format is unusual",
            "Low",
            0.45,
            "The created date exists but could not be parsed into a standard date format.",
            "date"
        )

    if modified and not modified_dt:
        add_finding(
            findings,
            "Modified date format is unusual",
            "Low",
            0.45,
            "The modified date exists but could not be parsed into a standard date format.",
            "date"
        )

    if created_dt and modified_dt:
        if modified_dt < created_dt:
            add_finding(
                findings,
                "Modified date is earlier than created date",
                "High",
                0.85,
                "The modified date appears earlier than the created date. This is unusual and may indicate incorrect or altered metadata.",
                "date"
            )

        days_difference = (modified_dt - created_dt).days

        if days_difference > 30:
            add_finding(
                findings,
                "Document modified significantly after creation",
                "Medium",
                0.75,
                f"The document was modified {days_difference} days after creation. This may indicate editing, conversion, or normal document handling.",
                "date"
            )

    # Software/tool checks
    if creator and producer and creator.lower() != producer.lower():
        add_finding(
            findings,
            "Creator and producer mismatch",
            "Low",
            0.60,
            "The document appears to have been created using one tool and exported or processed using another. This is common and should not be treated as proof of tampering.",
            "software"
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
                "software"
            )
            break

    # Missing metadata checks
    if not author:
        add_finding(
            findings,
            "Missing author metadata",
            "Low",
            0.40,
            "The author field is empty. This may happen naturally depending on the software used to create the document.",
            "missing_metadata"
        )

    if not title:
        add_finding(
            findings,
            "Missing title metadata",
            "Low",
            0.35,
            "The title field is empty. This is common and does not strongly indicate tampering by itself.",
            "missing_metadata"
        )

    # Structural checks
    if metadata.get("is_encrypted"):
        add_finding(
            findings,
            "PDF is encrypted",
            "Medium",
            0.70,
            "The PDF is encrypted. Some metadata or content may not be fully accessible for analysis.",
            "structure"
        )

    if metadata.get("page_count") == 0:
        add_finding(
            findings,
            "PDF has zero pages",
            "High",
            0.90,
            "The PDF appears to contain no pages, which is abnormal for a document file.",
            "structure"
        )

    return findings