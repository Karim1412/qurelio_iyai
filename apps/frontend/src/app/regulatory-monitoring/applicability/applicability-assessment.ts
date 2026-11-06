export type ApplicabilityDecision = 'APPLICABLE' | 'CONDITIONAL' | 'NOT_APPLICABLE' | 'NEEDS_REVIEW';

export interface SavedApplicabilityAssessment {
  id: string;
  companyId: string;
  productId: string;
  regulationId?: string | null;
  reference: string;
  title?: string | null;
  decision: ApplicabilityDecision;
  rationale: string;
  conditions?: string | null;
  evidenceReferences: string[];
  sourceUrl?: string | null;
  sourceVersion?: string | null;
  monitoredSourceId?: string | null;
  sourceSnapshotHashAtReview?: string | null;
  sourceFreshness?: 'CURRENT' | 'SOURCE_CHANGED' | 'CHECK_UNAVAILABLE' | 'CHECK_OVERDUE' | 'UNVERIFIED' | 'NOT_LINKED' | 'MONITORING_DISABLED' | string;
  reviewerId: string;
  reviewerRole: string;
  reviewedAt: string;
}

export interface CreateApplicabilityAssessment {
  regulationId?: string;
  reference: string;
  title?: string;
  decision: ApplicabilityDecision;
  rationale: string;
  conditions?: string;
  evidenceReferences: string[];
  sourceUrl?: string;
  sourceVersion?: string;
  monitoredSourceId?: string;
}

export const DECISION_LABEL: Record<ApplicabilityDecision, string> = {
  APPLICABLE: 'Applicable',
  CONDITIONAL: 'Conditionally applicable',
  NOT_APPLICABLE: 'Not applicable',
  NEEDS_REVIEW: 'Needs further review',
};

/** Candidate-discovery response: advisory retrieval hints, not legal conclusions. */
export interface ApplicabilityMatchSignal {
  field: string;
  value: string;
  source: 'PRODUCT_PROFILE' | 'GROUNDED_DOCUMENT_EXTRACTION';
  sourceDocumentName?: string;
  sourceAuthority?: string;
}

export interface ApplicabilityCandidate {
  regulationId: string;
  reference: string;
  shortCode?: string;
  title?: string;
  type?: string;
  authority?: string;
  jurisdiction?: string;
  countryRegion?: string;
  category?: string;
  legalStatus?: string;
  currentVersion?: string;
  sourceUrl?: string;
  sourceUrlStatus: 'URL_RECORDED_NOT_VERIFIED' | 'NO_SOURCE_URL_RECORDED';
  matchType: 'RECORDED_REFERENCE' | 'TOPIC_MATCH' | 'INDUSTRY_MARKET_SCREEN';
  matchLabel: string;
  reasons: string[];
  matchedSignals: ApplicabilityMatchSignal[];
  matchedRecordedValues?: string[];
  scopeWarning: string;
  requiresHumanReview: true;
}

export interface ApplicabilityCandidateResponse {
  productId: string;
  evaluatedAt: string;
  catalog: {
    version: string;
    asOfDate: string | null;
    ageDays: number | null;
    status: 'AS_OF_DATE_MISSING' | 'STALE_REVALIDATION_REQUIRED' | 'AS_OF_DATE_IN_FUTURE' | 'SNAPSHOT_DATED' | string;
    referenceCount: number;
    targetIndustries: string[];
    industriesActuallyCovered: string[];
    coverageNote: string;
    legalBoundaryNote?: string | null;
  };
  profile: {
    detectedIndustries: string[];
    industryReasons: string[];
    targetMarkets: string[];
    mappedMarketCodes: string[];
    missingProfileFields: string[];
    warnings: string[];
    unresolvedConflictFields: string[];
  };
  summary: {
    recordedReferenceMatches: number;
    topicMatches: number;
    broaderScreeningCandidates: number;
    unresolvedRecordedReferences: number;
    status: 'INCOMPLETE_PRODUCT_CONTEXT' | 'CANDIDATES_FOUND' | 'NO_SCOPED_CANDIDATES_IN_CATALOG' | string;
    note: string;
  };
  recordedReferenceMatches: ApplicabilityCandidate[];
  topicMatches: ApplicabilityCandidate[];
  broaderScreeningCandidates: ApplicabilityCandidate[];
  unrecognizedRecordedReferences: Array<{
    value: string;
    field: 'applicableRegulations' | 'requiredCertifications';
    note: string;
  }>;
}
