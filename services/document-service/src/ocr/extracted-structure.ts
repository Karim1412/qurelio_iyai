/** Structured extraction result persisted as JSON (document-service OCR pipeline). */
/** One atomic, individually-checkable requirement decomposed from a standard's clause — see DocumentSection.requirements. */
export interface RequirementItem {
  /** Verbatim transcription from the source clause — never a paraphrase; this is what a compliance engine checks products against. */
  text: string;
  type: 'mandatory' | 'recommended' | 'informative' | 'conditional';
  modalVerb?: string | null;
  /** Non-null only when this requirement's applicability is conditional (e.g. "only for Class III devices"). */
  appliesIf?: string | null;
  /** Other clause numbers this requirement explicitly cites. */
  crossReferences?: string[];
}

export interface DocumentSection {
  /** Clause / subclause reference when known (e.g. "4.1", "A.2"). */
  clauseNumber?: string | null;
  heading: string;
  content: string;
  bullets?: string[];
  /** Brief summary/abstract of what this clause mandates (for standards: key requirement, for products: section purpose). */
  summary?: string | null;
  /** Important compliance notes, critical requirements, or regulatory implications. */
  importantNotes?: string[] | null;
  /** ISO_NORM only: true if this clause contains at least one binding SHALL/MUST obligation. */
  mandatory?: boolean;
  /** ISO_NORM only: short functional domain label (e.g. "Risk Management", "Documentation & Records"). */
  category?: string | null;
  /** ISO_NORM only: this clause's binding content decomposed into atomic, checkable requirements. Empty array for purely informative clauses. */
  requirements?: RequirementItem[];
  /** Character offsets in the canonical extracted source text. */
  sourceStart?: number;
  sourceEnd?: number;
  /** Heuristic: likely contains normative language and was eligible for semantic analysis. */
  normativeCandidate?: boolean;
}

/** Product document profile: maps to Overview / Specifications tabs (Qleer-style UI) */
export interface ProductBasicInformation {
  reference?: string | null;
  modelNumber?: string | null;
  serialNumber?: string | null;
  revision?: string | null;
  category?: string | null;
  subCategory?: string | null;
  tradeMark?: string | null;
  manufacturer?: string | null;
  countryOfOrigin?: string | null;
}

export interface ProductUsageInformation {
  environment?: string | null;
  users?: string | null;
  tempHumidity?: string | null;
  ipRating?: string | null;
}

/** Single row for quality traceability (specs, materials, regulatory, one table in UI). */
export interface QualityTraceabilityRow {
  category?: string | null;
  parameter?: string | null;
  value?: string | null;
  unit?: string | null;
  notes?: string | null;
}

/** One product certification read off a certificate / declaration of conformity. */
export interface ProductOnboardingCertification {
  standardName?: string | null;
  certifyingBody?: string | null;
  certificateNumber?: string | null;
  marketScope?: string | null;
  /** ISO date (YYYY-MM-DD) when the source states one. */
  issueDate?: string | null;
  expiryDate?: string | null;
}

/**
 * Wizard-shaped draft of the product profile: one key per field of the
 * "Add product" onboarding steps, so an uploaded document can pre-fill the form
 * for the user to verify. Every field is a suggestion, never authoritative.
 */
export interface ProductOnboardingDraft {
  // Identity
  productName?: string | null;
  sku?: string | null;
  brandName?: string | null;
  productFamily?: string | null;
  category?: string | null;
  /** 'finished' | 'semi_finished' | 'component' | 'raw_material' | 'service' */
  productType?: string | null;
  description?: string | null;
  // Technical
  intendedUse?: string | null;
  targetUsers?: string[] | null;
  keyMaterials?: string[] | null;
  /** 'Solid' | 'Liquid' | 'Gas' | 'Powder' | 'Paste' | 'Other' */
  physicalForm?: string | null;
  hsTariffCode?: string | null;
  countryOfOrigin?: string | null;
  // Markets
  targetMarkets?: string[] | null;
  requiredCertifications?: string[] | null;
  applicableRegulations?: string[] | null;
  industryLabels?: string[] | null;
  // Manufacturing
  productionSites?: string[] | null;
  productionProcesses?: string[] | null;
  criticalSuppliers?: string[] | null;
  // Certifications
  productCertifications?: ProductOnboardingCertification[] | null;
}

