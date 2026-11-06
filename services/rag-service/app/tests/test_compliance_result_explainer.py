from app.services.compliance_result_explainer import build_clause_presentation


def test_na_structural_heading_has_explanation_not_generic_na():
    result = build_clause_presentation(
        status="N/A",
        clause_reference="1",
        clause_title="Scope",
        product_standard_comparison={"method": "heading_only_clause"},
    )
    assert result["display_status"] == "Heading only — not scored"
    assert "standalone auditable requirement" in result["status_explanation"]
    assert "N/A" not in result["display_status"]


def test_na_out_of_scope_explains_scope_reason_and_next_action():
    result = build_clause_presentation(
        status="N/A",
        applicability={"scope": "OUT_OF_SCOPE", "reason": "This duty belongs to the importer."},
        product_standard_comparison={"decision": "N/A"},
    )
    assert result["display_status"] == "Outside product scope"
    assert "importer" in result["status_explanation"]
    assert "product conformity action" in result["recommended_action"]


def test_missing_info_identifies_conflicting_and_partial_product_facts():
    result = build_clause_presentation(
        status="MISSING_INFO",
        justification="MISSING_INFO: sources disagree.",
        evidence_coverage="PARTIAL",
        product_standard_comparison={
            "elements": [
                {"productField": "rated voltage", "observedValue": "220 V / 240 V", "status": "partial", "standardConstraint": "220 V max"},
                {"productField": "operating temperature", "observedValue": "-10..40 C", "status": "covered", "conflict": True},
            ]
        },
    )
    assert result["display_status"] == "Evidence needed"
    assert any("rated voltage" in x for x in result["missing_information"])
    assert any("operating temperature" in x for x in result["missing_information"])
    assert "not by itself proof of non-conformity" in result["status_explanation"]


def test_fail_and_inconclusive_have_actionable_language():
    failed = build_clause_presentation(status="FAIL", justification="FAIL: observed voltage exceeds the limit.")
    inconclusive = build_clause_presentation(status="INCONCLUSIVE", inconclusive_reason="Clause mapping could not be verified.")
    assert failed["display_status"] == "Requirement not met"
    assert "corrective action" in failed["recommended_action"]
    assert inconclusive["display_status"] == "Assessment needs review"
    assert "Clause mapping" in inconclusive["status_explanation"]


def test_pass_explanation_names_clause_and_requirement_without_overclaiming():
    result = build_clause_presentation(
        status="PASS",
        clause_reference="7.2",
        clause_title="Process validation",
        clause_summary="The process shall be validated before release.",
        justification="PASS: record QP-01 meets the stated range.",
    )
    assert result["display_status"] == "Conformity supported"
    assert "available evidence supports" in result["status_explanation"].lower()
    assert "clause 7.2" in result["status_explanation"].lower()
    assert "process shall be validated" in result["status_explanation"].lower()
    assert "all legal obligations" not in result["status_explanation"].lower()


def test_n_a_without_scope_reason_requires_confirmation_not_auto_exclusion():
    result = build_clause_presentation(
        status="N/A",
        clause_reference="5.4",
        justification="N/A: applicability rationale not supplied.",
        product_standard_comparison={"decision": "N/A", "method": "deterministic_product_standard_comparison"},
    )
    assert result["display_status"] == "Applicability needs confirmation"
    assert "does not contain a sufficiently explicit scope rationale" in result["status_explanation"]
    assert "before treating this requirement as excluded" in result["recommended_action"]
