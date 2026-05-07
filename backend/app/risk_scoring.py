def severity_weight(severity):
    weights = {
        "Low": 10,
        "Medium": 25,
        "High": 45,
    }
    return weights.get(severity, 0)


def calculate_risk_score(findings):
    if not findings:
        return 0

    score = 0

    for finding in findings:
        severity = finding.get("severity", "Low")
        confidence = finding.get("confidence", 0.5)
        score += severity_weight(severity) * confidence

    categories = set(f.get("category") for f in findings)

    # Increase score slightly if multiple types of suspicious signals appear together
    if len(categories) >= 3:
        score += 10

    # Avoid over-penalizing many weak findings
    low_findings = [f for f in findings if f.get("severity") == "Low"]
    if len(low_findings) == len(findings):
        score = min(score, 30)

    return min(round(score), 100)


def get_risk_level(score):
    if score <= 30:
        return "Low"
    elif score <= 65:
        return "Medium"
    return "High"


def get_summary(score):
    level = get_risk_level(score)

    if level == "Low":
        return "The document contains limited or weak metadata indicators. No strong metadata mutation signals were detected."
    elif level == "Medium":
        return "The document contains metadata patterns that may suggest post-creation editing, conversion, or metadata changes. These findings should be reviewed carefully."
    else:
        return "The document contains multiple or stronger metadata indicators that may suggest unusual metadata changes. These findings should be reviewed with additional evidence."


def get_recommended_action(score):
    level = get_risk_level(score)

    if level == "Low":
        return "No immediate action is required. Review manually only if the document is part of a sensitive process."
    elif level == "Medium":
        return "Review the document manually and compare it with source records if the file is important."
    else:
        return "Perform a deeper manual review, compare with original files, and verify the document through additional evidence."