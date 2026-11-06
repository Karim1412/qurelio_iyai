// src/app.module.ts
import { Module }         from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule }  from '@nestjs/typeorm';
import { Document, DocumentVersion, Product, FileFolder } from './database/entities/document.entity';
import { DocumentAccessRule } from './database/entities/document-access-rule.entity';
import { DocumentAuditEvent } from './database/entities/document-audit-event.entity';
import { ProductRegulatoryAssessment } from './database/entities/product-regulatory-assessment.entity';
import { RegulatoryMonitorSource } from './database/entities/regulatory-monitor-source.entity';
import { RegulatorySourceCheck } from './database/entities/regulatory-source-check.entity';
import { RegulatoryChangeEvent } from './database/entities/regulatory-change-event.entity';
import { RegulatoryChangeEventReview } from './database/entities/regulatory-change-event-review.entity';
import { StorageService }    from './storage/storage.service';
import { IngestService }     from './ingest/ingest.service';
import { InternalTokenGuard } from './common/internal-token.guard';
import { DocumentService }   from './documents/document.service';
import { DocumentAuditService } from './documents/document-audit.service';
import { DocumentAclService } from './documents/document-acl.service';
import { DocumentController } from './documents/document.controller';
import { ProductApplicabilityService } from './documents/product-applicability.service';
import { RegulatoryMonitoringService } from './regulatory-monitoring/regulatory-monitoring.service';
import { RegulatoryMonitoringController } from './regulatory-monitoring/regulatory-monitoring.controller';
import { HealthController }   from './health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: '../../.env' }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (cfg: ConfigService) => ({
        type: 'postgres',
        host: cfg.get('POSTGRES_HOST'), port: cfg.get<number>('POSTGRES_PORT'),
        username: cfg.get('POSTGRES_USER'), password: cfg.get('POSTGRES_PASSWORD'),
        database: cfg.get('POSTGRES_DB'),
        entities: [Document, DocumentVersion, Product, FileFolder, DocumentAccessRule, DocumentAuditEvent, ProductRegulatoryAssessment, RegulatoryMonitorSource, RegulatorySourceCheck, RegulatoryChangeEvent, RegulatoryChangeEventReview],
        // Keep legacy development behavior unless deployment explicitly disables it. For production,
        // apply the complete schema migration set first, then set TYPEORM_SYNCHRONIZE=false.
        synchronize: String(cfg.get('TYPEORM_SYNCHRONIZE', 'true')).toLowerCase() === 'true', logging: false,
      }),
    }),
    TypeOrmModule.forFeature([Document, DocumentVersion, Product, FileFolder, DocumentAccessRule, DocumentAuditEvent, ProductRegulatoryAssessment, RegulatoryMonitorSource, RegulatorySourceCheck, RegulatoryChangeEvent, RegulatoryChangeEventReview]),
  ],
  controllers: [DocumentController, RegulatoryMonitoringController, HealthController],
  providers:   [StorageService, IngestService, InternalTokenGuard, DocumentAuditService, DocumentAclService, DocumentService, ProductApplicabilityService, RegulatoryMonitoringService],
})
export class AppModule {}
