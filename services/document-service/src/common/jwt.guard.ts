// common/jwt.guard.ts : inline JWT verification for child services
// Each service verifies the token independently (no call to auth-service)
import { Injectable, CanActivate, ExecutionContext,
         UnauthorizedException, ForbiddenException, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import * as jwt      from 'jsonwebtoken';

export const Public = () => SetMetadata('isPublic', true);
export const Roles  = (...r: string[]) => SetMetadata('roles', r);

export const CurrentUser = (target: any, key: string, index: number) => {
  // param decorator placeholder: use req.user in controllers
};

@Injectable()
export class JwtGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>('isPublic', [ctx.getHandler(), ctx.getClass()]);
    if (isPublic) return true;

    const req    = ctx.switchToHttp().getRequest();
    const bearer = req.headers['authorization']?.split(' ')[1];
    if (!bearer) throw new UnauthorizedException('No token');

    try {
      const payload = jwt.verify(bearer, process.env.JWT_SECRET) as any;
      req.user = { id: payload.sub, email: payload.email, role: payload.role, companyId: payload.companyId };
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }

    const roles = this.reflector.getAllAndOverride<string[]>('roles', [ctx.getHandler(), ctx.getClass()]);
    if (roles?.length && !roles.includes(req.user.role))
      throw new ForbiddenException(`Required roles: ${roles.join(', ')}`);

    return true;
  }
}