/**
 * Pharmaceutical-specific facts. Only populated when the document shows real
 * signal of being a drug product (tablet, syrup, injectable, etc.) — never
 * populated for a non-drug product.
 */
export interface ProductPharmaceuticalDetails {
  productName?: string | null;
  activeIngredient?: string | null;
  strengthDosage?: string | null;
  pharmaceuticalForm?: string | null;
  volumeOrPackSize?: string | null;
  storageConditions?: string | null;
  expirationDate?: string | null;
  batchNumber?: string | null;
  registrationNumber?: string | null;
  certificateNumber?: string | null;
  routeOfAdministration?: string | null;
  shelfLifeMonths?: string | null;
  prescriptionStatus?: string | null;
  coaReference?: string | null;
  ndcOrGtinCode?: string | null;
}

export interface ProductMedicalDeviceDetails {
  deviceClass?: string | null;
  udiCode?: string | null;
  intendedPurpose?: string | null;
  sterility?: string | null;
  singleUseOrReusable?: string | null;
  implantable?: string | null;
  biocompatibilityStandard?: string | null;
  clinicalEvaluationReference?: string | null;
  deviceLifeSpan?: string | null;
  contraindications?: string | null;
  accessoriesIncluded?: string | null;
  softwareVersion?: string | null;
}

export interface ProductElectronicsDetails {
  voltageRating?: string | null;
  currentRating?: string | null;
  powerConsumption?: string | null;
  frequencyRange?: string | null;
  protectionRating?: string | null;
  batteryType?: string | null;
  connectivityStandards?: string | null;
  firmwareVersion?: string | null;
  emcCompliance?: string | null;
  energyEfficiencyClass?: string | null;
  operatingTemperatureRange?: string | null;
  warrantyPeriod?: string | null;
}

export interface ProductFoodBeverageDetails {
  ingredientsList?: string | null;
  allergens?: string | null;
  nutritionalInformation?: string | null;
  netWeight?: string | null;
  servingSize?: string | null;
  bestBeforeDate?: string | null;
  foodSafetyCertification?: string | null;
  countryOfProcessing?: string | null;
  preservatives?: string | null;
  organicCertification?: string | null;
  halalKosherCertification?: string | null;
}

export interface ProductCosmeticsDetails {
  inciIngredientsList?: string | null;
  netContent?: string | null;
  batchCode?: string | null;
  periodAfterOpening?: string | null;
  skinType?: string | null;
  dermatologicallyTested?: string | null;
  animalTestingStatus?: string | null;
  spfRating?: string | null;
  expirationDate?: string | null;
  manufacturingDate?: string | null;
  cosmeticRegulationCompliance?: string | null;
}

export interface ProductChemicalDetails {
  casNumber?: string | null;
  hazardClassificationGHS?: string | null;
  safetyDataSheetReference?: string | null;
  flashPoint?: string | null;
  phValue?: string | null;
  physicalState?: string | null;
  hazardPictograms?: string | null;
  handlingPrecautions?: string | null;
  storageTemperatureRange?: string | null;
  unNumber?: string | null;
  packagingGroup?: string | null;
}

export interface ProductMachineryDetails {
  powerRating?: string | null;
  operatingPressure?: string | null;
  noiseLevel?: string | null;
  weightCapacity?: string | null;
  safetyGuardsPresent?: string | null;
  machineryDirectiveCompliance?: string | null;
  maintenanceSchedule?: string | null;
  operatingSpeed?: string | null;
  requiredPPE?: string | null;
  installationRequirements?: string | null;
}

export interface ProductTextileDetails {
  fiberComposition?: string | null;
  fabricConstruction?: string | null;
  gsmWeight?: string | null;
  colorfastnessRating?: string | null;
  flammabilityRating?: string | null;
  careInstructions?: string | null;
  countryOfManufacture?: string | null;
  oekoTexOrOtherCertification?: string | null;
  shrinkageRate?: string | null;
  threadCount?: string | null;
}

export interface ProductConstructionMaterialsDetails {
  materialGrade?: string | null;
  loadBearingCapacity?: string | null;
  fireResistanceRating?: string | null;
  compressiveStrength?: string | null;
  thermalConductivity?: string | null;
  ceMarkingDoP?: string | null;
  standardCompliance?: string | null;
  dimensionsTolerance?: string | null;
  durabilityWarranty?: string | null;
  environmentalRating?: string | null;
}

