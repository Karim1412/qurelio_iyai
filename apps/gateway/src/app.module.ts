import { Module }          from '@nestjs/common';
import { ConfigModule }    from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { ProxyService }    from './proxy/proxy.service';
import { ProxyController } from './proxy/proxy.controller';
import { HealthController } from './health/health.controller';
import { RbacService }      from './rbac/rbac.service';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: '../../.env' }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 300 }]),
  ],
  controllers: [HealthController, ProxyController],
  providers:   [ProxyService, RbacService],
})
export class AppModule {}
