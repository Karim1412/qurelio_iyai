import {
  Controller, Get, Post, Patch, Delete, Param, Body, Req, Res, UseGuards, HttpCode, HttpStatus,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { CompanyService } from './company.service';
import { AddUserDto, CreateCompanyByAdminDto, UpdateUserRoleDto } from './company.dto';
import { JwtAuthGuard }  from '../auth/jwt-auth.guard';
import { RolesGuard }    from '../auth/roles.guard';
import { Roles, CurrentUser } from '../auth/decorators/index';
import { JwtRequestUser } from '../auth/jwt.strategy';

@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
export class CompanyController {
  constructor(private company: CompanyService) {}

  // ── Super Admin ────────────────────────────────────────────────────────────
  @Get('admin/pending-summary')     @Roles('SUPER_ADMIN')
  getAdminPending() { return this.company.getAdminPendingSummary(); }

  @Get('admin/companies')           @Roles('SUPER_ADMIN')
  getAllCompanies() { return this.company.getAllCompanies(); }

  @Get('admin/companies/:companyId/avatar/image') @Roles('SUPER_ADMIN')
  companyAvatarImage(@Param('companyId') companyId: string, @Res({ passthrough: false }) res: Response) {
    return this.company.streamCompanyAvatarImage(companyId, res);
  }

  @Post('admin/companies')          @Roles('SUPER_ADMIN') @HttpCode(HttpStatus.CREATED)
  createCompany(@Body() dto: CreateCompanyByAdminDto) { return this.company.createCompanyByAdmin(dto); }

  @Get('admin/companies/:id')       @Roles('SUPER_ADMIN')
  getCompany(@Param('id') id: string) { return this.company.getCompany(id); }

  @Patch('admin/companies/:id/activate') @Roles('SUPER_ADMIN')
  activateCompany(@Param('id') id: string) { return this.company.activateCompany(id); }

  @Patch('admin/companies/:id/suspend')  @Roles('SUPER_ADMIN')
  suspendCompany(@Param('id') id: string) { return this.company.suspendCompany(id); }

  @Delete('admin/companies/:id')    @Roles('SUPER_ADMIN') @HttpCode(HttpStatus.OK)
  deleteCompany(@Param('id') id: string) { return this.company.deleteCompany(id); }

  // ── Director ───────────────────────────────────────────────────────────────
  @Get('company/pending-summary')   @Roles('DIRECTOR')
  getCompanyPending(@CurrentUser('companyId') cid: string) {
    return this.company.getDirectorPendingSummary(cid);
  }

  /** Team directory (read-only): directors manage users; other roles need names for activity log, etc. */
  @Get('company/users')             @Roles('DIRECTOR', 'QUALITY_MANAGER', 'AUDITOR', 'OPERATOR')
  getUsers(@CurrentUser('companyId') cid: string) { return this.company.getCompanyUsers(cid); }

  /** Company logo for any member of the tenant (same as director profile image source). */
  @Get('company/avatar/image') @Roles('DIRECTOR', 'QUALITY_MANAGER', 'AUDITOR', 'OPERATOR')
  ownCompanyAvatarImage(@CurrentUser() actor: JwtRequestUser, @Res({ passthrough: false }) res: Response) {
    return this.company.streamOwnCompanyAvatarImage(actor, res);
  }

  @Get('company/users/:userId/avatar/image') @Roles('DIRECTOR', 'QUALITY_MANAGER', 'AUDITOR', 'OPERATOR')
  userAvatarImage(
    @CurrentUser() actor: JwtRequestUser,
    @Param('userId') userId: string,
    @Res({ passthrough: false }) res: Response,
  ) {
    return this.company.streamUserAvatarImage(actor, userId, res);
  }

  @Post('company/users')            @Roles('DIRECTOR')
  addUser(@Req() req: Request, @Body() dto: AddUserDto) {
    const u = req.user as JwtRequestUser;
    const cid = (u.companyId ?? u.id ?? '').toString().trim();
    return this.company.addUser(cid, dto, u);
  }

  @Patch('company/users/:uid/toggle') @Roles('DIRECTOR')
  toggleUser(@CurrentUser() actor: JwtRequestUser, @Param('uid') uid: string) {
    const cid = (actor.companyId ?? actor.id ?? '').toString().trim();
    return this.company.toggleUserActive(cid, uid, actor);
  }

  @Patch('company/users/:uid/role') @Roles('DIRECTOR')
  updateUserRole(
    @CurrentUser() actor: JwtRequestUser,
    @Param('uid') uid: string,
    @Body() dto: UpdateUserRoleDto,
  ) {
    const cid = (actor.companyId ?? actor.id ?? '').toString().trim();
    return this.company.updateUserRole(cid, uid, dto);
  }

  @Delete('company/users/:uid')     @Roles('DIRECTOR') @HttpCode(HttpStatus.OK)
  removeUser(@CurrentUser() actor: JwtRequestUser, @Param('uid') uid: string) {
    const cid = (actor.companyId ?? actor.id ?? '').toString().trim();
    return this.company.removeUser(cid, uid, actor);
  }
}
