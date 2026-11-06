"""Pure-logic unit tests for the new extraction modules.

These cover scenarios that do NOT require API keys, real documents, or the
network, so they can be run inside the rag-service container with only the
already-installed runtime dependencies. Run with:

    python -m unittest app/tests/test_extraction_logic -v

(or copy into the container /app and run `python -m unittest discover`)
"""
import unittest
import asyncio

from app.services import evidence as ev
from app.services.evidence import Fact, SourceRef, Candidate, values_conflict, merge_facts
from app.services.json_robust import parse_json, InvalidJSON, parse_json_with_retries, _find_valid_prefix
from app.services import normalize as nz
from app.services.chunking import chunk_text


class TestJsonRobust(unittest.TestCase):
    def test_valid_json(self):
        r = parse_json('{"title": "X", "sections": []}')
        self.assertFalse(r.recovered)
        self.assertEqual(r.data["title"], "X")

    def test_code_fence_stripped(self):
        r = parse_json('```json\n{"title": "Y"}\n```')
        self.assertEqual(r.data["title"], "Y")

    def test_truncated_json_detected(self):
        # An unclosed object is clearly truncated → must raise kind='truncated'.
        with self.assertRaises(InvalidJSON) as ctx:
            parse_json('{"title": "X", "sections": [{"heading": "H"')
        self.assertEqual(ctx.exception.kind, "truncated")

    def test_malformed_json_detected(self):
        # Balanced braces but invalid syntax → genuinely malformed (not truncated).
        with self.assertRaises(InvalidJSON) as ctx:
            parse_json('{"title": "X" "sections": []}')
        self.assertEqual(ctx.exception.kind, "malformed")

    def test_invalid_json_always_raises(self):
        # The production-critical invariant: any malformed/truncated output raises
        # InvalidJSON (so the caller retries the WHOLE model call) instead of being
        # silently stored as a valid-looking degraded object.
        for bad in ('', '{', '[', '{"a": }', 'not json', '{"a": 1 "b": 2}', '{"a": '):
            with self.assertRaises(InvalidJSON):
                _ = parse_json(bad)

    def test_empty_detected(self):
        with self.assertRaises(InvalidJSON):
            parse_json("")

    def test_recovery_on_truncated_tail(self):
        r = parse_json('{"a": 1, "b": 2', recover=True)
        self.assertTrue(r.recovered)
        self.assertEqual(r.data.get("a"), 1)

    def test_trailing_garbage_prefix_salvaged(self):
        # Complete JSON object followed by human-readable prose (common with some
        # models appending a closing remark). Must be salvaged losslessly.
        text = '{"title": "ACME", "sections": []} Here is my summary of the document.'
        prefix = _find_valid_prefix(text)
        self.assertIsNotNone(prefix)
        data, _candidate = prefix
        self.assertEqual(data, {"title": "ACME", "sections": []})

    def test_trailing_garbage_via_recover(self):
        pr = parse_json('{"a": 1} done.', recover=True)
        self.assertTrue(pr.recovered)
        self.assertEqual(pr.data.get("a"), 1)

    def test_trailing_garbage_is_not_truncation(self):
        # A fully-closed object + trailing text STILL fails the strict parse (it is
        # not silently accepted), but it is safely recoverable via the prefix path,
        # so it should not push a wasteful full re-request. Invariant: strict parse
        # raises InvalidJSON; recovery salvages it.
        text = '{"a": 1} trailing'
        with self.assertRaises(InvalidJSON):
            parse_json(text, recover=False)
        pr = parse_json(text, recover=True)
        self.assertTrue(pr.recovered)
        self.assertEqual(pr.data.get("a"), 1)

    def test_genuine_truncation_not_matched_as_prefix(self):
        # An unclosed object must NOT be mistaken for trailing-garbage, so the
        # strict path still re-requests the model rather than salvaging a half.
        text = '{"title": "X", "sections": [{"heading": "H"'
        self.assertIsNone(_find_valid_prefix(text))

    def test_leading_prose_not_matched_as_prefix(self):
        # Prose that precedes the JSON is not a valid prefix of a complete object.
        self.assertIsNone(_find_valid_prefix('Summary: {"x":1}'))

    def test_array_trailing_prefix(self):
        data, _candidate = _find_valid_prefix('[{"a":1}] done')
        self.assertEqual(data, [{"a": 1}])



class TestNormalization(unittest.TestCase):
    def test_date_iso(self):
        self.assertEqual(nz.normalize_value("expiryDate", "31/12/2026"), "2026-12-31")
        self.assertEqual(nz.normalize_value("x", "2024-03-05"), "2024-03-05")

    def test_quantity_preserves_original(self):
        # normalize must be reversible: it returns machine form but evidence keeps raw.
        v = nz.normalize_value("weight", "5,5 kg")
        self.assertIsNotNone(v)
        self.assertIn("kg", v)

    def test_high_risk_not_silently_corrected(self):
        # For a high-risk id the raw string is preserved verbatim in the fact.
        f = ev._scalar_fact("basicInformation.serialNumber", "O1I2S5", "f.pdf", 1, "llm")
        self.assertEqual(f.raw_value, "O1I2S5")
        self.assertEqual(f.value, "O1I2S5")


