/**
 * Option lists for the product onboarding wizard.
 *
 * Shared so the AI pre-fill (product-prefill.ts) can snap extracted values onto
 * exactly the choices the steps render: a suggestion that is not in the list
 * would silently never appear as selected.
 */

export const TARGET_USERS = [
  'B2B (Industrial)', 'B2B (Commercial)', 'B2C (General consumers)',
  'B2C (Children / Minors)', 'Medical professionals', 'Food service / Catering',
  'Government / Public sector',
];

export const PHYSICAL_FORMS = ['Solid', 'Liquid', 'Gas', 'Powder', 'Paste', 'Other'];

export const COUNTRIES = [
  'Tunisia', 'Morocco', 'Algeria', 'Egypt', 'France', 'Germany', 'Italy',
  'Spain', 'United Kingdom', 'USA', 'China', 'India', 'Turkey', 'Saudi Arabia', 'UAE',
];

export const MARKETS = [
  'European Union', 'USA (FDA-regulated)', 'USA (General)',
  'Gulf (GCC / GSO)', 'North Africa / Maghreb', 'Sub-Saharan Africa',
  'United Kingdom', 'Domestic (Tunisia)',
];

export const INDUSTRY_LABELS = [
  'CE Marking', 'FDA Registration', 'Halal', 'Kosher',
  'REACH compliant', 'RoHS compliant', 'Ecolabel', 'OEKO-TEX',
];

export const PRODUCTION_PROCESSES = [
  'Production / Assembly', 'Quality Control', 'Procurement',
  'Dyeing & Finishing', 'Packaging', 'Logistics / Warehousing',
];

export const PRODUCT_TYPE_VALUES = ['finished', 'semi_finished', 'component', 'raw_material', 'service'];

export const PRODUCT_STATUS_VALUES = ['active', 'draft', 'discontinued'];
