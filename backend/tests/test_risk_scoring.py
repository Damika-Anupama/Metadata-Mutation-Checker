"""Unit tests for risk_scoring: pure scoring logic with no I/O."""
from app.risk_scoring import (
    severity_weight,
    calculate_risk_score,
    get_risk_level,
    get_summary,
    get_recommended_action,
)


def test_severity_weight_known_levels():
    assert severity_weight("Low") == 10
    assert severity_weight("Medium") == 25
    assert severity_weight("High") == 45


def test_severity_weight_unknown_defaults_zero():
    assert severity_weight("Critical") == 0
    assert severity_weight(None) == 0


def test_calculate_risk_score_empty_is_zero():
    assert calculate_risk_score([]) == 0


def test_calculate_risk_score_single_high():
    findings = [{"severity": "High", "confidence": 1.0, "category": "date"}]
    # 45 * 1.0 = 45
    assert calculate_risk_score(findings) == 45


def test_calculate_risk_score_all_low_is_capped_at_30():
    findings = [
        {"severity": "Low", "confidence": 1.0, "category": "date"},
        {"severity": "Low", "confidence": 1.0, "category": "software"},
        {"severity": "Low", "confidence": 1.0, "category": "missing_metadata"},
        {"severity": "Low", "confidence": 1.0, "category": "structure"},
    ]
    # Raw would exceed 30 but all-low cap applies
    assert calculate_risk_score(findings) == 30


def test_calculate_risk_score_multi_category_bonus():
    findings = [
        {"severity": "High", "confidence": 1.0, "category": "date"},
        {"severity": "Medium", "confidence": 1.0, "category": "software"},
        {"severity": "High", "confidence": 1.0, "category": "structure"},
    ]
    # 45 + 25 + 45 = 115, +10 multi-category bonus = 125, clamped to 100
    assert calculate_risk_score(findings) == 100


def test_calculate_risk_score_never_exceeds_100():
    findings = [{"severity": "High", "confidence": 1.0, "category": f"c{i}"} for i in range(10)]
    assert calculate_risk_score(findings) <= 100


def test_get_risk_level_boundaries():
    assert get_risk_level(0) == "Low"
    assert get_risk_level(30) == "Low"
    assert get_risk_level(31) == "Medium"
    assert get_risk_level(65) == "Medium"
    assert get_risk_level(66) == "High"
    assert get_risk_level(100) == "High"


def test_get_summary_matches_level():
    assert "limited or weak" in get_summary(10)
    assert "may suggest post-creation" in get_summary(50)
    assert "stronger metadata indicators" in get_summary(90)


def test_get_recommended_action_matches_level():
    assert "No immediate action" in get_recommended_action(10)
    assert "Review the document manually" in get_recommended_action(50)
    assert "deeper manual review" in get_recommended_action(90)
