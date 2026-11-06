/**
 * Option lists for the public "Book a demo" form.
 *
 * These mirror the company registration form so a demo request and the account
 * it later becomes describe the business the same way. The values are validated
 * server-side in auth-service `demo.dto.ts`: keep the two in step.
 */

export const DEMO_FIELDS = [
  'Manufacturing',
  'Healthcare',
  'Technology',
  'Finance',
  'Retail',
  'Construction',
  'Education',
  'Logistics',
  'Food & Beverage',
  'Other',
] as const;

export const DEMO_CAPACITIES = ['1-10', '11-50', '51-200', '201-500', '500+'] as const;

/** Stated turnaround, shown on the page and repeated in the confirmation email. */
export const DEMO_RESPONSE_HOURS = 48;
