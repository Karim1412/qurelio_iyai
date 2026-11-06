import unittest

from app.services.compliance_guard import clause_reference_quality, requirement_scope


class ComplianceGuardTests(unittest.TestCase):
    def test_may_inside_mandatory_sentence_does_not_exclude_obligation(self):
        r = requirement_scope({"clauseRef": "4.1", "type": "mandatory", "text":
            "The manufacturer shall maintain records of incidents that may affect safety."})
        self.assertEqual(r["scope"], "IN_SCOPE")

    def test_economic_operator_is_not_automatically_excluded(self):
        r = requirement_scope({"clauseRef": "4.1", "type": "mandatory", "text":
            "Economic operators shall retain the documentation."})
        self.assertEqual(r["scope"], "REVIEW")

    def test_multilingual_normative_wording_is_not_silently_excluded(self):
        for text in ("Il fabbricante deve conservare i documenti.",
                     "El fabricante debe conservar los documentos.",
                     "Der Hersteller muss die Dokumente aufbewahren.",
                     "يجب على المصنع الاحتفاظ بالسجلات."):
            with self.subTest(text=text):
                r = requirement_scope({"clauseRef": "4.1", "type": "mandatory", "text": text})
                self.assertNotEqual(r["scope"], "OUT_OF_SCOPE")

    def test_date_is_not_a_clause(self):
        q = clause_reference_quality("29.3.2014")
        self.assertFalse(q["valid"])
        self.assertEqual(q["kind"], "DATE_METADATA")

    def test_member_state_requirement_is_out_of_scope(self):
        r = requirement_scope({
            "clauseRef": "5",
            "text": "Member States shall notify the Commission of the measures taken.",
            "type": "mandatory",
        })
        self.assertEqual(r["scope"], "OUT_OF_SCOPE")
        self.assertEqual(r["kind"], "MEMBER_STATE")

    def test_notified_body_requirement_is_out_of_scope(self):
        r = requirement_scope({
            "clauseRef": "24",
            "text": "Conformity assessment bodies shall be independent.",
            "type": "mandatory",
        })
        self.assertEqual(r["scope"], "OUT_OF_SCOPE")
        self.assertEqual(r["kind"], "CONFORMITY_ASSESSMENT_BODY")

    def test_recital_section_is_out_of_scope(self):
        r = requirement_scope({
            "clauseRef": "1",
            "text": "This Directive should take account of the state of the art.",
            "type": "recommended",
        }, section_type="recital")
        self.assertEqual(r["scope"], "OUT_OF_SCOPE")
        self.assertEqual(r["kind"], "NON_NORMATIVE_SECTION")

    def test_manufacturer_requirement_is_in_scope(self):
        r = requirement_scope({
            "clauseRef": "7",
            "text": "Manufacturers shall draw up the technical documentation.",
            "type": "mandatory",
        })
        self.assertEqual(r["scope"], "IN_SCOPE")
        self.assertEqual(r["kind"], "MANUFACTURER")

    def test_pure_context_without_normative_signal_is_out_of_scope(self):
        r = requirement_scope({
            "clauseRef": "2",
            "text": "This Directive establishes requirements for electromagnetic compatibility.",
            "type": "mandatory",
        })
        self.assertEqual(r["scope"], "OUT_OF_SCOPE")
        self.assertEqual(r["kind"], "NO_NORMATIVE_SIGNAL")


if __name__ == "__main__":
    unittest.main()
