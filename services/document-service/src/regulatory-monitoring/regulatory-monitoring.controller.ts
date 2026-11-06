import {
  Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards, HttpCode, HttpStatus,
} from '@nestjs/common';
import { JwtGuard, Roles } from '../common/jwt.guard';
import { RegulatoryMonitoringService } from './regulatory-monitoring.service';

@Controller('documents/regulatory-monitoring')
@UseGuards(JwtGuard)
export class RegulatoryMonitoringController {
  constructor(private readonly service: RegulatoryMonitoringService) {}

  @Get('summary')
  summary(@Req() req: any) {
    return this.service.summary(req.user.companyId);
  }

  @Get('sources')
  listSources(
    @Req() req: any,
    @Query('search') search?: string,
    @Query('jurisdiction') jurisdiction?: string,
    @Query('priority') priority?: string,
    @Query('status') status?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.service.listSources({ search, jurisdiction, priority, status, limit, offset }, req.user.companyId);
  }

  @Get('events')
  listEvents(
    @Req() req: any,
    @Query('state') state?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.service.listEvents(req.user.companyId, { state, limit, offset });
  }

  @Get('sources/:sourceId/history')
  sourceHistory(@Param('sourceId') sourceId: string, @Req() req: any, @Query('limit') limit?: string) {
    const parsed = limit ? Number(limit) : 20;
    return this.service.sourceHistory(sourceId, req.user.companyId, Number.isInteger(parsed) ? parsed : 20);
  }

  /** Queue source checks and return immediately; the scheduler executes them in small batches. */
  @Post('check')
  @Roles('SUPER_ADMIN', 'DIRECTOR', 'QUALITY_MANAGER')
  @HttpCode(HttpStatus.ACCEPTED)
  queueChecks(@Req() req: any, @Body() body: { sourceIds?: string[] }) {
    return this.service.queueChecks(body?.sourceIds, req.user.companyId, req.user.role);
  }

  @Patch('sources/:sourceId')
  @Roles('SUPER_ADMIN')
  updateSource(
    @Param('sourceId') sourceId: string,
    @Body() body: { enabled?: boolean; checkIntervalHours?: number; useRecommendedCadence?: boolean },
  ) {
    return this.service.updateSource(sourceId, body || {});
  }

  @Patch('events/:eventId/review')
  @Roles('DIRECTOR', 'QUALITY_MANAGER')
  reviewEvent(
    @Param('eventId') eventId: string,
    @Req() req: any,
    @Body() body: { impactState: string; reviewNote: string },
  ) {
    return this.service.reviewEvent(eventId, req.user.companyId, req.user.id, req.user.role, body);
  }
}
