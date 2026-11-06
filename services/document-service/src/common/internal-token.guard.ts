import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/** Validates `X-Internal-Token` for service-to-service callbacks (e.g. RAG → document-service). */
@Injectable()
export class InternalTokenGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const got = String(req.headers['x-internal-token'] ?? '');
    const expected = this.config.get<string>('DOCUMENT_INTERNAL_TOKEN', '') ?? '';
    if (!expected || got !== expected) {
      throw new UnauthorizedException('Invalid internal token');
    }
    return true;
  }
}
