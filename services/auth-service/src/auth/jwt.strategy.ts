import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy }                  from '@nestjs/passport';
import { ExtractJwt, Strategy }              from 'passport-jwt';
import { ConfigService }                     from '@nestjs/config';
import { InjectRepository }                  from '@nestjs/typeorm';
import { Repository }                        from 'typeorm';
import { User, UserRole }                    from '../database/entities/user.entity';
import { Company, CompanyStatus }            from '../database/entities/company.entity';

/** Attached to `request.user` when the JWT was issued for a company (director) login, not a `User` row. */
export const AUTH_SUBJECT_COMPANY = 'company' as const;

export type JwtRequestUser =
  | User
  | {
      id: string;
      email: string;
      role: UserRole.DIRECTOR;
      companyId: string;
      firstName: string;
      lastName: string;
      phone: string;
      authSubject: typeof AUTH_SUBJECT_COMPANY;
    };

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    @InjectRepository(User) private userRepo: Repository<User>,
    @InjectRepository(Company) private companyRepo: Repository<Company>,
  ) {
    super({
      jwtFromRequest:   ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey:      config.get<string>('JWT_SECRET'),
    });
  }

  async validate(payload: { sub: string; role: string; companyId?: string | null }): Promise<JwtRequestUser> {
    if (payload.role === UserRole.DIRECTOR) {
      const company = await this.companyRepo.findOne({ where: { id: payload.sub } });
      if (!company) throw new UnauthorizedException('Company not found');
      if (!company.isEmailVerified)
        throw new UnauthorizedException('Please verify your company email first');
      if (company.status !== CompanyStatus.ACTIVE)
        throw new UnauthorizedException('Company account is not active');
      return {
        id:          company.id,
        email:       company.email,
        role:        UserRole.DIRECTOR,
        companyId:   company.id,
        firstName:   company.name,
        lastName:    '',
        phone:       company.phone,
        authSubject: AUTH_SUBJECT_COMPANY,
      };
    }

    const user = await this.userRepo.findOne({
      where:    { id: payload.sub },
      relations: ['company'],
    });
    if (!user)          throw new UnauthorizedException('User not found');
    if (!user.isActive) throw new UnauthorizedException('Account is not active');
    return user;
  }
}
