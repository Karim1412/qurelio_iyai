import { Module, OnModuleInit }              from '@nestjs/common';
import { Injectable }                        from '@nestjs/common';
import { ConfigModule, ConfigService }       from '@nestjs/config';
import { TypeOrmModule }                     from '@nestjs/typeorm';
import { InjectRepository }                  from '@nestjs/typeorm';
import { Repository }                        from 'typeorm';
import { JwtModule }                         from '@nestjs/jwt';
import { PassportModule }                    from '@nestjs/passport';
import { ThrottlerModule, ThrottlerGuard }   from '@nestjs/throttler';
import { APP_GUARD }                         from '@nestjs/core';
import * as bcrypt from 'bcryptjs';

import { User }              from './database/entities/user.entity';
import { Company }           from './database/entities/company.entity';
import { OtpCode }           from './database/entities/otp-code.entity';
import { PendingRegistration } from './database/entities/pending-registration.entity';
import { MailModule }        from './mail/mail.module';
import { OtpService }        from './otp/otp.service';
import { AuthService }       from './auth/auth.service';
import { AuthController }    from './auth/auth.controller';
import { JwtStrategy }       from './auth/jwt.strategy';
import { JwtAuthGuard }      from './auth/jwt-auth.guard';
import { RolesGuard }        from './auth/roles.guard';
import { CompanyService }    from './company/company.service';
import { CompanyController } from './company/company.controller';
import { CompanyProfile }    from './database/entities/company-profile.entity';
import { CompanyProfileService }    from './company-profile/company-profile.service';
import { CompanyProfileController } from './company-profile/company-profile.controller';
import { InternalController } from './internal/internal.controller';
import { HealthController }  from './health.controller';
import { AvatarStorageService } from './avatar/avatar-storage.service';
import { DemoSlot, DemoBooking } from './database/entities/demo.entity';
import { DemoService }    from './demo/demo.service';
import { GoogleMeetService } from './demo/google-meet.service';
import { DemoPublicController, DemoAdminController } from './demo/demo.controller';
@Injectable()
class SuperAdminInitializer implements OnModuleInit {
  constructor(
    @InjectRepository(User) private readonly userRepository: Repository<User>,
    private readonly configService: ConfigService,
  ) {}

  async onModuleInit() {
    console.log('SuperAdminInitializer: Starting initialization...');
    const email    = this.configService.get<string>('SUPER_ADMIN_EMAIL');
    const password = this.configService.get<string>('SUPER_ADMIN_PASSWORD');
    if (!email || !password) {
      console.error('SuperAdminInitializer: Missing email or password in environment variables!');
      return; 
    }

    console.log(`SuperAdminInitializer: SUPER_ADMIN_EMAIL=${email}`);
    console.log('SuperAdminInitializer: Checking if super admin exists...');
    const exists = await this.userRepository.findOne({ where: { email } });
    if (!exists) {
      console.log('SuperAdminInitializer: Super admin does not exist. Creating...');
      const superAdmin = this.userRepository.create({
        firstName:       'Super',
        lastName:        'Admin',
        email,
        passwordHash:    await bcrypt.hash(password, 12),
        role:            'SUPER_ADMIN' as any,
        isEmailVerified: true,
        isActive:        true,
      });
      await this.userRepository.save(superAdmin);
      console.log(`Super admin created: ${email}`);
    } else {
      console.log('Super admin already exists');
    }
  }
}


@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true,  }),

    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (cfg: ConfigService) => ({
        type:        'postgres',
        host:        cfg.get('POSTGRES_HOST'),
        port:        cfg.get<number>('POSTGRES_PORT'),
        username:    cfg.get('POSTGRES_USER'),
        password:    cfg.get('POSTGRES_PASSWORD'),
        database:    cfg.get('POSTGRES_DB'),
        entities:    [User, Company, OtpCode, PendingRegistration, CompanyProfile, DemoSlot, DemoBooking],
        synchronize: true,   // set false in production and use migrations
        logging:     false,
      }),
    }),

    TypeOrmModule.forFeature([User, Company, OtpCode, PendingRegistration, CompanyProfile, DemoSlot, DemoBooking]),

    PassportModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (cfg: ConfigService) => ({
        secret:      cfg.get('JWT_SECRET'),
        signOptions: { expiresIn: cfg.get('JWT_EXPIRES_IN', '15m') },
      }),
    }),

    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 60 }]),

    MailModule,
  ],
  controllers: [AuthController, CompanyController, CompanyProfileController, InternalController, HealthController, DemoPublicController, DemoAdminController],
  providers: [
    AuthService, CompanyService, CompanyProfileService, OtpService, JwtStrategy, AvatarStorageService,
    DemoService, GoogleMeetService,
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    SuperAdminInitializer,
  ],
})
export class AppModule {}
