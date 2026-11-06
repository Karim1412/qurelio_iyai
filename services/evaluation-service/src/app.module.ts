// src/app.module.ts
import * as path from 'path';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { ScheduleModule } from '@nestjs/schedule';
import { Evaluation } from './database/entities/evaluation.entity';
import { NonConformity, CapaAction } from './database/entities/non-conformity.entity';
import { Audit, AuditFinding, AuditChecklist, AuditChangeLog } from './database/entities/audit.entity';
import { CompanyActivityEvent } from './database/entities/company-activity-event.entity';
import { Report, ReportVersion, ReportModification, ReportApproval } from './database/entities/report.entity';
import { ReportTemplate, ReportTemplateVersion } from './database/entities/report-template.entity';
import { CompanyActivityService } from './company-activity/company-activity.service';
import { EvaluationService } from './evaluation/evaluation.service';
import { EvaluationProcessor } from './evaluation/evaluation.processor';
import { NCService } from './nc/nc.service';
import { AuditService } from './audit/audit.service';
import { ReportService } from './report/report.service';
import { ReportTemplateService } from './report/report-template.service';
import { EvaluationController, NCController, AuditController } from './controllers';
import { ReportController } from './report/report.controller';
import { HealthController } from './health.controller';
import { InternalController } from './internal/internal.controller';
import { WorkspaceChatContextService } from './internal/workspace-chat-context.service';
import { InternalTokenGuard } from './common/internal-token.guard';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      /** Repo root first; docker/.env fills vars (e.g. DOCUMENT_INTERNAL_TOKEN) when running Nest outside Compose. */
      envFilePath: [
        path.join(__dirname, '../../../.env'),
        path.join(__dirname, '../../../docker/.env'),
      ],
    }),
    ScheduleModule.forRoot(),
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (cfg: ConfigService) => ({
        connection: {
          host: cfg.get('REDIS_HOST', 'localhost'),
          port: parseInt(String(cfg.get('REDIS_PORT', 6379)), 10),
        },
      }),
    }),
    BullModule.registerQueue({ name: 'evaluation' }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (cfg: ConfigService) => ({
        type: 'postgres',
        host: cfg.get('POSTGRES_HOST'), port: cfg.get<number>('POSTGRES_PORT'),
        username: cfg.get('POSTGRES_USER'), password: cfg.get('POSTGRES_PASSWORD'),
        database: cfg.get('POSTGRES_DB'),
        entities: [
          Evaluation, NonConformity, CapaAction, Audit, AuditFinding, AuditChecklist, AuditChangeLog,
          CompanyActivityEvent,
          Report, ReportVersion, ReportModification, ReportApproval,
          ReportTemplate, ReportTemplateVersion,
        ],
        synchronize: true, logging: false,
      }),
    }),
    TypeOrmModule.forFeature([
      Evaluation, NonConformity, CapaAction, Audit, AuditFinding, AuditChecklist, AuditChangeLog,
      CompanyActivityEvent,
      Report, ReportVersion, ReportModification, ReportApproval,
      ReportTemplate, ReportTemplateVersion,
    ]),
  ],
  controllers: [
    EvaluationController, NCController, AuditController, ReportController, HealthController,
    InternalController,
  ],
  providers: [
    EvaluationService, EvaluationProcessor, NCService, AuditService, ReportService, ReportTemplateService,
    CompanyActivityService, WorkspaceChatContextService, InternalTokenGuard,
  ],
})
export class AppModule {}
