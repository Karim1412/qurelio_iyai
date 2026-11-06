import {
  Injectable, NotFoundException, Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CompanyProfile, OnboardingStatus } from '../database/entities/company-profile.entity';
import {
  UpdateIdentityDto, UpdateActivityDto, UpdateMarketsDto,
  UpdateQualityDto, SaveProfileDto,
} from './company-profile.dto';

@Injectable()
export class CompanyProfileService {
  private readonly logger = new Logger(CompanyProfileService.name);

  constructor(
    @InjectRepository(CompanyProfile)
    private readonly profileRepo: Repository<CompanyProfile>,
  ) {}

  /** Get or create profile for a company (upsert pattern). */
  async getProfile(companyId: string): Promise<CompanyProfile> {
    let profile = await this.profileRepo.findOne({ where: { companyId } });
    if (!profile) {
      profile = this.profileRepo.create({
        companyId,
        onboardingStatus: OnboardingStatus.NOT_STARTED,
        currentStep: 0,
      });
      await this.profileRepo.save(profile);
    }
    return profile;
  }

  /** Save Step 1: Company Identity. */
  async updateIdentity(companyId: string, dto: UpdateIdentityDto): Promise<CompanyProfile> {
    const profile = await this.getProfile(companyId);
    Object.assign(profile, dto);
    if (profile.onboardingStatus === OnboardingStatus.NOT_STARTED) {
      profile.onboardingStatus = OnboardingStatus.IN_PROGRESS;
    }
    await this.profileRepo.save(profile);
    this.logger.log(`Profile identity updated for company ${companyId}`);
    return profile;
  }

  /** Save Step 2: Activity & Products. */
  async updateActivity(companyId: string, dto: UpdateActivityDto): Promise<CompanyProfile> {
    const profile = await this.getProfile(companyId);
    Object.assign(profile, dto);
    if (profile.onboardingStatus === OnboardingStatus.NOT_STARTED) {
      profile.onboardingStatus = OnboardingStatus.IN_PROGRESS;
    }
    await this.profileRepo.save(profile);
    this.logger.log(`Profile activity updated for company ${companyId}`);
    return profile;
  }

  /** Save Step 3: Markets & Compliance. */
  async updateMarkets(companyId: string, dto: UpdateMarketsDto): Promise<CompanyProfile> {
    const profile = await this.getProfile(companyId);
    Object.assign(profile, dto);
    if (profile.onboardingStatus === OnboardingStatus.NOT_STARTED) {
      profile.onboardingStatus = OnboardingStatus.IN_PROGRESS;
    }
    await this.profileRepo.save(profile);
    this.logger.log(`Profile markets updated for company ${companyId}`);
    return profile;
  }

  /** Save Step 4: Quality Team & Context. */
  async updateQuality(companyId: string, dto: UpdateQualityDto): Promise<CompanyProfile> {
    const profile = await this.getProfile(companyId);
    Object.assign(profile, dto);
    if (profile.onboardingStatus === OnboardingStatus.NOT_STARTED) {
      profile.onboardingStatus = OnboardingStatus.IN_PROGRESS;
    }
    await this.profileRepo.save(profile);
    this.logger.log(`Profile quality updated for company ${companyId}`);
    return profile;
  }

  /** Save entire profile (all steps at once, e.g. on "Save & exit"). */
  async saveFullProfile(companyId: string, dto: SaveProfileDto): Promise<CompanyProfile> {
    const profile = await this.getProfile(companyId);

    if (dto.identity) Object.assign(profile, dto.identity);
    if (dto.activity) Object.assign(profile, dto.activity);
    if (dto.markets) Object.assign(profile, dto.markets);
    if (dto.quality) Object.assign(profile, dto.quality);
    if (dto.currentStep !== undefined) profile.currentStep = dto.currentStep;
    if (dto.onboardingStatus) profile.onboardingStatus = dto.onboardingStatus as OnboardingStatus;

    if (profile.onboardingStatus === OnboardingStatus.NOT_STARTED) {
      profile.onboardingStatus = OnboardingStatus.IN_PROGRESS;
    }

    await this.profileRepo.save(profile);
    this.logger.log(`Full profile saved for company ${companyId}`);
    return profile;
  }

  /** Mark onboarding as completed. */
  async completeOnboarding(companyId: string): Promise<CompanyProfile> {
    const profile = await this.getProfile(companyId);
    profile.onboardingStatus = OnboardingStatus.COMPLETED;
    await this.profileRepo.save(profile);
    this.logger.log(`Onboarding completed for company ${companyId}`);
    return profile;
  }

  /** Delete profile (admin only). */
  async deleteProfile(companyId: string): Promise<void> {
    const profile = await this.profileRepo.findOne({ where: { companyId } });
    if (profile) {
      await this.profileRepo.remove(profile);
    }
  }
}
