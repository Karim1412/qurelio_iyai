import { Injectable, CanActivate, ExecutionContext,
         UnauthorizedException, ForbiddenException, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import * as jwt      from 'jsonwebtoken';

export const Roles  = (...r: string[]) => SetMetadata('roles', r);
export const Public = () => SetMetadata('isPublic', true);

@Injectable()
export class JwtGuard implements CanActivate {
  constructor(private reflector: Reflector) {}
  canActivate(ctx: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>('isPublic', [ctx.getHandler(), ctx.getClass()]);
    if (isPublic) return true;
    const req    = ctx.switchToHttp().getRequest();
    const bearer = req.headers['authorization']?.split(' ')[1];
    if (!bearer) throw new UnauthorizedException('No token');
    // Ensure JWT_SECRET is not undefined
    const secret = process.env.JWT_SECRET || 'default_secret';
    try {
      const p = jwt.verify(bearer, secret) as any;
      req.user = { id: p.sub, email: p.email, role: p.role, companyId: p.companyId, department: p.department };
    } catch { throw new UnauthorizedException('Invalid or expired token'); }
    const roles = this.reflector.getAllAndOverride<string[]>('roles', [ctx.getHandler(), ctx.getClass()]);
    if (roles?.length && !roles.includes(req.user.role))
      throw new ForbiddenException(`Required: ${roles.join(', ')}`);
    return true;
  }
}
