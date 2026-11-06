import {
  Controller, Get, Post, Put, Delete, Body, HttpCode, HttpStatus,
} from '@nestjs/common';
import { CompanyProfileService } from './company-profile.service';
import {
  UpdateIdentityDto, UpdateActivityDto, UpdateMarketsDto,
  UpdateQualityDto, SaveProfileDto,
} from './company-profile.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles, CurrentUser } from '../auth/decorators/index';
import { UseGuards } from '@nestjs/common';

@Controller('company/profile')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CompanyProfileController {
  constructor(private readonly profileService: CompanyProfileService) {}

  /** GET /company/profile: fetch full profile. */
  @Get()
  @Roles('DIRECTOR', 'QUALITY_MANAGER', 'AUDITOR', 'OPERATOR')
  getProfile(@CurrentUser('companyId') companyId: string) {
    return this.profileService.getProfile(companyId);
  }

  /** PUT /company/profile: save entire profile (all steps). */
  @Put()
  @Roles('DIRECTOR')
  saveProfile(
    @CurrentUser('companyId') companyId: string,
    @Body() dto: SaveProfileDto,
  ) {
    return this.profileService.saveFullProfile(companyId, dto);
  }

  /** PUT /company/profile/identity: save Step 1. */
  @Put('identity')
  @Roles('DIRECTOR')
  updateIdentity(
    @CurrentUser('companyId') companyId: string,
    @Body() dto: UpdateIdentityDto,
  ) {
    return this.profileService.updateIdentity(companyId, dto);
  }

  /** PUT /company/profile/activity: save Step 2. */
  @Put('activity')
  @Roles('DIRECTOR')
  updateActivity(
    @CurrentUser('companyId') companyId: string,
    @Body() dto: UpdateActivityDto,
  ) {
    return this.profileService.updateActivity(companyId, dto);
  }

  /** PUT /company/profile/markets: save Step 3. */
  @Put('markets')
  @Roles('DIRECTOR')
  updateMarkets(
    @CurrentUser('companyId') companyId: string,
    @Body() dto: UpdateMarketsDto,
  ) {
    return this.profileService.updateMarkets(companyId, dto);
  }

  /** PUT /company/profile/quality: save Step 4. */
  @Put('quality')
  @Roles('DIRECTOR')
  updateQuality(
    @CurrentUser('companyId') companyId: string,
    @Body() dto: UpdateQualityDto,
  ) {
    return this.profileService.updateQuality(companyId, dto);
  }

  /** POST /company/profile/complete: mark onboarding as done. */
  @Post('complete')
  @Roles('DIRECTOR')
  @HttpCode(HttpStatus.OK)
  completeOnboarding(@CurrentUser('companyId') companyId: string) {
    return this.profileService.completeOnboarding(companyId);
  }

  /** DELETE /company/profile: delete profile (admin reset). */
  @Delete()
  @Roles('DIRECTOR')
  @HttpCode(HttpStatus.OK)
  deleteProfile(@CurrentUser('companyId') companyId: string) {
    return this.profileService.deleteProfile(companyId);
  }
}