export interface ProductProfile {
  basicInformation?: ProductBasicInformation | null;
  usage?: ProductUsageInformation | null;
  /** Certification marks / standards / approval numbers printed on the document. */
  certifications?: {
    marks?: string[] | null;
    standards?: string[] | null;
    approvalNumbers?: string[] | null;
  } | null;
  /** Pre-fill payload for the product onboarding wizard (see ProductOnboardingDraft). */
  onboarding?: ProductOnboardingDraft | null;
  generalDescription?: string | null;
  applications?: string | null;
  safetyWarnings?: string[] | null;
  /** Quality-focused narrative: requirements, critical characteristics, inspection relevance */
  qualitySpecificationNarrative?: string | null;
  /** Regulatory / safety notes (CE, warnings, standards cited on label) */
  regulatoryNotes?: string | null;
  /** Free text legacy field; prefer qualitySpecificationNarrative + traceabilityRows for new extractions */
  technicalCharacteristics?: string | null;
  /** Legacy bullets; avoid duplicating traceabilityRows */
  technicalBullets?: string[] | null;
  dimensions?: string | null;
  weight?: string | null;
  /** Unified table: specifications, materials/BOM, dimensions, category distinguishes rows */
  traceabilityRows?: QualityTraceabilityRow[] | null;
  /** Only present for pharmaceutical/drug products. */
  pharmaceuticalDetails?: ProductPharmaceuticalDetails | null;
  /** Only present for medical devices. */
  medicalDeviceDetails?: ProductMedicalDeviceDetails | null;
  electronicsDetails?: ProductElectronicsDetails | null;
  foodBeverageDetails?: ProductFoodBeverageDetails | null;
  cosmeticsDetails?: ProductCosmeticsDetails | null;
  chemicalDetails?: ProductChemicalDetails | null;
  machineryDetails?: ProductMachineryDetails | null;
  textileDetails?: ProductTextileDetails | null;
  constructionMaterialsDetails?: ProductConstructionMaterialsDetails | null;
}

/** A fact the AI freely captured that doesn't fit any predefined field — genuine creative freedom, not a fixed schema. */
export interface CustomField {
  label: string;
  value: string;
  category?: string | null;
  importance?: 'high' | 'medium' | 'low' | null;
}


/** Compact source-grounded fact discovered outside the fixed ProductProfile schema. */
export interface ProductFactSource {
  documentId: string;
  documentName: string;
  sourceHint?: string | null;
  evidence?: string | null;
  grounded?: boolean | null;
  detectedAt: string;
}

/** One document's raw product-fact extraction before product-level source merging. */
export interface ExtractedProductFact {
  category: string;
  label: string;
  value: string;
  unit?: string | null;
  importance?: 'critical' | 'high' | 'medium' | 'low' | null;
  grounded?: boolean | null;
  conflict?: boolean;
  sourceHint?: string | null;
  evidence?: string | null;
}

/** Product-level stored fact after corroborating sources are attached. */
export interface ProductFact {
  category: string;
  label: string;
  value: string;
  unit?: string | null;
  importance?: 'critical' | 'high' | 'medium' | 'low' | null;
  grounded?: boolean | null;
  conflict?: boolean;
  sources: ProductFactSource[];
}

export interface PredefinedFieldCheck {
  field: string;
  label: string;
  detected: boolean;
  /** The actual extracted value shown to the user, when detected — never guessed, straight from productProfile. */
  value?: string | null;
  /**
   * true = value confirmed present (fuzzy match) in the source document text.
   * false = detected but could NOT be confirmed in the text — flagged for
   * human verification before this value is trusted downstream (e.g. by the
   * compliance engine). undefined/null = grounding not evaluated (e.g. no
   * raw text available for this pass).
   */
  grounded?: boolean | null;
  confidence?: number | null;
  sourceAuthority?: 'certificate' | 'test_report' | 'datasheet' | 'declaration' | 'manual' | 'label' | 'marketing' | 'other';
}

export interface CategoryChecklistResult {
  label: string;
  checklist: PredefinedFieldCheck[];
  missingFields: string[];
  /** Labels of detected fields whose value could not be confirmed in the source text — needs human verification. */
  ungroundedFields?: string[];
  detectedFieldCount: number;
  totalPredefinedFields: number;
  overallConfidence: number;
}

/**
 * Deterministic extraction-quality summary. Confidence is NOT the model's
 * self-rating — it is detectedFieldCount / totalPredefinedFields, computed
 * in code, so it is reproducible and auditable. "detectedCategories" can
 * contain more than one entry for a combination product.
 */
