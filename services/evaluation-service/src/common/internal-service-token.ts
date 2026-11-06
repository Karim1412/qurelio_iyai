import { ConfigService } from '@nestjs/config';

/**
 * Shared secret for service-to-service calls (notification internal API, document internal routes, etc.).
 */
export function resolveInternalServiceToken(cfg: ConfigService): string {
  const t =
    cfg.get<string>('NOTIFICATION_INTERNAL_TOKEN') ||
    cfg.get<string>('DOCUMENT_INTERNAL_TOKEN') ||
    cfg.get<string>('INTERNAL_SERVICE_TOKEN') ||
    '';
  return String(t).trim();
}
