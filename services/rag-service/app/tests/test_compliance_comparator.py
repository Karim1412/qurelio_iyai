import unittest

from app.services.compliance_comparator import compare_requirement, reconcile_llm_judgment
from app.services.compliance_rules import Fact, ProductSnapshot


class ComplianceComparatorTests(unittest.TestCase):
    def test_numeric_requirement_passes_from_grounded_product_fact(self):
        snapshot = ProductSnapshot(facts={
            "voltage": Fact(
                field="electronicsDetails.voltageRating",
                value="230 V",
                source="Datasheet.pdf",
                page=12,
                confidence=0.92,
                grounded=True,
                evidence="Rated voltage: 230 V",
            )
        })
        result = compare_requirement({
            "id": "REQ-1",
            "clauseRef": "6.2",
            "text": "The supply voltage shall not exceed 250 V.",
            "type": "mandatory",
            "grounded": True,
        }, snapshot)
        self.assertEqual(result["decision"], "PASS")
        self.assertEqual(result["coverage"], "COMPLETE")
        self.assertEqual(result["method"], "deterministic_product_standard_numeric")

    def test_numeric_requirement_fails_when_product_is_outside_limit(self):
        snapshot = ProductSnapshot(facts={
            "pressure": Fact(
                field="machineryDetails.operatingPressure",
                value="14 bar",
                source="Datasheet.pdf",
                page=8,
                confidence=0.90,
                grounded=True,
                evidence="Maximum operating pressure: 14 bar",
            )
        })
        result = compare_requirement({
            "id": "REQ-2",
            "clauseRef": "8.4",
            "text": "Operating pressure shall not exceed 10 bar.",
            "type": "mandatory",
            "grounded": True,
        }, snapshot)
        self.assertEqual(result["decision"], "FAIL")
        self.assertEqual(result["elements"][0]["comparison"], "outside_limit")

    def test_range_requirement_normalizes_units(self):
        snapshot = ProductSnapshot(facts={
            "voltage": Fact(
                field="voltage",
                value="0.23 kV",
                source="Technical specification.pdf",
                confidence=0.90,
                grounded=True,
                evidence="Nominal voltage: 0.23 kV",
            )
        })
        result = compare_requirement({
            "id": "REQ-3",
            "clauseRef": "4.1",
            "text": "The nominal voltage shall be between 220 V and 240 V.",
            "type": "mandatory",
            "grounded": True,
        }, snapshot)
        self.assertEqual(result["decision"], "PASS")
        self.assertEqual(result["elements"][0]["normalizedObserved"]["unit"], "v")

    def test_conflicting_product_facts_do_not_auto_pass(self):
        snapshot = ProductSnapshot(facts={
            "pressure": Fact(
                field="pressure",
                value="10 bar",
                source="Spec-A.pdf",
                confidence=0.95,
                grounded=True,
                conflict=True,
                evidence="Operating pressure: 10 bar",
            )
        })
        result = compare_requirement({
            "id": "REQ-4",
            "clauseRef": "5.2",
            "text": "Operating pressure shall not exceed 10 bar.",
            "type": "mandatory",
            "grounded": True,
        }, snapshot)
        self.assertIsNone(result["decision"])
        self.assertEqual(result["coverage"], "CONFLICTING")

    def test_ungrounded_standard_requirement_never_auto_decides(self):
        snapshot = ProductSnapshot(facts={
            "voltage": Fact(field="voltage", value="230 V", confidence=.99, grounded=True)
        })
        result = compare_requirement({
            "id": "REQ-5",
            "clauseRef": "3.1",
            "text": "The supply voltage shall not exceed 250 V.",
            "type": "mandatory",
            "grounded": False,
        }, snapshot)
        self.assertIsNone(result["decision"])
        self.assertEqual(result["method"], "standard_requirement_not_grounded")

    def test_llm_pass_is_reconciled_against_strong_numeric_contradiction(self):
        comparison = {
            "decision": "FAIL",
            "confidence": 0.95,
            "coverage": "COMPLETE",
        }
        status, confidence, reason = reconcile_llm_judgment(
            "PASS", .91, comparison, supporting_evidence_count=1, evidence_refs_count=1
        )
        self.assertEqual(status, "FAIL")
        self.assertGreaterEqual(confidence, .90)
        self.assertIn("contradicts the LLM PASS", reason)



    def test_multiple_numeric_constraints_require_all_to_pass(self):
        snapshot = ProductSnapshot(facts={
            "voltage": Fact(field="voltage", value="230 V", source="Datasheet.pdf", confidence=0.95, grounded=True, evidence="Rated voltage: 230 V"),
            "frequency": Fact(field="frequency", value="50 Hz", source="Datasheet.pdf", confidence=0.95, grounded=True, evidence="Frequency: 50 Hz"),
        })
        result = compare_requirement({
            "id": "REQ-7",
            "clauseRef": "6.2",
            "text": "The equipment shall have a voltage between 220 V and 240 V and a frequency between 45 Hz and 60 Hz.",
            "type": "mandatory",
            "grounded": True,
        }, snapshot)
        self.assertEqual(result["decision"], "PASS")
        self.assertEqual(result["numericConstraintCount"], 2)
        self.assertEqual(result["numericConstraintsCovered"], 2)

    def test_multiple_numeric_constraints_fail_when_one_is_outside_limit(self):
        snapshot = ProductSnapshot(facts={
            "voltage": Fact(field="voltage", value="230 V", source="Datasheet.pdf", confidence=0.95, grounded=True, evidence="Rated voltage: 230 V"),
            "frequency": Fact(field="frequency", value="70 Hz", source="Datasheet.pdf", confidence=0.95, grounded=True, evidence="Frequency: 70 Hz"),
        })
        result = compare_requirement({
            "id": "REQ-8",
            "clauseRef": "6.2",
            "text": "The equipment shall have a voltage between 220 V and 240 V and a frequency between 45 Hz and 60 Hz.",
            "type": "mandatory",
            "grounded": True,
        }, snapshot)
        self.assertEqual(result["decision"], "FAIL")
        self.assertEqual(result["numericConstraintsContradicted"], 1)

    def test_strict_boundary_does_not_pass_at_equal_limit(self):
        snapshot = ProductSnapshot(facts={
            "pressure": Fact(field="pressure", value="10 bar", source="Test report.pdf", confidence=0.94, grounded=True, evidence="Maximum pressure: 10 bar"),
        })
        result = compare_requirement({
            "id": "REQ-9",
            "clauseRef": "7.1",
            "text": "The working pressure shall be less than 10 bar.",
            "type": "mandatory",
            "grounded": True,
        }, snapshot)
        self.assertEqual(result["decision"], "FAIL")

    def test_informative_requirement_is_not_scored_as_conformity(self):
        result = compare_requirement({
            "id": "REQ-10",
            "clauseRef": "1",
            "text": "This clause provides background information.",
            "type": "informative",
            "grounded": True,
        }, ProductSnapshot(facts={}))
        self.assertEqual(result["decision"], "N/A")
        self.assertEqual(result["coverage"], "NOT_APPLICABLE")

    def test_certification_reference_alone_never_auto_passes(self):
        snapshot = ProductSnapshot(facts={
            "certificate": Fact(field="certificate", value="ISO 13485", source="Product certificate.pdf", confidence=0.95, grounded=True, evidence="Certificate: ISO 13485"),
        })
        result = compare_requirement({
            "id": "REQ-11",
            "clauseRef": "4.1",
            "text": "The manufacturer shall be certified to ISO 13485.",
            "type": "mandatory",
            "grounded": True,
        }, snapshot)
        self.assertIsNone(result["decision"])
        self.assertEqual(result["method"], "certification_evidence_required")

    def test_required_feature_can_be_checked_against_product_fact(self):
        snapshot = ProductSnapshot(facts={
            "emergency stop": Fact(field="emergency stop", value="Emergency stop button installed", source="Machine datasheet.pdf", confidence=0.94, grounded=True, evidence="Emergency stop button installed"),
        })
        result = compare_requirement({
            "id": "REQ-12",
            "clauseRef": "5.4",
            "text": "The machine shall be equipped with an emergency stop button.",
            "type": "mandatory",
            "grounded": True,
        }, snapshot)
        self.assertEqual(result["decision"], "PASS")

    def test_required_feature_and_numeric_constraint_are_both_required(self):
        snapshot = ProductSnapshot(facts={
            "voltage": Fact(field="voltage", value="230 V", source="Datasheet.pdf", confidence=0.95, grounded=True, evidence="Rated voltage: 230 V"),
        })
        result = compare_requirement({
            "id": "REQ-13",
            "clauseRef": "5.5",
            "text": "The equipment shall have a voltage between 220 V and 240 V and shall include an emergency stop button.",
            "type": "mandatory",
            "grounded": True,
        }, snapshot)
        self.assertIsNone(result["decision"])
        self.assertEqual(result["coverage"], "PARTIAL")

    def test_prohibited_feature_is_a_contradiction(self):
        snapshot = ProductSnapshot(facts={
            "material": Fact(field="material", value="Contains asbestos", source="Material declaration.pdf", confidence=0.95, grounded=True, evidence="Contains asbestos"),
        })
        result = compare_requirement({
            "id": "REQ-14",
            "clauseRef": "8.1",
            "text": "The product shall not contain asbestos.",
            "type": "mandatory",
            "grounded": True,
        }, snapshot)
        self.assertEqual(result["decision"], "FAIL")

    def test_exact_value_does_not_pass_for_a_product_range(self):
        snapshot = ProductSnapshot(facts={
            "voltage": Fact(field="voltage", value="220-240 V", source="Datasheet.pdf", confidence=0.95, grounded=True, evidence="Rated voltage: 220-240 V"),
        })
        result = compare_requirement({
            "id": "REQ-15",
            "clauseRef": "6.3",
            "text": "The equipment shall have a voltage of 230 V.",
            "type": "mandatory",
            "grounded": True,
        }, snapshot)
        self.assertIsNone(result["decision"])
        self.assertEqual(result["elements"][0]["comparison"], "exact_value_mismatch")

    def test_member_state_article_is_not_a_product_conformity_failure(self):
        result = compare_requirement({
            "id": "REQ-SCOPE-1",
            "clauseRef": "5",
            "text": "Member States shall notify the Commission of the measures taken.",
            "type": "mandatory",
            "grounded": True,
        }, ProductSnapshot(facts={}))
        self.assertEqual(result["decision"], "N/A")
        self.assertEqual(result["applicability"]["kind"], "MEMBER_STATE")

    def test_date_reference_with_normative_text_is_inconclusive(self):
        result = compare_requirement({
            "id": "REQ-SCOPE-2",
            "clauseRef": "29.3.2014",
            "text": "Manufacturers shall retain the technical documentation for ten years.",
            "type": "mandatory",
            "grounded": True,
        }, ProductSnapshot(facts={}))
        self.assertEqual(result["decision"], "INCONCLUSIVE")
        self.assertEqual(result["method"], "scope_gate_review")

    def test_llm_pass_is_not_allowed_to_override_documentary_contradiction(self):
        comparison = {
            "decision": "FAIL",
            "confidence": 0.95,
            "coverage": "COMPLETE",
        }
        status, confidence, reason = reconcile_llm_judgment(
            "PASS", .91, comparison, supporting_evidence_count=1, evidence_refs_count=1,
            llm_evidence_assessment=[{"supports": True, "contradicts": False}],
        )
        self.assertEqual(status, "MISSING_INFO")
        self.assertLessEqual(confidence, 0.58)
        self.assertIn("conflicting evidence", reason.lower())

    def test_llm_na_without_scope_or_condition_is_not_accepted(self):
        status, _, reason = reconcile_llm_judgment(
            "N/A", .90, {"decision": None, "coverage": "NONE", "confidence": 0.0},
            supporting_evidence_count=0, evidence_refs_count=0,
        )
        self.assertEqual(status, "MISSING_INFO")
        self.assertIn("returned N/A", reason)

    def test_ungrounded_product_fact_cannot_auto_pass_numeric_requirement(self):
        snapshot = ProductSnapshot(facts={
            "voltage": Fact(
                field="voltage", value="230 V", source="Unknown.pdf", confidence=0.99,
                grounded=False, evidence="Rated voltage: 230 V",
            )
        })
        result = compare_requirement({
            "id": "REQ-UNGR-1",
            "clauseRef": "6.1",
            "text": "The supply voltage shall not exceed 250 V.",
            "type": "mandatory",
            "grounded": True,
        }, snapshot)
        self.assertIsNone(result["decision"])
        self.assertIn(result["coverage"], {"PARTIAL", "NONE", "CONFLICTING"})


