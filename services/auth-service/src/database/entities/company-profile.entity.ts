import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, UpdateDateColumn, OneToOne, JoinColumn,
} from 'typeorm';
import { Company } from './company.entity';

export enum OnboardingStatus {
  NOT_STARTED = 'NOT_STARTED',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED   = 'COMPLETED',
}

@Entity('company_profiles')
export class CompanyProfile {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'company_id', unique: true })
  companyId: string;

  @OneToOne(() => Company, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'company_id' })
  company: Company;

  // ── Step 1: Company Identity ──────────────────────────────────────────────

  @Column({ name: 'legal_name', nullable: true })
  legalName: string | null;

  @Column({ name: 'trade_name', nullable: true })
  tradeName: string | null;

  @Column({ name: 'headquarters_country', nullable: true })
  headquartersCountry: string | null;

  @Column({ name: 'headquarters_address', nullable: true })
  headquartersAddress: string | null;

  @Column({ name: 'registration_number', nullable: true })
  registrationNumber: string | null;

  @Column({ name: 'year_founded', type: 'int', nullable: true })
  yearFounded: number | null;

  @Column({ name: 'website', nullable: true })
  website: string | null;

  @Column({ name: 'logo_key', nullable: true })
  logoKey: string | null;

  // ── Step 2: Activity & Products ───────────────────────────────────────────

  @Column({ name: 'primary_sector', nullable: true })
  primarySector: string | null;

  @Column({ name: 'sub_sectors', type: 'jsonb', default: '[]' })
  subSectors: string[];

  @Column({ name: 'products', type: 'jsonb', default: '[]' })
  products: string[];

  @Column({ name: 'production_processes', type: 'jsonb', default: '[]' })
  productionProcesses: string[];

  @Column({ name: 'raw_materials', type: 'jsonb', default: '[]' })
  rawMaterials: string[];

  @Column({ name: 'asset_types', type: 'jsonb', default: '[]' })
  assetTypes: string[];

  // ── Step 3: Markets & Compliance ──────────────────────────────────────────

  @Column({ name: 'sites', type: 'jsonb', default: '[]' })
  sites: Array<{
    siteName: string;
    country: string;
    city: string;
    role: string;
  }>;

  @Column({ name: 'target_markets', type: 'jsonb', default: '[]' })
  targetMarkets: string[];

  @Column({ name: 'certifications', type: 'jsonb', default: '[]' })
  certifications: Array<{
    standardName: string;
    certifyingBody: string;
    issueDate: string;
    expiryDate: string;
    scopeNote: string;
  }>;

  @Column({ name: 'target_certifications', type: 'jsonb', default: '[]' })
  targetCertifications: string[];

  @Column({ name: 'industry_labels', type: 'jsonb', default: '[]' })
  industryLabels: string[];

  // ── Step 4: Quality Team & Context ────────────────────────────────────────

  @Column({ name: 'maturity_level', nullable: true })
  maturityLevel: string | null;

  @Column({ name: 'employee_range', nullable: true })
  employeeRange: string | null;

  @Column({ name: 'revenue_range', nullable: true })
  revenueRange: string | null;

  @Column({ name: 'quality_team_size', type: 'int', nullable: true })
  qualityTeamSize: number | null;

  @Column({ name: 'quality_manager_name', nullable: true })
  qualityManagerName: string | null;

  @Column({ name: 'quality_manager_email', nullable: true })
  qualityManagerEmail: string | null;

  @Column({ name: 'quality_challenges', type: 'jsonb', default: '[]' })
  qualityChallenges: string[];

  @Column({ name: 'has_documents', default: false })
  hasDocuments: boolean;

  // ── Status ────────────────────────────────────────────────────────────────

  @Column({
    name: 'onboarding_status',
    type: 'enum',
    enum: OnboardingStatus,
    default: OnboardingStatus.NOT_STARTED,
  })
  onboardingStatus: OnboardingStatus;

  @Column({ name: 'current_step', type: 'int', default: 0 })
  currentStep: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