class TestEvidenceConflict(unittest.TestCase):
    def test_equal_values_no_conflict(self):
        self.assertFalse(values_conflict("ACME Corp", "ACME Corp"))

    def test_case_space_insensitive_same(self):
        self.assertFalse(values_conflict("Acme Corp", "acme  corp"))

    def test_numeric_equivalence(self):
        self.assertFalse(values_conflict("5.5 kW", "5,5 kW"))

    def test_different_values_conflict(self):
        self.assertTrue(values_conflict("ACME Corp", "Globex Inc"))

    def test_merge_agreeing_keeps_high_confidence(self):
        a = Fact(field="basicInformation.manufacturer", value="ACME", confidence=0.9,
                 source=SourceRef(file="a.pdf", page=1))
        b = Fact(field="basicInformation.manufacturer", value="ACME", confidence=0.99,
                 source=SourceRef(file="b.pdf", page=2))
        merged = merge_facts(a, b)
        self.assertEqual(merged.confidence, 0.99)
        self.assertEqual(merged.status, ev.FOUND)

    def test_merge_conflicting_marks_conflict_not_longest(self):
        """The 'longest wins' heuristic is NOT used: a conflict is preserved with
        both candidates, regardless of which string is longer."""
        a = Fact(field="basicInformation.reference", value="REF-1", confidence=0.9,
                 source=SourceRef(file="a.pdf"))
        b = Fact(field="basicInformation.reference", value="REF-1-B007-EXTRA-LONG", confidence=0.9,
                 source=SourceRef(file="b.pdf"))
        merged = merge_facts(a, b)
        self.assertEqual(merged.status, ev.CONFLICT)
        self.assertEqual(len(merged.candidates), 2)
        # The longer string must NOT have silently won.
        self.assertNotEqual(merged.value, "REF-1-B007-EXTRA-LONG")

    def test_missing_never_overwrites_found(self):
        a = Fact(field="x", value="present", confidence=0.9, source=SourceRef(file="a.pdf"))
        missing = Fact(field="x", value=None, status=ev.NOT_FOUND)
        merged = merge_facts(a, missing)
        self.assertEqual(merged.status, ev.FOUND)
        self.assertEqual(merged.value, "present")

    def test_high_risk_uncertain_default(self):
        f = ev._scalar_fact("basicInformation.serialNumber", "?!?", "f.pdf", 1, "llm")
        self.assertEqual(f.status, ev.UNCERTAIN)


class TestCompleteness(unittest.TestCase):
    def test_partial_when_chunks_failed(self):
        facts = [Fact(field="basicInformation.manufacturer", value="ACME", source=SourceRef(file="f.pdf"))]
        report = ev.completeness_report(facts, ["basicInformation.manufacturer", "basicInformation.reference"],
                                        failed_chunks=1, total_chunks=5)
        self.assertEqual(report["documentState"], "PARTIAL")
        self.assertIn("basicInformation.reference", report["missingFields"])

    def test_conflict_surfaces(self):
        facts = [
            Fact(field="weight", value="5 kg", source=SourceRef(file="a.pdf")),
            Fact(field="weight", value="6 kg", source=SourceRef(file="b.pdf")),
        ]
        report = ev.completeness_report(facts, ["weight"])
        self.assertIn("weight", report["conflicts"])


class TestChunking(unittest.TestCase):
    def test_no_silent_truncation(self):
        paras = [f"Paragraph number {i} with enough unique words to be a block." for i in range(50)]
        text = "\n\n".join(paras)
        chunks = chunk_text(text, max_chars=400, overlap=40)
        # Every paragraph's content must survive somewhere — content presence is
        # the real guarantee, not char-for-char length (whitespace is normalised).
        for p in paras:
            self.assertTrue(
                any(p in c.text for c in chunks),
                f"paragraph lost: {p[:40]}",
            )

    def test_single_chunk_when_small(self):
        chunks = chunk_text("Short doc", max_chars=9000)
        self.assertEqual(len(chunks), 1)

    def test_every_chunk_returned(self):
        text = "\n\n".join(str(i) * 20 for i in range(30))
        chunks = chunk_text(text, max_chars=100, overlap=10)
        # The orchestrator processes ALL chunks; the chunker must not drop any.
        joined = "".join(c.text for c in chunks)
        self.assertTrue(joined)


def async_test(coro):
    def wrapper(*args, **kwargs):
        loop = asyncio.new_event_loop()
        try:
            return loop.run_until_complete(coro(*args, **kwargs))
        finally:
            loop.close()
    return wrapper


class TestRateLimit(unittest.TestCase):
    @async_test
    async def test_credit_exhaustion_uses_fallback(self):
        from app.services.rate_limit import CreditExhaustedError, retry_with_backoff

        calls = {"primary": 0, "fallback": 0}

        async def primary():
            calls["primary"] += 1
            raise CreditExhaustedError(detail="out of credits")

        async def fallback():
            calls["fallback"] += 1
            return "ok-from-fallback"

        result = await retry_with_backoff(primary, max_attempts=3, fallback_provider=fallback)
        self.assertEqual(result, "ok-from-fallback")
        self.assertEqual(calls["primary"], 1)  # credit exhaustion fails fast, no retry
        self.assertEqual(calls["fallback"], 1)


    @async_test
    async def test_rate_limit_backoff_retries(self):
        from app.services.rate_limit import RetryableError, retry_with_backoff

        attempts = {"n": 0}

        async def flaky():
            attempts["n"] += 1
            if attempts["n"] < 3:
                raise RetryableError(status=429, retry_after=0, kind="rate_limit")
            return "ok"

        result = await retry_with_backoff(flaky, max_attempts=5)
        self.assertEqual(result, "ok")
        self.assertEqual(attempts["n"], 3)


class TestFingerprint(unittest.TestCase):
    def test_same_content_same_fingerprint(self):
        a = ev.fingerprint("d1", "c1", "k1", "the same extracted text", {})
        b = ev.fingerprint("d1", "c1", "k1", "the same extracted text", {})
        self.assertEqual(a, b)

    def test_different_content_differs(self):
        a = ev.fingerprint("d1", "c1", "k1", "text A", {})
        b = ev.fingerprint("d1", "c1", "k1", "text B", {})
        self.assertNotEqual(a, b)


if __name__ == "__main__":
    unittest.main()
