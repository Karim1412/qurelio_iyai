from app.services.evaluation_engine import _structured_clause_records


def test_structured_records_use_requirements_summary_when_sections_have_none():
    payload = {
        "sections": [
            {"clauseNumber": "1", "heading": "Scope", "content": "Scope text", "requirements": []},
            {"clauseNumber": "4.1", "heading": "General", "content": "Clause text", "requirements": []},
        ],
        "requirementsSummary": {
            "requirements": [
                {"id": "REQ-4.1-1", "clauseRef": "4.1", "clauseTitle": "General", "text": "The equipment shall be assessed.", "type": "mandatory", "modalVerb": "shall"},
                {"id": "REQ-4.1-2", "clauseRef": "4.1", "clauseTitle": "General", "text": "Protective measures shall be provided.", "type": "mandatory", "modalVerb": "shall"},
            ],
            "totalRequirements": 2,
        },
    }
    records = _structured_clause_records(payload)
    assert len(records) == 1
    assert records[0].ref == "4.1"
    assert records[0].title == "General"
    assert len(records[0].requirements) == 2


def test_structured_records_do_not_turn_requirement_free_standard_into_false_zero_score_input():
    payload = {
        "sections": [{"clauseNumber": "1", "heading": "Scope", "content": "Scope text"}],
        "requirementsSummary": {"requirements": [], "totalRequirements": 0},
    }
    assert _structured_clause_records(payload) == []

def test_structured_records_recover_reference_from_metadata_without_name_error():
    # Regression for the production failure: _reference_from_text calls the
    # shared _dedupe_repeat helper while the requirement has a generic ref.
    payload = {
        "sections": [
            {
                "clauseNumber": "7.2.4",
                "heading": "7.2.4 Overcurrent protection",
                "content": "The protective device shall be provided.",
            }
        ],
        "requirementsSummary": {
            "requirements": [
                {
                    "id": "REQ-7.2.4-1",
                    "clauseRef": "Part 1",
                    "sectionNumber": "Clause 7.2.4",
                    "clauseTitle": "Overcurrent protection",
                    "text": "The protective device shall be provided.",
                    "type": "mandatory",
                    "modalVerb": "shall",
                }
            ],
            "totalRequirements": 1,
        },
    }

    records = _structured_clause_records(payload)
    assert len(records) == 1
    assert records[0].ref == "7.2.4"
    assert records[0].requirements[0]["_clauseMappingMethod"] == "metadata:sectionNumber"

