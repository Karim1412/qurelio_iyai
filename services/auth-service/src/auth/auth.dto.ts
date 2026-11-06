import {
  IsEmail,
  IsString,
  MinLength,
  MaxLength,
  IsOptional,
  IsNotEmpty,
  Matches,
  ValidateIf,
  IsIn,
} from 'class-validator';
import { Transform } from 'class-transformer';
import {
  ACCOUNT_PASSWORD_MESSAGE,
  ACCOUNT_PASSWORD_PATTERN,
  ACCOUNT_PHONE_E164_PATTERN,
  ACCOUNT_PHONE_MESSAGE,
  normalizeInternationalPhone,
} from '../common/account-validation';

export class RegisterCompanyDto {
  @IsString() @IsNotEmpty() companyName: string;
  @IsString() @IsNotEmpty() field: string;
  @IsEmail() email: string;
  @Transform(({ value }) => normalizeInternationalPhone(value))
  @IsString()
  @IsNotEmpty()
  @Matches(ACCOUNT_PHONE_E164_PATTERN, { message: ACCOUNT_PHONE_MESSAGE })
  phone: string;
  @IsString() @IsOptional() description?: string;
  @IsString() @IsOptional() companyCapacity?: string;
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  @Matches(ACCOUNT_PASSWORD_PATTERN, { message: ACCOUNT_PASSWORD_MESSAGE })
  password: string;
}

export class RegisterUserDto {
  @IsString() @IsNotEmpty() firstName: string;
  @IsString() @IsNotEmpty() lastName: string;
  @IsEmail() email: string;
  @Transform(({ value }) => normalizeInternationalPhone(value))
  @IsString()
  @IsNotEmpty()
  @Matches(ACCOUNT_PHONE_E164_PATTERN, { message: ACCOUNT_PHONE_MESSAGE })
  phone: string;
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  @Matches(ACCOUNT_PASSWORD_PATTERN, { message: ACCOUNT_PASSWORD_MESSAGE })
  password: string;
  @IsIn(['QUALITY_MANAGER', 'AUDITOR', 'OPERATOR']) role: string;
  /** 8-character code from the company workspace (QUR + 5 letters/digits). */
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() : value))
  @IsString()
  @IsNotEmpty()
  @Matches(/^QUR[A-Z0-9]{5}$/, {
    message:
      'Company code must be 8 characters: QUR followed by 5 letters or digits (example: QUR12AB3). Ask your company director. It is shown on Profile after signup.',
  })
  companyCode: string;
}

export class LoginDto {
  @IsEmail() email: string;
  @IsString() @IsNotEmpty() password: string;
}

export class VerifyOtpDto {
  @IsEmail() email: string;
  @IsString() @MinLength(6) @MaxLength(6) code: string;
}

export class ResendOtpDto {
  @IsEmail() email: string;
}

export class ForgotPasswordDto {
  @IsEmail() email: string;
}

export class ResetPasswordDto {
  @IsString() @MinLength(6) @MaxLength(6) code: string;
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  @Matches(ACCOUNT_PASSWORD_PATTERN, { message: ACCOUNT_PASSWORD_MESSAGE })
  newPassword: string;
}

export class UpdateProfileDto {
  @IsString() @IsOptional() firstName?: string;
  @IsString() @IsOptional() lastName?: string;
  @IsOptional()
  @ValidateIf((_o, v) => v != null && String(v).trim() !== '')
  @Transform(({ value }) => normalizeInternationalPhone(value))
  @IsString()
  @Matches(ACCOUNT_PHONE_E164_PATTERN, { message: ACCOUNT_PHONE_MESSAGE })
  phone?: string;
  @IsString() @IsOptional() name?: string;
}

export class ChangePasswordDto {
  @IsString() @IsNotEmpty() currentPassword: string;
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  @Matches(ACCOUNT_PASSWORD_PATTERN, { message: ACCOUNT_PASSWORD_MESSAGE })
  newPassword: string;
}

export class SetupAccountDto {
  @IsEmail() email: string;
  @IsString() @MinLength(6) @MaxLength(6) code: string;
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  @Matches(ACCOUNT_PASSWORD_PATTERN, { message: ACCOUNT_PASSWORD_MESSAGE })
  newPassword: string;
}

export class ContactDto {
  @IsString() @IsNotEmpty() firstName: string;
  @IsString() @IsOptional() lastName?: string;
  @IsEmail() email: string;
  @IsString() @IsOptional() subject?: string;
  @IsString() @IsNotEmpty() @MaxLength(2000) message: string;
}

export class RefreshTokenDto {
  @IsString()
  @IsNotEmpty()
  refreshToken: string;
}
