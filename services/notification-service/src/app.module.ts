// src/app.module.ts
import { Module }         from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule }  from '@nestjs/typeorm';
import { Notification }   from './database/entities/notification.entity';
import { NotificationService }    from './notifications/notification.service';
import { NotificationController } from './notifications/notification.controller';
import { HealthController }       from './health.controller';
import { InternalTokenGuard } from './common/internal-token.guard';

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
        entities: [Notification],
        synchronize: true, logging: false,
      }),
    }),
    TypeOrmModule.forFeature([Notification]),
  ],
  controllers: [NotificationController, HealthController],
  providers:   [NotificationService, InternalTokenGuard],
})
export class AppModule {}