export interface ExtractionQuality {
  detectedCategories: string[];
  predefinedFieldsChecklist: PredefinedFieldCheck[];
  missingFields: string[];
  /** Labels of detected general fields whose value could not be confirmed in the source text. */
  ungroundedFields?: string[];
  detectedFieldCount: number;
  totalPredefinedFields: number;
  overallConfidence: number;
  categoryChecklists: Record<string, CategoryChecklistResult>;
  additionalFindings: string[];
  fieldSources: Record<string, string>;
  /** Dotted-path fields (general + category) whose value passed the grounding check for THIS document. */
  groundedFields?: string[];
}

export interface StandardExtractionQuality {
  /** false when one or more semantic requirement batches are still pending/retryable. */
  processingComplete?: boolean;
  normativeSectionsDetected?: number;
  normativeSectionsAnalyzed?: number;
  pendingSemanticSections?: string[];
  semanticBatchFailures?: Array<{ clause: string; error: string }>;
  totalClauses: number;
  clausesWithMandatoryClassification: number;
  clausesWithCategory: number;
  metadataFieldsDetected: number;
  metadataFieldsTotal: number;
  metadataCompleteness: number;
  classificationCompleteness: number;
  overallConfidence: number;
}

/** One flattened, traceable requirement — this is the shape a compliance engine reads, never DocumentSection.requirements directly. */
export interface FlatRequirement {
  id: string;
  clauseRef: string;
  clauseTitle: string;
  isAnnex: boolean;
  text: string;
  type: 'mandatory' | 'recommended' | 'informative' | 'conditional';
  modalVerb?: string | null;
  appliesIf?: string | null;
  crossReferences: string[];
  /**
   * true = confirmed present (verbatim or via legitimate lettered-list
   * splitting) in its clause's own text; false = could not be confirmed —
   * flag for human verification before a compliance engine relies on it;
   * null = not evaluated (no raw text available for this pass).
   */
  grounded: boolean | null;
}

/**
 * Bounded, flat, compliance-engine-ready requirements view for one standard
 * document — computed deterministically in code from DocumentSection.requirements
 * (never re-derived by an LLM at read time). Includes two accuracy
 * cross-checks that run alongside the extraction itself (see rag-service's
 * compute_standard_requirements_summary): possiblyIncompleteClauses flags a
 * clause where a deterministic obligation-sentence count exceeds what was
 * extracted (likely under-extraction); ungroundedRequirementCount is how many
 * requirements could not be confirmed against their own clause's text
 * (possible hallucination) — both are for human review, never auto-corrected.
 */
export interface RequirementsSummary {
  schemaVersion: 1;
  totalRequirements: number;
  mandatoryCount: number;
  recommendedCount: number;
  informativeCount: number;
  conditionalCount: number;
  clausesWithRequirements: number;
  /** Clauses the model flagged mandatory=true but extracted zero requirements for — a real gap, needs review. */
  clausesFlaggedMandatoryButEmpty: string[];
  /** Clauses where a deterministic shall/must/should sentence count exceeds the extracted requirement count. */
  possiblyIncompleteClauses: string[];
  ungroundedRequirementCount: number;
  requirements: FlatRequirement[];
}

export interface ExtractedStructure {
  title?: string | null;
  documentTypeGuess?: string | null;
  classification?: string | null;
  sections?: DocumentSection[];
  keyPoints?: string[];
  /** PDF/Office: one-paragraph summary of what this file establishes (purpose + key facts). */
  fileSummary?: string | null;
  /** Images: what is visible (objects, labels, warnings, packaging text), "visual understanding". */
  visualDescription?: string | null;
  /** Populated for PRODUCT_DOC / EVIDENCE: UI Overview + Specifications */
  productProfile?: ProductProfile | null;
  extractionQuality?: ExtractionQuality | null;
  standardExtractionQuality?: StandardExtractionQuality | null;
  /** ISO_NORM only: the bounded, flattened requirements list — see RequirementsSummary. */
  requirementsSummary?: RequirementsSummary | null;
  /** AI-invented fields beyond any predefined schema — see CustomField. */
  customFields?: CustomField[];
  /** Source-grounded compact facts that do not fit the fixed productProfile schema. */
  productFacts?: ExtractedProductFact[];
  /** Normative standard metadata (ISO, EN, IEC, etc.) from cover / title block (Standards Library) */
  standardMetadata?: {
    reference?: string | null;
    title?: string | null;
    categories?: string[] | null;
    effectiveDate?: string | null;
  } | null;
}

