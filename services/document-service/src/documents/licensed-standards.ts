/**
 * Copyright guardrail for the Standards & Regulations module.
 *
 * Standards bodies (ISO, IEC, ASTM, DIN…) sell their standards under licence and
 * forbid redistribution. Qurelio only accepts documents that are free to use and
 * publicly published, so an upload whose title looks like a licensed standard is
 * refused unless the uploader explicitly takes responsibility for their right to
 * use that copy.
 *
 * Detection is deliberately conservative and runs on the **title and filename**
 * only: short, user-supplied text. Scanning full document text would flag any
 * file that merely *cites* a standard, which is legitimate and extremely common
 * in quality manuals.
 *
 * This is a compliance prompt, not a legal determination: it cannot know whether
 * a given copy was licensed, so it informs and records rather than judges.
 */

export interface LicensedStandardFinding {
  /** Short body code, e.g. "ISO". */
  body: string;
  /** Human label shown to the user. */
  label: string;
  /** The exact text that matched, so the warning can quote it. */
  evidence: string;
}

interface BodyPattern {
  body: string;
  label: string;
  pattern: RegExp;
}

/**
 * Bodies whose standards are sold and licence-restricted.
 * Word boundaries matter: "EN" must not match "ENVIRONMENT", "UL" must not match
 * "REGULATION".
 */
const LICENSED_BODIES: BodyPattern[] = [
  { body: 'ISO', label: 'ISO: International Organization for Standardization', pattern: /\bISO(?:\/[A-Z]{2,4})?[\s\-]?\d{3,5}\b|\bISO\b(?=[\s\-]*\d)/i },
  { body: 'IEC', label: 'IEC: International Electrotechnical Commission', pattern: /\bIEC[\s\-]?\d{3,5}\b/i },
  { body: 'EN', label: 'EN: European Standard (CEN / CENELEC)', pattern: /\bEN[\s\-]?(?:ISO[\s\-]?)?\d{2,5}\b/i },
  { body: 'ASTM', label: 'ASTM International', pattern: /\bASTM\b/i },
  { body: 'ANSI', label: 'ANSI: American National Standards Institute', pattern: /\bANSI\b/i },
  { body: 'BSI', label: 'BSI: British Standards Institution', pattern: /\bBS[\s\-]?(?:EN[\s\-]?)?\d{3,5}\b|\bBSI\b/i },
  { body: 'DIN', label: 'DIN: Deutsches Institut für Normung', pattern: /\bDIN\b/i },
  { body: 'NF', label: 'NF: Norme Française (AFNOR)', pattern: /\bNF[\s\-]?(?:EN[\s\-]?)?\d{2,5}\b|\bAFNOR\b/i },
  { body: 'UL', label: 'UL Solutions', pattern: /\bUL[\s\-]?\d{2,4}\b/i },
  { body: 'IEEE', label: 'IEEE', pattern: /\bIEEE\b/i },
  { body: 'JIS', label: 'JIS: Japanese Industrial Standards', pattern: /\bJIS\b/i },
  { body: 'GOST', label: 'GOST', pattern: /\bGOST\b/i },
  { body: 'SAE', label: 'SAE International', pattern: /\bSAE\b/i },
  { body: 'AAMI', label: 'AAMI', pattern: /\bAAMI\b/i },
  { body: 'IPC', label: 'IPC: Association Connecting Electronics Industries', pattern: /\bIPC[\s\-]?[A-Z]?\d{3,4}\b/i },
  { body: 'ISPE', label: 'ISPE: Baseline / Good Practice Guides', pattern: /\bISPE\b/i },
  { body: 'Ph. Eur.', label: 'European Pharmacopoeia (EDQM), subscription', pattern: /\bPh\.?\s?Eur\b|\bEuropean Pharmacopoeia\b|\bEDQM\b/i },
  { body: 'USP', label: 'United States Pharmacopeia, subscription', pattern: /\bUSP\b(?![A-Z])/i },
  { body: 'ICS', label: 'ICH Q7-style purchased compendium', pattern: /\bBSI Standards Publication\b/i },
];

/**
 * Families that are published free of charge by the issuing authority. When a
 * title matches one of these and no licensed body, no warning is raised.
 */
const PUBLIC_DOMAIN_HINTS: RegExp[] = [
  /\bRegulation\s*\(\s*EU\s*\)/i,
  /\bRegulation\s*\(\s*EC\s*\)/i,
  /\bDirective\s+\d{4}\/\d+\/(?:EC|EU)\b/i,
  /\bEudraLex\b/i,
  /\bMDCG\b/i,
  /\b21\s*CFR\b/i,
  /\bFDA\b/i,
  /\bWHO\b/i,
  /\bEMA\b/i,
  /\bICH\s*[QEMS]\d/i,
  /\bJORT\b/i,
  /\bLoi\s+n°/i,
  /\bd[ée]cret\b/i,
  /\bcircular\b/i,
];

/** True when the text names a freely published authority document. */
export function looksPubliclyPublished(text: string): boolean {
  const t = (text ?? '').trim();
  if (!t) return false;
  return PUBLIC_DOMAIN_HINTS.some((p) => p.test(t));
}

/**
 * Scan title + filename for a licensed standards body.
 * Returns the first match, or null when nothing licensed is recognised.
 */
export function detectLicensedStandard(...parts: Array<string | null | undefined>): LicensedStandardFinding | null {
  const text = parts.filter(Boolean).join(' ').trim();
  if (!text) return null;

  for (const { body, label, pattern } of LICENSED_BODIES) {
    const m = pattern.exec(text);
    if (m) {
      return { body, label, evidence: m[0].trim() };
    }
  }
  return null;
}

/** Message shown to the user and stored alongside the acknowledgement. */
export function licensedStandardWarning(finding: LicensedStandardFinding): string {
  return (
    `"${finding.evidence}" identifies a document published by ${finding.label}. ` +
    'Standards from this body are sold under licence and may not be redistributed. ' +
    'Qurelio only accepts documents that are free to use and published to the public. ' +
    'By continuing you confirm you hold the right to use this copy and accept sole ' +
    'responsibility for it.'
  );
}