if __name__ == "__main__":
    unittest.main()

class ComplianceComparatorAdditionalTests(unittest.TestCase):
    def test_up_to_with_spaced_thousands_is_parsed_and_checked(self):
        snapshot = ProductSnapshot(facts={
            "voltage": Fact(
                field="electronicsDetails.voltageRating",
                value="900 V",
                source="Technical Manual.pdf",
                page=4,
                confidence=0.96,
                grounded=True,
                evidence="Rated voltage: 900 V",
            )
        })
        result = compare_requirement({
            "id": "REQ-16",
            "clauseRef": "4.4.5",
            "text": "The equipment shall be supplied at a voltage up to 1 000 V.",
            "type": "mandatory",
            "grounded": True,
        }, snapshot)
        self.assertEqual(result["decision"], "PASS")
        self.assertEqual(result["elements"][0]["comparison"], "within_limit")

    def test_out_of_scope_actor_never_reaches_semantic_decision(self):
        result = compare_requirement({
            "id": "REQ-SCOPE-3",
            "clauseRef": "10",
            "text": "Importers shall keep a copy of the EU declaration of conformity.",
            "type": "mandatory",
            "grounded": True,
        }, ProductSnapshot(facts={}))
        self.assertEqual(result["decision"], "N/A")
        self.assertEqual(result["applicability"]["scope"], "OUT_OF_SCOPE")

