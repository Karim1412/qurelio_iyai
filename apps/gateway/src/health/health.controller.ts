import { Controller, Get } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';



@Controller('health')
export class HealthController {
  constructor(private cfg: ConfigService) {}

  /** Liveness only: for Docker/K8s probes. Does not call upstream services. */
  @Get('live')
  live(): { status: string; timestamp: string } {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }

  @Get()
  async check(): Promise<{ gateway: string; timestamp: string; services: { name: string; status: string }[] }> {
    const services = [
      { name: 'auth-service', url: this.cfg.get('AUTH_SERVICE_URL', 'http://auth-service:3002') },
      { name: 'document-service', url: this.cfg.get('DOCUMENT_SERVICE_URL', 'http://document-service:3003') },
      { name: 'evaluation-service', url: this.cfg.get('EVALUATION_SERVICE_URL', 'http://evaluation-service:3005') },
      { name: 'notification-service', url: this.cfg.get('NOTIFICATION_SERVICE_URL', 'http://notification-service:3004') },
      { name: 'rag-service', url: this.cfg.get('RAG_SERVICE_URL', 'http://rag-service:8000') },
    ];

    const checks = await Promise.allSettled(
      services.map((s) => axios.get(`${s.url}/api/health`, { timeout: 3000 }))
    );

    return {
      gateway: 'ok',
      timestamp: new Date().toISOString(),
      services: checks.map((result, i) => ({
        name: services[i].name,
        status: result.status === 'fulfilled' ? 'up' : 'down',
      })),
    };
  }
}
