import unittest

from app.services.compliance_rules import Fact, ProductSnapshot, build_product_snapshot, deterministic_check


class ComplianceRulesTests(unittest.TestCase):
    def snapshot(self):
        return build_product_snapshot({
            "name": "Machine X",
            "extractedStructured": {
                "productProfile": {
                    "basicInformation": {"category": "industrial_machine"},
                    "usage": {"voltageFrequency": "950 V AC / 50 Hz", "ipRating": "IP54"},
                    "electronicsDetails": {"voltageRating": "950 V", "frequencyRange": "50 Hz"},
                    "certifications": {"standards": ["EN 60204-1:2018"], "marks": ["CE"]},
                }
            },
            "productFolder": {
                "name": "Machine X",
                "mergedProfile": {
                    "usage": {"voltageFrequency": "950 V AC / 50 Hz"},
                    "certifications": {"standards": ["EN 60204-1:2018"]},
                },
                "fieldProvenance": {"usage.voltageFrequency": {"documentId": "prod-doc", "documentName": "spec.pdf", "page": 12}},
                "fieldConflicts": {},
            },
        }, "prod-doc")

    def test_numeric_max_pass(self):
        snap = self.snapshot()
        out = deterministic_check({"text": "The nominal voltage shall not exceed 1000 V.", "type": "mandatory"}, snap)
        self.assertIsNotNone(out)
        self.assertEqual(out["status"], "PASS")

    def test_numeric_max_fail(self):
        snap = self.snapshot()
        # Replace the authoritative fact with a contradictory value.
        snap.facts["usage.voltagefrequency"].value = "1200 V AC / 50 Hz"
        out = deterministic_check({"text": "The nominal voltage shall not exceed 1000 V.", "type": "mandatory"}, snap)
        self.assertIsNotNone(out)
        self.assertEqual(out["status"], "FAIL")

    def test_certification_claim_is_not_auto_pass(self):
        snap = self.snapshot()
        out = deterministic_check({"text": "The equipment shall comply with EN 60204-1:2018.", "type": "mandatory"}, snap)
        self.assertIsNone(out)

    def test_informative_is_not_assessed(self):
        snap = self.snapshot()
        out = deterministic_check({"text": "Background information.", "type": "informative"}, snap)
        self.assertEqual(out["status"], "N/A")

    def test_unknown_numeric_is_deferred(self):
        snap = build_product_snapshot({"extractedStructured": {"productProfile": {}}}, "prod-doc")
        out = deterministic_check({"text": "The nominal voltage shall not exceed 1000 V.", "type": "mandatory"}, snap)
        self.assertIsNone(out)


    def test_voltage_uses_compatible_unit_in_mixed_fact(self):
        snap = ProductSnapshot(facts={
            "voltagefrequency": Fact(field="voltageFrequency", value="50/60 Hz, 230 V")
        })
        out = deterministic_check({"text": "The supply voltage shall not exceed 400 V.", "type": "mandatory"}, snap)
        self.assertIsNotNone(out)
        self.assertEqual(out["status"], "PASS")

if __name__ == "__main__":
    unittest.main()
