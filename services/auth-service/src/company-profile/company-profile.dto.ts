import {
  IsString, IsOptional, IsNotEmpty, IsEmail, IsNumber,
  IsArray, ValidateNested, IsIn, Min, Max,
} from 'class-validator';
import { Type } from 'class-transformer';

// ── Step 1: Company Identity ──────────────────────────────────────────────

export class UpdateIdentityDto {
  @IsString() @IsOptional()
  legalName?: string;

  @IsString() @IsOptional()
  tradeName?: string;

  @IsString() @IsOptional()
  headquartersCountry?: string;

  @IsString() @IsOptional()
  headquartersAddress?: string;

  @IsString() @IsOptional()
  registrationNumber?: string;

  @IsNumber() @IsOptional() @Min(1800) @Max(2100)
  yearFounded?: number;

  @IsString() @IsOptional()
  website?: string;

  @IsString() @IsOptional()
  logoKey?: string;
}

// ── Step 2: Activity & Products ───────────────────────────────────────────

export class UpdateActivityDto {
  @IsString() @IsOptional()
  primarySector?: string;

  @IsArray() @IsString({ each: true }) @IsOptional()
  subSectors?: string[];

  @IsArray() @IsString({ each: true }) @IsOptional()
  products?: string[];

  @IsArray() @IsString({ each: true }) @IsOptional()
  productionProcesses?: string[];

  @IsArray() @IsString({ each: true }) @IsOptional()
  rawMaterials?: string[];

  @IsArray() @IsString({ each: true }) @IsOptional()
  assetTypes?: string[];
}

// ── Step 3: Markets & Compliance ──────────────────────────────────────────

export class SiteDto {
  @IsString() @IsNotEmpty()
  siteName: string;

  @IsString() @IsNotEmpty()
  country: string;

  @IsString() @IsOptional()
  city?: string;

  @IsString() @IsNotEmpty()
  role: string;
}

export class CertificationDto {
  @IsString() @IsNotEmpty()
  standardName: string;

  @IsString() @IsOptional()
  certifyingBody?: string;

  @IsString() @IsOptional()
  issueDate?: string;

  @IsString() @IsOptional()
  expiryDate?: string;

  @IsString() @IsOptional()
  scopeNote?: string;
}

export class UpdateMarketsDto {
  @IsArray() @ValidateNested({ each: true }) @Type(() => SiteDto) @IsOptional()
  sites?: SiteDto[];

  @IsArray() @IsString({ each: true }) @IsOptional()
  targetMarkets?: string[];

  @IsArray() @ValidateNested({ each: true }) @Type(() => CertificationDto) @IsOptional()
  certifications?: CertificationDto[];

  @IsArray() @IsString({ each: true }) @IsOptional()
  targetCertifications?: string[];

  @IsArray() @IsString({ each: true }) @IsOptional()
  industryLabels?: string[];
}

// ── Step 4: Quality Team & Context ────────────────────────────────────────

export class UpdateQualityDto {
  @IsString() @IsOptional()
  @IsIn(['none', 'informal', 'developing', 'established', 'certified'])
  maturityLevel?: string;

  @IsString() @IsOptional()
  employeeRange?: string;

  @IsString() @IsOptional()
  revenueRange?: string;

  @IsNumber() @IsOptional() @Min(0)
  qualityTeamSize?: number;

  @IsString() @IsOptional()
  qualityManagerName?: string;

  @IsEmail() @IsOptional()
  qualityManagerEmail?: string;

  @IsArray() @IsString({ each: true }) @IsOptional()
  qualityChallenges?: string[];

  @IsOptional()
  hasDocuments?: boolean;
}

// ── Combined save ─────────────────────────────────────────────────────────

export class SaveProfileDto {
  @IsOptional()
  identity?: UpdateIdentityDto;

  @IsOptional()
  activity?: UpdateActivityDto;

  @IsOptional()
  markets?: UpdateMarketsDto;

  @IsOptional()
  quality?: UpdateQualityDto;

  @IsNumber() @IsOptional()
  currentStep?: number;

  @IsString() @IsOptional()
  @IsIn(['NOT_STARTED', 'IN_PROGRESS', 'COMPLETED'])
  onboardingStatus?: string;
}