class ComplianceComparatorAccuracyRegressionTests(unittest.TestCase):
    def _snapshot(self):
        return ProductSnapshot(facts={
            "assembly": Fact(
                field="Assembly's dimensions",
                value="128.5 mm",
                source="Boitier_contacteur_LE1D09P7A04.pdf",
                confidence=0.99,
                grounded=True,
                evidence="Assembly's dimensions 128.5",
                document_id="d1",
            ),
            "bobine": Fact(
                field="bobine",
                value="230Vca",
                source="Boitier_contacteur_LE1D09P7A04.pdf",
                confidence=0.99,
                grounded=True,
                evidence="bobine 230Vca",
                document_id="d1",
            ),
        })

    def test_insulation_resistance_cannot_use_dimension_as_evidence(self):
        result = compare_requirement({
            "id": "REQ-ACC-1",
            "clauseRef": "18.3",
            "text": "When insulation resistance tests are performed, the insulation resistance measured at 500 V DC between the power circuit conductors and the protective bonding circuit shall be not less than 1 MΩ.",
            "type": "mandatory",
            "grounded": True,
        }, self._snapshot())
        self.assertIsNone(result["decision"])
        self.assertEqual(result["coverage"], "NONE")
        self.assertEqual(result["elements"], [])

    def test_test_frequency_cannot_use_bobine_voltage_as_frequency(self):
        result = compare_requirement({
            "id": "REQ-ACC-2",
            "clauseRef": "18.4",
            "text": "The test voltage shall be at a nominal frequency of 50 Hz or 60 Hz.",
            "type": "mandatory",
            "grounded": True,
        }, self._snapshot())
        self.assertIsNone(result["decision"])
        self.assertEqual(result["elements"], [])

    def test_test_duration_cannot_use_dimension_as_duration(self):
        result = compare_requirement({
            "id": "REQ-ACC-3",
            "clauseRef": "18.4",
            "text": "The maximum test voltage shall be applied between the power circuit conductors and the protective bonding circuit for at least 1 s.",
            "type": "mandatory",
            "grounded": True,
        }, self._snapshot())
        self.assertIsNone(result["decision"])
        self.assertEqual(result["elements"], [])

    def test_procedural_resistance_range_cannot_fail_from_dimension(self):
        result = compare_requirement({
            "id": "REQ-ACC-4",
            "clauseRef": "18.2.2",
            "text": "The resistance measured shall be in the expected range according to the length, the cross sectional area and the material of the related protective conductors and protective bonding conductor(s).",
            "type": "mandatory",
            "grounded": True,
        }, self._snapshot())
        self.assertIsNone(result["decision"])
        self.assertEqual(result["elements"], [])

    def test_derived_test_voltage_is_not_compared_to_rated_voltage(self):
        result = compare_requirement({
            "id": "REQ-ACC-5",
            "clauseRef": "18.4",
            "text": "The maximum test voltage shall have a value of twice the rated supply voltage of the equipment or 1 000 V, whichever is the greater.",
            "type": "mandatory",
            "grounded": True,
        }, self._snapshot())
        self.assertIsNone(result["decision"])
        self.assertEqual(result["elements"], [])

    def test_allowed_frequency_values_are_parsed_without_inventing_voltage_frequency(self):
        from app.services.compliance_comparator import _extract_requirement_numerics
        numerics = _extract_requirement_numerics("The test voltage shall be at a nominal frequency of 50 Hz or 60 Hz.")
        self.assertEqual(len(numerics), 1)
        self.assertEqual(numerics[0]["operator"], "allowed")
        self.assertEqual(numerics[0]["values"], [50.0, 60.0])
        self.assertEqual(numerics[0]["canonicalProperty"], "test_frequency")

    def test_real_grounded_insulation_resistance_can_pass(self):
        snapshot = ProductSnapshot(facts={
            "insulation": Fact(
                field="insulation resistance",
                value="2 MΩ",
                source="Electrical test report.pdf",
                confidence=0.96,
                grounded=True,
                evidence="Insulation resistance: 2 MΩ at 500 V DC",
                document_id="test1",
            )
        })
        result = compare_requirement({
            "id": "REQ-ACC-6",
            "clauseRef": "18.3",
            "text": "When insulation resistance tests are performed, the insulation resistance measured at 500 V DC between the power circuit conductors and the protective bonding circuit shall be not less than 1 MΩ.",
            "type": "mandatory",
            "grounded": True,
        }, snapshot)
        # This requirement contains procedure wording, so the comparator defers to
        # semantic evidence assessment rather than treating the test value as a
        # static Product attribute. The key accuracy invariant is that it must not
        # be incorrectly decided from unrelated fields.
        self.assertIsNone(result["decision"])


if __name__ == "__main__":
    unittest.main()
