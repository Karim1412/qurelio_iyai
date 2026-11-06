import {
  ArrayMaxSize, ArrayNotEmpty, IsArray, IsBoolean, IsEmail, IsEnum, IsIn, IsInt,
  IsISO8601, IsOptional, IsString, Matches, MaxLength, Min, MinLength,
} from 'class-validator';
import { DemoBookingStatus, DemoSlotStatus } from '../database/entities/demo.entity';

/**
 * Booking form option lists.
 *
 * The booking popup asks the Early Access questionnaire, so these are the same
 * values the public form renders: see
 * `apps/frontend/src/components/demo/demo-form-options.ts`. Change both together.
 */

/** Field / Industry: the three sectors Qurelio targets. */
export const DEMO_FIELDS = [
  'Pharmaceutical industry',
  'Cosmetic industry',
  'MedTech (Medical Technology)',
] as const;

/** Company size bands. */
export const DEMO_CAPACITIES = [
  '1 – 10 employees', '11 – 50', '51 – 200', '201 – 500', 'More than 500',
] as const;

export const DEMO_ROLES = [
  'Quality Manager / Quality Director (QM)',
  'Quality Assurance Manager (QA)',
  'Regulatory Affairs Manager (RA)',
  'Responsible Pharmacist / Market Release Manager',
  'Executive management (CEO / Managing Director / owner)',
  'Production or Operations Manager',
  'Quality & regulatory consultant',
  'Other',
] as const;

export const DEMO_CONSULTING_SCOPES = ['For my own firm', 'For my clients', 'Both'] as const;

export const DEMO_MARKETS = [
  'Tunisia (domestic market)',
  'European Union',
  'United Kingdom',
  'United States',
  'Gulf / Saudi Arabia (SFDA, GSO)',
  'North Africa (Algeria, Morocco, Libya, Egypt)',
  'Sub-Saharan Africa (WAEMU / ECOWAS)',
] as const;

export const DEMO_CERTIFICATIONS = [
  'ISO 9001', 'ISO 13485 (medical devices)', 'GMP', 'GDP (distribution)',
  'ISO 22716 (cosmetics)', 'HACCP / ISO 22000', 'ISO 17025 (laboratories)',
  'CE marking', 'None so far', 'Other',
] as const;

export const DEMO_PRODUCT_COUNTS = [
  '1 – 5', '6 – 20', '21 – 100', 'More than 100', 'Not sure / not applicable',
] as const;

export const DEMO_COMPLIANCE_TODAY = [
  'Excel files and shared documents',
  'Paper / physical binders',
  'A QMS or eQMS already in place',
  'An external provider / a consultant',
  'Nothing structured so far',
] as const;

export const DEMO_CHALLENGES = [
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
] as const;

export const DEMO_TIMELINES = [
  'Immediately (within a month)',
  'This quarter (1 to 3 months)',
  'In 3 to 6 months',
  'Beyond 6 months / just gathering information for now',
] as const;

export const DEMO_DECISION_ROLES = [
  'I decide', 'I recommend / I co-decide', "I'm gathering information, others decide",
] as const;

export const DEMO_PILOT_ANSWERS = [
  "Yes, I'm interested", "Maybe, I'd like to know more", "No, I'd just like to see the product",
] as const;

export const DEMO_LANGUAGES = ['French', 'English', 'Arabic'] as const;

/** Question 12 accepts at most three answers. */
export const DEMO_MAX_CHALLENGES = 3;

const asStrings = (list: readonly string[]) => list as unknown as string[];

export class CreateDemoBookingDto {
  @IsString()
  slotId!: string;

  // ── Page 1: you & your company ───────────────────────────────────────────
  @IsString() @MinLength(2, { message: 'First and last name is required' }) @MaxLength(200)
  fullName!: string;

  @IsEmail({}, { message: 'Enter a valid work email' }) @MaxLength(320)
  email!: string;

  @IsString() @MinLength(2, { message: 'Company name required' }) @MaxLength(200)
  companyName!: string;

  @IsIn(asStrings(DEMO_ROLES), { message: 'Select your role' })
  role!: string;

