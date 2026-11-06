// src/notifications/notification.controller.ts
import {
  Controller, Get, Post, Patch, Delete, Param, Query, Body, Req, UseGuards, HttpCode, HttpStatus,
} from '@nestjs/common';
import { NotificationService }  from './notification.service';
import { Injectable, CanActivate, ExecutionContext, UnauthorizedException, SetMetadata } from '@nestjs/common';
import { InternalTokenGuard } from '../common/internal-token.guard';
import { Reflector } from '@nestjs/core';
import * as jwt from 'jsonwebtoken';

@Injectable()
class JwtGuard implements CanActivate {
  constructor(private reflector: Reflector) {}
  canActivate(ctx: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>('isPublic', [ctx.getHandler(), ctx.getClass()]);
    if (isPublic) return true;
    const req    = ctx.switchToHttp().getRequest();
    const bearer = req.headers['authorization']?.split(' ')[1];
    if (!bearer) throw new UnauthorizedException('No token');
    try {
      const p = jwt.verify(bearer, process.env.JWT_SECRET) as any;
      req.user = { id: p.sub, email: p.email, role: p.role, companyId: p.companyId };
    } catch { throw new UnauthorizedException('Invalid token'); }
    return true;
  }
}

const Public = () => SetMetadata('isPublic', true);

@Controller('notifications')
@UseGuards(JwtGuard)
export class NotificationController {
  constructor(private svc: NotificationService) {}

  @Get()
  list(
    @Req() req: any,
    @Query('unread') unread?: string,
    @Query('archived') archived?: string,
  ) {
    return this.svc.listForUser(req.user.id, unread === 'true', archived === 'true');
  }

  @Get('unread-count')
  count(@Req() req: any) { return this.svc.unreadCount(req.user.id); }

  @Patch('read-all')
  markAllRead(@Req() req: any) { return this.svc.markAllRead(req.user.id); }

  @Patch(':id/read')
  markRead(@Param('id') id: string, @Req() req: any) { return this.svc.markRead(id, req.user.id); }

  @Patch(':id/archive')
  archive(@Param('id') id: string, @Req() req: any) { return this.svc.archive(id, req.user.id); }

  @Patch(':id/unarchive')
  unarchive(@Param('id') id: string, @Req() req: any) { return this.svc.unarchive(id, req.user.id); }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  remove(@Param('id') id: string, @Req() req: any) {
    return this.svc.remove(id, req.user.id);
  }

  // Internal: called by other services (optional X-Internal-Token when NOTIFICATION_INTERNAL_TOKEN is set)
  @Public()
  @UseGuards(InternalTokenGuard)
  @Post('internal/create')
  createInternal(@Body() body: any) {
    return this.svc.create(body);
  }

  @Public()
  @UseGuards(InternalTokenGuard)
  @Post('internal/evaluation-complete')
  evalComplete(@Body() body: any) {
    return this.svc.notifyEvaluationComplete(body);
  }

  @Public()
  @UseGuards(InternalTokenGuard)
  @Post('internal/evaluation-failed')
  evalFailed(@Body() body: any) {
    return this.svc.notifyEvaluationFailed(body);
  }

  @Public()
  @UseGuards(InternalTokenGuard)
  @Post('internal/document-extraction-complete')
  documentExtractionComplete(@Body() body: any) {
    return this.svc.notifyDocumentExtractionComplete(body);
  }

  @Public()
  @UseGuards(InternalTokenGuard)
  @Post('internal/capa-assigned')
  capaAssigned(@Body() body: any) {
    return this.svc.notifyCapaAssigned(body);
  }

  @Public()
  @UseGuards(InternalTokenGuard)
  @Post('internal/capa-due-soon')
  capaDueSoon(@Body() body: any) {
    return this.svc.notifyCapaDueSoon(body);
  }
}