/** Product-level (cross-document) traceability types — stored on Product after merging potentially tens of documents. */
export interface ProductFieldProvenanceEntry {
  value: string;
  documentId: string;
  documentName: string;
  updatedAt: string;
  locationHint?: string;
  evidence?: string;
  resolvedManuallyBy?: string;
  /** true = the source document confirmed this value against its own extracted text; false = could not confirm (flag for human review); undefined = not evaluated. Cleared once a human manually resolves the field. */
  grounded?: boolean | null;
  confidence?: number | null;
  sourceAuthority?: 'certificate' | 'test_report' | 'datasheet' | 'declaration' | 'manual' | 'label' | 'marketing' | 'other';
}

export interface ProductFieldConflictCandidate {
  value: string;
  documentId: string;
  documentName: string;
  detectedAt: string;
  grounded?: boolean | null;
  confidence?: number | null;
  sourceAuthority?: ProductFieldProvenanceEntry['sourceAuthority'];
  evidence?: string;
}

export type ProductFieldProvenanceMap = Record<string, ProductFieldProvenanceEntry>;
export type ProductFieldConflictMap = Record<string, ProductFieldConflictCandidate[]>;

export interface ProductExtractionQuality extends Omit<ExtractionQuality, 'additionalFindings' | 'fieldSources'> {
  documentsContributing: number;
}

export interface RequirementCoverageItem {
  requirement: string;
  covered: boolean;
  matchedAgainst?: string;
}

export interface RequirementCoverage {
  required: RequirementCoverageItem[];
  coveredCount: number;
  totalRequired: number;
}

/**
 * ---------------------------------------------------------------------------
 * "AI Extraction" — the bounded, flat, compliance-engine-ready view.
 * ---------------------------------------------------------------------------
 * Everything above this point (mergedProfile / extractionQuality /
 * fieldProvenance / fieldConflicts / customFields) is the STORAGE shape —
 * optimized for incremental, per-document, conflict-safe merging.
 *
 * AiExtractionView is a DERIVED, READ-ONLY projection of that storage,
 * assembled on read by `buildAiExtractionView()` in document.service.ts. It
 * is never itself persisted — so adding a field to it never means a
 * migration, and the underlying storage never has to duplicate data to stay
 * "simple". This is the one shape downstream consumers (the product results
 * UI, and later the compliance engine) should read instead of reaching into
 * mergedProfile/extractionQuality/fieldConflicts directly.
 */
export interface AiExtractionField {
  key: string;
  label: string;
  /** Value currently shown as authoritative (null when missing). */
  value: string | null;
  status: 'found' | 'missing' | 'conflict' | 'needs_verification';
  /** true/false/null — see ProductFieldProvenanceEntry.grounded. Only meaningful when status is 'found'. */
  grounded: boolean | null;
  sourceDocumentId: string | null;
  sourceDocumentName: string | null;
  /** Only present when status === 'conflict': the other candidate values a human must pick between. */
  alternates?: { value: string; documentId: string; documentName: string }[];
}

export interface AiExtractionCategoryBlock {
  key: string;
  label: string;
  fields: AiExtractionField[];
  completeness: number; // 0-100
}

export interface AiExtractionOtherField {
  label: string;
  value: string;
  category?: string | null;
}

export interface AiExtractionFactSource {
  documentId: string;
  documentName: string;
  sourceHint?: string | null;
  evidence?: string | null;
  grounded?: boolean | null;
  detectedAt: string;
}

export interface AiExtractionFact {
  category: string;
  label: string;
  value: string;
  unit?: string | null;
  importance?: 'critical' | 'high' | 'medium' | 'low' | null;
  grounded?: boolean | null;
  conflict?: boolean;
  sources: AiExtractionFactSource[];
}

export interface AiExtractionView {
  schemaVersion: 2;
  detectedCategories: string[];
  universalFields: AiExtractionField[];
  categoryFields: AiExtractionCategoryBlock[];
  otherFields: AiExtractionOtherField[];
  missingRequiredFields: string[];
  conflictedFields: string[];
  needsVerificationFields: string[];
  completeness: number; // 0-100, universal-fields only, deterministic
  documentsContributing: number;
  lastExtractedAt: string | null;
  productFacts: AiExtractionFact[];
}
