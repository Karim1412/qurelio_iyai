/**
 * Product-level (cross-document) extraction completeness scoring, plus
 * requirement-coverage cross-checking and a deterministic readiness summary.
 *
 * Registry-driven, extensible category system — mirrors
 * services/rag-service/app/services/structure_openai.py's CATEGORY_REGISTRY.
 * Adding a new vertical is one registry entry; everything else (checklist
 * building, missing-field detection, confidence scoring, combination-product
 * support) is generic. If you add/change a category on the Python side,
 * mirror it here too.
 */

export interface PredefinedFieldCheck {
  field: string;
  label: string;
  detected: boolean;
  value?: string | null;
  grounded?: boolean | null;
}

export interface CategoryChecklistResult {
  label: string;
  checklist: PredefinedFieldCheck[];
  missingFields: string[];
  ungroundedFields?: string[];
  detectedFieldCount: number;
  totalPredefinedFields: number;
  overallConfidence: number;
}

export interface ProductExtractionQuality {
  detectedCategories: string[];
  predefinedFieldsChecklist: PredefinedFieldCheck[];
  missingFields: string[];
  ungroundedFields?: string[];
  detectedFieldCount: number;
  totalPredefinedFields: number;
  overallConfidence: number;
  categoryChecklists: Record<string, CategoryChecklistResult>;
  documentsContributing: number;
  productFactCount: number;
  groundedProductFactCount: number;
  productFactGroundingRate: number;
  ungroundedProductFactCount: number;
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

export interface CustomField {
  label: string;
  value: string;
  category?: string | null;
}

interface CategoryDef {
  label: string;
  detailsKey: string;
  fields: [string, string][];
  keywords: string[];
}

const PREDEFINED_PRODUCT_FIELDS: [string, string][] = [
  ['productName', 'Product Name'],
  ['basicInformation.reference', 'Reference / Part Number'],
  ['basicInformation.modelNumber', 'Model Number'],
  ['basicInformation.serialNumber', 'Serial Number'],
  ['basicInformation.revision', 'Revision'],
  ['basicInformation.category', 'Category'],
  ['basicInformation.manufacturer', 'Manufacturer'],
  ['basicInformation.countryOfOrigin', 'Country of Origin'],
  ['basicInformation.tradeMark', 'Trademark / Brand'],
  ['certifications', 'Certifications & Standards'],
  ['dimensions', 'Dimensions'],
  ['weight', 'Weight'],
  ['usage', 'Usage & Environment'],
  ['safetyWarnings', 'Safety Warnings'],
  ['expiryOrShelfLife', 'Expiry / Shelf Life'],
  ['qualitySpecificationNarrative', 'Quality Specification'],
  ['regulatoryNotes', 'Regulatory Notes'],
];

const PRODUCT_NAME_SOURCES = ['pharmaceuticalDetails.productName', 'basicInformation.tradeMark', 'basicInformation.reference'];
const EXPIRY_SOURCES = [
  'pharmaceuticalDetails.expirationDate',
  'cosmeticsDetails.expirationDate',
  'foodBeverageDetails.bestBeforeDate',
  'pharmaceuticalDetails.shelfLifeMonths',
  'cosmeticsDetails.periodAfterOpening',
];

const CATEGORY_REGISTRY: Record<string, CategoryDef> = {
  pharmaceutical: {
    label: 'Pharmaceutical',
    detailsKey: 'pharmaceuticalDetails',
    fields: [
      ['pharmaceuticalDetails.productName', 'Product Name'],
      ['pharmaceuticalDetails.activeIngredient', 'Active Ingredient'],
      ['pharmaceuticalDetails.strengthDosage', 'Strength / Dosage'],
      ['pharmaceuticalDetails.pharmaceuticalForm', 'Pharmaceutical Form'],
      ['pharmaceuticalDetails.volumeOrPackSize', 'Volume / Pack Size'],
      ['pharmaceuticalDetails.storageConditions', 'Storage Conditions'],
      ['pharmaceuticalDetails.expirationDate', 'Expiration Date'],
      ['pharmaceuticalDetails.batchNumber', 'Batch Number'],
      ['pharmaceuticalDetails.registrationNumber', 'Registration Number'],
      ['pharmaceuticalDetails.certificateNumber', 'Certificate Number'],
      ['pharmaceuticalDetails.routeOfAdministration', 'Route of Administration'],
      ['pharmaceuticalDetails.shelfLifeMonths', 'Shelf Life (months)'],
      ['pharmaceuticalDetails.prescriptionStatus', 'Prescription Status'],
      ['pharmaceuticalDetails.coaReference', 'Certificate of Analysis Reference'],
      ['pharmaceuticalDetails.ndcOrGtinCode', 'NDC / GTIN Code'],
    ],
    keywords: [
      'tablet', 'capsule', 'syrup', 'injectable', 'injection', 'ointment', 'cream',
      'oral suspension', 'vaccine', 'pharmaceutical', 'drug', 'dosage', 'mg/ml',
      'mg/5ml', 'active ingredient', 'ampoule', 'vial', 'solution for infusion',
    ],
  },
  medicalDevice: {
    label: 'Medical Device',
    detailsKey: 'medicalDeviceDetails',
    fields: [
      ['medicalDeviceDetails.deviceClass', 'Device Risk Class'],
      ['medicalDeviceDetails.udiCode', 'UDI Code'],
      ['medicalDeviceDetails.intendedPurpose', 'Intended Purpose'],
      ['medicalDeviceDetails.sterility', 'Sterility'],
      ['medicalDeviceDetails.singleUseOrReusable', 'Single-Use / Reusable'],
      ['medicalDeviceDetails.implantable', 'Implantable'],
      ['medicalDeviceDetails.biocompatibilityStandard', 'Biocompatibility Standard'],
      ['medicalDeviceDetails.clinicalEvaluationReference', 'Clinical Evaluation Reference'],
      ['medicalDeviceDetails.deviceLifeSpan', 'Device Life Span'],
      ['medicalDeviceDetails.contraindications', 'Contraindications'],
      ['medicalDeviceDetails.accessoriesIncluded', 'Accessories Included'],
      ['medicalDeviceDetails.softwareVersion', 'Software Version'],
    ],
    keywords: [
      'medical device', 'class i', 'class ii', 'class iii', 'class iia', 'class iib',
      'implant', 'catheter', 'surgical', 'diagnostic device', 'in vitro diagnostic',
      'ivd', 'sterile', 'single use', 'single-use', 'biocompatib', 'mdr', '510(k)',
      'prosthesis', 'stent', 'electrode', 'electrosurgical', 'endoscope', 'defibrillator',
    ],
  },
  electronics: {
    label: 'Electronics / Electrical Equipment',
    detailsKey: 'electronicsDetails',
    fields: [
      ['electronicsDetails.voltageRating', 'Voltage Rating'],
      ['electronicsDetails.currentRating', 'Current Rating'],
      ['electronicsDetails.powerConsumption', 'Power Consumption'],
      ['electronicsDetails.frequencyRange', 'Frequency Range'],
      ['electronicsDetails.protectionRating', 'Protection Rating (IP)'],
      ['electronicsDetails.batteryType', 'Battery Type'],
      ['electronicsDetails.connectivityStandards', 'Connectivity Standards'],
      ['electronicsDetails.firmwareVersion', 'Firmware Version'],
      ['electronicsDetails.emcCompliance', 'EMC Compliance'],
      ['electronicsDetails.energyEfficiencyClass', 'Energy Efficiency Class'],
      ['electronicsDetails.operatingTemperatureRange', 'Operating Temperature Range'],
      ['electronicsDetails.warrantyPeriod', 'Warranty Period'],
    ],
    keywords: [
      'voltage', 'amperage', 'watts', 'electronic', 'circuit', 'pcb', 'battery',
      'charger', 'adapter', 'ip rating', 'bluetooth', 'wi-fi', 'firmware', 'rohs',
      'emc', 'frequency', 'power supply',
    ],
  },
  foodBeverage: {
    label: 'Food & Beverage',
    detailsKey: 'foodBeverageDetails',
    fields: [
      ['foodBeverageDetails.ingredientsList', 'Ingredients List'],
      ['foodBeverageDetails.allergens', 'Allergens'],
      ['foodBeverageDetails.nutritionalInformation', 'Nutritional Information'],
      ['foodBeverageDetails.netWeight', 'Net Weight'],
      ['foodBeverageDetails.servingSize', 'Serving Size'],
      ['foodBeverageDetails.bestBeforeDate', 'Best Before / Use By Date'],
      ['foodBeverageDetails.foodSafetyCertification', 'Food Safety Certification (e.g. HACCP)'],
      ['foodBeverageDetails.countryOfProcessing', 'Country of Processing'],
      ['foodBeverageDetails.preservatives', 'Preservatives'],
      ['foodBeverageDetails.organicCertification', 'Organic Certification'],
      ['foodBeverageDetails.halalKosherCertification', 'Halal / Kosher Certification'],
    ],
    keywords: [
      'ingredients', 'nutrition facts', 'allergen', 'best before', 'use by',
      'food grade', 'haccp', 'net weight', 'serving size', 'organic', 'halal',
      'kosher', 'edible',
    ],
  },
  cosmetics: {
    label: 'Cosmetics & Personal Care',
    detailsKey: 'cosmeticsDetails',
    fields: [
      ['cosmeticsDetails.inciIngredientsList', 'INCI Ingredients List'],
      ['cosmeticsDetails.netContent', 'Net Content'],
      ['cosmeticsDetails.batchCode', 'Batch Code'],
      ['cosmeticsDetails.periodAfterOpening', 'Period After Opening (PAO)'],
      ['cosmeticsDetails.skinType', 'Skin Type'],
      ['cosmeticsDetails.dermatologicallyTested', 'Dermatologically Tested'],
      ['cosmeticsDetails.animalTestingStatus', 'Animal Testing Status'],
      ['cosmeticsDetails.spfRating', 'SPF Rating'],
      ['cosmeticsDetails.expirationDate', 'Expiration Date'],
      ['cosmeticsDetails.manufacturingDate', 'Manufacturing Date'],
      ['cosmeticsDetails.cosmeticRegulationCompliance', 'Cosmetic Regulation Compliance (e.g. EU CPNP)'],
    ],
    keywords: [
      'cosmetic', 'skincare', 'inci', 'pao', 'dermatologically tested',
      'cruelty-free', 'cruelty free', 'spf', 'fragrance', 'moisturi', 'shampoo',
      'lotion', 'serum',
    ],
  },
  chemical: {
    label: 'Chemical & Industrial Materials',
    detailsKey: 'chemicalDetails',
    fields: [
      ['chemicalDetails.casNumber', 'CAS Number'],
      ['chemicalDetails.hazardClassificationGHS', 'Hazard Classification (GHS)'],
      ['chemicalDetails.safetyDataSheetReference', 'Safety Data Sheet Reference'],
      ['chemicalDetails.flashPoint', 'Flash Point'],
      ['chemicalDetails.phValue', 'pH Value'],
      ['chemicalDetails.physicalState', 'Physical State'],
      ['chemicalDetails.hazardPictograms', 'Hazard Pictograms'],
      ['chemicalDetails.handlingPrecautions', 'Handling Precautions'],
      ['chemicalDetails.storageTemperatureRange', 'Storage Temperature Range'],
      ['chemicalDetails.unNumber', 'UN Number (Transport)'],
      ['chemicalDetails.packagingGroup', 'Packaging Group'],
    ],
    keywords: [
      'cas number', 'sds', 'safety data sheet', 'ghs', 'hazard', 'flash point',
      'corrosive', 'flammable', 'chemical', 'reagent', 'solvent', 'un number',
      'hazmat',
    ],
  },
  machinery: {
    label: 'Machinery & Industrial Equipment',
    detailsKey: 'machineryDetails',
    fields: [
      ['machineryDetails.powerRating', 'Power Rating'],
      ['machineryDetails.operatingPressure', 'Operating Pressure'],
      ['machineryDetails.noiseLevel', 'Noise Level'],
      ['machineryDetails.weightCapacity', 'Weight / Load Capacity'],
      ['machineryDetails.safetyGuardsPresent', 'Safety Guards Present'],
      ['machineryDetails.machineryDirectiveCompliance', 'Machinery Directive Compliance (CE)'],
      ['machineryDetails.maintenanceSchedule', 'Maintenance Schedule'],
      ['machineryDetails.operatingSpeed', 'Operating Speed'],
      ['machineryDetails.requiredPPE', 'Required PPE'],
      ['machineryDetails.installationRequirements', 'Installation Requirements'],
    ],
    keywords: [
      'machinery', 'industrial equipment', 'operating pressure', 'rpm',
      'noise level', 'lockout', 'tagout', 'ppe required', 'machine directive',
      'conveyor', 'hydraulic', 'pneumatic', 'actuator',
    ],
  },
  textile: {
    label: 'Textile & Apparel',
    detailsKey: 'textileDetails',
    fields: [
      ['textileDetails.fiberComposition', 'Fiber Composition'],
      ['textileDetails.fabricConstruction', 'Fabric Construction'],
      ['textileDetails.gsmWeight', 'GSM / Fabric Weight'],
      ['textileDetails.colorfastnessRating', 'Colorfastness Rating'],
      ['textileDetails.flammabilityRating', 'Flammability Rating'],
      ['textileDetails.careInstructions', 'Care Instructions'],
      ['textileDetails.countryOfManufacture', 'Country of Manufacture'],
      ['textileDetails.oekoTexOrOtherCertification', 'OEKO-TEX / Other Textile Certification'],
      ['textileDetails.shrinkageRate', 'Shrinkage Rate'],
      ['textileDetails.threadCount', 'Thread Count'],
    ],
    keywords: [
      'fabric', 'textile', 'yarn', 'gsm', 'denier', 'woven', 'knit',
      'apparel', 'garment', 'colorfastness', 'shrinkage', 'oeko-tex',
      'thread count', 'polyester', 'cotton blend', 'care label',
    ],
  },
  constructionMaterials: {
    label: 'Construction & Building Materials',
    detailsKey: 'constructionMaterialsDetails',
    fields: [
      ['constructionMaterialsDetails.materialGrade', 'Material Grade'],
      ['constructionMaterialsDetails.loadBearingCapacity', 'Load-Bearing Capacity'],
      ['constructionMaterialsDetails.fireResistanceRating', 'Fire Resistance Rating'],
      ['constructionMaterialsDetails.compressiveStrength', 'Compressive Strength'],
      ['constructionMaterialsDetails.thermalConductivity', 'Thermal Conductivity'],
      ['constructionMaterialsDetails.ceMarkingDoP', 'CE Marking / Declaration of Performance'],
      ['constructionMaterialsDetails.standardCompliance', 'Standard Compliance (EN/ASTM)'],
      ['constructionMaterialsDetails.dimensionsTolerance', 'Dimensions Tolerance'],
      ['constructionMaterialsDetails.durabilityWarranty', 'Durability / Warranty'],
      ['constructionMaterialsDetails.environmentalRating', 'Environmental Rating'],
    ],
    keywords: [
      'concrete', 'rebar', 'cement', 'aggregate', 'load-bearing',
      'fire resistance', 'compressive strength', 'insulation', 'thermal conductivity',
      'declaration of performance', 'dop', 'building material', 'structural steel',
      'masonry', 'waterproofing',
    ],
  },
};

function getPath(obj: any, path: string): any {
  return path.split('.').reduce((node, key) => (node && typeof node === 'object' ? node[key] : undefined), obj);
}

function hasValue(v: any): boolean {
  if (v === null || v === undefined) return false;
  if (typeof v === 'string') return v.trim() !== '';
  if (Array.isArray(v)) return v.some(hasValue);
  if (typeof v === 'object') return Object.values(v).some(hasValue);
  return true;
}

function fieldPresent(profile: Record<string, unknown>, path: string): boolean {
  if (path === 'certifications') {
    const certs = (profile.certifications ?? {}) as Record<string, unknown>;
    return ['marks', 'standards', 'approvalNumbers'].some((k) => hasValue(certs[k]));
  }
  if (path === 'usage') {
    const usage = (profile.usage ?? {}) as Record<string, unknown>;
    return Object.values(usage).some(hasValue);
  }
  if (path === 'productName' || path === 'expiryOrShelfLife') {
    return displayValue(profile, path) !== null;
  }
  return hasValue(getPath(profile, path));
}

/** Human-readable value for a checklist row, including the composite/synthetic
 * paths (certifications, usage, productName, expiryOrShelfLife) that aren't
 * plain scalars. Mirrors rag-service's `_display_value` — keep in sync. */
function displayValue(profile: Record<string, unknown>, path: string): string | null {
  if (path === 'certifications') {
    const certs = (profile.certifications ?? {}) as Record<string, unknown>;
    const parts: string[] = [];
    for (const k of ['marks', 'standards', 'approvalNumbers']) {
      const v = certs[k];
      if (Array.isArray(v)) parts.push(...v.map((x) => String(x).trim()).filter(Boolean));
    }
    return parts.length ? parts.slice(0, 6).join(', ') : null;
  }
  if (path === 'usage') {
    const usage = (profile.usage ?? {}) as Record<string, unknown>;
    const parts = Object.values(usage).filter(hasValue).map((v) => String(v).trim());
    return parts.length ? parts.slice(0, 4).join('; ') : null;
  }
  if (path === 'productName' || path === 'expiryOrShelfLife') {
    const sources = path === 'productName' ? PRODUCT_NAME_SOURCES : EXPIRY_SOURCES;
    for (const p of sources) {
      const v = getPath(profile, p);
      if (hasValue(v)) return String(v).trim().slice(0, 500);
    }
    return null;
  }
  const v = getPath(profile, path);
  if (v === null || v === undefined) return null;
  if (Array.isArray(v)) {
    const joined = v.map((x) => String(x).trim()).filter(Boolean).join(', ');
    return joined || null;
  }
  const s = String(v).trim();
  return s ? s.slice(0, 500) : null;
}

function categoryHaystack(profile: Record<string, unknown>): string {
  const basic = (profile.basicInformation ?? {}) as Record<string, unknown>;
  return [basic.category, basic.subCategory, basic.tradeMark].map((x) => String(x ?? '').toLowerCase()).join(' ');
}

function looksLikeCategory(profile: Record<string, unknown>, key: string): boolean {
  const cat = CATEGORY_REGISTRY[key];
  const details = profile[cat.detailsKey] as Record<string, unknown> | undefined;
  if (details && Object.values(details).some(hasValue)) return true;
  const haystack = categoryHaystack(profile);
  return cat.keywords.some((kw) => haystack.includes(kw));
}

function detectCategories(profile: Record<string, unknown>): string[] {
  return Object.keys(CATEGORY_REGISTRY).filter((key) => looksLikeCategory(profile, key));
}

function buildChecklist(
  profile: Record<string, unknown>,
  fields: [string, string][],
  groundedByPath?: Record<string, boolean | null | undefined>,
) {
  const checklist: PredefinedFieldCheck[] = [];
  const missing: string[] = [];
  const ungrounded: string[] = [];
  let detected = 0;
  for (const [field, label] of fields) {
    const present = fieldPresent(profile, field);
    const value = present ? displayValue(profile, field) : null;
    const grounded = present && groundedByPath ? groundedByPath[field] ?? null : null;
    if (present && grounded === false) ungrounded.push(label);
    checklist.push({ field, label, detected: present, value, grounded });
    if (present) detected += 1;
    else missing.push(label);
  }
  const total = fields.length;
  return {
    checklist,
    missing,
    ungrounded,
    detected,
    total,
    confidence: total ? Math.round((detected / total) * 1000) / 1000 : 0,
  };
}

export function computeProductExtractionQuality(
  mergedProfile: Record<string, unknown> | null | undefined,
  documentsContributing: number,
  fieldProvenance?: Record<string, { grounded?: boolean | null }> | null,
  productFacts?: Array<{ grounded?: boolean | null }> | null,
): ProductExtractionQuality {
  const profile = mergedProfile ?? {};
  const groundedByPath: Record<string, boolean | null | undefined> = {};
  for (const [path, entry] of Object.entries(fieldProvenance ?? {})) groundedByPath[path] = entry?.grounded;

  const general = buildChecklist(profile, PREDEFINED_PRODUCT_FIELDS, groundedByPath);
  const matchedCategories = detectCategories(profile);

  const categoryChecklists: Record<string, CategoryChecklistResult> = {};
  for (const key of matchedCategories) {
    const cat = CATEGORY_REGISTRY[key];
    const built = buildChecklist(profile, cat.fields, groundedByPath);
    categoryChecklists[key] = {
      label: cat.label,
      checklist: built.checklist,
      missingFields: built.missing,
      ungroundedFields: built.ungrounded,
      detectedFieldCount: built.detected,
      totalPredefinedFields: built.total,
      overallConfidence: built.confidence,
    };
  }

  const facts = Array.isArray(productFacts) ? productFacts : [];
  const groundedProductFactCount = facts.filter((f) => f?.grounded === true).length;
  const ungroundedProductFactCount = facts.filter((f) => f?.grounded === false).length;
  const productFactGroundingRate = facts.length
    ? Math.round((groundedProductFactCount / facts.length) * 1000) / 1000
    : 0;

  return {
    detectedCategories: matchedCategories,
    predefinedFieldsChecklist: general.checklist,
    missingFields: general.missing,
    ungroundedFields: general.ungrounded,
    detectedFieldCount: general.detected,
    totalPredefinedFields: general.total,
    overallConfidence: general.confidence,
    categoryChecklists,
    documentsContributing,
    productFactCount: facts.length,
    groundedProductFactCount,
    productFactGroundingRate,
    ungroundedProductFactCount,
  };
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function valuesMatch(a: string, b: string): boolean {
  const aLower = a.trim().toLowerCase();
  const bLower = b.trim().toLowerCase();
  if (!aLower || !bLower) return false;
  if (aLower === bLower) return true;
  const shortStr = aLower.length <= bLower.length ? aLower : bLower;
  const longStr = aLower.length <= bLower.length ? bLower : aLower;
  const pattern = new RegExp(`(^|[^a-z0-9])${escapeRegex(shortStr)}($|[^a-z0-9])`, 'i');
  return pattern.test(longStr);
}

export function computeRequirementCoverage(
  requiredCertifications: string[] | null | undefined,
  mergedProfile: Record<string, unknown> | null | undefined,
): RequirementCoverage | null {
  const required = (requiredCertifications ?? []).map((r) => r.trim()).filter(Boolean);
  if (required.length === 0) return null;

  const profile = mergedProfile ?? {};
  const certs = (profile.certifications ?? {}) as Record<string, unknown>;
  const pharma = (profile.pharmaceuticalDetails ?? {}) as Record<string, unknown>;
  const device = (profile.medicalDeviceDetails ?? {}) as Record<string, unknown>;
  const chemical = (profile.chemicalDetails ?? {}) as Record<string, unknown>;

  const haystackValues: string[] = [
    ...(Array.isArray(certs.marks) ? certs.marks : []),
    ...(Array.isArray(certs.standards) ? certs.standards : []),
    ...(Array.isArray(certs.approvalNumbers) ? certs.approvalNumbers : []),
    String(pharma.registrationNumber ?? ''),
    String(pharma.certificateNumber ?? ''),
    String(device.deviceClass ?? ''),
    String(device.biocompatibilityStandard ?? ''),
    String(chemical.hazardClassificationGHS ?? ''),
    String((profile.regulatoryNotes as string) ?? ''),
  ]
    .map((v) => String(v).trim())
    .filter(Boolean);

  const items: RequirementCoverageItem[] = required.map((requirement) => {
    const match = haystackValues.find((v) => valuesMatch(requirement, v));
    return { requirement, covered: !!match, matchedAgainst: match };
  });

  return {
    required: items,
    coveredCount: items.filter((i) => i.covered).length,
    totalRequired: items.length,
  };
}

export function generateReadinessSummary(
  quality: ProductExtractionQuality,
  coverage: RequirementCoverage | null,
  conflictCount: number,
  customFieldCount: number,
): string {
  const pct = Math.round(quality.overallConfidence * 100);
  const categoryLabels = quality.detectedCategories.map((k) => CATEGORY_REGISTRY[k]?.label ?? k);
  const kindLabel = categoryLabels.length > 0 ? categoryLabels.join(' / ') + ' product' : 'product';

  const parts: string[] = [];
  parts.push(
    `This ${kindLabel} is ${pct}% complete against its predefined field checklist ` +
      `(${quality.detectedFieldCount}/${quality.totalPredefinedFields} fields detected` +
      `${quality.documentsContributing ? ` across ${quality.documentsContributing} document${quality.documentsContributing === 1 ? '' : 's'}` : ''}).`,
  );

  for (const key of quality.detectedCategories) {
    const cc = quality.categoryChecklists[key];
    if (!cc) continue;
    const catPct = Math.round(cc.overallConfidence * 100);
    parts.push(`${cc.label} data is ${catPct}% complete (${cc.detectedFieldCount}/${cc.totalPredefinedFields}).`);
  }

  if (coverage) {
    if (coverage.coveredCount === coverage.totalRequired) {
      parts.push(`All ${coverage.totalRequired} required certification(s) declared at onboarding have supporting evidence on file.`);
    } else {
      const missing = coverage.required.filter((r) => !r.covered).map((r) => r.requirement);
      parts.push(
        `${coverage.coveredCount} of ${coverage.totalRequired} required certification(s) have supporting evidence on file; ` +
          `still missing: ${missing.join(', ')}.`,
      );
    }
  }

  if (customFieldCount > 0) {
    parts.push(`The AI also captured ${customFieldCount} additional data point${customFieldCount === 1 ? '' : 's'} specific to this product that fall outside the standard checklist.`);
  }

  if (conflictCount > 0) {
    const isPlural = conflictCount !== 1;
    parts.push(
      `${conflictCount} field${isPlural ? 's' : ''} ${isPlural ? 'have' : 'has'} conflicting values ` +
        `between documents and ${isPlural ? 'need' : 'needs'} review before this record should be considered audit-ready.`,
    );
  }

  return parts.join(' ');
}
