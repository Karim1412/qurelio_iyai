import { Injectable, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as jwt from 'jsonwebtoken';
import {
  CUSTOM_RULES,
  PREFIX_RULES,
  PUBLIC_ROUTES,
  isInternalTokenPath,
  isPublicInternalPath,
  isRagInternalOnlyPath,
  isSuperAdminBlockedFromTenantApi,
  type PrefixRule,
} from './gateway-rbac.rules';

export interface JwtPayloadShape {
  sub: string;
  role?: string;
  email?: string;
  companyId?: string | null;
}

@Injectable()
export class RbacService {
  constructor(private readonly cfg: ConfigService) {}

  /** Path without /api prefix, normalized (no trailing slash except "/"). */
  normalizePath(rawPath: string): string {
    let p = rawPath.split('?')[0] || '/';
    if (p.startsWith('/api')) p = p.slice(4) || '/';
    if (p.length > 1 && p.endsWith('/')) p = p.slice(0, -1);
    return p || '/';
  }

  assertRequestAllowed(params: {
    method: string;
    path: string;
    headers: Record<string, string | string[] | undefined>;
  }): JwtPayloadShape | null {
    const method = params.method.toUpperCase();
    if (method === 'OPTIONS') return null;

    const path = this.normalizePath(params.path);

    if (PUBLIC_ROUTES.some((r) => r.method === method && r.path === path)) return null;

    if (isPublicInternalPath(method, path)) return null;

    if (isInternalTokenPath(path)) {
      this.assertInternalToken(params.headers);
      return null;
    }

    if (isRagInternalOnlyPath(method, path)) {
      this.assertInternalToken(params.headers);
      return null;
    }

    const bearer = this.getBearer(params.headers);
    if (!bearer) throw new UnauthorizedException('No token');

    const secret = this.cfg.get<string>('JWT_SECRET');
    if (!secret) throw new UnauthorizedException('Gateway JWT_SECRET not configured');

    let payload: JwtPayloadShape;
    try {
      payload = jwt.verify(bearer, secret) as JwtPayloadShape;
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }

    const role = payload.role;
    if (!role) throw new ForbiddenException('Token has no role');

    if (role === 'SUPER_ADMIN' && isSuperAdminBlockedFromTenantApi(path)) {
      throw new ForbiddenException('Super admin cannot access tenant quality APIs');
    }

    for (const rule of CUSTOM_RULES) {
      if (rule.test(method, path)) {
        if (!rule.roles.includes(role))
          throw new ForbiddenException(`Required roles: ${rule.roles.join(', ')}`);
        return payload;
      }
    }

    const prefixRule = this.matchPrefixRule(method, path);
    if (prefixRule && !prefixRule.roles.includes(role)) {
      throw new ForbiddenException(`Required roles: ${prefixRule.roles.join(', ')}`);
    }
    return payload;
  }

  private matchPrefixRule(method: string, path: string): PrefixRule | undefined {
    const candidates = PREFIX_RULES.filter((r) => {
      if (!this.methodMatches(r.methods, method)) return false;
      return this.matchesPrefix(path, r.prefix);
    });
    if (!candidates.length) return undefined;
    return candidates.sort((a, b) => b.prefix.length - a.prefix.length)[0];
  }

  private matchesPrefix(path: string, prefix: string): boolean {
    if (path === prefix) return true;
    return path.startsWith(prefix.endsWith('/') ? prefix : `${prefix}/`);
  }

  private methodMatches(ruleMethods: string[] | '*', method: string): boolean {
    if (ruleMethods === '*') return true;
    return ruleMethods.includes(method);
  }

  private getBearer(headers: Record<string, string | string[] | undefined>): string | undefined {
    const raw = headers['authorization'];
    const s = typeof raw === 'string' ? raw : undefined;
    if (!s?.toLowerCase().startsWith('bearer ')) return undefined;
    return s.slice(7).trim();
  }

  private assertInternalToken(headers: Record<string, string | string[] | undefined>): void {
    const expected = this.cfg.get<string>('DOCUMENT_INTERNAL_TOKEN', '') ?? '';
    const got = String(headers['x-internal-token'] ?? headers['X-Internal-Token'] ?? '');
    if (!expected || got !== expected) {
      throw new UnauthorizedException('Invalid internal token');
    }
  }
}
