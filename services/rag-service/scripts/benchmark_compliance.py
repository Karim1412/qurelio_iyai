#!/usr/bin/env python3
"""Compare an evaluation JSON response with human-reviewed requirement labels.

Usage: python scripts/benchmark_compliance.py GOLD.json EVALUATION.json
A gold file is an array or {"results": [...]} with requirement_id and status per
row; optional evidence_document_ids records acceptable source documents.
Evaluation input is the GET /api/evaluations/:id JSON response or its results array.
"""
import json
import sys
from pathlib import Path


ALIASES = {
    'SATISFIED': 'PASS', 'CONFORMANT': 'PASS',
    'NOT_SATISFIED': 'FAIL', 'MAJOR_NC': 'FAIL', 'MINOR_NC': 'FAIL', 'CRITICAL_NC': 'FAIL',
    'PARTIALLY_SATISFIED': 'MISSING_INFO', 'NA': 'N/A', 'NOT_APPLICABLE': 'N/A',
    'ERROR': 'INCONCLUSIVE',
}
VALID = {'PASS', 'FAIL', 'N/A', 'MISSING_INFO', 'INCONCLUSIVE'}


def rows(value):
    result = value.get('results') if isinstance(value, dict) else value
    if not isinstance(result, list):
        raise ValueError('Expected a JSON array or an object with a results array')
    return result


def identifier(row):
    return str(row.get('requirement_id') or row.get('requirementId') or '').strip()


def status(row):
    override = row.get('override') if isinstance(row.get('override'), dict) else {}
    value = str(override.get('verdict') or row.get('status') or row.get('verdict') or '').upper().strip()
    return ALIASES.get(value, value)


def index(value, label):
    out = {}
    for row in rows(value):
        if not isinstance(row, dict) or not identifier(row):
            raise ValueError(f'{label} has a row without a requirement ID')
        key = identifier(row)
        if key in out:
            raise ValueError(f'{label} has a duplicate requirement ID: {key}')
        if status(row) not in VALID:
            raise ValueError(f'{label} has an invalid status for {key}')
        out[key] = row
    return out


def citations(row):
    sources = row.get('supporting_evidence') or row.get('supportingEvidence') or []
    return {str(item.get('document_id') or item.get('documentId') or '') for item in sources
            if isinstance(item, dict) and (item.get('document_id') or item.get('documentId')) and str(item.get('excerpt') or '').strip()}


def ratio(n, d):
    return round(n / d, 4) if d else None


def compare(gold, actual):
    expected, predicted = index(gold, 'Gold file'), index(actual, 'Evaluation')
    if not expected:
        raise ValueError('Gold file must contain at least one requirement')
    common = expected.keys() & predicted.keys()
    matching = [key for key in common if status(expected[key]) == status(predicted[key])]
    gold_pass = [key for key in expected if status(expected[key]) == 'PASS']
    predicted_pass = [key for key in predicted if status(predicted[key]) == 'PASS']
    true_pass = [key for key in predicted_pass if key in expected and status(expected[key]) == 'PASS']
    false_pass = [key for key in predicted_pass if key not in expected or status(expected[key]) != 'PASS']
    false_na = [key for key in common if status(predicted[key]) == 'N/A' and status(expected[key]) != 'N/A']
    decided = [key for key in predicted if status(predicted[key]) in {'PASS', 'FAIL'}]
    source_checked = [key for key in decided if key in expected and isinstance(expected[key].get('evidence_document_ids'), list) and expected[key]['evidence_document_ids']]
    supported_sources = [key for key in source_checked if citations(predicted[key]) & set(expected[key]['evidence_document_ids'])]
    return {
        'gold_requirements': len(expected), 'matched_requirements': len(common),
        'exact_status_accuracy_including_missing': ratio(len(matching), len(expected)),
        'pass_precision': ratio(len(true_pass), len(predicted_pass)),
        'pass_recall_including_missing': ratio(len(true_pass), len(gold_pass)),
        'false_pass_count': len(false_pass), 'false_pass_ids': sorted(false_pass),
        'incorrect_not_applicable_count': len(false_na), 'incorrect_not_applicable_ids': sorted(false_na),
        'decisions_with_cited_excerpt_rate': ratio(sum(bool(citations(predicted[key])) for key in decided), len(decided)),
        'decisions_citing_expected_source_rate': ratio(len(supported_sources), len(source_checked)),
        'source_checked_decisions': len(source_checked),
        'missing_requirement_ids': sorted(expected.keys() - predicted.keys()),
        'unexpected_requirement_ids': sorted(predicted.keys() - expected.keys()),
    }


def main():
    if len(sys.argv) != 3:
        raise SystemExit(__doc__)
    try:
        gold = json.loads(Path(sys.argv[1]).read_text(encoding='utf-8'))
        actual = json.loads(Path(sys.argv[2]).read_text(encoding='utf-8'))
        print(json.dumps(compare(gold, actual), indent=2, ensure_ascii=False))
    except (OSError, ValueError, TypeError) as exc:
        raise SystemExit(f'Benchmark failed: {exc}') from exc


if __name__ == '__main__': main()