  @IsOptional() @IsString() @MaxLength(200)
  roleOther?: string;

  /** Optional; when given it must be E.164. */
  @IsOptional() @Matches(/^\+[1-9]\d{6,14}$/, { message: 'Enter a valid phone number with country code' })
  phone?: string;

  // ── Page 2: regulatory context ───────────────────────────────────────────
  @IsIn(asStrings(DEMO_FIELDS), { message: 'Select your primary industry' })
  field!: string;

  @IsOptional() @IsIn(asStrings(DEMO_CONSULTING_SCOPES))
  consultingScope?: string;

  @IsIn(asStrings(DEMO_CAPACITIES), { message: 'Select your company size' })
  companyCapacity!: string;

  @IsArray() @IsIn(asStrings(DEMO_MARKETS), { each: true })
  marketsActive!: string[];

  @IsArray() @IsIn(asStrings(DEMO_MARKETS), { each: true })
  marketsTargeting!: string[];

  @IsOptional() @IsArray() @IsIn(asStrings(DEMO_CERTIFICATIONS), { each: true })
  certifications?: string[];

  @IsOptional() @IsString() @MaxLength(200)
  certificationsOther?: string;

  @IsOptional() @IsIn(asStrings(DEMO_PRODUCT_COUNTS))
  productCount?: string;

  // ── Page 3: priorities & demo ────────────────────────────────────────────
  @IsIn(asStrings(DEMO_COMPLIANCE_TODAY), { message: 'Tell us how you manage compliance today' })
  complianceToday!: string;

  @IsOptional() @IsString() @MaxLength(200)
  qmsName?: string;

  @IsArray()
  @ArrayNotEmpty({ message: 'Select at least one challenge' })
  @ArrayMaxSize(DEMO_MAX_CHALLENGES, { message: `Select at most ${DEMO_MAX_CHALLENGES} challenges` })
  @IsIn(asStrings(DEMO_CHALLENGES), { each: true })
  challenges!: string[];

  @IsOptional() @IsString() @MaxLength(300)
  challengesOther?: string;

  @IsIn(asStrings(DEMO_TIMELINES), { message: 'Select when you want a solution in place' })
  timeline!: string;

  @IsIn(asStrings(DEMO_DECISION_ROLES), { message: 'Select your role in the decision' })
  decisionRole!: string;

  @IsIn(asStrings(DEMO_PILOT_ANSWERS), { message: 'Tell us about the pilot programme' })
  pilotInterest!: string;

  /** "Anything specific you'd like to see during the demo?" */
  @IsOptional() @IsString() @MaxLength(4000)
  description?: string;

  @IsOptional() @IsIn(asStrings(DEMO_LANGUAGES))
  preferredLanguage?: string;

  @IsBoolean()
  consentContact!: boolean;

  @IsOptional() @IsBoolean()
  consentMarketing?: boolean;
}

export class CreateDemoSlotDto {
  /** ISO instant for the slot start. */
  @IsISO8601({}, { message: 'startsAt must be an ISO date-time' })
  startsAt!: string;

  @IsOptional()
  @IsInt()
  @Min(5)
  durationMinutes?: number;
}

export class BulkCreateDemoSlotsDto {
  @IsArray()
  @IsISO8601({}, { each: true, message: 'Each slot start must be an ISO date-time' })
  starts!: string[];

  @IsOptional()
  @IsInt()
  @Min(5)
  durationMinutes?: number;
}

export class UpdateDemoSlotDto {
  @IsOptional()
  @IsEnum(DemoSlotStatus)
  status?: DemoSlotStatus;

  @IsOptional()
  @IsISO8601({}, { message: 'startsAt must be an ISO date-time' })
  startsAt?: string;

  @IsOptional()
  @IsInt()
  @Min(5)
  durationMinutes?: number;
}

export class RespondDemoBookingDto {
  @IsEnum(DemoBookingStatus)
  status!: DemoBookingStatus;

  /** Overrides the auto-generated Google Meet link when the admin supplies one. */
  @IsOptional() @IsString() @MaxLength(500)
  meetingLink?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  adminNote?: string;
}
