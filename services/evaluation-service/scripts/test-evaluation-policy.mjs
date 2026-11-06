import assert from 'node:assert/strict';
import { scoreIsPublishable, findEvaluationResultIndex } from '../src/evaluation/evaluation-policy.ts';
import { selectEvaluationEvidence } from '../../document-service/src/documents/evaluation-evidence-selection.ts';

assert.equal(scoreIsPublishable(['PASS', 'FAIL', 'N/A']), true);
for (const statuses of [[], ['N/A'], ['PASS', 'MISSING_INFO'], ['PASS', 'INCONCLUSIVE'], ['PASS', 'UNKNOWN']]) {
  assert.equal(scoreIsPublishable(statuses), false);
}
const rows = [{ resultId: 'row-1', clauseReference: '4.1' }, { resultId: 'row-2', clauseReference: '4.1' }];
assert.equal(findEvaluationResultIndex(rows, 'row-2'), 1);
assert.equal(findEvaluationResultIndex(rows, '4.1'), -2);
assert.equal(findEvaluationResultIndex(rows, 'unknown'), -1);
assert.deepEqual(selectEvaluationEvidence(['a', 'b'], [], 'a'), ['a', 'b']);
assert.deepEqual(selectEvaluationEvidence(['a', 'b'], ['b', 'b'], 'a'), ['a', 'b']);
assert.throws(() => selectEvaluationEvidence(['a', 'b'], ['other-product'], 'a'));
assert.throws(() => selectEvaluationEvidence(['b'], [], 'a'));
console.log('Evaluation policy and evidence selection: 13 checks passed');
