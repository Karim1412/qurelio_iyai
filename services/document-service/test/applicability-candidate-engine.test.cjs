const test = require('node:test');
const assert = require('node:assert/strict');
const { matchProductToRegulatoryCandidates } = require('../dist/regulatory-monitoring/applicability-candidate-engine');

const euTopicalPharma = {
  id: 'product-eu-topical',
  industryLabels: ['Pharmaceuticals'],
  categoryTags: ['Pharmaceuticals'],
  targetMarkets: ['European Union'],
  intendedUse: 'Treatment for a localized skin condition',
  physicalForm: 'Cream',
  productType: 'finished',
  productionProcesses: ['Mixing and filling'],
  applicableRegulations: [],
  requiredCertifications: [],
};

test('finds a topical reference from product signals and requires industry + market fit', () => {
  const result = matchProductToRegulatoryCandidates(euTopicalPharma, new Date('2026-10-20T00:00:00.000Z'));
  const match = result.topicMatches.find((candidate) => candidate.regulationId === 'GUID-EU-TOPICAL');
  assert.ok(match, 'topical pharmaceutical product should surface the topical guideline as a review candidate');
  assert.ok(match.matchedSignals.some((signal) => signal.field === 'physicalForm' && signal.value === 'Cream'));
  assert.equal(match.requiresHumanReview, true);
  assert.match(match.scopeWarning, /does not establish that the instrument legally applies/i);
  assert.ok(!result.topicMatches.some((candidate) => candidate.regulationId === 'GUID-TN-GMP'));
});

test('does not treat an unrelated non-pharmaceutical product as in-scope', () => {
  const result = matchProductToRegulatoryCandidates({
    id: 'speaker-eu', industryLabels: ['Consumer Electronics'], categoryTags: ['Electronics'],
    targetMarkets: ['European Union'], intendedUse: 'Bluetooth audio playback', physicalForm: 'Solid',
  }, new Date('2026-10-20T00:00:00.000Z'));
  assert.equal(result.topicMatches.length, 0);
  assert.equal(result.broaderScreeningCandidates.length, 0);
  assert.equal(result.summary.status, 'INCOMPLETE_PRODUCT_CONTEXT');
  assert.ok(result.profile.missingProfileFields.includes('Industry / product category'));
});

test('surfaces Tunisia oral-liquid DEG/EG candidate with matched profile signals', () => {
  const result = matchProductToRegulatoryCandidates({
    id: 'tn-liquid', industryLabels: ['Pharmaceuticals'], categoryTags: ['Pharmaceuticals'],
    targetMarkets: ['Tunisia'], intendedUse: 'Oral liquid medicine containing glycerol and propylene glycol',
    physicalForm: 'Liquid', productionProcesses: ['Syrup manufacture'],
  }, new Date('2026-10-20T00:00:00.000Z'));
  assert.ok(result.topicMatches.some((candidate) => candidate.regulationId === 'ORD-TN-DPM-2025-09'));
  assert.ok(result.topicMatches.some((candidate) => candidate.regulationId === 'GUID-WHO-DEG-EG'));
});

test('does not guess jurisdiction candidates when target markets are absent', () => {
  const result = matchProductToRegulatoryCandidates({
    id: 'no-market', industryLabels: ['Pharmaceuticals'], categoryTags: ['Pharmaceuticals'],
    intendedUse: 'Medicine', physicalForm: 'Tablet',
  }, new Date('2026-10-20T00:00:00.000Z'));
  assert.equal(result.topicMatches.length, 0);
  assert.equal(result.broaderScreeningCandidates.length, 0);
  assert.ok(result.profile.missingProfileFields.includes('Target markets'));
});

test('recognizes a catalog reference already recorded on the product, but still flags unknown references', () => {
  const result = matchProductToRegulatoryCandidates({
    id: 'recorded', industryLabels: ['Pharmaceuticals'], targetMarkets: ['EU'], intendedUse: 'Medicine',
    applicableRegulations: ['EudraLex Vol. 4, Annex 1', 'Unknown country-specific rule 123'],
  }, new Date('2026-10-20T00:00:00.000Z'));
  assert.ok(result.recordedReferenceMatches.some((candidate) => candidate.regulationId === 'GUID-EU-GMP-ANX1'));
  assert.ok(result.unrecognizedRecordedReferences.some((item) => item.value === 'Unknown country-specific rule 123'));
});

test('does not use conflicted form values to trigger topical matches', () => {
  const result = matchProductToRegulatoryCandidates({
    id: 'conflict', industryLabels: ['Pharmaceuticals'], categoryTags: ['Pharmaceuticals'],
    targetMarkets: ['EU'], intendedUse: 'Medicine', physicalForm: 'Cream',
    fieldConflicts: { physicalForm: [{ value: 'Tablet' }, { value: 'Cream' }] },
  }, new Date('2026-10-20T00:00:00.000Z'));
  assert.ok(!result.topicMatches.some((candidate) => candidate.regulationId === 'GUID-EU-TOPICAL'));
  assert.ok(result.profile.warnings.some((warning) => warning.includes('Unresolved AI-extraction conflicts')));
});

test('exposes catalog age and current coverage limits instead of claiming comprehensive coverage', () => {
  const result = matchProductToRegulatoryCandidates(euTopicalPharma, new Date('2026-10-20T00:00:00.000Z'));
  assert.equal(result.catalog.status, 'STALE_REVALIDATION_REQUIRED');
  assert.deepEqual(result.catalog.industriesActuallyCovered, ['Pharmaceuticals']);
  assert.ok(result.catalog.coverageNote.includes('17 records'));
});


test('does not mis-map Russia to the US through the short alias `us`', () => {
  const result = matchProductToRegulatoryCandidates({
    id: 'russia-market', industryLabels: ['Pharmaceuticals'], categoryTags: ['Pharmaceuticals'],
    targetMarkets: ['Russia'], intendedUse: 'Medicine', physicalForm: 'Tablet',
  }, new Date('2026-10-20T00:00:00.000Z'));
  assert.ok(!result.profile.mappedMarketCodes.includes('US'));
  assert.equal(result.topicMatches.length, 0);
  assert.equal(result.broaderScreeningCandidates.length, 0);
});

test('uses grounded provenance for flattened array values when available', () => {
  const result = matchProductToRegulatoryCandidates({
    id: 'grounded-array', categoryTags: ['Pharmaceuticals'], targetMarkets: ['EU'],
    intendedUse: 'Medicine',
    mergedProfile: { applications: ['topical cream'] },
    fieldProvenance: { applications: { grounded: true, documentName: 'Product specification.pdf' } },
  }, new Date('2026-10-20T00:00:00.000Z'));
  const topical = result.topicMatches.find((candidate) => candidate.regulationId === 'GUID-EU-TOPICAL');
  assert.ok(topical);
  assert.ok(topical.matchedSignals.some((signal) => signal.field === 'applications' && signal.source === 'GROUNDED_DOCUMENT_EXTRACTION'));
  assert.ok(topical.matchedSignals.some((signal) => signal.sourceDocumentName === 'Product specification.pdf'));
});
