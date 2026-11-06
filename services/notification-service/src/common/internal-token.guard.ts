import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * When NOTIFICATION_INTERNAL_TOKEN (or DOCUMENT_INTERNAL_TOKEN) is set, internal routes must send X-Internal-Token.
 * If unset, internal routes stay open (dev only: use a token in production).
 */
@Injectable()
export class InternalTokenGuard implements CanActivate {
  constructor(private readonly cfg: ConfigService) {}

  canActivate(ctx: ExecutionContext): boolean {
    const expected =
      (this.cfg.get<string>('NOTIFICATION_INTERNAL_TOKEN') || this.cfg.get<string>('DOCUMENT_INTERNAL_TOKEN') || '')
        .trim();
    if (!expected) return true;
    const req = ctx.switchToHttp().getRequest();
    const got = String(req.headers['x-internal-token'] ?? req.headers['X-Internal-Token'] ?? '');
    if (got !== expected) throw new UnauthorizedException('Invalid internal token');
    return true;
  }
}
