"""Offline regression tests for compliance source isolation and scoring."""
import asyncio
import importlib.util
import sys
import types
import unittest
from types import SimpleNamespace
from pathlib import Path
from unittest.mock import patch

try:
    import httpx  # noqa: F401
except ImportError:
    fake = types.ModuleType('httpx')
    fake.TimeoutException = type('TimeoutException', (Exception,), {})
    fake.RequestError = type('RequestError', (Exception,), {})
    sys.modules['httpx'] = fake

from app.tests.test_compliance_engine_hardening import EvaluationEngine, ClauseRecord
import app.services.evaluation_engine as engine_module
from app.services.compliance_rules import Fact, ProductSnapshot, build_product_snapshot


class Bus:
    async def publish(self, *args, **kwargs): pass


def row(status, ref='4.1'):
    return SimpleNamespace(status=status, clause_reference=ref)


class ReliabilityTests(unittest.TestCase):
    def test_score_requires_complete_applicable_decisions(self):
        cases = [[row('PASS')] + [row('INCONCLUSIVE') for _ in range(99)],
                 [row('PASS'), row('MISSING_INFO')], [row('N/A')], [], [row('PASS'), row('UNKNOWN')]]
        for rows in cases:
            with self.subTest(rows=len(rows)):
                self.assertIsNone(engine_module._weighted_overall(rows, None))
        rows = [row('PASS', '4.1'), row('FAIL', '5.1'), row('N/A', '6.1')]
        self.assertEqual(engine_module._weighted_overall(rows, None), 50.0)
        self.assertEqual(engine_module._weighted_overall(rows, {'4.1': 2, '5.1': 1}), 66.67)
        self.assertEqual(engine_module._weighted_overall(rows, {'4.1': float('nan')}), 50.0)

    def test_judge_validation_rejects_malformed_output(self):
        base = {'requirement_index': 1, 'status': 'PASS', 'justification': 'Supported', 'confidence': 0.9, 'evidence_refs': [1]}
        invalid = [{'status': 'FABRICATED'}, {'requirement_index': 1.5}, {'requirement_index': True},
                   {'requirement_index': 3}, {'confidence': float('nan')}, {'confidence': True},
                   {'evidence_refs': [True]}, {'evidence_refs': '1'}, {'evidence_assessment': [{'supports': 'true'}]}]
        for update in invalid:
            with self.subTest(update=update):
                self.assertFalse(engine_module._validate_judge_response({'judgments': [{**base, **update}]}, 2)[0])
        self.assertTrue(engine_module._validate_judge_response({'judgments': [base]}, 2)[0])
        self.assertTrue(engine_module._validate_judge_response({'judgments': [{**base, 'status': 'INCONCLUSIVE'}]}, 2)[0])

    def test_standard_page_provenance_is_preserved(self):
        data = {'sections': [{'clauseNumber': '4.1', 'title': 'Records', 'content': 'Records shall be retained.', 'pageStart': 3, 'pageEnd': 4}],
                'requirementsSummary': {'requirements': [{'id': 'req-1', 'clauseRef': '4.1', 'text': 'Records shall be retained.', 'type': 'mandatory'}]}}
        rec = engine_module._structured_clause_records(data)[0]
        self.assertEqual((rec.standard_quality_flags['sourcePageStart'], rec.standard_quality_flags['sourcePageEnd']), (3, 4))

    def test_same_standard_id_reads_the_updated_extraction(self):
        def extraction(text):
            return {'sections': [{'clauseNumber': '4.1', 'title': 'Records', 'content': text}],
                    'requirementsSummary': {'requirements': [{'id': 'r1', 'clauseRef': '4.1', 'text': text, 'type': 'mandatory'}]}}
        documents = [extraction('The manufacturer shall keep paper records.'),
                     extraction('The manufacturer shall keep electronic records.')]
        async def fetch(*args): return documents.pop(0)
        engine = object.__new__(EvaluationEngine)
        engine._clause_cache = {}
        engine._clause_records_cache = {}
        with patch.object(engine_module, '_fetch_structured_extraction', side_effect=fetch):
            asyncio.run(engine._derive_clauses('tenant', 'std', 'standard'))
            first = engine._clause_records_cache[('tenant', 'std')]['4.1'].requirements[0]['text']
            asyncio.run(engine._derive_clauses('tenant', 'std', 'standard'))
            second = engine._clause_records_cache[('tenant', 'std')]['4.1'].requirements[0]['text']
        self.assertIn('paper', first)
        self.assertIn('electronic', second)

    def test_missing_product_connection_fails_explicitly(self):
        with patch.object(engine_module.settings, 'DOCUMENT_INTERNAL_TOKEN', ''):
            with self.assertRaisesRegex(RuntimeError, 'not configured'):
                asyncio.run(engine_module._fetch_product_snapshot('tenant', 'product', ['product']))

    def test_benchmark_penalizes_missing_and_unexpected_passes(self):
        path = Path(__file__).parents[2] / 'scripts' / 'benchmark_compliance.py'
        spec = importlib.util.spec_from_file_location('compliance_benchmark', path)
        benchmark = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(benchmark)
        gold = [{'requirement_id': '1', 'status': 'PASS'}, {'requirement_id': '2', 'status': 'FAIL'}]
        actual = [{'requirement_id': '2', 'status': 'N/A'}, {'requirement_id': 'extra', 'status': 'PASS'}]
        result = benchmark.compare(gold, actual)
        self.assertEqual(result['pass_precision'], 0.0)
        self.assertEqual(result['pass_recall_including_missing'], 0.0)
        self.assertEqual(result['false_pass_ids'], ['extra'])
        self.assertEqual(result['incorrect_not_applicable_ids'], ['2'])
        self.assertEqual(result['missing_requirement_ids'], ['1'])

    def test_snapshot_excludes_restricted_sources(self):
        payload = {'name': 'Allowed.pdf', 'extractedStructured': {'productProfile': {'safe': 'yes'}, 'fieldEvidence': {'safe': 'safe: yes'}, 'extractionQuality': {'groundedFields': ['safe']}},
                   'productFolder': {'mergedProfile': {'secret': 'excluded', 'unknown': 'excluded', 'shared': 'kept'},
                   'fieldProvenance': {'secret': {'documentId': 'restricted'}, 'shared': {'documentId': 'allowed', 'evidence': 'shared: kept', 'grounded': True}},
                   'productFacts': [{'category': 'safety', 'label': 'secret feature', 'value': 'x', 'sources': [{'documentId': 'restricted'}]},
                                    {'category': 'safety', 'label': 'allowed feature', 'value': 'y', 'sources': [{'documentId': 'allowed', 'evidence': 'feature y', 'grounded': True}]}]}}
        snapshot = build_product_snapshot(payload, 'allowed', ['allowed'])
        facts = {f.field: f for f in snapshot.facts.values()}
        for field in ('secret', 'unknown', 'secret feature'): self.assertNotIn(field, facts)
        for field in ('shared', 'allowed feature', 'safe'): self.assertIn(field, facts)
        self.assertTrue(facts['safe'].grounded)

    def test_retrieval_covers_late_queries_and_rejects_wrong_documents(self):
        class Search:
            def __init__(self): self.queries = []
            async def search(self, query, company_id, **kwargs):
                self.queries.append(query)
                return [SimpleNamespace(score=0.9, metadata={'document_id': 'wrong', 'text': 'restricted evidence'}),
                        SimpleNamespace(score=0.8, metadata={'document_id': 'allowed', 'text': 'source ' + query})]
        engine = object.__new__(EvaluationEngine)
        engine.ingestion = Search()
        with patch.object(engine_module, 'get_event_bus', return_value=Bus()):
            _, found, _ = asyncio.run(engine._retrieve_evidence('e', 'tenant', '4', ['allowed'], [f'requirement {i}' for i in range(25)]))
        self.assertEqual(len(engine.ingestion.queries), 25)
        self.assertEqual(len(found), 25)
        self.assertEqual({x.document_id for x in found}, {'allowed'})
        self.assertTrue(any('requirement 24' in x.excerpt for x in found))

    def test_search_failure_is_distinct_from_missing_evidence(self):
        class Search:
            async def search(self, *args, **kwargs): raise RuntimeError('offline')
        engine = object.__new__(EvaluationEngine)
        engine.ingestion = Search()
        with patch.object(engine_module, 'get_event_bus', return_value=Bus()):
            with self.assertRaises(engine_module.EvidenceRetrievalError):
                asyncio.run(engine._retrieve_evidence('e', 'tenant', '4', ['allowed'], ['test']))

    def test_fact_relevance_scores_remain_independent(self):
        good = Fact(field='test', value='yes', document_id='allowed', source='Spec', evidence='test yes', grounded=True)
        weak = Fact(field='unrelated', value='yes', document_id='allowed', source='Spec', evidence='unrelated yes', grounded=True)
        bad = Fact(field='other', value='no', document_id='restricted', evidence='secret', grounded=True)
        ungrounded = Fact(field='unguarded', value='no', document_id='allowed', evidence='unverified', grounded=False)
        class Search:
            async def search(self, *args, **kwargs): return []
        engine = object.__new__(EvaluationEngine)
        engine.ingestion = Search()
        ranked = [{'fact': good, 'matchScore': 0.93}, {'fact': weak, 'matchScore': 0.06}, {'fact': bad, 'matchScore': 0.99}, {'fact': ungrounded, 'matchScore': 0.7}]
        with patch.object(engine_module, 'get_event_bus', return_value=Bus()), patch.object(engine_module, 'rank_product_facts', return_value=ranked):
            _, found, payload = asyncio.run(engine._retrieve_evidence('e', 'tenant', '4', ['allowed'], ['q'], ProductSnapshot()))
        self.assertEqual([item.similarity_score for item in found], [0.93, 0.06])
        self.assertEqual([item['similarity_score'] for item in payload], [0.93, 0.06])

    def test_search_failure_marks_every_requirement_inconclusive(self):
        engine = object.__new__(EvaluationEngine)
        requirements = [{'id': f'r{i}', 'text': f'The manufacturer shall keep record {i}.', 'type': 'mandatory'} for i in range(3)]
        record = ClauseRecord(ref='4.1', title='Records', text='Records', section_type='normative', requirements=requirements)
        async def fail(*args, **kwargs): raise engine_module.EvidenceRetrievalError('search unavailable')
        engine._retrieve_evidence = fail
        cmp = lambda req, snapshot: {'decision': None, 'coverage': 'NONE', 'elements': [], 'applicability': {'scope': 'IN_SCOPE'}}
        with patch.object(engine_module, 'get_event_bus', return_value=Bus()), patch.object(engine_module, 'compare_requirement', side_effect=cmp):
            rows = asyncio.run(engine._eval_clause_from_record('e', 'tenant', record, ['allowed'], 'std', product_snapshot=object()))
        self.assertEqual([r.status for r in rows], ['INCONCLUSIVE'] * 3)
        self.assertEqual([r.requirement_id for r in rows], ['r0', 'r1', 'r2'])
        self.assertTrue(all(r.decision_source == 'EVIDENCE_SEARCH_ERROR' for r in rows))


if __name__ == '__main__': unittest.main()
