/**
 * Early Access Request form: option lists and copy.
 *
 * Mirrors `services/auth-service/src/demo/early-access.dto.ts`, which validates
 * every answer against these exact strings. Change both together.
 */

export const EA_ROLES = [
  'Quality Manager / Quality Director (QM)',
  'Quality Assurance Manager (QA)',
  'Regulatory Affairs Manager (RA)',
  'Responsible Pharmacist / Market Release Manager',
  'Executive management (CEO / Managing Director / owner)',
  'Production or Operations Manager',
  'Quality & regulatory consultant',
  'Other',
];

/**
 * Field / Industry: the three sectors Qurelio targets.
 * Scoped to this form; company registration and the product wizard keep their own list.
 */
export const EA_INDUSTRIES = [
  'Pharmaceutical industry',
  'Cosmetic industry',
  'MedTech (Medical Technology)',
];

export const EA_CONSULTING_SCOPES = ['For my own firm', 'For my clients', 'Both'];

export const EA_COMPANY_SIZES = [
  '1 – 10 employees',
  '11 – 50',
  '51 – 200',
  '201 – 500',
  'More than 500',
];

export const EA_MARKETS = [
  'Tunisia (domestic market)',
  'European Union',
  'United Kingdom',
  'United States',
  'Gulf / Saudi Arabia (SFDA, GSO)',
  'North Africa (Algeria, Morocco, Libya, Egypt)',
  'Sub-Saharan Africa (WAEMU / ECOWAS)',
];

export const EA_CERTIFICATIONS = [
  'ISO 9001',
  'ISO 13485 (medical devices)',
  'GMP',
  'GDP (distribution)',
  'ISO 22716 (cosmetics)',
  'HACCP / ISO 22000',
  'ISO 17025 (laboratories)',
  'CE marking',
  'None so far',
  'Other',
];

export const EA_PRODUCT_COUNTS = [
  '1 – 5',
  '6 – 20',
  '21 – 100',
  'More than 100',
  'Not sure / not applicable',
];

export const EA_COMPLIANCE_TODAY = [
  'Excel files and shared documents',
  'Paper / physical binders',
  'A QMS or eQMS already in place',
  'An external provider / a consultant',
  'Nothing structured so far',
];

export const EA_CHALLENGES = [
  'Keeping up with regulatory changes: monitoring is manual and time-consuming',
  'Checking whether our products or files meet a given regulatory text',
  'Redoing gap analyses in Excel, for every text and every product',
  'Managing non-conformities and CAPAs with reliable traceability',
  'Rebuilding an audit or inspection file under time pressure',
  'Not missing an expiry or renewal date (certificates, authorisations, qualifications)',
  'Handling several markets with different requirements',
  'Finding the right document, in the right version, at the right time',
  'Tracking team training and qualifications',
  'Other',
];

export const EA_TIMELINES = [
  'Immediately (within a month)',
  'This quarter (1 to 3 months)',
  'In 3 to 6 months',
  'Beyond 6 months / just gathering information for now',
];

export const EA_DECISION_ROLES = [
  'I decide',
  'I recommend / I co-decide',
  "I'm gathering information, others decide",
];

export const EA_PILOT_ANSWERS = [
  "Yes, I'm interested",
  "Maybe, I'd like to know more",
  "No, I'd just like to see the product",
];

export const EA_LANGUAGES = ['French', 'English', 'Arabic'];

/** Question 12 accepts at most three answers. */
export const EA_MAX_CHALLENGES = 3;

/** Triggers the non-blocking "a work address helps" hint on question 2. */
export const EA_PERSONAL_EMAIL_DOMAINS = ['gmail', 'yahoo', 'hotmail', 'outlook', 'live'];

/**
 * Placeholders from the source copy that still need real values before this form
 * goes live. Surfaced here rather than buried in JSX so they are easy to find.
 */
export const EA_LEGAL_ENTITY = '[LEGAL ENTITY]';
export const EA_CONTACT_EMAIL = 'contact@qurelio.com';

export const EA_RESPONSE_HOURS = 48;
