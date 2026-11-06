import {
  IsEmail,
  IsString,
  MinLength,
  MaxLength,
  IsIn,
  IsOptional,
  IsNotEmpty,
  Matches,
} from 'class-validator';
import { Transform } from 'class-transformer';
import {
  ACCOUNT_PASSWORD_MESSAGE,
  ACCOUNT_PASSWORD_PATTERN,
  ACCOUNT_PHONE_E164_PATTERN,
  ACCOUNT_PHONE_MESSAGE,
  normalizeInternationalPhone,
} from '../common/account-validation';

export class CreateCompanyByAdminDto {
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

export class AddUserDto {
  @IsString()
  @MinLength(1)
  firstName!: string;

  @IsString()
  @MinLength(1)
  lastName!: string;

  @IsEmail()
  email!: string;

  @Transform(({ value }) => normalizeInternationalPhone(value))
  @IsString()
  @IsNotEmpty()
  @Matches(ACCOUNT_PHONE_E164_PATTERN, { message: ACCOUNT_PHONE_MESSAGE })
  phone!: string;

  @IsIn(['QUALITY_MANAGER', 'AUDITOR', 'OPERATOR'])
  role!: string;
}

/** Director-only: change a team member’s role (QM / Auditor / Operator). */
export class UpdateUserRoleDto {
  @IsIn(['QUALITY_MANAGER', 'AUDITOR', 'OPERATOR'])
  role!: string;
}
